import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import {
  advanceProgress,
  initialProgress,
  type PlayerProgress,
  type ProgressMutation,
} from "./game/player-progress";
import type { CountryBoard } from "./game/types";
import type { Mission } from "./game/missions";
import type { Navigation } from "./game/navigation";
import type { PendingProgress, ProgressReceipt } from "./game/progress-outbox";

export class ProgressConflict extends Error {
  readonly code = "progress/conflict";
  constructor() {
    super("Progress changed in another tab or device. Reload to continue.");
  }
}
function readProgress(value: Record<string, unknown>): PlayerProgress {
  const player = value.player as PlayerProgress["player"] | undefined;
  if (
    !player ||
    player.version !== 2 ||
    !Number.isSafeInteger(player.revision) ||
    player.revision < 0 ||
    !Number.isSafeInteger(player.wallet) ||
    player.wallet < 0
  )
    throw new Error("This save has an unsupported format");
  return {
    player,
    active: (value.active ?? null) as PlayerProgress["active"],
    pendingHours: (value.pendingHours ?? null) as number | null,
    reward: typeof value.reward === "number" ? value.reward : 0,
  };
}

/** One private document per player. Transactions prevent accidental lost updates;
 * the player controls their own game state under the casual-game trust model. */
export class ProgressStore {
  constructor(
    private db: Firestore,
    private board: CountryBoard,
    private levels: Mission[],
    private navigation?: Navigation,
    private now: () => number = Date.now,
  ) {}

  async load(uid: string): Promise<PlayerProgress> {
    return (await this.loadWithReceipt(uid)).progress;
  }
  async loadWithReceipt(uid: string): Promise<ProgressReceipt> {
    const ref = doc(this.db, "players", uid);
    return runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) {
        const data = snapshot.data();
        return {
          progress: readProgress(data),
          lastMutationId:
            typeof data.lastMutationId === "string"
              ? data.lastMutationId
              : null,
        };
      }
      const progress = initialProgress(),
        lastMutationId = crypto.randomUUID();
      transaction.set(ref, {
        ...progress,
        lastMutationId,
        updatedAt: serverTimestamp(),
      });
      return { progress, lastMutationId };
    });
  }
  /** The browser has already validated and applied this single-player transition.
   * Persist its exact snapshot, guarded by ownership, revision and receipt ID. */
  async commit(uid: string, entry: PendingProgress): Promise<PlayerProgress> {
    const ref = doc(this.db, "players", uid);
    return runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Reload to initialize your save");
      const data = snapshot.data(),
        current = readProgress(data);
      if (data.lastMutationId === entry.actionId) return current;
      if (current.player.revision !== entry.revision)
        throw new ProgressConflict();
      if (entry.progress.player.revision !== entry.revision + 1)
        throw new Error("Invalid save revision");
      transaction.set(ref, {
        ...entry.progress,
        lastMutationId: entry.actionId,
        updatedAt: serverTimestamp(),
      });
      return entry.progress;
    });
  }

  async mutate(uid: string, change: ProgressMutation): Promise<PlayerProgress> {
    const ref = doc(this.db, "players", uid);
    return runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Reload to initialize your save");
      const data = snapshot.data(),
        current = readProgress(data);
      // A committed upload can lose its response. Reuse its ID when recovering.
      if (data.lastMutationId === change.actionId) return current;
      if (current.player.revision !== change.revision)
        throw new ProgressConflict();
      const next = advanceProgress(
        current,
        change,
        this.board,
        this.levels,
        this.now(),
        this.navigation,
      );
      transaction.set(ref, {
        ...next,
        lastMutationId: change.actionId,
        updatedAt: serverTimestamp(),
      });
      return next;
    });
  }
}
