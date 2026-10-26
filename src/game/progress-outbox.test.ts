import test from "node:test";
import assert from "node:assert/strict";
import { ProgressOutbox, type PendingProgress } from "./progress-outbox";
import {
  initialProgress,
  advanceProgress,
  type PlayerProgress,
  type ProgressMutation,
} from "./player-progress";
import { readFileSync } from "node:fs";
import { Navigation } from "./navigation";
import type { CountryBoard } from "./types";
import type { Mission } from "./missions";
const board: CountryBoard = JSON.parse(
  readFileSync("public/data/india.json", "utf8"),
);
const levels: Mission[] = JSON.parse(
  readFileSync("public/data/india-campaign.json", "utf8"),
).levels;
const nav = new Navigation(board);
const transition = (
  p: PlayerProgress,
  input: Partial<ProgressMutation>,
  now = 1000,
) =>
  advanceProgress(
    p,
    {
      actionId: crypto.randomUUID(),
      revision: p.player.revision,
      op: "action",
      ...input,
    },
    board,
    levels,
    now,
    nav,
  );
const wait = () => new Promise<void>((resolve) => queueMicrotask(resolve));
test("purchase and training update immediately while the first cloud write is held", async () => {
  const p = initialProgress();
  p.player.unlocked = 3;
  p.player.wallet = 75;
  let release!: (p: PlayerProgress) => void;
  const sent: PendingProgress[] = [];
  const box = new ProgressOutbox(
    { confirmed: p, pending: [] },
    {
      persist: () => {},
      commit: (entry) => {
        sent.push(entry);
        return sent.length === 1
          ? new Promise((resolve) => (release = resolve))
          : Promise.resolve(entry.progress);
      },
    },
  );
  box.enqueue(
    "buy",
    transition(box.response, { action: { kind: "purchase", squad: "rapid" } }),
  );
  box.enqueue(
    "train",
    transition(box.response, { action: { kind: "train", squad: "rapid" } }),
  );
  assert.equal(box.response.player.wallet, 30);
  assert.equal(box.response.player.squads.rapid!.training!.readyAt, 31000);
  assert.equal(box.pendingCount, 2);
  await wait();
  assert.equal(sent.length, 1);
  release(sent[0].progress);
  await box.flush();
  assert.deepEqual(
    sent.map((entry) => entry.actionId),
    ["buy", "train"],
  );
  assert.equal(box.pendingCount, 0);
  assert.equal(box.response.player.squads.rapid!.training!.readyAt, 31000);
});
test("start, saved moves, reward and next level retain exact attempt identities before any acknowledgement", async () => {
  let committed = initialProgress();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const box = new ProgressOutbox(
    { confirmed: committed, pending: [] },
    {
      persist: () => {},
      commit: async (entry) => {
        await gate;
        assert.equal(entry.revision, committed.player.revision);
        committed = entry.progress;
        return committed;
      },
    },
  );
  box.enqueue(
    "start",
    transition(box.response, {
      op: "start",
      level: 1,
      selection: ["patrol-1", "patrol-2", "patrol-3"],
    }),
  );
  const first = box.response.active!.id;
  box.enqueue(
    "finish",
    transition(box.response, {
      op: "finish",
      attemptId: first,
      moves: levels[0].witness,
    }),
  );
  assert.equal(box.response.player.wallet, 90);
  assert.equal(box.response.player.unlocked, 2);
  box.enqueue(
    "next",
    transition(box.response, {
      op: "start",
      level: 2,
      selection: ["patrol-1", "patrol-2", "patrol-3"],
    }),
  );
  const second = box.response.active!.id;
  assert.notEqual(first, second);
  assert.equal(box.pendingCount, 3);
  release();
  await box.flush();
  assert.equal(committed.active!.id, second);
  assert.equal(committed.player.wallet, 90);
});
test("offline journal survives reload and a committed response-lost purchase is not applied twice", async () => {
  const p = initialProgress();
  p.player.unlocked = 3;
  p.player.wallet = 75;
  const box = new ProgressOutbox(
    { confirmed: p, pending: [] },
    {
      persist: () => {},
      retryMs: 60000,
      commit: () => Promise.reject(new Error("offline")),
    },
  );
  box.enqueue(
    "buy",
    transition(box.response, { action: { kind: "purchase", squad: "rapid" } }),
  );
  await assert.rejects(box.flush(), /offline/);
  assert.equal(box.status, "offline");
  assert.equal(box.response.player.wallet, 50);
  const saved = JSON.parse(JSON.stringify(box.snapshot()));
  box.stop();
  const restored = new ProgressOutbox(saved, {
    persist: () => {},
    commit: (entry) => Promise.resolve(entry.progress),
  });
  assert(
    restored.reconcile({
      progress: saved.pending[0].progress,
      lastMutationId: "buy",
    }),
  );
  assert.equal(restored.pendingCount, 0);
  assert.equal(restored.response.player.wallet, 50);
});
test("a newer device revision preserves unsynced local progress without overwriting cloud state", async () => {
  const p = initialProgress();
  let persisted: unknown;
  const cloud = structuredClone(p);
  cloud.player.revision = 5;
  cloud.player.wallet = 77;
  const box = new ProgressOutbox(
    { confirmed: p, pending: [] },
    {
      persist: (value) => (persisted = value),
      commit: () =>
        Promise.reject(
          Object.assign(new Error("newer save"), { code: "progress/conflict" }),
        ),
    },
  );
  box.enqueue(
    "prompt",
    transition(box.response, { action: { kind: "prompt" } }),
  );
  await assert.rejects(box.flush());
  assert.equal(box.status, "conflict");
  assert.equal(box.pendingCount, 1);
  assert(persisted);
  assert.equal(
    box.reconcile({ progress: cloud, lastMutationId: "other-device" }),
    false,
  );
  assert.equal(box.response.player.wallet, 0);
  assert.equal(cloud.player.wallet, 77);
  box.stop();
});

test("cached optimistic play continues while startup reconciles a response-lost write", async () => {
  const p = initialProgress();
  p.player.unlocked = 3;
  p.player.wallet = 75;
  const bought = transition(p, {
    action: { kind: "purchase", squad: "rapid" },
  });
  const sent: string[] = [];
  const box = new ProgressOutbox(
    {
      confirmed: p,
      pending: [
        { actionId: "buy", revision: p.player.revision, progress: bought },
      ],
    },
    {
      paused: true,
      persist: () => {},
      commit: async (entry) => {
        sent.push(entry.actionId);
        return entry.progress;
      },
    },
  );
  box.enqueue(
    "train",
    transition(box.response, { action: { kind: "train", squad: "rapid" } }),
  );
  await wait();
  assert.equal(sent.length, 0);
  assert.equal(box.response.player.wallet, 30);
  assert(box.reconcile({ progress: bought, lastMutationId: "buy" }));
  box.resume();
  await box.flush();
  assert.deepEqual(sent, ["train"]);
  assert.equal(box.response.player.wallet, 30);
});
