import test from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_KEY, initializeCampaign } from "./campaign";

const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("supported home timezones start there; everyone else starts in USA", () => {
  for (const [zone, first] of [["Asia/Kolkata", "india"], ["Asia/Calcutta", "india"], ["Europe/Budapest", "hungary"], ["America/New_York", "usa"], ["Asia/Tokyo", "usa"], ["Europe/London", "usa"], ["constructor", "usa"], ["", "usa"]]) {
    const campaign = initializeCampaign(null, false, () => zone);
    assert.equal(campaign.countries[0], first, zone);
    assert.deepEqual(campaign.countries.slice(1), ["usa", "india", "hungary"].filter((id) => id !== first));
    assert.equal(campaign.source, first === "usa" ? "default" : "device_timezone");
  }
  assert.equal(initializeCampaign(null, false, () => {throw new Error("unavailable");}).countries[0], "usa");
});

test("saved country order survives travel and refresh without consulting the timezone again", () => {
  const store = storage(), first = initializeCampaign(store, false, () => "Asia/Kolkata");
  assert.deepEqual(first.countries, ["india", "usa", "hungary"]);
  const resumed = initializeCampaign(store, true, () => {throw new Error("must not read device region");});
  assert.deepEqual(resumed, { countries: first.countries, source: "saved_campaign" });
  assert.equal(initializeCampaign(store, false, () => "Europe/Budapest").countries[0], "india");
});

test("legacy gameplay keeps its original campaign order instead of being relocated", () => {
  const store = storage();
  const campaign = initializeCampaign(store, true, () => {throw new Error("must not infer a new start for an existing game");});
  assert.deepEqual(campaign, {countries:["usa", "india", "hungary"], source:"legacy_progress"});
  assert.equal(initializeCampaign(store, true, () => "Asia/Calcutta").source, "saved_campaign");
});

test("invalid or blocked storage cannot create missing or duplicate country stages", () => {
  for (const saved of ["{broken", JSON.stringify({version:1,countries:["india","india","hungary"]}), JSON.stringify({version:1,countries:["india","usa"]}), JSON.stringify({version:1,countries:["india","usa","missing"]}), JSON.stringify({version:0,countries:["hungary","usa","india"]})]) {
    const store = storage(); store.setItem(CAMPAIGN_KEY, saved);
    assert.deepEqual(initializeCampaign(store, false, () => "Europe/Budapest").countries, ["hungary","usa","india"]);
  }
  const blocked = {getItem: () => {throw new Error("blocked");}, setItem: () => {throw new Error("blocked");}};
  assert.deepEqual(initializeCampaign(blocked, false, () => "Asia/Kolkata").countries, ["india","usa","hungary"]);
  assert.deepEqual(initializeCampaign(blocked, true, () => "Asia/Kolkata").countries, ["usa","india","hungary"]);
});
