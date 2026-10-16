import type { CaptureResult, PostHogConfig } from "posthog-js";
import { USER_PROPERTIES } from "./events";

/** Public project token supplied by the owner; this is not an administrative key. */
export const POSTHOG_TOKEN = "phc_qvnmtmJK9HVoMtGsY6HHS66U6dcbfqBpR3ZBhkgCW54G";
export const POSTHOG_CONFIG = {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-05-30",
  // Gameplay events remain explicit; session replay records the play journey.
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: false,
  session_recording: {
    maskAllInputs: true,
    // Uploaded images, filenames and rendered portrait canvases stay local.
    blockSelector: "#player-photo, #crop-editor, #newspaper",
  },
  capture_performance: false,
  capture_exceptions: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  rageclick: false,
  disable_surveys: true,
  disable_conversations: true,
  save_referrer: false,
  save_campaign_params: false,
  disable_capture_url_hashes: true,
  // SDK session/initial attribution is independent of save_campaign_params and
  // our gameplay allow-list. Strip it, including nested person updates.
  before_send(event: CaptureResult) {
    for (const key of Object.keys(event.properties)) {
      if (key === "$current_url" || key === "$referrer" || key.startsWith("$initial_") || key.startsWith("$session_entry_") || key.startsWith("utm_")) delete event.properties[key];
    }
    for (const properties of [event.properties.$set, event.properties.$set_once, event.$set, event.$set_once]) {
      if (!properties) continue;
      for (const key of Object.keys(properties)) if (!Object.hasOwn(USER_PROPERTIES, key) && key !== "$internal_or_test_user") delete properties[key];
    }
    return event;
  },
} satisfies Partial<PostHogConfig>;
