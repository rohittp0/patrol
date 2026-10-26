import { PLAYTEST_CONFIG as CONFIG } from "../game/playtest.config";
import { playerProfile } from "../player-profile";
import { COMMON_PARAMETERS, EVENTS, PERFORMANCE_TRACES, type AnalyticsParams, type EventName } from "./events";
import { POSTHOG_CONFIG, POSTHOG_TOKEN } from "./posthog.config";
import { initMetaPixel } from "./meta-pixel";

type Packet = { name: EventName; params: AnalyticsParams };
const queued: Packet[] = [], recent: Packet[] = [];
let context: AnalyticsParams = {};
let send: ((packet: Packet) => void) | null = null;
let sendMeta: ReturnType<typeof initMetaPixel> | null = null;
let setProfile: (() => void) | null = null;
let recordTrace: ((name: keyof typeof PERFORMANCE_TRACES, start: number, duration: number, country?: string) => void) | null = null;
let traceQueue: { name: keyof typeof PERFORMANCE_TRACES; start: number; duration: number; country?: string }[] = [];
let initialized = false;
let debug = false;
let tracesRecorded = 0;

/** Runtime allow-list is deliberate: unknown fields are dropped even if a caller
 * defeats TypeScript. Never send free-form names, photos, URLs, or error messages. */
export function sanitizeEvent(name: EventName, params: AnalyticsParams): AnalyticsParams {
  const allowed = new Set<string>([...COMMON_PARAMETERS, ...EVENTS[name].parameters]);
  return Object.fromEntries(Object.entries(params).filter(([key, value]) => allowed.has(key) && (typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 100) : value]));
}

export function gameContext(next: AnalyticsParams) { context = sanitizeEvent("level_start", next); }
export function track(name: EventName, params: AnalyticsParams = {}) {
  if (!CONFIG.telemetry.enabled) return;
  const packet = { name, params: sanitizeEvent(name, { ...context, ...params }) };
  try { sendMeta?.(name, packet.params); } catch { /* A blocked pixel cannot interrupt play or PostHog. */ }
  recent.push(packet); if (recent.length > CONFIG.telemetry.maxQueuedEvents) recent.shift();
  if (send) { try { send(packet); } catch { /* Collection cannot interrupt play. */ } }
  else { queued.push(packet); if (queued.length > CONFIG.telemetry.maxQueuedEvents) queued.shift(); }
}

export function profileChanged() { try { setProfile?.(); } catch { /* Profile collection is optional. */ } }

/** Captures actual work duration even if the SDK loads after the work finishes.
 * No performance observer or timer runs in the frame loop. */
export function measure(name: keyof typeof PERFORMANCE_TRACES, start: number, country?: string) {
  const value = { name, start: performance.timeOrigin + start, duration: performance.now() - start, country };
  if (recordTrace) recordTrace(name, value.start, value.duration, country);
  else if (traceQueue.length < 20) traceQueue.push(value);
}

export function initTelemetry() {
  if (initialized) return; initialized = true;
  debug = new URLSearchParams(location.search).get("telemetry_debug") === "1";
  if (import.meta.env.DEV || debug) Object.defineProperty(window, "__PATROL_TELEMETRY__", { get: () => ({ recent: structuredClone(recent), ready: !!send, metaReady: !!sendMeta, performanceReady: !!recordTrace, tracesRecorded }) });
  const allowed = CONFIG.telemetry.enabled && (debug || CONFIG.telemetry.enableInDevelopment || !import.meta.env.DEV && location.origin === CONFIG.hosting.productionOrigin);
  if (!allowed) { traceQueue = []; return; }
  try { sendMeta = initMetaPixel(window, document); } catch { /* Meta is optional; PostHog still loads. */ }
  const load = async () => {
    try {
      const { default: posthog } = await import("posthog-js");
      const instance = posthog.init(POSTHOG_TOKEN, POSTHOG_CONFIG);
      if (!instance) return;
      setProfile = () => {
        const profile = playerProfile();
        instance.identify(profile.id);
      };
      setProfile();
      instance.startSessionRecording();
      send = ({ name, params }) => { instance.capture(name, { ...params, ...(debug ? { debug_mode: true } : {}) }); };
      for (const packet of queued.splice(0)) send(packet);
      if (Math.random() < CONFIG.telemetry.performanceSampleRate || debug) {
        recordTrace = (name, start, duration, country) => {
          try {
            instance.capture(name, { duration_ms: Math.round(duration), ...(country ? { country } : {}), ...(debug ? { debug_mode: true } : {}) }, { timestamp: new Date(start + duration) });
            tracesRecorded++;
          }
          catch { /* Monitoring cannot interrupt later country/poster work. */ }
        };
        for (const item of traceQueue) recordTrace(item.name, item.start, item.duration, item.country);
      }
      traceQueue = [];
    } catch { queued.length = 0; traceQueue = []; /* Blocked telemetry must never break a hunt. */ }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(() => void load(), { timeout: CONFIG.telemetry.idleTimeoutMs });
  else setTimeout(() => void load(), CONFIG.telemetry.idleTimeoutMs);
}
