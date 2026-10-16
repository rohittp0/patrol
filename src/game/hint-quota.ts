import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

export const HINT_QUOTA_KEY = "patrol:hint-quota:v1";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
interface Quota { remaining: number; refillAt: number | null }
const tuning = CONFIG.hints.quota;
const full = (): Quota => ({ remaining: tuning.capacity, refillAt: null });
const browserStorage = () => { try { return localStorage; } catch { return null; } };

/** Browser-wide allowance, independent of the current hunt. Absolute wall time
 * makes the cooldown survive refresh, closed tabs and background throttling. */
export class HintQuota {
  private state = full();
  private memoryOnly = false;
  constructor(private storage: StoragePort | null = browserStorage(), private now: () => number = Date.now, private onRefill: () => void = () => {}) {}

  status(): Quota & { remainingMs: number } {
    if (this.storage && !this.memoryOnly) {
      try {
        const value = JSON.parse(this.storage.getItem(HINT_QUOTA_KEY) ?? "null");
        const valid = value && value.version === 1 && Number.isInteger(value.remaining) && value.remaining >= 0 && value.remaining <= tuning.capacity
          && (value.remaining === 0 ? Number.isSafeInteger(value.refillAt) && value.refillAt > 0 : value.refillAt === null);
        this.state = valid ? { remaining: value.remaining, refillAt: value.refillAt } : full();
      } catch { this.memoryOnly = true; }
    }
    if (this.state.refillAt !== null && this.now() >= this.state.refillAt) { this.state = full(); this.persist(); this.onRefill(); }
    return { ...this.state, remainingMs: this.state.refillAt === null ? 0 : Math.max(0, this.state.refillAt - this.now()) };
  }

  consume(): boolean {
    if (this.status().remaining === 0) return false;
    this.state.remaining--;
    if (this.state.remaining === 0) this.state.refillAt = this.now() + tuning.refillAfterMs;
    this.persist(); return true;
  }

  private persist() {
    try { this.storage?.setItem(HINT_QUOTA_KEY, JSON.stringify({ version: 1, ...this.state })); }
    catch { this.memoryOnly = true; }
  }
}

export function hintCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
