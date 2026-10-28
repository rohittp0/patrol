import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { initialProgress } from "../src/game/player-progress";

const environment = await initializeTestEnvironment({
  projectId: "patrol-daac9",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});
test.after(() => environment.cleanup());
const freshSave = () => ({
  ...initialProgress(),
  lastMutationId: crypto.randomUUID(),
  updatedAt: serverTimestamp(),
});

test("owners can create and update their own well-formed saves, but cannot access other players", async () => {
  const id = `rules-${crypto.randomUUID()}`;
  const owner = environment.authenticatedContext(id).firestore();
  const other = environment.authenticatedContext(`other-${id}`).firestore();
  const guest = environment.unauthenticatedContext().firestore();
  const ref = doc(owner, "players", id);
  await assertSucceeds(setDoc(ref, freshSave()));
  await assertSucceeds(getDoc(ref));
  // Deliberate casual-game trust boundary: owners control their own money.
  await assertSucceeds(
    updateDoc(ref, {
      "player.wallet": 9999,
      "player.revision": 1,
      updatedAt: serverTimestamp(),
    }),
  );
  assert.equal((await getDoc(ref)).data()!.player.wallet, 9999);
  await assertFails(getDoc(doc(other, "players", id)));
  await assertFails(getDoc(doc(guest, "players", id)));
  await assertFails(setDoc(doc(other, "players", id), freshSave()));
  await assertFails(setDoc(doc(guest, "players", id), freshSave()));
  await assertFails(getDocs(collection(owner, "players")));
  await assertFails(deleteDoc(ref));
  await assertFails(getDoc(doc(owner, "players", id, "receipts", "private")));
});

test("save rules reject stale revisions, malformed data and spoofed update times", async () => {
  const id = `shape-${crypto.randomUUID()}`;
  const db = environment.authenticatedContext(id).firestore(),
    ref = doc(db, "players", id);
  await assertSucceeds(setDoc(ref, freshSave()));
  const invalid = [
    { "player.revision": 0 },
    { "player.wallet": -1, "player.revision": 1 },
    { "player.unlocked": 26, "player.revision": 1 },
    { "player.version": 3, "player.revision": 1 },
    { "player.squads": "invalid", "player.revision": 1 },
    { "player.selection": [], "player.revision": 1 },
    { "player.loginPrompted": "yes", "player.revision": 1 },
    {
      "player.tutorials": { field: "yes", academy: false },
      "player.revision": 1,
    },
    {
      "player.tutorials": { field: true, academy: false, injected: true },
      "player.revision": 1,
    },
    { active: "invalid", "player.revision": 1 },
    { reward: -1, "player.revision": 1 },
    { pendingHours: -1, "player.revision": 1 },
    { injected: true, "player.revision": 1 },
  ];
  for (const data of invalid)
    await assertFails(
      updateDoc(ref, { ...data, updatedAt: serverTimestamp() }),
    );
  await assertFails(
    updateDoc(ref, {
      "player.revision": 1,
      updatedAt: Timestamp.fromMillis(0),
    }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      "player.selection": [null, null, null],
      "player.revision": 1,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("a full six-squad collection and in-progress training fit the rules evaluation budget", async () => {
  const id = `full-${crypto.randomUUID()}`;
  const db = environment.authenticatedContext(id).firestore(),
    ref = doc(db, "players", id);
  const save = freshSave();
  save.player.unlocked = 15;
  for (const squad of ["rapid", "helicopter", "marksman"] as const)
    save.player.squads[squad] = {
      step: 3,
      training: { step: 4, readyAt: Date.now() + 600000 },
    };
  await assertSucceeds(setDoc(ref, save));
  await assertSucceeds(
    updateDoc(ref, { "player.revision": 1, updatedAt: serverTimestamp() }),
  );
});

test("legacy saves can add tutorial completion without replacing their campaign", async () => {
  const id = `legacy-${crypto.randomUUID()}`;
  const db = environment.authenticatedContext(id).firestore(),
    ref = doc(db, "players", id);
  const save = freshSave();
  delete save.player.tutorials;
  save.player.wallet = 75;
  save.player.unlocked = 3;
  await assertSucceeds(setDoc(ref, save));
  await assertSucceeds(
    updateDoc(ref, {
      "player.tutorials": { field: true, academy: true },
      "player.revision": 1,
      updatedAt: serverTimestamp(),
    }),
  );
  const saved = (await getDoc(ref)).data()!;
  assert.equal(saved.player.wallet, 75);
  assert.equal(saved.player.unlocked, 3);
});

test("four-slot USA saves are accepted while five slots, invalid levels and mismatched roster shapes are rejected", async () => {
  const id = `usa-${crypto.randomUUID()}`;
  const db = environment.authenticatedContext(id).firestore(), ref = doc(db, "players", id);
  const save = freshSave();
  save.player.unlocked = 25;
  save.player.deploymentSlots = 4;
  save.player.selection = ["patrol-1", "patrol-2", "patrol-3", null];
  save.player.results["25"] = { bestMoves: 7, paid: 390 };
  await assertSucceeds(setDoc(ref, save));
  for (const patch of [
    { "player.deploymentSlots": 5, "player.selection": [null,null,null,null,null] },
    { "player.deploymentSlots": 4, "player.selection": [null,null,null] },
    { "player.deploymentSlots": 3, "player.selection": [null,null,null,null] },
    { "player.unlocked": 26 },
  ]) await assertFails(updateDoc(ref, { ...patch, "player.revision": 1, updatedAt: serverTimestamp() }));
  const active = { id: "usa-16", level: 16, country: "usa", selection: ["patrol-1",null,null,null], steps: [0], setup: {}, rules: {}, moves: [] };
  await assertSucceeds(updateDoc(ref, { active, "player.revision": 1, updatedAt: serverTimestamp() }));
  for (const country of ["hungary", "india"]) await assertFails(updateDoc(ref, { active: {...active,country}, "player.revision": 2, updatedAt: serverTimestamp() }));
});
