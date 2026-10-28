import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signInWithCredential,
  linkWithCredential,
  GoogleAuthProvider,
  type AuthCredential,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  terminate,
} from "firebase/firestore";
import { FIREBASE_CONFIG } from "../src/firebase.config";
import { ProgressStore, ProgressConflict } from "../src/progress-store";
import { chapterForLevel } from "../src/game/collection";
import { Navigation } from "../src/game/navigation";
import type {
  PlayerProgress,
  ProgressMutation,
} from "../src/game/player-progress";
import type { CountryBoard } from "../src/game/types";
import type { Mission } from "../src/game/missions";

const board: CountryBoard = JSON.parse(
  readFileSync("public/data/india.json", "utf8"),
);
const levels: Mission[] = JSON.parse(
  readFileSync("public/data/india-campaign.json", "utf8"),
).levels;
const navigation = new Navigation(board);
const usa: CountryBoard = JSON.parse(readFileSync("public/data/usa.json", "utf8"));
const usaLevels: Mission[] = JSON.parse(readFileSync("public/data/usa-campaign.json", "utf8")).levels;
const worlds = { india: {board, navigation}, usa: {board:usa, navigation:new Navigation(usa)} };
const campaignWorld = (level: number) => worlds[chapterForLevel(level).country];
async function session(
  credential?: AuthCredential,
  now: () => number = Date.now,
) {
  const app = initializeApp(FIREBASE_CONFIG, crypto.randomUUID()),
    auth = getAuth(app),
    db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  if (credential) await signInWithCredential(auth, credential);
  else await signInAnonymously(auth);
  const uid = auth.currentUser!.uid;
  return {
    auth,
    uid,
    store: new ProgressStore(db, campaignWorld, [...levels,...usaLevels], undefined, now),
    close: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}
const mutation = (
  state: PlayerProgress,
  change: Omit<ProgressMutation, "actionId" | "revision">,
): ProgressMutation => ({
  ...change,
  actionId: crypto.randomUUID(),
  revision: state.player.revision,
});

test("browser progression saves directly, deduplicates retries, restores moves and continues on another device", async () => {
  let now = 1000;
  const s = await session(undefined, () => now);
  try {
    let state = await s.store.load(s.uid);
    assert.equal(state.player.wallet, 0);
    await assert.rejects(
      () =>
        s.store.mutate(
          s.uid,
          mutation(state, {
            op: "start",
            level: 2,
            selection: ["patrol-1", "patrol-2", "patrol-3"],
          }),
        ),
      /locked/,
    );
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "start",
        level: 1,
        selection: ["patrol-1", "patrol-2", "patrol-3"],
      }),
    );
    const attemptId = state.active!.id;
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "save",
        attemptId,
        moves: [levels[0].witness[0]],
        pendingHours: 0,
      }),
    );
    const reloaded = await s.store.load(s.uid);
    assert.equal(reloaded.active!.id, attemptId);
    assert.equal(reloaded.pendingHours, 0);
    assert.equal(reloaded.active!.moves.length, 1);
    const claim = mutation(state, {
      op: "finish",
      attemptId,
      moves: levels[0].witness,
    });
    state = await s.store.mutate(s.uid, claim);
    assert.equal(state.reward, 90);
    const duplicate = await s.store.mutate(s.uid, claim);
    assert.equal(duplicate.player.wallet, 90);
    assert.equal(duplicate.player.revision, state.player.revision);
    await assert.rejects(
      () => s.store.mutate(s.uid, { ...claim, actionId: crypto.randomUUID() }),
      ProgressConflict,
    );
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "start",
        level: 2,
        selection: ["patrol-1", "patrol-2", "patrol-3"],
      }),
    );
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "finish",
        attemptId: state.active!.id,
        moves: levels[1].witness,
      }),
    );
    assert.equal(state.player.unlocked, 3);
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "action",
        action: { kind: "purchase", squad: "rapid" },
      }),
    );
    await assert.rejects(
      () =>
        s.store.mutate(
          s.uid,
          mutation(state, {
            op: "action",
            action: { kind: "purchase", squad: "rapid" },
          }),
        ),
      /owned/,
    );
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "action",
        action: { kind: "train", squad: "rapid" },
      }),
    );
    assert.equal(state.player.squads.rapid!.training!.readyAt, 31000);
    await assert.rejects(
      () =>
        s.store.mutate(
          s.uid,
          mutation(state, {
            op: "start",
            level: 3,
            selection: ["rapid", null, null],
          }),
        ),
      /unavailable/,
    );
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "action",
        action: { kind: "tutorial", lesson: "academy" },
      }),
    );
    now = 31000;
    state = await s.store.mutate(
      s.uid,
      mutation(state, {
        op: "start",
        level: 3,
        selection: ["rapid", null, null],
      }),
    );
    assert.equal(state.player.squads.rapid!.step, 1);
    assert.equal(state.active!.rules.squadCount, 1);
    const jwt =
      [
        { alg: "none", typ: "JWT" },
        {
          iss: "https://accounts.google.com",
          aud: "emulator-client",
          sub: crypto.randomUUID(),
          email: `patrol-${crypto.randomUUID()}@example.com`,
          email_verified: true,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".";
    const credential = GoogleAuthProvider.credential(jwt);
    await linkWithCredential(s.auth.currentUser!, credential);
    assert.equal(s.auth.currentUser!.uid, s.uid);
    const other = await session(credential, () => now);
    try {
      assert.equal(other.uid, s.uid);
      const continued = await other.store.load(other.uid);
      assert.equal(continued.player.wallet, state.player.wallet);
      assert.equal(continued.active!.id, state.active!.id);
      assert.equal(continued.player.squads.rapid!.step, 1);
      assert.equal(continued.player.tutorials?.academy, true);
      const stale = state;
      state = await other.store.mutate(
        other.uid,
        mutation(continued, { op: "abandon" }),
      );
      await assert.rejects(
        () => s.store.mutate(s.uid, mutation(stale, { op: "abandon" })),
        ProgressConflict,
      );
    } finally {
      await other.close();
    }
  } finally {
    await s.close();
  }
});

test("optimistic snapshots persist their exact attempt IDs, clocks and receipts", async () => {
  const s = await session();
  try {
    const before = await s.store.load(s.uid);
    const actionId = crypto.randomUUID();
    const { advanceProgress } = await import("../src/game/player-progress");
    const next = advanceProgress(
      before,
      {
        actionId,
        revision: before.player.revision,
        op: "start",
        level: 1,
        selection: ["patrol-1", "patrol-2", "patrol-3"],
      },
      board,
      levels,
      1000,
      navigation,
    );
    const entry = {
      actionId,
      revision: before.player.revision,
      progress: next,
    };
    const saved = await s.store.commit(s.uid, entry);
    assert.equal(saved.active!.id, next.active!.id);
    const retry = await s.store.commit(s.uid, entry);
    assert.deepEqual(retry, saved);
    const receipt = await s.store.loadWithReceipt(s.uid);
    assert.equal(receipt.lastMutationId, actionId);
    assert.deepEqual(receipt.progress, next);
    await assert.rejects(
      s.store.commit(s.uid, { ...entry, actionId: crypto.randomUUID() }),
      ProgressConflict,
    );
  } finally {
    await s.close();
  }
});


test("four-slot USA attempts persist, resume, and award their globally numbered level exactly once", async () => {
  const s = await session();
  try {
    const fresh = await s.store.load(s.uid);
    const seeded = structuredClone(fresh); seeded.player.unlocked = 16; seeded.player.wallet = 1000; seeded.player.revision++;
    for (const squad of ["rapid", "helicopter", "marksman"] as const) seeded.player.squads[squad] = {step:4,training:null};
    let state = await s.store.commit(s.uid, {actionId:crypto.randomUUID(),revision:fresh.player.revision,progress:seeded});
    state = await s.store.mutate(s.uid, mutation(state, {op:"action",action:{kind:"buy-slot"}}));
    state = await s.store.mutate(s.uid, mutation(state, {op:"start",level:16,selection:usaLevels[0].recommended.map(r=>r.id)}));
    const attemptId = state.active!.id;
    state = await s.store.mutate(s.uid, mutation(state,{op:"save",attemptId,moves:usaLevels[0].witness.slice(0,1)}));
    state = await s.store.load(s.uid);
    assert.equal(state.active!.country,"usa"); assert.equal(state.active!.selection.length,4);
    assert.equal(state.active!.moves.length,1);
    const claim = mutation(state,{op:"finish",attemptId,moves:usaLevels[0].witness});
    const result = await s.store.mutate(s.uid,claim);
    assert.equal(result.player.unlocked,17); assert(result.player.results["16"]);
    assert.equal(result.active,null);
    assert.deepEqual(await s.store.mutate(s.uid,claim),result);
  } finally { await s.close(); }
});
