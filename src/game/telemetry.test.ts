import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { COLLECTED_EVENTS, COMMON_PARAMETERS, EVENTS, PARAMETERS } from "../telemetry/events";
import { sanitizeEvent } from "../telemetry";
import { playerProfile, savePlayerProfile } from "../player-profile";
import { POSTHOG_CONFIG, POSTHOG_TOKEN } from "../telemetry/posthog.config";
import { PLAYTEST_CONFIG } from "./playtest.config";

test("analytics catalog keeps bounded names and documents every allowed parameter", () => {
  for (const [name, event] of Object.entries(EVENTS)) {
    assert(/^[a-z][a-z0-9_]{0,39}$/.test(name), name);
    assert(event.description && event.usedIn);
    assert(new Set([...COMMON_PARAMETERS, ...event.parameters]).size <= 25, name);
    for (const parameter of event.parameters) { assert(PARAMETERS[parameter]); assert(parameter.length <= 40); }
  }
});

test("events strip unapproved identity and SDK metadata without overriding SDK identity flags", () => {
  for (const event of [...COLLECTED_EVENTS, "country_prepare"]) {
    const sent = POSTHOG_CONFIG.before_send({
      uuid: crypto.randomUUID(), event,
      properties: {
        token: POSTHOG_TOKEN, distinct_id: "fresh-page-anonymous-id", country: "india",
        $process_person_profile: true, $is_identified: true,
        $device_id: "old-browser-id", $user_id: "firebase-uid", attempt_id: "saved-attempt",
        $current_url: "https://private.example/?email=private", $referrer: "private",
        $initial_current_url: "private", $session_entry_url: "private",
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
    assert.equal(sent.properties.$process_person_profile, true);
    assert.equal(sent.properties.$is_identified, true);
    assert.equal(sent.properties.$geoip_disable, undefined);
    assert.equal(sent.$set, undefined);
    assert.equal(sent.$set_once, undefined);
  }
});

test("identified-only configuration persists browser identity and waits to start masked replay", () => {
  assert.equal(POSTHOG_CONFIG.person_profiles, "identified_only");
  assert.equal(POSTHOG_CONFIG.persistence, "localStorage+cookie");
  assert.equal(POSTHOG_CONFIG.persistence_name, "patrol_anonymous_v1");
  assert.equal(POSTHOG_CONFIG.internal_or_test_user_hostname, null);
  assert.equal(POSTHOG_CONFIG.ip, false);
  assert.equal(POSTHOG_CONFIG.disable_session_recording, true);
  assert.equal(POSTHOG_CONFIG.session_recording.maskAllInputs, true);
  assert.equal(POSTHOG_CONFIG.disable_surveys, true);
  assert.equal(POSTHOG_CONFIG.disable_external_dependency_loading, false);
});

test("transport rejects noisy and retired flows plus unwanted SDK identity events", () => {
  for (const event of ["map_gesture", "move_issued", "helicopter_deploy", "post_select",
    "squad_select", "guide_step_view", "hint_request", "poster_crop_adjust",
    "$create_alias", "$groupidentify", "$set", "survey sent", "$autocapture"]) {
    assert(!COLLECTED_EVENTS.has(event));
    assert.equal(POSTHOG_CONFIG.before_send({ uuid: crypto.randomUUID(), event, properties: {} }), null);
  }
});

test("guest person-processing flags survive the send filter", () => {
  const sent = POSTHOG_CONFIG.before_send({
    uuid: crypto.randomUUID(), event: "app_open",
    properties: { distinct_id: "guest", $process_person_profile: false, $is_identified: false },
  });
  assert(sent);
  assert.equal(sent.properties.$process_person_profile, false);
  assert.equal(sent.properties.$is_identified, false);
});

test("campaign tags survive without automatic URL or referrer properties", () => {
  const sent = POSTHOG_CONFIG.before_send({
    uuid: crypto.randomUUID(), event: "app_open",
    properties: {
      utm_source: "meta", utm_medium: "paid", utm_campaign: "launch", utm_content: "video",
      $referrer: "private", $current_url: "private", $initial_referrer: "private",
      $initial_utm_source: "private",
    },
  });
  assert(sent);
  for (const [key, value] of Object.entries({ utm_source: "meta", utm_medium: "paid", utm_campaign: "launch", utm_content: "video" }))
    assert.equal(sent.properties[key], value);
  assert(!JSON.stringify(sent).includes("private"));
  assert.equal(POSTHOG_CONFIG.save_campaign_params, true);
  assert.equal(POSTHOG_CONFIG.save_referrer, false);
});

test("identify keeps the merge IDs and bounded SDK metadata without person properties", () => {
  const sent = POSTHOG_CONFIG.before_send({
    uuid: crypto.randomUUID(), event: "$identify",
    properties: {
      token: POSTHOG_TOKEN, distinct_id: "firebase-uid", $anon_distinct_id: "previous-guest",
      $process_person_profile: true, $is_identified: true, $session_id: "session",
      $set: { email: "private" }, $set_once: { $initial_referrer: "private" },
      $current_url: "private", $initial_current_url: "private", $referrer: "private",
      email: "private", name: "private", signed_in: true, country: "private", uid: "private",
      $groups: { account: "private" },
    },
    $set: { email: "private" }, $set_once: { $initial_referrer: "private" },
  });
  assert(sent);
  assert.deepEqual(sent.properties, {
    token: POSTHOG_TOKEN, distinct_id: "firebase-uid", $anon_distinct_id: "previous-guest",
    $process_person_profile: true, $is_identified: true, $session_id: "session",
  });
  assert.equal(sent.$set, undefined);
  assert.equal(sent.$set_once, undefined);
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


test("session replay keeps its structured snapshots through the send filter", () => {
  const data = [{ type: 2, data: { node: { type: 0, childNodes: [] } } }];
  for (const identified of [false, true]) {
    const sent = POSTHOG_CONFIG.before_send({ uuid: crypto.randomUUID(), event: "$snapshot", properties: { token: POSTHOG_TOKEN, $snapshot_data: data, $session_id: "session", $window_id: "window", $process_person_profile: identified, $is_identified: identified } });
    assert(sent);
    assert.equal(sent.properties.$snapshot_data, data);
    assert.equal(sent.properties.$session_id, "session");
    assert.equal(sent.properties.$process_person_profile, identified);
    assert.equal(sent.properties.$is_identified, identified);
    assert.equal(sent.properties.$geoip_disable, undefined);
  }
});

type SdkCall = { method: "identify" | "reset" | "record" | "capture"; args: unknown[] };
let telemetryModuleNumber = 0;

/** Keep the lifecycle real, replacing only browser globals and the external SDK.
 * Loading stays under test control so Auth can move before or after SDK readiness. */
async function telemetryHarness(t: TestContext, identifiedAs?: string) {
  // Import while browser globals are absent: the real SDK constructor otherwise
  // installs browser listeners before its init boundary can be replaced.
  const { default: posthog } = await import("posthog-js");
  const calls: SdkCall[] = [];
  const captures: { name: string; params: Record<string, unknown>; distinctId: string }[] = [];
  let isIdentified = identifiedAs !== undefined;
  let distinctId = identifiedAs ?? "initial-guest";
  let resetCount = 0;
  let idleCallback: (() => void) | undefined;
  let sdkLoaded = false;
  const sdk = {
    _isIdentified: () => isIdentified,
    get_distinct_id: () => distinctId,
    identify: (uid: string) => {
      calls.push({ method: "identify", args: [uid] });
      isIdentified = true; distinctId = uid;
    },
    reset: () => {
      calls.push({ method: "reset", args: [] });
      isIdentified = false; distinctId = `new-guest-${++resetCount}`;
    },
    startSessionRecording: (...args: unknown[]) => { calls.push({ method: "record", args }); },
    sessionRecordingStarted: () => true,
    capture: (name: string, params: Record<string, unknown>) => {
      calls.push({ method: "capture", args: [name, params] });
      captures.push({ name, params, distinctId });
    },
  };
  const target = {
    requestIdleCallback: (callback: () => void) => { idleCallback = callback; return 1; },
  };
  const globals = {
    window: target,
    location: { search: "?telemetry_debug=1", origin: "http://localhost:3000" },
    document: { createElement: () => ({}), head: { appendChild: () => undefined } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  // Node exposes the CJS boundary as a namespace; the app imports this default.
  const originalInit = Object.getOwnPropertyDescriptor(posthog, "init");
  Object.defineProperty(posthog, "init", {
    configurable: true, value: () => { sdkLoaded = true; return sdk; },
  });
  t.after(() => {
    if (originalInit) Object.defineProperty(posthog, "init", originalInit);
    else Reflect.deleteProperty(posthog, "init");
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const telemetry: typeof import("../telemetry/index") = await import(`../telemetry/index.ts?test=${++telemetryModuleNumber}`);
  const settle = async () => {
    // Dynamic import and the recorder's readiness Promise cross task boundaries.
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
  };
  const ready = async () => {
    assert(idleCallback, "initTelemetry must schedule SDK loading");
    idleCallback();
    await settle();
    assert(sdkLoaded, "the controlled SDK boundary must have loaded");
  };
  const advance = async (milliseconds: number) => { t.mock.timers.tick(milliseconds); await settle(); };
  const debug = () => (target as typeof target & { __PATROL_TELEMETRY__: { ready: boolean; droppedStaleIdentity: number } }).__PATROL_TELEMETRY__;
  telemetry.initTelemetry();
  assert.equal(typeof telemetry.setTelemetryIdentity, "function", "Auth must be able to resolve telemetry identity");
  return { telemetry, calls, captures, ready, settle, advance, debug };
}

test("sign-out before SDK readiness drops queued account packets without identifying again", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.track("level_start", { country: "india" });
  h.telemetry.track("level_end", { success: 1 });
  h.telemetry.setTelemetryIdentity(null);
  await h.ready();
  assert.deepEqual(h.captures, []);
  assert.equal(h.calls.filter(call => call.method === "identify").length, 0);
  assert.equal(h.debug().droppedStaleIdentity, 2);
});

test("guest to account to guest drops the old guest packets and re-arms a discarded app_open", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity(null);
  h.telemetry.track("app_open");
  h.telemetry.track("level_start", { country: "india" });
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.setTelemetryIdentity(null);
  await h.ready();
  assert.deepEqual(h.captures, []);
  assert.equal(h.calls.filter(call => call.method === "identify" || call.method === "reset").length, 0);
  assert.equal(h.debug().droppedStaleIdentity, 2);
  assert.deepEqual(h.calls.filter(call => call.method === "record" && call.args.length), [
    { method: "record", args: [{ event_trigger: true }] },
  ]);
});

test("queued account events identify once before they are captured", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.track("app_open");
  h.telemetry.track("level_start", { country: "india" });
  await h.ready();
  assert.deepEqual(h.calls.filter(call => call.method === "identify"), [{ method: "identify", args: ["account-A"] }]);
  assert(h.calls.findIndex(call => call.method === "identify") < h.calls.findIndex(call => call.method === "capture"));
  assert.deepEqual(h.captures.map(({ name, distinctId }) => ({ name, distinctId })), [
    { name: "app_open", distinctId: "account-A" }, { name: "level_start", distinctId: "account-A" },
  ]);
  assert.equal(h.captures[1].params.country, "india");
  assert.equal(h.captures[1].params.debug_mode, true);
  assert.equal(h.debug().droppedStaleIdentity, 0);
});

test("unresolved Auth leaves a persisted identity alone until confirmed guest resolution", async t => {
  const h = await telemetryHarness(t, "persisted-account");
  h.telemetry.track("app_open");
  await h.ready();
  assert.equal(h.calls.length, 0);
  assert.equal(h.debug().ready, false);
  h.telemetry.setTelemetryIdentity(null);
  await h.settle();
  assert.deepEqual(h.calls.filter(call => call.method !== "capture"), [
    { method: "reset", args: [] }, { method: "record", args: [{ event_trigger: true }] },
  ]);
  assert.equal(h.captures.length, 1);
  assert.equal(h.captures[0].distinctId, "new-guest-1");
  assert.equal(h.debug().droppedStaleIdentity, 0);
  await h.advance(PLAYTEST_CONFIG.telemetry.replayReadyTimeoutMs);
  assert.equal(h.captures.length, 1, "resolved Auth cancels the fallback flush");
});

test("first Auth resolution to the persisted uid keeps early packets without resetting", async t => {
  const h = await telemetryHarness(t, "account-A");
  h.telemetry.track("app_open");
  await h.ready();
  assert.equal(h.calls.length, 0);
  h.telemetry.setTelemetryIdentity("account-A");
  await h.settle();
  assert.deepEqual(h.calls.filter(call => call.method === "identify" || call.method === "reset"), [
    { method: "identify", args: ["account-A"] },
  ]);
  assert.equal(h.captures.length, 1);
  assert.equal(h.captures[0].distinctId, "account-A");
  assert.equal(h.debug().droppedStaleIdentity, 0);
  await h.advance(PLAYTEST_CONFIG.telemetry.replayReadyTimeoutMs);
  assert.equal(h.captures.length, 1);
  assert.equal(h.calls.filter(call => call.method === "reset").length, 0);
});

test("sign-in before SDK readiness drops guest app_open and arms replay after identify", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity(null);
  h.telemetry.track("app_open");
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.track("level_start", { country: "india" });
  await h.ready();
  assert.deepEqual(h.calls.slice(0, 2), [
    { method: "identify", args: ["account-A"] }, { method: "record", args: [{ event_trigger: true }] },
  ]);
  assert.equal(h.calls.filter(call => call.method === "identify").length, 1);
  assert.equal(h.calls.filter(call => call.method === "reset").length, 0);
  assert.deepEqual(h.captures.map(capture => capture.name), ["level_start"]);
  assert.equal(h.captures[0].distinctId, "account-A");
  assert.equal(h.debug().droppedStaleIdentity, 1);
});

test("Auth restoring another account resets before identify and before queued captures", async t => {
  const h = await telemetryHarness(t, "account-A");
  h.telemetry.track("app_open");
  await h.ready();
  assert.equal(h.calls.length, 0);
  h.telemetry.setTelemetryIdentity("account-B");
  await h.settle();
  assert.deepEqual(h.calls.slice(0, 3), [
    { method: "reset", args: [] }, { method: "identify", args: ["account-B"] },
    { method: "record", args: [{ event_trigger: true }] },
  ]);
  assert.equal(h.captures.length, 1);
  assert.equal(h.captures[0].distinctId, "account-B");
  assert.equal(h.debug().droppedStaleIdentity, 0);
});

test("Auth timeout gates uploads and replay, then flushes exactly once under a fresh guest", async t => {
  const h = await telemetryHarness(t, "persisted-account");
  h.telemetry.track("country_load_error", { country: "india" });
  await h.ready();
  assert.equal(h.calls.length, 0);
  await h.advance(PLAYTEST_CONFIG.telemetry.replayReadyTimeoutMs - 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.debug().ready, false);
  await h.advance(1);
  assert.deepEqual(h.calls.filter(call => call.method !== "capture"), [
    { method: "reset", args: [] }, { method: "record", args: [{ event_trigger: true }] },
  ]);
  assert.equal(h.captures.length, 1);
  assert.equal(h.captures[0].name, "country_load_error");
  assert.equal(h.captures[0].distinctId, "new-guest-1");
  assert.equal(h.captures[0].params.signed_in, false);
  assert.equal(h.debug().ready, true);
  assert.equal(h.debug().droppedStaleIdentity, 0);
  h.telemetry.setTelemetryIdentity(null);
  await h.advance(PLAYTEST_CONFIG.telemetry.replayReadyTimeoutMs);
  assert.equal(h.captures.length, 1);
  assert.equal(h.calls.filter(call => call.method === "reset").length, 1);
});

test("live identity transitions re-arm replay and repeated Auth notifications are no-ops", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity(null);
  await h.ready();
  h.calls.length = 0;
  h.telemetry.setTelemetryIdentity(null);
  assert.equal(h.calls.length, 0);
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.setTelemetryIdentity("account-A");
  h.telemetry.setTelemetryIdentity("account-B");
  h.telemetry.setTelemetryIdentity(null);
  h.telemetry.setTelemetryIdentity(null);
  assert.deepEqual(h.calls, [
    { method: "identify", args: ["account-A"] }, { method: "record", args: [{ event_trigger: true }] },
    { method: "reset", args: [] }, { method: "identify", args: ["account-B"] }, { method: "record", args: [{ event_trigger: true }] },
    { method: "reset", args: [] }, { method: "record", args: [{ event_trigger: true }] },
  ]);
});

test("every collected event carries the release version through the SDK filter", async t => {
  const h = await telemetryHarness(t);
  h.telemetry.setTelemetryIdentity(null);
  for (const name of COLLECTED_EVENTS) h.telemetry.track(name as keyof typeof EVENTS, { app_version: "old-caller-version" });
  await h.ready();
  assert.equal(h.captures.length, COLLECTED_EVENTS.size);
  for (const capture of h.captures) {
    const sent = POSTHOG_CONFIG.before_send({ uuid: crypto.randomUUID(), event: capture.name, properties: capture.params });
    assert(sent);
    assert.equal(sent.properties.app_version, "2.1.0", capture.name);
  }
});
