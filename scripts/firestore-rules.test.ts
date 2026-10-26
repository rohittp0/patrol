import test from "node:test";
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
} from "firebase/firestore";

const environment = await initializeTestEnvironment({
  projectId: "patrol-daac9",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});
test.after(() => environment.cleanup());
test("only the owner can read an individual player save; no client can write game state", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "players/rules-owner"), {
      player: { wallet: 30 },
    });
  });
  const owner = environment.authenticatedContext("rules-owner").firestore();
  const other = environment.authenticatedContext("rules-other").firestore();
  const guest = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(owner, "players/rules-owner")));
  await assertFails(getDoc(doc(other, "players/rules-owner")));
  await assertFails(getDoc(doc(guest, "players/rules-owner")));
  await assertFails(getDocs(collection(owner, "players")));
  await assertFails(
    updateDoc(doc(owner, "players/rules-owner"), { "player.wallet": 9999 }),
  );
  await assertFails(
    setDoc(doc(owner, "players/rules-owner"), { player: { wallet: 9999 } }),
  );
  await assertFails(deleteDoc(doc(owner, "players/rules-owner")));
  await assertFails(
    setDoc(doc(other, "players/rules-new"), { player: { wallet: 0 } }),
  );
  await assertFails(
    getDoc(doc(owner, "players/rules-owner/receipts/private-receipt")),
  );
});
