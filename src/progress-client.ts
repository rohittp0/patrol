import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  signInAnonymously,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { setTelemetryAccount } from "./telemetry";
import { FIREBASE_CONFIG } from "./firebase.config";
import {
  settleTraining,
  type PlayerAction,
  type SquadId,
} from "./game/collection";
import {
  advanceProgress,
  initialProgress,
  type PlayerProgress,
  type ProgressMutation,
} from "./game/player-progress";
import type { Mission, MissionAttempt } from "./game/missions";
import type { BoardSource } from "./game/campaign-world";
import type { Navigation } from "./game/navigation";
import { ProgressStore } from "./progress-store";
import {
  ProgressOutbox,
  type ProgressJournal,
  type ProgressReceipt,
  type SyncStatus,
} from "./game/progress-outbox";

interface PendingSave {
  uid: string;
  input: ProgressMutation;
}
interface Checkpoint {
  uid: string;
  attemptId: string;
  moves: MissionAttempt["moves"];
  pendingHours: number | null;
}
type CachedProgress =
  | PlayerProgress
  | { uid: string; progress: PlayerProgress };

const KEY = "patrol:progress:v2",
  PENDING = "patrol:pending:v2",
  CHECKPOINT = "patrol:checkpoint:v2",
  OUTBOX = "patrol:outbox:v1";
export class ProgressClient {
  response: PlayerProgress = initialProgress();
  // Keep Firebase's registered OAuth handler. A custom Hosting domain is not
  // automatically registered as a Google OAuth callback.
  private app = initializeApp(FIREBASE_CONFIG);
  readonly auth = getAuth(this.app);
  private db = getFirestore(this.app);
  private store: ProgressStore;
  readonly local =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("local") === "1";
  private outbox: ProgressOutbox | null = null;
  private loadedUid = "";
  private durable = true;
  recoveryMessage = "";
  get syncStatus(): SyncStatus {
    return this.outbox?.status ?? "saved";
  }
  get pendingCount() {
    return this.outbox?.pendingCount ?? 0;
  }
  get syncMessage() {
    if (this.syncStatus === "conflict")
      return "Newer cloud progress exists. Open your profile to resolve it; this device keeps its unsynced progress.";
    if (this.syncStatus === "offline")
      return this.durable
        ? "Offline · progress saved on this device"
        : "Offline · keep this tab open until saved";
    return this.pendingCount
      ? "Saving in background"
      : this.local
        ? "Saved on this device"
        : "Progress saved";
  }
  retry() {
    this.outbox?.retry();
  }
  flush() {
    return this.outbox?.flush() ?? Promise.resolve();
  }
  private volatile = new Map<string, string>();

  constructor(
    private board: BoardSource,
    private levels: Mission[],
    private navigation?: Navigation,
    private prepareLevel?: (level: number) => Promise<unknown>,
  ) {
    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_EMULATORS === "1"
    ) {
      connectAuthEmulator(this.auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(this.db, "127.0.0.1", 8080);
    }
    this.store = new ProgressStore(this.db, board, levels, navigation);
    setTelemetryAccount(() => this.auth.currentUser);
  }
  get player() {
    return settleTraining(this.response.player, this.now());
  }
  get signedIn() {
    return !!this.auth.currentUser && !this.auth.currentUser.isAnonymous;
  }
  now() {
    return Date.now();
  }
  private get(key: string) {
    try {
      return this.volatile.get(key) ?? localStorage.getItem(key);
    } catch {
      return this.volatile.get(key) ?? null;
    }
  }
  private put(key: string, value: string) {
    this.volatile.set(key, value);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      /* Keep playing in memory while the cloud transport is available. */
      return false;
    }
  }
  private remove(key: string) {
    this.volatile.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Memory-only session. */
    }
  }
  private read<T>(key: string): T | null {
    try {
      return JSON.parse(this.get(key) ?? "null") as T | null;
    } catch {
      this.remove(key);
      return null;
    }
  }
  private accept(response: PlayerProgress) {
    this.response = response;
    this.put(
      KEY,
      JSON.stringify({
        uid: this.auth.currentUser?.uid ?? "local",
        progress: response,
      }),
    );
    return response;
  }
  async load(knownReceipt?: ProgressReceipt) {
    if (!this.local) {
      await this.auth.authStateReady();
      if (!this.auth.currentUser) await signInAnonymously(this.auth);
    }
    const uid = this.auth.currentUser?.uid ?? "local";
    // Resuming the current screen must never wait for another cloud round trip.
    if (this.outbox && this.loadedUid === uid) return this.response;
    this.outbox?.stop();
    const cached = this.read<CachedProgress>(KEY);
    const cachedProgress =
      cached && "progress" in cached
        ? cached.uid === uid
          ? cached.progress
          : null
        : this.local
          ? cached
          : null;
    const saved = this.read<ProgressJournal & { uid: string }>(OUTBOX);
    let journal =
      saved?.uid === uid &&
      Array.isArray(saved.pending) &&
      saved.confirmed?.player?.version === 2
        ? saved
        : null;
    const backgroundReceipt =
      !knownReceipt && journal && journal.pending.length > 0 && !this.local
        ? this.store.loadWithReceipt(uid)
        : null;
    let receipt: ProgressReceipt;
    try {
      receipt =
        knownReceipt ??
        (backgroundReceipt
          ? { progress: journal!.confirmed, lastMutationId: null }
          : this.local
            ? {
                progress:
                  journal?.confirmed ?? cachedProgress ?? initialProgress(),
                lastMutationId: null,
              }
            : await this.store.loadWithReceipt(uid));
    } catch (error) {
      if (!journal && !cachedProgress) throw error;
      receipt = {
        progress: journal?.confirmed ?? cachedProgress!,
        lastMutationId: null,
      };
    }
    // Only fetch geometry needed by an active/checkpointed country; home and
    // locked previews need the small manifests, not both country maps.
    const activeLevels = new Set([
      receipt.progress.active?.level, journal?.confirmed.active?.level,
      ...(journal?.pending.map(entry => entry.progress.active?.level) ?? []),
    ].filter((level): level is number => typeof level === "number"));
    await Promise.all([...activeLevels].map(level => this.prepareLevel?.(level)));
    const connect = (state: ProgressJournal) => {
      const outbox = new ProgressOutbox(state, {
        paused: !!backgroundReceipt,
        commit: (entry) =>
          this.local
            ? Promise.resolve(entry.progress)
            : this.store.commit(uid, entry),
        persist: (value) => {
          this.durable = this.put(OUTBOX, JSON.stringify({ uid, ...value }));
        },
        changed: () => {
          if (this.outbox !== outbox) return;
          this.accept(outbox.response);
          window.dispatchEvent(new Event("patrol:sync-change"));
        },
      });
      this.outbox = outbox;
      return outbox;
    };
    const outbox = connect(
      journal ?? { confirmed: receipt.progress, pending: [] },
    );
    if (!outbox.reconcile(receipt)) {
      this.put(
        "patrol:conflict-backup:v2",
        JSON.stringify({ uid, ...outbox.snapshot() }),
      );
      outbox.stop();
      journal = null;
      connect({ confirmed: receipt.progress, pending: [] });
      this.recoveryMessage =
        "Loaded newer cloud progress. This device’s unsynced campaign is kept as a backup.";
    }
    this.loadedUid = uid;
    this.accept(this.outbox!.response);
    // Recover the previous release's one-action journal without duplicating a
    // transaction that committed just before the browser closed.
    const pending = this.read<PendingSave>(PENDING);
    if (
      pending?.uid === uid &&
      pending.input.actionId !== receipt.lastMutationId
    ) {
      try {
        if (pending.input.revision !== this.response.player.revision)
          throw new Error("Older pending save");
        if (pending.input.op === "start" && typeof pending.input.level === "number")
          await this.prepareLevel?.(pending.input.level);
        const next = advanceProgress(
          this.response,
          pending.input,
          this.board,
          this.levels,
          this.now(),
          this.navigation,
        );
        this.outbox!.enqueue(pending.input.actionId, next);
        this.accept(this.outbox!.response);
      } catch {
        this.put("patrol:legacy-pending-backup:v2", JSON.stringify(pending));
      }
    }
    this.remove(PENDING);
    const checkpoint = this.read<Checkpoint>(CHECKPOINT);
    if (
      checkpoint?.uid === uid &&
      checkpoint.attemptId === this.response.active?.id
    ) {
      try {
        await this.operation("save", {
          attemptId: checkpoint.attemptId,
          moves: checkpoint.moves,
          pendingHours: checkpoint.pendingHours,
        });
      } catch {
        /* A newer queued checkpoint already owns this attempt. */
      }
    }
    this.remove(CHECKPOINT);
    const activeOutbox = this.outbox!;
    if (backgroundReceipt) {
      void backgroundReceipt
        .then((cloud) => {
          if (this.outbox !== activeOutbox) return;
          if (activeOutbox.reconcile(cloud)) activeOutbox.resume();
          else
            this.put(
              "patrol:conflict-backup:v2",
              JSON.stringify({ uid, ...activeOutbox.snapshot() }),
            );
        })
        .catch(() => {
          if (this.outbox === activeOutbox) activeOutbox.resume();
        });
    } else activeOutbox.resume();
    if (this.player.unlocked === 15 && this.player.results["15"])
      await this.operation("action", { action: { kind: "extend-campaign" } });
    return this.response;
  }
  private operation(
    op: ProgressMutation["op"],
    data: Omit<Partial<ProgressMutation>, "op"> = {},
  ) {
    if (!this.outbox) throw new Error("Your campaign is still loading");
    const input: ProgressMutation = {
      ...structuredClone(data),
      op,
      actionId: crypto.randomUUID(),
      revision: this.response.player.revision,
    };
    // Validation and the visible transition happen now, once. Cloud writes use
    // this exact snapshot, so later UI actions do not wait for older requests.
    const next = advanceProgress(
      this.response,
      input,
      this.board,
      this.levels,
      this.now(),
      this.navigation,
    );
    this.outbox.enqueue(input.actionId, next);
    this.accept(next);
    return Promise.resolve(next);
  }
  action(action: PlayerAction) {
    return this.operation("action", { action });
  }
  async start(level: number, selection: (SquadId | null)[]) {
    await this.prepareLevel?.(level);
    return this.operation("start", { level, selection });
  }
  checkpoint(moves: MissionAttempt["moves"], pendingHours: number | null) {
    const value = JSON.stringify({
      uid: this.auth.currentUser?.uid ?? "local",
      attemptId: this.response.active?.id,
      moves,
      pendingHours,
    });
    this.put(CHECKPOINT, value);
    return value;
  }
  async save(moves: MissionAttempt["moves"], pendingHours: number | null) {
    const journal = this.checkpoint(moves, pendingHours);
    const result = await this.operation("save", {
      attemptId: this.response.active?.id,
      moves,
      pendingHours,
    });
    if (this.get(CHECKPOINT) === journal) this.remove(CHECKPOINT);
    return result;
  }
  async finish(moves: MissionAttempt["moves"]) {
    const result = await this.operation("finish", {
      attemptId: this.response.active?.id,
      moves,
    });
    this.remove(CHECKPOINT);
    return result;
  }
  abandon() {
    return this.operation("abandon");
  }
  backupForTutorial() {
    this.put(
      "patrol:pre-tutorial-attempt:v2",
      JSON.stringify({ uid: this.loadedUid, progress: this.response }),
    );
  }
  async reloadCloud() {
    const uid = this.auth.currentUser?.uid;
    const receipt = this.local
      ? {
          progress: this.outbox?.snapshot().confirmed ?? this.response,
          lastMutationId: null,
        }
      : uid
        ? await this.store.loadWithReceipt(uid)
        : null;
    if (!receipt) throw new Error("Sign in to load your cloud campaign");
    if (this.outbox)
      this.put(
        "patrol:conflict-backup:v2",
        JSON.stringify({ uid: this.loadedUid, ...this.outbox.snapshot() }),
      );
    this.outbox?.stop();
    this.outbox = null;
    this.loadedUid = "";
    this.remove(OUTBOX);
    this.remove(CHECKPOINT);
    return this.load(receipt);
  }
  async google() {
    if (this.local)
      throw new Error("Google sign-in is available on the hosted game");
    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(this.auth.currentUser!, provider);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "auth/credential-already-in-use"
      ) {
        const credential = GoogleAuthProvider.credentialFromError(
          error as never,
        );
        if (
          !credential ||
          !confirm(
            "This Google account already has saved progress. Load that campaign? This browser's guest progress will be kept as a backup.",
          )
        )
          return;
        await this.flush();
        this.put("patrol:guest-backup:v2", JSON.stringify(this.response));
        await signInWithCredential(this.auth, credential);
      } else throw error;
    }
    await this.load();
  }
  async signOut() {
    await this.flush();
    await signOut(this.auth);
    this.remove(KEY);
    this.remove(CHECKPOINT);
    await this.load();
  }
}
