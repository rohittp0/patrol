import { PatrolGame, type GameRules, type GameSnapshot } from "./game/engine";
import { Navigation } from "./game/navigation";
import { findHint } from "./game/hints";
import type { CountryBoard, StartingSetup } from "./game/types";

export type HintRequest =
  | { kind: "board"; board: CountryBoard }
  | { kind: "search"; setup: StartingSetup; rules: GameRules; snapshot: GameSnapshot };

let board: CountryBoard;
let navigation: Navigation;
self.onmessage = (event: MessageEvent<HintRequest>) => {
  if (event.data.kind === "board") {
    board = event.data.board;
    navigation = new Navigation(board);
    return;
  }
  try {
    const { setup, rules, snapshot } = event.data;
    const game = PatrolGame.fromSnapshot(board, setup, rules, snapshot, navigation);
    self.postMessage({ result: findHint(game) });
  } catch {
    self.postMessage({ error: "Hint calculation could not finish. Try again." });
  }
};
