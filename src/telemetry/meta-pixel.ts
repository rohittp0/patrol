import type { AnalyticsParams, EventName } from "./events";

/** Public destination ID supplied by the site owner, not a credential. */
export const META_PIXEL_ID = "1412945137121409";
type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Pixel;
  loaded: boolean;
  version: string;
};
type PixelWindow = { fbq?: Pixel; _fbq?: Pixel };
declare global { interface Window extends PixelWindow {} }
const clients = new WeakMap<PixelWindow, (name: EventName, params: AnalyticsParams) => void>();

// Deliberately smaller than PostHog's contract: no identity or profile fields.
const PARAMETERS = ["country", "case_id", "challenge_id", "hunt_number", "campaign_start_country", "moves_used", "moves_left", "squad_count", "success", "score", "reason", "elapsed_seconds", "hints_used", "entry", "method", "lesson", "squad_type", "amount", "upgrade_rank", "training_seconds"] as const;
const EVENTS: Partial<Record<EventName, string>> = {
  level_start: "GameStart",
  game_resume: "GameResume",
  level_end: "GameCompleted",
  guide_complete: "TutorialCompleted",
  first_squad_purchase: "FirstSquadPurchased",
  squad_purchase: "SquadPurchased",
  squad_training: "SquadTrainingStarted",
  poster_download: "NewspaperDownloaded",
};

export function metaEvents(name: EventName, params: AnalyticsParams) {
  const event = EVENTS[name] ?? (name === "poster_share_result" && params.reason === "success" ? "NewspaperShared" : undefined);
  if (!event) return [];
  const properties = Object.fromEntries(PARAMETERS.flatMap(key => {
    const value = params[key];
    return typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string"
      ? [[key, typeof value === "string" ? value.slice(0, 100) : value]] : [];
  }));
  return [event, ...(name === "level_end" && params.success === 1 ? ["GameWon"] : [])].map(name => ({ name, properties }));
}

/** The supplied async Meta bootstrap, behind Patrol's production/debug gate.
 * Keep this independent of PostHog loading, identification and performance work. */
export function initMetaPixel(target: PixelWindow, document: Pick<Document, "createElement" | "head">) {
  const existing = clients.get(target);
  if (existing) return existing;
  const needsScript = !target.fbq;
  let pixel = target.fbq;
  if (!pixel) {
    const stub = function (...args: unknown[]) {
      if (stub.callMethod) stub.callMethod(...args);
      else stub.queue.push(args);
    } as Pixel;
    stub.queue = []; stub.push = stub; stub.loaded = true; stub.version = "2.0";
    target.fbq = pixel = stub;
    target._fbq ??= stub;
  }
  // Disable inferred clicks/form matching before init; do not pass player data.
  pixel("set", "autoConfig", false, META_PIXEL_ID);
  pixel("init", META_PIXEL_ID);
  pixel("trackSingle", META_PIXEL_ID, "PageView");
  if (needsScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  const send = (name: EventName, params: AnalyticsParams) => {
    for (const event of metaEvents(name, params)) pixel("trackSingleCustom", META_PIXEL_ID, event.name, event.properties);
  };
  clients.set(target, send);
  return send;
}
