import test from "node:test";
import assert from "node:assert/strict";
import { NewspaperIntroductions } from "./newspaper-intro";

test("only opening captures introduce the newspaper, once for each country across reloads", () => {
  let value: string | null = null;
  const store = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
  const intros = new NewspaperIntroductions(store);
  assert(!intros.claim("usa", 0, false)); assert(!intros.claim("usa", 1, true));
  assert(intros.claim("usa", 0, true)); assert(!intros.claim("usa", 0, true));
  const restored = new NewspaperIntroductions(store);
  assert(!restored.claim("usa", 0, true));
  assert(restored.claim("india", 0, true)); assert(restored.claim("hungary", 0, true));
  assert(!intros.claim("india", 0, true));
});

test("unavailable or corrupt storage keeps the game playable with a tab-local fallback", () => {
  const intros = new NewspaperIntroductions({getItem: () => {throw new Error("blocked");}, setItem: () => {throw new Error("blocked");}});
  assert(intros.claim("usa", 0, true)); assert(!intros.claim("usa", 0, true));
  const corrupt = new NewspaperIntroductions({getItem: () => "bad JSON", setItem: () => {}});
  assert(corrupt.claim("usa", 0, true)); assert(!corrupt.claim("usa", 0, true));
});
