import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_PARAMETERS, EVENTS, PARAMETERS } from "../telemetry/events";
import { sanitizeEvent } from "../telemetry";
import { playerProfile, savePlayerProfile } from "../player-profile";
import { POSTHOG_CONFIG } from "../telemetry/posthog.config";

test("analytics catalog keeps bounded names and documents every allowed parameter", () => {
  for (const [name, event] of Object.entries(EVENTS)) {
    assert(/^[a-z][a-z0-9_]{0,39}$/.test(name), name);
    assert(event.description && event.usedIn);
    assert(new Set([...COMMON_PARAMETERS, ...event.parameters]).size <= 25, name);
    for (const parameter of event.parameters) { assert(PARAMETERS[parameter]); assert(parameter.length <= 40); }
  }
});

test("PostHog's automatic URL and attribution properties are removed from events and person updates", () => {
  const privateUrl = "https://example.com/patrol/?name=Ada#private";
  const initial = { $initial_current_url: privateUrl, $initial_referrer: privateUrl, utm_source: privateUrl, gclid: privateUrl, name: "Ada", profile_name_set: "yes" };
  const sent = POSTHOG_CONFIG.before_send({
    uuid: crypto.randomUUID(), event: "$identify",
    properties: { distinct_id: "random-profile-id", $current_url: privateUrl, $session_entry_url: privateUrl, $session_entry_utm_source: privateUrl, utm_source: privateUrl, $referrer: privateUrl, $set: { ...initial }, $set_once: { ...initial } },
    $set: { ...initial }, $set_once: { ...initial },
  });
  assert(!JSON.stringify(sent).includes(privateUrl));
  assert.equal(sent.properties.distinct_id, "random-profile-id");
  for (const properties of [sent.$set, sent.$set_once, sent.properties.$set, sent.properties.$set_once]) assert.deepEqual(properties, { name: "Ada", profile_name_set: "yes" });
});

test("event allow-list drops names, images, filenames, errors, and unrelated fields", () => {
  const dirty = { country: "usa", has_photo: true, name: "Officer Ada", photo: "data:image/png;base64,private", filename: "private.jpg", error: "personal error", distance_km: 12, duration_ms: NaN };
  assert.deepEqual(sanitizeEvent("poster_open", dirty), { country: "usa", has_photo: true });
  assert.deepEqual(sanitizeEvent("move_issued", dirty), { country: "usa", distance_km: 12 });
});

test("SDK survey lifecycle payloads and exact interaction flags survive the privacy filter", () => {
  const surveyId = "01a1468e-96f5-0000-eba8-078f7982be33";
  for (const event of ["survey shown", "survey sent", "survey dismissed", "survey abandoned"]) {
    for (const iteration of [undefined, 1]) {
      const responded = `$survey_responded/${surveyId}${iteration ? `/${iteration}` : ""}`;
      const dismissed = `$survey_dismissed/${surveyId}${iteration ? `/${iteration}` : ""}`;
      const markers = { [responded]: true, [dismissed]: true, "$survey_responded/unrelated": true, $initial_current_url: "https://example.com/private" };
      const payload = { $survey_id: surveyId, $survey_iteration: iteration, $survey_submission_id: "submission", $survey_completed: false, $survey_response_question: 4 };
      const sent = POSTHOG_CONFIG.before_send({
        uuid: crypto.randomUUID(), event,
        properties: { ...payload, $current_url: "https://example.com/private", $set: { ...markers } },
        $set: { ...markers },
      });
      for (const [key, value] of Object.entries(payload)) assert.equal(sent.properties[key], value);
      const expected = event === "survey sent" ? { [responded]: true } : event === "survey dismissed" ? { [dismissed]: true } : {};
      assert.deepEqual(sent.properties.$set, expected);
      assert.deepEqual(sent.$set, expected);
      assert(!JSON.stringify(sent).includes("https://example.com/private"));
    }
  }
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
