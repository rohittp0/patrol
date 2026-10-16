import test from "node:test";
import assert from "node:assert/strict";
import { NewspaperIntroductions } from "./newspaper-intro";

test("only second-hunt captures introduce the newspaper, once per country across reloads", () => {
  let value: string | null = null;
  const store = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
  const intros = new NewspaperIntroductions(store);
  assert(!intros.claim("usa", 0, true)); assert(!intros.claim("usa", 1, false)); assert(!intros.claim("usa", 2, true));
  assert(intros.claim("usa", 1, true)); assert(!intros.claim("usa", 1, true));
  const restored = new NewspaperIntroductions(store);
  assert(!restored.claim("usa", 1, true));
  assert(restored.claim("india", 1, true)); assert(restored.claim("hungary", 1, true));
  assert(!intros.claim("india", 1, true));
});

test("unavailable or corrupt storage keeps the game playable with a tab-local fallback", () => {
  const intros = new NewspaperIntroductions({getItem: () => {throw new Error("blocked");}, setItem: () => {throw new Error("blocked");}});
  assert(intros.claim("usa", 1, true)); assert(!intros.claim("usa", 1, true));
  const corrupt = new NewspaperIntroductions({getItem: () => "bad JSON", setItem: () => {}});
  assert(corrupt.claim("usa", 1, true)); assert(!corrupt.claim("usa", 1, true));
});
