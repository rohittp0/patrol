import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advanceProgress,
  initialProgress,
  type PlayerProgress,
  type ProgressMutation,
} from "./player-progress";
import { Navigation } from "./navigation";
import type { CountryBoard } from "./types";
import type { Mission } from "./missions";
const board: CountryBoard = JSON.parse(
  readFileSync(
    new URL("../../public/data/india.json", import.meta.url),
    "utf8",
  ),
);
const levels: Mission[] = JSON.parse(
  readFileSync(
    new URL("../../public/data/india-campaign.json", import.meta.url),
    "utf8",
  ),
).levels;
const nav = new Navigation(board);
const change = (
  state: PlayerProgress,
  input: Omit<ProgressMutation, "actionId" | "revision">,
) =>
  advanceProgress(
    state,
    {
      ...input,
      actionId: crypto.randomUUID(),
      revision: state.player.revision,
    },
    board,
    levels,
    1000,
    nav,
  );

test("browser progression only pays a completed win once and preserves the original state", () => {
  const original = initialProgress();
  let state = change(original, {
    op: "start",
    level: 1,
    selection: ["patrol-1", "patrol-2", "patrol-3"],
  });
  assert.equal(original.active, null);
  const attemptId = state.active!.id;
  assert.throws(
    () => change(state, { op: "finish", attemptId, moves: [] }),
    /Complete/,
  );
  state = change(state, { op: "finish", attemptId, moves: levels[0].witness });
  assert.equal(state.player.wallet, 90);
  assert.equal(state.player.unlocked, 2);
  assert.equal(state.active, null);
  assert.throws(
    () => change(state, { op: "finish", attemptId, moves: levels[0].witness }),
    /no longer active/,
  );
  state = change(state, {
    op: "start",
    level: 1,
    selection: ["patrol-1", "patrol-2", "patrol-3"],
  });
  state = change(state, {
    op: "finish",
    attemptId: state.active!.id,
    moves: levels[0].witness,
  });
  assert.equal(state.reward, 0);
  assert.equal(state.player.wallet, 90);
});
test("partial-move checkpoints cannot rewind saved time or replace prior moves", () => {
  let state = change(initialProgress(), {
    op: "start",
    level: 1,
    selection: ["patrol-1", "patrol-2", "patrol-3"],
  });
  const attemptId = state.active!.id,
    moves = [levels[0].witness[0]];
  state = change(state, { op: "save", attemptId, moves, pendingHours: 0.1 });
  assert.throws(
    () => change(state, { op: "save", attemptId, moves, pendingHours: 0 }),
    /newer/,
  );
  assert.throws(
    () => change(state, { op: "save", attemptId, moves: [] }),
    /history/,
  );
  state = change(state, { op: "save", attemptId, moves, pendingHours: null });
  assert.throws(
    () => change(state, { op: "save", attemptId, moves, pendingHours: 0.2 }),
    /newer/,
  );
  assert.throws(
    () => change(state, { op: "save", attemptId: "another-attempt", moves }),
    /no longer/,
  );
});
test("browser training honors its clock and keeps empty-slot play available", () => {
  let state = initialProgress();
  state.player.unlocked = 3;
  state.player.wallet = 100;
  state = change(state, {
    op: "action",
    action: { kind: "purchase", squad: "rapid" },
  });
  state = change(state, {
    op: "action",
    action: { kind: "train", squad: "rapid" },
  });
  assert.equal(state.player.squads.rapid!.training!.readyAt, 31000);
  state = change(state, {
    op: "start",
    level: 3,
    selection: [null, null, null],
  });
  assert.equal(state.active!.rules.squadCount, 0);
  state = change(state, { op: "abandon" });
  state = advanceProgress(
    state,
    {
      op: "start",
      level: 3,
      selection: ["rapid", null, null],
      actionId: crypto.randomUUID(),
      revision: state.player.revision,
    },
    board,
    levels,
    31000,
    nav,
  );
  assert.equal(state.active!.rules.units![0].speed, 240);
  assert.throws(
    () =>
      change(state, {
        op: "action",
        action: { kind: "train", squad: "rapid" },
      }),
    /saved level/,
  );
});
