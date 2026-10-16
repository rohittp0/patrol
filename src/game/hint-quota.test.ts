import test from "node:test";
import assert from "node:assert/strict";
import { HintQuota, HINT_QUOTA_KEY, hintCountdown } from "./hint-quota";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("four hints start a 30-minute cooldown only when the last hint is used", () => {
  const store = storage(); let now = 1000;
  let refills = 0;
  const quota = new HintQuota(store, () => now, () => refills++);
  for (let remaining = 3; remaining >= 0; remaining--) {
    now += 5000; assert(quota.consume());
    assert.equal(quota.status().remaining, remaining);
    assert.equal(quota.status().refillAt, remaining ? null : now + CONFIG.hints.quota.refillAfterMs);
  }
  assert(!quota.consume());
  assert.equal(hintCountdown(quota.status().remainingMs), "30:00");
  now += CONFIG.hints.quota.refillAfterMs - 1;
  assert(!quota.consume()); assert.equal(hintCountdown(quota.status().remainingMs), "00:01");
  now++;
  assert.deepEqual(quota.status(), { remaining: 4, refillAt: null, remainingMs: 0 });
  quota.status(); assert.equal(refills, 1);
  assert(quota.consume()); assert.equal(quota.status().remaining, 3);
});

test("reloads and other tabs share the allowance without resetting its deadline", () => {
  const store = storage(); let now = 1000;
  const first = new HintQuota(store, () => now);
  assert(first.consume());
  const second = new HintQuota(store, () => now);
  assert.equal(second.status().remaining, 3);
  assert(second.consume()); assert.equal(first.status().remaining, 2);
  assert(first.consume()); assert(second.consume());
  const deadline = first.status().refillAt;
  now += 10_000;
  assert.equal(new HintQuota(store, () => now).status().refillAt, deadline);
  assert.equal(hintCountdown(first.status().remainingMs), "29:50");
});

test("invalid stored data is repaired on use and unavailable storage still has a session quota", () => {
  for (const value of ["null", JSON.stringify({version:1, remaining:-1, refillAt:null}), JSON.stringify({version:1, remaining:0, refillAt:null})]) {
    const store = storage(); store.setItem(HINT_QUOTA_KEY, value);
    const quota = new HintQuota(store, () => 1000);
    assert.equal(quota.status().remaining, 4); assert(quota.consume());
    assert.equal(JSON.parse(store.getItem(HINT_QUOTA_KEY)!).remaining, 3);
  }
  const quota = new HintQuota({getItem: () => {throw new Error("blocked");}, setItem: () => {throw new Error("blocked");}}, () => 1000);
  for (let i = 0; i < 4; i++) assert(quota.consume());
  assert(!quota.consume());
  assert.equal(hintCountdown(1001), "00:02");
});
