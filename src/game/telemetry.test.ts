import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTED_EVENTS, COMMON_PARAMETERS, EVENTS, PARAMETERS } from "../telemetry/events";
import { sanitizeEvent } from "../telemetry";
import { playerProfile, savePlayerProfile } from "../player-profile";
import { POSTHOG_CONFIG, POSTHOG_TOKEN } from "../telemetry/posthog.config";

test("analytics catalog keeps bounded names and documents every allowed parameter", () => {
  for (const [name, event] of Object.entries(EVENTS)) {
    assert(/^[a-z][a-z0-9_]{0,39}$/.test(name), name);
    assert(event.description && event.usedIn);
    assert(new Set([...COMMON_PARAMETERS, ...event.parameters]).size <= 25, name);
    for (const parameter of event.parameters) { assert(PARAMETERS[parameter]); assert(parameter.length <= 40); }
  }
});

test("all outbound events are personless and strip identity and SDK metadata", () => {
  for (const event of [...COLLECTED_EVENTS, "country_prepare"]) {
    const sent = POSTHOG_CONFIG.before_send({
      uuid: crypto.randomUUID(), event,
      properties: {
        token: POSTHOG_TOKEN, distinct_id: "fresh-page-anonymous-id", country: "india",
        $process_person_profile: true, $is_identified: true,
        $device_id: "old-browser-id", $user_id: "firebase-uid", attempt_id: "saved-attempt",
        $current_url: "https://private.example/?email=private", $referrer: "private",
        $initial_current_url: "private", $session_entry_url: "private", utm_source: "private",
        email: "private", name: "private", photo: "private", $set: { name: "private" },
        $set_once: { name: "private" }, $groups: { account: "private" },
      },
      $set: { name: "private" }, $set_once: { name: "private" },
    });
    assert(sent);
    assert(!JSON.stringify(sent).includes("private"));
    assert(!JSON.stringify(sent).includes("saved-attempt"));
    assert(!JSON.stringify(sent).includes("old-browser-id"));
    assert.equal(sent.properties.token, POSTHOG_TOKEN);
    assert.equal(sent.properties.distinct_id, "fresh-page-anonymous-id");
    assert.equal(sent.properties.$process_person_profile, false);
    assert.equal(sent.properties.$is_identified, false);
    assert.equal(sent.properties.$geoip_disable, true);
    assert.equal(sent.$set, undefined);
    assert.equal(sent.$set_once, undefined);
  }
});

test("anonymous configuration cannot reuse identified storage or load replay/survey extensions", () => {
  assert.equal(POSTHOG_CONFIG.person_profiles, "never");
  assert.equal(POSTHOG_CONFIG.persistence, "memory");
  assert.equal(POSTHOG_CONFIG.ip, false);
  assert.equal(POSTHOG_CONFIG.disable_session_recording, true);
  assert.equal(POSTHOG_CONFIG.disable_surveys, true);
  assert.equal(POSTHOG_CONFIG.disable_external_dependency_loading, true);
});

test("transport rejects noisy and retired flows plus SDK identity/replay events", () => {
  for (const event of ["map_gesture", "move_issued", "helicopter_deploy", "post_select",
    "squad_select", "guide_step_view", "hint_request", "poster_crop_adjust",
    "$identify", "$create_alias", "$groupidentify", "$snapshot", "survey sent", "$autocapture"]) {
    assert(!COLLECTED_EVENTS.has(event));
    assert.equal(POSTHOG_CONFIG.before_send({ uuid: crypto.randomUUID(), event, properties: {} }), null);
  }
});

test("funnel retains level, roster, economy and tutorial dimensions without save IDs", () => {
  assert.deepEqual(sanitizeEvent("level_start", {
    country: "india", hunt_number: 3, empty_slots: 1, rapid_rank: 2,
    ...{ attempt_id: "secret", uid: "secret", email: "secret" },
  }), { country: "india", hunt_number: 3, empty_slots: 1, rapid_rank: 2 });
  assert.deepEqual(sanitizeEvent("squad_training", {
    squad_type: "rapid", upgrade_rank: 2, training_seconds: 30, amount: 80,
  }), { squad_type: "rapid", upgrade_rank: 2, training_seconds: 30, amount: 80 });
  assert.deepEqual(sanitizeEvent("guide_complete", {
    lesson: "academy", duration_ms: 15000,
  }), { lesson: "academy", duration_ms: 15000 });
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
