import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

export const CAMPAIGN_KEY = "patrol:campaign:v1";
export type CountryId = (typeof CONFIG.levels)[number]["id"];
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export interface Campaign {
  countries: CountryId[];
  source: "saved_campaign" | "legacy_progress" | "device_timezone" | "default";
}
const authoredOrder = (): CountryId[] => CONFIG.levels.map((level) => level.id);
const deviceTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };
const validCountries = (value: unknown): value is CountryId[] => Array.isArray(value)
  && value.length === CONFIG.levels.length && new Set(value).size === value.length
  && value.every((id) => CONFIG.levels.some((level) => level.id === id));

/** Choose once, then remember the whole sequence. Existing saves without this
 * marker retain the original authored order and their historical hunt numbers.
 * Only new campaigns consult the timezone; travel never rearranges a campaign. */
export function initializeCampaign(storage: StoragePort | null, hasExistingProgress: boolean, timezone: () => string = deviceTimezone): Campaign {
  try {
    const saved = JSON.parse(storage?.getItem(CAMPAIGN_KEY) ?? "null");
    if (saved?.version === 1 && validCountries(saved.countries)) return { countries: saved.countries, source: "saved_campaign" };
  } catch { /* Storage is optional. */ }
  let campaign: Campaign;
  if (hasExistingProgress) campaign = { countries: authoredOrder(), source: "legacy_progress" };
  else {
    let zone = ""; try { zone = timezone(); } catch { /* An unavailable timezone uses the fallback. */ }
    const matches = CONFIG.campaign.timezoneCountries as Readonly<Record<string, CountryId | undefined>>;
    const matched = Object.hasOwn(matches, zone) ? matches[zone] : undefined;
    const first = matched ?? CONFIG.campaign.fallbackCountry;
    campaign = { countries: [first, ...authoredOrder().filter((id) => id !== first)], source: matched ? "device_timezone" : "default" };
  }
  try { storage?.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 1, countries: campaign.countries })); } catch { /* Keep the session playable. */ }
  return campaign;
}
