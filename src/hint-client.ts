import type { PatrolGame } from "./game/engine";
import type { HintResult } from "./game/hints";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import type { CountryBoard } from "./game/types";
import type { HintRequest } from "./hint.worker";

/** One cancellable worker per board. Heavy search never blocks map input. */
export class HintClient {
  private worker: Worker | null = null;
  private board: CountryBoard | null = null;
  private reject: ((error: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  cancel(reason = "cancelled") {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.board = null;
    this.reject?.(new Error(reason));
    this.reject = null;
  }

  find(game: PatrolGame): Promise<HintResult> {
    if (this.reject) this.cancel();
    if (!this.worker || this.board !== game.board) {
      this.cancel();
      this.worker = new Worker(new URL("./hint.worker.ts", import.meta.url), { type: "module" });
      this.board = game.board;
      this.worker.postMessage({ kind: "board", board: game.board } satisfies HintRequest);
    }
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.timer = setTimeout(() => this.cancel("Hint calculation timed out. Try again."), CONFIG.hints.searchTimeMs + CONFIG.hints.workerGraceMs);
      this.worker!.onmessage = (event: MessageEvent<{ result?: HintResult; error?: string }>) => {
        clearTimeout(this.timer);
        this.reject = null;
        if (event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      this.worker!.onerror = () => this.cancel("Hint calculation could not start. Try again.");
      this.worker!.postMessage({ kind: "search", setup: game.setup, rules: game.rules, snapshot: game.snapshot() } satisfies HintRequest);
    });
  }
}
