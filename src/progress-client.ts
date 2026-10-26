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
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { FIREBASE_CONFIG } from "./firebase.config";
import {
  applyAction,
  awardWin,
  newPlayer,
  settleTraining,
  type PlayerAction,
  type PlayerState,
  type SquadId,
} from "./game/collection";
import {
  createMission,
  replayAttempt,
  type Mission,
  type MissionAttempt,
} from "./game/missions";
import type { CountryBoard } from "./game/types";

export interface ProgressResponse {
  player: PlayerState;
  active: MissionAttempt | null;
  pendingHours: number | null;
  reward: number;
  serverNow: number;
}
const KEY = "patrol:progress:v2",
  PENDING = "patrol:pending:v2";
const CHECKPOINT = "patrol:checkpoint:v2";
export class ProgressClient {
  response: ProgressResponse = {
    player: newPlayer(),
    active: null,
    pendingHours: null,
    reward: 0,
    serverNow: Date.now(),
  };
  private app = initializeApp({
    ...FIREBASE_CONFIG,
    ...(location.hostname === "patrol.rohittp.com"
      ? { authDomain: location.hostname }
      : {}),
  });
  readonly auth = getAuth(this.app);
  private functions = getFunctions(this.app, "asia-south1");
  readonly local =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("local") === "1";
  private offset = 0;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    private board: CountryBoard,
    private levels: Mission[],
  ) {
    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_EMULATORS === "1"
    ) {
      connectAuthEmulator(this.auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFunctionsEmulator(this.functions, "127.0.0.1", 5001);
    }
  }
  get player() {
    return settleTraining(this.response.player, this.now());
  }
  get signedIn() {
    return !!this.auth.currentUser && !this.auth.currentUser.isAnonymous;
  }
  now() {
    return Date.now() + this.offset;
  }
  private store() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.response));
    } catch {
      /* Server state remains authoritative. */
    }
  }
  private accept(response: ProgressResponse) {
    this.response = response;
    this.offset = response.serverNow - Date.now();
    this.store();
    return response;
  }
  async load() {
    if (this.local) {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (saved?.player?.version === 2) this.response = saved;
      } catch {
        /* Fresh local test. */
      }
      return this.accept({ ...this.response, serverNow: Date.now() });
    }
    await this.auth.authStateReady();
    if (!this.auth.currentUser) await signInAnonymously(this.auth);
    const pending = localStorage.getItem(PENDING);
    if (pending) {
      const saved = JSON.parse(pending);
      if (saved.uid === this.auth.currentUser!.uid) {
        try {
          await this.remote(saved.input);
        } catch (error) {
          if (!this.definitive(error)) throw error;
        }
      }
      localStorage.removeItem(PENDING);
    }
    await this.remote({ op: "load", actionId: crypto.randomUUID() });
    const checkpoint = localStorage.getItem(CHECKPOINT);
    if (checkpoint) {
      const saved = JSON.parse(checkpoint);
      if (
        saved.uid === this.auth.currentUser!.uid &&
        saved.attemptId === this.response.active?.id
      ) {
        try {
          await this.operation("save", saved);
        } catch (error) {
          if (!this.definitive(error)) throw error;
        }
      }
      localStorage.removeItem(CHECKPOINT);
    }
    return this.response;
  }
  private definitive(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      [
        "functions/aborted",
        "functions/failed-precondition",
        "functions/invalid-argument",
        "functions/permission-denied",
        "functions/unauthenticated",
      ].includes(String(error.code))
    );
  }
  private async remote(input: Record<string, unknown>) {
    const call = httpsCallable<Record<string, unknown>, ProgressResponse>(
      this.functions,
      "patrol",
      { timeout: 60000 },
    );
    const result = await call(input);
    return this.accept(result.data);
  }
  private operation(op: string, data: Record<string, unknown> = {}) {
    const frozen = structuredClone(data);
    const next = this.serial
      .catch(() => {})
      .then(() => this.perform(op, frozen));
    this.serial = next;
    return next;
  }
  private async perform(op: string, data: Record<string, unknown>) {
    const input = {
      op,
      ...data,
      actionId: crypto.randomUUID(),
      revision: this.response.player.revision,
    };
    if (this.local) return this.localOperation(op, data);
    if (localStorage.getItem(PENDING))
      throw new Error(
        "An earlier action is waiting to sync. Reload to recover it safely.",
      );
    localStorage.setItem(
      PENDING,
      JSON.stringify({ uid: this.auth.currentUser?.uid, input }),
    );
    try {
      const result = await this.remote(input);
      localStorage.removeItem(PENDING);
      return result;
    } catch (error) {
      if (this.definitive(error)) localStorage.removeItem(PENDING);
      throw error;
    }
  }
  private localOperation(op: string, data: Record<string, unknown>) {
    const r = structuredClone(this.response);
    r.reward = 0;
    r.serverNow = Date.now();
    if (op === "action")
      r.player = applyAction(r.player, data.action as PlayerAction, this.now());
    else if (op === "start") {
      const mission = this.levels.find((x) => x.number === data.level)!;
      const selection = data.selection as (SquadId | null)[];
      const { setup, rules, steps } = createMission(
        this.board,
        mission,
        r.player,
        selection,
        this.now(),
      );
      r.active = {
        id: crypto.randomUUID(),
        level: mission.number,
        selection,
        setup,
        rules,
        steps,
        moves: [],
      };
      r.pendingHours = null;
      r.player.selection = selection;
      r.player.revision++;
    } else if (op === "save" && r.active) {
      r.active.moves = data.moves as MissionAttempt["moves"];
      r.pendingHours = data.pendingHours as number | null;
      r.player.revision++;
    } else if (op === "finish" && r.active) {
      const game = replayAttempt(this.board, {
        ...r.active,
        moves: data.moves as MissionAttempt["moves"],
      });
      if (!game.won) throw new Error("Win not verified");
      const result = awardWin(r.player, r.active.level, game.ordersUsed);
      r.player = result.player;
      r.reward = result.reward;
      r.active = null;
      r.pendingHours = null;
    } else if (op === "abandon") {
      r.active = null;
      r.pendingHours = null;
      r.player.revision++;
    }
    return this.accept(r);
  }
  action(action: PlayerAction) {
    return this.operation("action", { action });
  }
  start(level: number, selection: (SquadId | null)[]) {
    return this.operation("start", { level, selection });
  }
  checkpoint(moves: MissionAttempt["moves"], pendingHours: number | null) {
    const value = JSON.stringify({
      uid: this.auth.currentUser?.uid,
      attemptId: this.response.active?.id,
      moves,
      pendingHours,
    });
    try {
      localStorage.setItem(CHECKPOINT, value);
    } catch {
      /* Online checkpoints still work. */
    }
    return value;
  }
  async save(moves: MissionAttempt["moves"], pendingHours: number | null) {
    const journal = this.checkpoint(moves, pendingHours);
    const result = await this.operation("save", {
      attemptId: this.response.active?.id,
      moves,
      pendingHours,
    });
    if (localStorage.getItem(CHECKPOINT) === journal)
      localStorage.removeItem(CHECKPOINT);
    return result;
  }
  async finish(moves: MissionAttempt["moves"]) {
    const result = await this.operation("finish", {
      attemptId: this.response.active?.id,
      moves,
    });
    localStorage.removeItem(CHECKPOINT);
    return result;
  }
  abandon() {
    return this.operation("abandon");
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
        localStorage.setItem(
          "patrol:guest-backup:v2",
          JSON.stringify(this.response),
        );
        await signInWithCredential(this.auth, credential);
      } else throw error;
    }
    await this.load();
  }
  async signOut() {
    await signOut(this.auth);
    localStorage.removeItem(KEY);
    await this.load();
  }
}
