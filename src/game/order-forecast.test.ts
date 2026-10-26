import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PatrolGame } from "./engine";
import { Navigation, distanceKm } from "./navigation";
import { createMission, type Mission } from "./missions";
import { newPlayer } from "./collection";
import { forecastOrder } from "./order-forecast";
import type { CountryBoard } from "./types";
const board: CountryBoard = JSON.parse(
  readFileSync("public/data/india.json", "utf8"),
);
const levels: Mission[] = JSON.parse(
  readFileSync("public/data/india-campaign.json", "utf8"),
).levels;
const nav = new Navigation(board);
test("every advertised pursuit matches the actual move, including arrival turns and firing", () => {
  for (const level of levels) {
    const p = newPlayer();
    p.unlocked = 15;
    level.recommended.forEach(
      ({ id, step }) => (p.squads[id] = { step, training: null }),
    );
    const { game } = createMission(
      board,
      level,
      p,
      level.recommended.map((s) => s.id),
      0,
      nav,
    );
    for (const move of level.witness) {
      const before = JSON.stringify(game.snapshot());
      const forecast = forecastOrder(game, move.squad, move.border)!;
      assert(forecast && forecast.runnerPath.length > 0);
      assert.equal(
        JSON.stringify(game.snapshot()),
        before,
        "preview must not play the move",
      );
      assert(game.issueOrder(move.squad, move.border));
      const duration = game.history.at(-1)!.durationHours;
      for (
        let i = 0;
        i < 127 && game.activeOrder && game.outcome.kind === "playing";
        i++
      )
        game.advanceHours(duration / 127);
      game.resolveOrder();
      assert(
        distanceKm(game.runner.position, forecast.runnerPath.at(-1)!) < 0.001,
        `Level ${level.number} preview endpoint`,
      );
      assert.equal(game.outcome.kind, forecast.outcome.kind);
      assert(
        Math.abs(
          game.history.at(-1)!.runnerTravelledKm - forecast.runnerDistanceKm,
        ) < 0.001,
      );
    }
  }
});
test("invalid previews spend no moves", () => {
  const level = levels[0],
    { game } = createMission(
      board,
      level,
      newPlayer(),
      ["patrol-1", "patrol-2", "patrol-3"],
      0,
      nav,
    );
  assert.equal(forecastOrder(game, 0, level.posts[0]), null);
  assert.equal(game.ordersUsed, 0);
});
