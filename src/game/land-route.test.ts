import test from "node:test";
import assert from "node:assert/strict";
import { LandRoute } from "./land-route";
import { distanceKm } from "./navigation";
import type { Position } from "./types";

const length = (points: Position[]) => points.slice(1).reduce((sum, point, i) => sum + distanceKm(points[i], point), 0);

test("squad route replaces inland triangle zigzags with an arc", () => {
  const land = new LandRoute({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] });
  const original: Position[] = [[1, 1], [3, 4], [4, 2], [6, 6], [9, 9]];
  const smoothed = land.smooth(original);
  assert.deepEqual(smoothed[0], original[0]);
  assert.deepEqual(smoothed.at(-1), original.at(-1));
  assert(smoothed.length > 2, "The direct route should be an arc");
  assert(length(smoothed) < length(original));
  assert(smoothed.slice(1).every((point, i) => land.allows(smoothed[i], point)));
});

test("land shortcuts cannot cut across an ocean inlet", () => {
  const land = new LandRoute({ type: "Polygon", coordinates: [[[0, 0], [8, 0], [8, 8], [5, 8], [5, 3], [3, 3], [3, 8], [0, 8], [0, 0]]] });
  assert.equal(land.allows([1, 7], [7, 7]), false);
  const smoothed = land.smooth([[1, 7], [2, 2], [6, 2], [7, 7]]);
  assert(smoothed.slice(1).every((point, i) => land.allows(smoothed[i], point)));
});

test("curves and shortcuts respect inland water holes", () => {
  const land = new LandRoute({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] });
  assert.equal(land.allows([2, 5], [8, 5]), false);
  const smoothed = land.smooth([[2, 5], [3, 3], [7, 3], [8, 5]]);
  assert(smoothed.slice(1).every((point, i) => land.allows(smoothed[i], point)));
  assert.equal(land.contains([5, 5]), false);
});
