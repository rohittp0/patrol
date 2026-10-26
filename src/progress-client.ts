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
import type { CountryBoard } from "./game/types";
import type { Navigation } from "./game/navigation";
import { ProgressStore } from "./progress-store";

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
  CHECKPOINT = "patrol:checkpoint:v2";
export class ProgressClient {
  response: PlayerProgress = initialProgress();
  private app = initializeApp({
    ...FIREBASE_CONFIG,
    ...(location.hostname === "patrol.rohittp.com"
      ? { authDomain: location.hostname }
      : {}),
  });
  readonly auth = getAuth(this.app);
  private db = getFirestore(this.app);
  private store: ProgressStore;
  readonly local =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("local") === "1";
  private serial: Promise<unknown> = Promise.resolve();
  private volatile = new Map<string, string>();

  constructor(
    private board: CountryBoard,
    private levels: Mission[],
    private navigation?: Navigation,
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
      return localStorage.getItem(key);
    } catch {
      return this.volatile.get(key) ?? null;
    }
  }
  private put(key: string, value: string) {
    this.volatile.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Online saves still work if local storage is unavailable. */
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
  private definitive(error: unknown) {
    return (
      error instanceof Error &&
      (!("code" in error) ||
        [
          "progress/conflict",
          "permission-denied",
          "invalid-argument",
          "unauthenticated",
        ].includes(String(error.code)))
    );
  }
  async load() {
    await this.serial.catch(() => {});
    if (this.local) {
      const saved = this.read<CachedProgress>(KEY);
      const progress = saved && "progress" in saved ? saved.progress : saved;
      if (progress?.player?.version === 2) this.response = progress;
    } else {
      await this.auth.authStateReady();
      if (!this.auth.currentUser) await signInAnonymously(this.auth);
      this.response = await this.store.load(this.auth.currentUser!.uid);
    }
    const uid = this.auth.currentUser?.uid ?? "local";
    const pending = this.read<PendingSave>(PENDING);
    if (pending) {
      if (pending.uid === uid) {
        try {
          this.response = this.local
            ? advanceProgress(
                this.response,
                pending.input,
                this.board,
                this.levels,
                this.now(),
                this.navigation,
              )
            : await this.store.mutate(uid, pending.input);
        } catch (error) {
          if (!this.definitive(error)) throw error;
        }
      }
      this.remove(PENDING);
    }
    const checkpoint = this.read<Checkpoint>(CHECKPOINT);
    if (checkpoint) {
      if (
        checkpoint.uid === uid &&
        checkpoint.attemptId === this.response.active?.id
      ) {
        const input: ProgressMutation = {
          ...checkpoint,
          op: "save",
          actionId: crypto.randomUUID(),
          revision: this.response.player.revision,
        };
        try {
          this.response = this.local
            ? advanceProgress(
                this.response,
                input,
                this.board,
                this.levels,
                this.now(),
                this.navigation,
              )
            : await this.store.mutate(uid, input);
        } catch (error) {
          if (!this.definitive(error)) throw error;
        }
      }
      this.remove(CHECKPOINT);
    }
    return this.accept(this.response);
  }
  private operation(
    op: ProgressMutation["op"],
    data: Omit<Partial<ProgressMutation>, "op"> = {},
  ) {
    const frozen = structuredClone(data);
    const next = this.serial
      .catch(() => {})
      .then(async () => {
        if (this.get(PENDING))
          throw new Error(
            "An earlier action is waiting to sync. Reload to recover it safely.",
          );
        const input: ProgressMutation = {
          ...frozen,
          op,
          actionId: crypto.randomUUID(),
          revision: this.response.player.revision,
        };
        const uid = this.auth.currentUser?.uid ?? "local";
        this.put(PENDING, JSON.stringify({ uid, input }));
        try {
          const result = this.local
            ? advanceProgress(
                this.response,
                input,
                this.board,
                this.levels,
                this.now(),
                this.navigation,
              )
            : await this.store.mutate(uid, input);
          this.remove(PENDING);
          return this.accept(result);
        } catch (error) {
          if (this.definitive(error)) this.remove(PENDING);
          throw error;
        }
      });
    this.serial = next;
    return next;
  }
  action(action: PlayerAction) {
    return this.operation("action", { action });
  }
  start(level: number, selection: (SquadId | null)[]) {
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
  async google() {
    if (this.local)
      throw new Error("Google sign-in is available on the hosted game");
    if (this.get(PENDING))
      throw new Error(
        "Reconnect and reload to finish saving before signing in",
      );
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
        this.put("patrol:guest-backup:v2", JSON.stringify(this.response));
        await signInWithCredential(this.auth, credential);
      } else throw error;
    }
    await this.load();
  }
  async signOut() {
    await this.serial.catch(() => {});
    if (this.get(PENDING))
      throw new Error(
        "Reconnect and reload to finish saving before signing out",
      );
    await signOut(this.auth);
    this.remove(KEY);
    this.remove(CHECKPOINT);
    await this.load();
  }
}
