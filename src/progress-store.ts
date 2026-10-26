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
    const ref = doc(this.db, "players", uid);
    return runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) return readProgress(snapshot.data());
      const progress = initialProgress();
      transaction.set(ref, {
        ...progress,
        lastMutationId: crypto.randomUUID(),
        updatedAt: serverTimestamp(),
      });
      return progress;
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
