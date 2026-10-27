import test from "node:test";
import assert from "node:assert/strict";
import { initMetaPixel, metaEvents, META_PIXEL_ID } from "../telemetry/meta-pixel";

test("Meta queues PageView before early gameplay and initializes only once", () => {
  const target: Parameters<typeof initMetaPixel>[0] = {};
  const scripts: HTMLScriptElement[] = [];
  const document = {
    createElement: () => ({}) as HTMLScriptElement,
    head: { appendChild: (script: HTMLScriptElement) => { scripts.push(script); } },
  } as unknown as Parameters<typeof initMetaPixel>[1];
  const send = initMetaPixel(target, document);
  send("level_start", { country: "india", hunt_number: 1 });
  assert.equal(initMetaPixel(target, document), send);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].src, "https://connect.facebook.net/en_US/fbevents.js");
  assert.deepEqual(target.fbq!.queue, [
    ["set", "autoConfig", false, META_PIXEL_ID],
    ["init", META_PIXEL_ID],
    ["trackSingle", META_PIXEL_ID, "PageView"],
    ["trackSingleCustom", META_PIXEL_ID, "GameStart", { country: "india", hunt_number: 1 }],
  ]);
  const delivered: unknown[][] = [];
  target.fbq!.callMethod = (...args) => { delivered.push(args); };
  send("level_end", { success: 1, score: 6 });
  assert.deepEqual(delivered, [
    ["trackSingleCustom", META_PIXEL_ID, "GameCompleted", { success: 1, score: 6 }],
    ["trackSingleCustom", META_PIXEL_ID, "GameWon", { success: 1, score: 6 }],
  ]);
});

test("Meta distinguishes loss, resume, guided completion and successful sharing", () => {
  assert.deepEqual(metaEvents("level_end", { success: 0 }).map(event => event.name), ["GameCompleted"]);
  assert.equal(metaEvents("game_resume", {})[0].name, "GameResume");
  assert.equal(metaEvents("guide_complete", {})[0].name, "TutorialCompleted");
  assert.equal(metaEvents("poster_download", {})[0].name, "NewspaperDownloaded");
  assert.equal(metaEvents("squad_purchase", {})[0].name, "SquadPurchased");
  assert.equal(metaEvents("squad_training", {})[0].name, "SquadTrainingStarted");
  assert.equal(metaEvents("poster_share_result", { reason: "success" })[0].name, "NewspaperShared");
  for (const reason of ["cancelled", "failed", "downloaded"]) assert.deepEqual(metaEvents("poster_share_result", { reason }), []);
  for (const name of ["app_open", "move_issued", "poster_profile_edit", "poster_photo_select", "map_gesture", "level_abandon"] as const) assert.deepEqual(metaEvents(name, {}), []);
});

test("Meta gameplay properties exclude identity, free-form data and non-finite values", () => {
  const dirty = {
    country: "india", success: 1, score: 6, elapsed_seconds: NaN,
    attempt_id: "private-id", name: "Officer Ada", email: "private@example.test", photo: "private-photo",
    url: "https://private.example", has_name: true, capture_region: "private region",
  };
  assert.deepEqual(metaEvents("level_end", dirty)[0].properties, { country: "india", success: 1, score: 6 });
});
