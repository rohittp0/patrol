import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

export const NEWSPAPER_INTRO_KEY = "patrol:newspaper-intros:v1";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
const browserStorage = () => { try { return localStorage; } catch { return null; } };

/** One automatic front page per country's second hunt, remembered on view.
 * The opening/tutorial hunt, replays and later hunts use the ordinary result.
 * Existing introduction markers remain seen when moving the intro later. */
export class NewspaperIntroductions {
  private seen = new Set<string>();
  constructor(private storage: StoragePort | null = browserStorage()) {}

  claim(country: string, challengeIndex: number, won: boolean): boolean {
    if (!won || challengeIndex !== CONFIG.poster.introductionHuntIndex) return false;
    try {
      const saved = JSON.parse(this.storage?.getItem(NEWSPAPER_INTRO_KEY) ?? "null");
      if (Array.isArray(saved)) for (const id of saved) if (typeof id === "string") this.seen.add(id);
    } catch { /* A blocked or corrupt store still remembers this tab's views. */ }
    if (this.seen.has(country)) return false;
    this.seen.add(country);
    try { this.storage?.setItem(NEWSPAPER_INTRO_KEY, JSON.stringify([...this.seen])); } catch { /* Session fallback. */ }
    return true;
  }
}
