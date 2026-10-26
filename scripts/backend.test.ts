import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithCredential,
  type AuthCredential,
} from "firebase/auth";
import { FIREBASE_CONFIG } from "../src/firebase.config";
import type { ProgressResponse } from "../src/progress-client";
import type { Mission } from "../src/game/missions";

const levels: Mission[] = JSON.parse(
  readFileSync("public/data/india-campaign.json", "utf8"),
).levels;
const endpoint = "http://127.0.0.1:5001/patrol-daac9/asia-south1/patrol";
async function session(credential?: AuthCredential) {
  const app = initializeApp(FIREBASE_CONFIG, crypto.randomUUID());
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  if (credential) await signInWithCredential(auth, credential);
  else await signInAnonymously(auth);
  const token = await auth.currentUser!.getIdToken();
  return {
    auth,
    close: () => deleteApp(app),
    call: async (input: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: { actionId: crypto.randomUUID(), ...input },
        }),
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error.message);
      return json.result as ProgressResponse;
    },
  };
}
test("callable rejects unauthenticated requests", async () => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { op: "load", actionId: crypto.randomUUID() },
    }),
  });
  assert.equal(response.status, 401);
});
test("server replays wins, deduplicates claims, rejects stale devices and refuses forged money", async () => {
  const s = await session();
  try {
    let state = await s.call({ op: "load" });
    assert.equal(state.player.wallet, 0);
    assert.equal(state.player.unlocked, 1);
    await assert.rejects(
      () =>
        s.call({
          op: "start",
          revision: state.player.revision,
          level: 2,
          selection: ["patrol-1", "patrol-2", "patrol-3"],
        }),
      /locked/,
    );
    await assert.rejects(
      () =>
        s.call({
          op: "action",
          revision: state.player.revision,
          action: { kind: "credit", amount: 10000 },
        }),
      /Unknown/,
    );
    state = await s.call({
      op: "start",
      revision: state.player.revision,
      level: 1,
      selection: ["patrol-1", "patrol-2", "patrol-3"],
    });
    const attemptId = state.active!.id;
    await assert.rejects(
      () =>
        s.call({
          op: "finish",
          revision: state.player.revision,
          attemptId,
          moves: [],
        }),
      /verified/,
    );
    const actionId = crypto.randomUUID(),
      claim = {
        op: "finish",
        revision: state.player.revision,
        attemptId,
        moves: levels[0].witness,
        actionId,
      };
    const finished = await s.call(claim);
    assert.equal(finished.reward, 90);
    assert.equal(finished.player.wallet, 90);
    assert.equal(finished.player.unlocked, 2);
    const repeated = await s.call(claim);
    assert.equal(repeated.player.wallet, 90);
    assert.equal(repeated.player.revision, finished.player.revision);
    await assert.rejects(
      () =>
        s.call({
          op: "action",
          revision: state.player.revision,
          action: { kind: "prompt" },
        }),
      /another device/,
    );
    state = await s.call({
      op: "start",
      revision: finished.player.revision,
      level: 1,
      selection: ["patrol-1", "patrol-2", "patrol-3"],
    });
    state = await s.call({
      op: "finish",
      revision: state.player.revision,
      attemptId: state.active!.id,
      moves: levels[0].witness,
    });
    assert.equal(state.reward, 0);
    assert.equal(state.player.wallet, 90);
    state = await s.call({
      op: "start",
      revision: state.player.revision,
      level: 2,
      selection: ["patrol-1", "patrol-2", "patrol-3"],
    });
    state = await s.call({
      op: "save",
      revision: state.player.revision,
      attemptId: state.active!.id,
      moves: [levels[1].witness[0]],
      pendingHours: 0,
    });
    const resumed = await s.call({ op: "load" });
    assert.equal(resumed.active!.id, state.active!.id);
    assert.equal(resumed.pendingHours, 0);
    assert.equal(resumed.active!.moves.length, 1);
    state = await s.call({
      op: "finish",
      revision: state.player.revision,
      attemptId: state.active!.id,
      moves: levels[1].witness,
    });
    assert.equal(state.player.unlocked, 3);
    state = await s.call({
      op: "action",
      revision: state.player.revision,
      action: { kind: "purchase", squad: "rapid" },
    });
    assert(state.player.squads.rapid);
    assert(state.player.firstPurchase);
    await assert.rejects(
      () =>
        s.call({
          op: "action",
          revision: state.player.revision,
          action: { kind: "purchase", squad: "rapid" },
        }),
      /owned/,
    );
    state = await s.call({
      op: "action",
      revision: state.player.revision,
      action: { kind: "train", squad: "rapid" },
    });
    assert.equal(state.player.squads.rapid!.step, 0);
    assert(state.player.squads.rapid!.training!.readyAt > state.serverNow);
    await assert.rejects(
      () =>
        s.call({
          op: "start",
          revision: state.player.revision,
          level: 3,
          selection: ["rapid", null, null],
        }),
      /unavailable/,
    );
    state = await s.call({
      op: "start",
      revision: state.player.revision,
      level: 3,
      selection: [null, null, null],
    });
    assert.equal(state.active!.rules.squadCount, 0);
    const uid = s.auth.currentUser!.uid;
    const jwt =
      [
        { alg: "none", typ: "JWT" },
        {
          iss: "https://accounts.google.com",
          aud: "emulator-client",
          sub: crypto.randomUUID(),
        email: `patrol-test-${crypto.randomUUID()}@example.com`,
          email_verified: true,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".";
    const credential = GoogleAuthProvider.credential(jwt);
    await linkWithCredential(s.auth.currentUser!, credential);
    assert.equal(s.auth.currentUser!.uid, uid, "Link keeps the guest UID");
    const anotherDevice = await session(credential);
    try {
      assert.equal(anotherDevice.auth.currentUser!.uid, uid);
      const continued = await anotherDevice.call({ op: "load" });
      assert.equal(continued.player.wallet, state.player.wallet);
      assert.equal(continued.active!.id, state.active!.id);
      assert(continued.player.squads.rapid!.training);
    } finally {
      await anotherDevice.close();
    }
  } finally {
    await s.close();
  }
});
