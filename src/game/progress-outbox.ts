import type { PlayerProgress } from "./player-progress";

export interface PendingProgress {
  actionId: string;
  revision: number;
  progress: PlayerProgress;
}
export interface ProgressReceipt {
  progress: PlayerProgress;
  lastMutationId: string | null;
}
export interface ProgressJournal {
  confirmed: PlayerProgress;
  pending: PendingProgress[];
}
export type SyncStatus = "saved" | "saving" | "offline" | "conflict";
interface OutboxPorts {
  commit: (entry: PendingProgress) => Promise<PlayerProgress>;
  persist: (journal: ProgressJournal) => void;
  changed?: (status: SyncStatus) => void;
  retryMs?: number;
  paused?: boolean;
}
/** Local state changes once, synchronously. Immutable snapshots sync in revision
 * order, preserving generated attempt IDs, training deadlines and rewards. */
export class ProgressOutbox {
  status: SyncStatus = "saved";
  private sending: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private paused = false;
  private failure: unknown = null;
  constructor(
    private journal: ProgressJournal,
    private ports: OutboxPorts,
  ) {
    this.journal = structuredClone(journal);
    this.paused = !!ports.paused;
  }
  get response() {
    return this.journal.pending.at(-1)?.progress ?? this.journal.confirmed;
  }
  get pendingCount() {
    return this.journal.pending.length;
  }
  snapshot() {
    return structuredClone(this.journal);
  }
  private changed(status: SyncStatus) {
    this.status = status;
    this.ports.persist(this.snapshot());
    this.ports.changed?.(status);
  }
  enqueue(actionId: string, progress: PlayerProgress) {
    const revision = this.response.player.revision;
    if (progress.player.revision !== revision + 1)
      throw new Error("Invalid optimistic save revision");
    this.journal.pending.push({
      actionId,
      revision,
      progress: structuredClone(progress),
    });
    this.changed(
      this.status === "conflict"
        ? "conflict"
        : this.status === "offline"
          ? "offline"
          : "saving",
    );
    if (!this.timer && this.status !== "conflict") void this.drain();
    return progress;
  }
  /** Trim a response-lost prefix using the cloud receipt; never replay a purchase. */
  reconcile(receipt: ProgressReceipt) {
    const index = this.journal.pending.findIndex(
      (entry) => entry.actionId === receipt.lastMutationId,
    );
    if (index >= 0) this.journal.pending.splice(0, index + 1);
    const expected = this.journal.pending[0]?.revision;
    if (
      expected !== undefined &&
      expected !== receipt.progress.player.revision
    ) {
      this.failure = new Error("A newer campaign was saved on another device");
      this.changed("conflict");
      return false;
    }
    this.journal.confirmed = structuredClone(receipt.progress);
    this.changed(this.pendingCount ? "saving" : "saved");
    return true;
  }
  resume() {
    this.paused = false;
    this.retry();
  }
  retry() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.status !== "conflict") void this.drain();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.drain();
    if (this.pendingCount)
      throw this.failure ?? new Error("Your progress is waiting to sync");
  }
  private drain(): Promise<void> {
    if (this.sending) return this.sending;
    if (this.stopped || this.paused || this.status === "conflict")
      return Promise.resolve();
    const send = async () => {
      while (this.journal.pending.length && !this.stopped) {
        const entry = this.journal.pending[0];
        this.changed("saving");
        try {
          const confirmed = await this.ports.commit(structuredClone(entry));
          this.journal.confirmed = confirmed;
          this.journal.pending.shift();
          this.failure = null;
          this.changed(this.pendingCount ? "saving" : "saved");
        } catch (error) {
          this.failure = error;
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? String(error.code)
              : "";
          const permanent = [
            "progress/conflict",
            "permission-denied",
            "invalid-argument",
            "unauthenticated",
          ].includes(code);
          this.changed(permanent ? "conflict" : "offline");
          if (!permanent && !this.stopped)
            this.timer = setTimeout(() => {
              this.timer = null;
              void this.drain();
            }, this.ports.retryMs ?? 5000);
          return;
        }
      }
    };
    // Begin after enqueue returns, so slow Firebase transports cannot hold the UI.
    this.sending = Promise.resolve()
      .then(send)
      .finally(() => {
        this.sending = null;
      });
    return this.sending;
  }
}
