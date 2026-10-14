import { PLAYTEST_CONFIG as CONFIG } from "../game/playtest.config";
import { playerProfile } from "../player-profile";
import { COMMON_PARAMETERS, EVENTS, PERFORMANCE_TRACES, type AnalyticsParams, type EventName } from "./events";
import { FIREBASE_CONFIG } from "./firebase.config";

type Packet = { name: EventName; params: AnalyticsParams };
const queued: Packet[] = [], recent: Packet[] = [];
let context: AnalyticsParams = {};
let send: ((packet: Packet) => void) | null = null;
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
  recent.push(packet); if (recent.length > CONFIG.telemetry.maxQueuedEvents) recent.shift();
  if (send) { try { send(packet); } catch { /* Collection cannot interrupt play. */ } }
  else { queued.push(packet); if (queued.length > CONFIG.telemetry.maxQueuedEvents) queued.shift(); }
}

export function profileChanged() { try { setProfile?.(); } catch { /* Profile collection is optional. */ } }

/** Uses retroactive SDK trace recording, so lazy SDK loading doesn't inflate
 * measured duration. No performance observer or timer runs in the frame loop. */
export function measure(name: keyof typeof PERFORMANCE_TRACES, start: number, country?: string) {
  const value = { name, start: performance.timeOrigin + start, duration: performance.now() - start, country };
  if (recordTrace) recordTrace(name, value.start, value.duration, country);
  else if (traceQueue.length < 20) traceQueue.push(value);
}

export function initTelemetry() {
  if (initialized) return; initialized = true;
  debug = new URLSearchParams(location.search).get("telemetry_debug") === "1";
  if (import.meta.env.DEV || debug) Object.defineProperty(window, "__PATROL_TELEMETRY__", { get: () => ({ recent: structuredClone(recent), ready: !!send, performanceReady: !!recordTrace, tracesRecorded }) });
  const allowed = CONFIG.telemetry.enabled && (debug || CONFIG.telemetry.enableInDevelopment || !import.meta.env.DEV && location.origin === CONFIG.hosting.productionOrigin);
  if (!allowed) { traceQueue = []; return; }
  const load = async () => {
    try {
      const [{ initializeApp }, analytics] = await Promise.all([import("firebase/app"), import("firebase/analytics")]);
      const app = initializeApp(FIREBASE_CONFIG);
      if (await analytics.isSupported()) {
        const instance = analytics.initializeAnalytics(app, { config: { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: `${location.origin}${location.pathname}` } });
        setProfile = () => {
          const profile = playerProfile();
          analytics.setUserId(instance, profile.id);
          analytics.setUserProperties(instance, { profile_name_set: profile.name ? "yes" : "no", profile_photo_set: profile.photo ? "yes" : "no" });
        };
        setProfile();
        send = ({ name, params }) => analytics.logEvent(instance, name, { ...params, ...(debug ? { debug_mode: true } : {}) });
        for (const packet of queued.splice(0)) send(packet);
      }
      if (Math.random() < CONFIG.telemetry.performanceSampleRate || debug) {
        const perf = await import("firebase/performance");
        const instance = perf.initializePerformance(app, { instrumentationEnabled: false, dataCollectionEnabled: true });
        recordTrace = (name, start, duration, country) => {
          try { const trace = perf.trace(instance, name); trace.record(start, duration, { attributes: country ? { country } : {} }); tracesRecorded++; }
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
