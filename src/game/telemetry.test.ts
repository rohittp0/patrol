import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_PARAMETERS, EVENTS, PARAMETERS } from "../telemetry/events";
import { sanitizeEvent } from "../telemetry";
import { playerProfile, savePlayerProfile } from "../player-profile";

test("analytics catalog respects GA event limits and documents every allowed parameter", () => {
  for (const [name, event] of Object.entries(EVENTS)) {
    assert(/^[a-z][a-z0-9_]{0,39}$/.test(name), name);
    assert(event.description && event.usedIn);
    assert(new Set([...COMMON_PARAMETERS, ...event.parameters]).size <= 25, name);
    for (const parameter of event.parameters) { assert(PARAMETERS[parameter]); assert(parameter.length <= 40); }
  }
});

test("event allow-list drops names, images, filenames, errors, and unrelated fields", () => {
  const dirty = { country: "usa", has_photo: true, name: "Officer Ada", photo: "data:image/png;base64,private", filename: "private.jpg", error: "personal error", distance_km: 12, duration_ms: NaN };
  assert.deepEqual(sanitizeEvent("poster_open", dirty), { country: "usa", has_photo: true });
  assert.deepEqual(sanitizeEvent("move_issued", dirty), { country: "usa", distance_km: 12 });
});

test("local profile migrates to name plus finished crop and discards original/crop settings", () => {
  let value = JSON.stringify({ name: "Ada", photo: "data:image/png;base64,Y3JvcA==", original: "private original", crop: { zoom: 2 } });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => value, setItem: (_: string, next: string) => { value = next; } } });
  try {
    const profile = playerProfile();
    assert.deepEqual(Object.keys(JSON.parse(value)).sort(), ["id", "name", "photo"]);
    assert.match(profile.id, /^[0-9a-f-]{36}$/);
    assert(savePlayerProfile({ name: "New name", photo: "data:image/webp;base64,Y3JvcA==" }));
    assert.equal(JSON.parse(value).photo, "data:image/webp;base64,Y3JvcA==");
    assert.equal(JSON.parse(value).id, profile.id);
    assert(savePlayerProfile({ photo: null })); assert.equal(JSON.parse(value).photo, null);
  } finally { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else Reflect.deleteProperty(globalThis, "localStorage"); }
});
