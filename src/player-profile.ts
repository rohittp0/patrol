import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";

export interface PlayerProfile { id: string; name: string; photo: string | null }
const KEY = "patrol:player:v1";
let cached: PlayerProfile | null = null;

export function playerProfile(): PlayerProfile {
  if (cached) return cached;
  let saved: Partial<PlayerProfile> = {};
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (value && typeof value === "object") saved = value; } catch { /* Storage is optional. */ }
  cached = {
    id: typeof saved.id === "string" && /^[0-9a-f-]{36}$/i.test(saved.id) ? saved.id : crypto.randomUUID(),
    name: typeof saved.name === "string" ? [...saved.name].slice(0, CONFIG.poster.maxNameLength).join("") : "",
    photo: validPhoto(saved.photo),
  };
  savePlayerProfile(cached);
  return cached;
}

const validPhoto = (value: unknown) => typeof value === "string" && /^data:image\/(webp|png|jpeg);base64,/.test(value) && value.length < 2_000_000 ? value : null;

/** A local convenience profile. No name, photo, crop, or filename goes to Firebase. */
export function savePlayerProfile(update: Partial<Pick<PlayerProfile, "name" | "photo">>): boolean {
  const profile = cached ?? playerProfile();
  if (update.name !== undefined) profile.name = [...update.name].slice(0, CONFIG.poster.maxNameLength).join("");
  if (update.photo !== undefined) profile.photo = validPhoto(update.photo);
  try { localStorage.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
}
