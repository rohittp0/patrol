import test from "node:test";
import assert from "node:assert/strict";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { patrolMapStyle } from "./patrol-map-style";
import { BasemapStatus } from "./basemap-status";
test("Patrol tactical style validates and has no external keyed style dependency", () => {
  const style = patrolMapStyle();
  assert.deepEqual(validateStyleMin(style), []);
  assert(style.sources.world);
  assert(style.layers.some((l) => l.id === "water"));
  assert(style.layers.some((l) => l.id === "town-names"));
  assert(!JSON.stringify(style).includes("key="));
  assert(!JSON.stringify(style).includes("lascadian"));
  assert(!style.sprite);
});
test("a glyph or single tile failure cannot produce a total basemap warning", () => {
  const status = new BasemapStatus();
  assert(!status.sourceError(undefined));
  assert(!status.sourceError("patrol-route"));
  assert(status.sourceError("world"));
  status.sourceData("metadata", false);
  assert(!status.sourceError("world"));
  status.sourceData("content", true);
  assert(status.available);
});
