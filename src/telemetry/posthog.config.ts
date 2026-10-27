import type { CaptureResult, PostHogConfig } from "posthog-js";
import { COLLECTED_EVENTS, COMMON_PARAMETERS, EVENTS, PERFORMANCE_TRACES, type EventName } from "./events";

/** Public project token supplied by the owner; not an administrative key. */
export const POSTHOG_TOKEN = "phc_qvnmtmJK9HVoMtGsY6HHS66U6dcbfqBpR3ZBhkgCW54G";
const SDK_PROPERTIES = new Set([
  "token", "distinct_id", "$session_id", "$window_id", "$insert_id", "$lib", "$lib_version",
  "$browser", "$browser_version", "$os", "$device_type", "debug_mode",
]);
export const POSTHOG_CONFIG = {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-05-30",
  person_profiles: "never",
  // A fresh anonymous ID per page load; never reuse the formerly identified store.
  persistence: "memory",
  persistence_name: "patrol_anonymous_v1",
  ip: false,
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
  capture_performance: false,
  capture_exceptions: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  rageclick: false,
  disable_surveys: true,
  disable_conversations: true,
  advanced_disable_feature_flags: true,
  disable_external_dependency_loading: true,
  save_referrer: false,
  save_campaign_params: false,
  disable_capture_url_hashes: true,
  before_send(event: CaptureResult) {
    const isTiming = Object.hasOwn(PERFORMANCE_TRACES, event.event);
    if (!COLLECTED_EVENTS.has(event.event) && !isTiming) return null;
    const parameters: readonly string[] = isTiming
      ? ["duration_ms", "country"]
      : [...COMMON_PARAMETERS, ...EVENTS[event.event as EventName].parameters];
    const allowed = new Set([...parameters, ...SDK_PROPERTIES]);
    // An allow-list also strips automatic URLs, device IDs, attribution, person
    // updates, account details, attempt IDs and arbitrary SDK/remote additions.
    for (const [key, value] of Object.entries(event.properties)) {
      if (!allowed.has(key) || !["string", "number", "boolean"].includes(typeof value))
        delete event.properties[key];
    }
    delete event.$set;
    delete event.$set_once;
    event.properties.$process_person_profile = false;
    event.properties.$is_identified = false;
    event.properties.$geoip_disable = true;
    return event;
  },
} satisfies Partial<PostHogConfig>;
