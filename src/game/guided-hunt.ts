import type { PatrolGame } from "./engine";
import type { StartingSetup } from "./types";

export type GuideStep = { kind: "post" | "squad" | "moving"; move: number; order: StartingSetup["witness"][number] } | { kind: "complete" };
type HuntState = Pick<PatrolGame, "setup" | "history" | "ordersUsed" | "activeOrder" | "outcome">;

/** Resume only a verified sequence prefix. An existing free-play save must never
 * be rewound or forced onto a recommendation that no longer fits its state. */
export function guidedHuntStep(game: HuntState, selectedPost: number | null): GuideStep | null {
  const witness = game.setup.witness;
  if (!witness.length || game.history.length !== game.ordersUsed || game.ordersUsed > witness.length) return null;
  if (!game.history.every((order, index) => order.squad === witness[index].squad && order.to === witness[index].border)) return null;
  if (game.outcome.kind === "won") return game.ordersUsed === witness.length ? { kind: "complete" } : null;
  if (game.outcome.kind !== "playing") return null;
  if (game.activeOrder) {
    const move = game.ordersUsed - 1, order = witness[move];
    return order && game.activeOrder.squad === order.squad && game.activeOrder.to === order.border ? { kind: "moving", move, order } : null;
  }
  const move = game.ordersUsed, order = witness[move];
  return order ? { kind: selectedPost === order.border ? "squad" : "post", move, order } : null;
}
