import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Navigation, distanceKm } from "../src/game/navigation";
import { PatrolGame } from "../src/game/engine";
import {
  newPlayer,
  statsFor,
  ECONOMY,
  type SquadId,
} from "../src/game/collection";
import { createMission, type Mission } from "../src/game/missions";
import type { CountryBoard } from "../src/game/types";

const board: CountryBoard = JSON.parse(
  readFileSync("public/data/india.json", "utf8"),
);
const nav = new Navigation(board);
const titles = [
  "Close the net",
  "The western coast",
  "A faster response",
  "Across the plateau",
  "No time to spare",
  "Air support",
  "Hold the line",
  "A narrow window",
  "Rapid pursuit",
  "Within range",
  "The long reach",
  "Cut off the crossing",
  "Pressure on all sides",
  "The final approach",
  "India: command test",
];
const briefings = [
  "Choose a squad, pick a post, then deploy. Seal every land escape.",
  "A new starting position. The coast can help complete your enclosure.",
  "Rapid Action is available in the academy. Reach posts sooner.",
  "Speed matters: long journeys give the fugitive more time.",
  "Train your Rapid Action Squad to close the gap.",
  "Helicopter Squad is available. Deployment spends a move; choose your landing carefully.",
  "Helicopter guarding expires. Watch the counter and prepare another deployment.",
  "Faster deployment gives the fugitive less time to escape.",
  "Combine speed with a well-timed border closure.",
  "Marksman Squad is available. Its firing radius works only while stationed.",
  "Train your Marksman Squad to cover more land.",
  "A moving Marksman cannot fire. Leave it in position when it counts.",
  "Choose which borders to guard and which to cover with firing range.",
  "Use your trained specialists together.",
  "Your final India assignment. Bring your strongest roster.",
];

function solve(game: PatrolGame, targets: number[], maxDepth = 6) {
  let beam: {
    game: PatrolGame;
    moves: { squad: number; border: number }[];
    score: number;
  }[] = [{ game, moves: [], score: 0 }];
  const seen = new Set<string>();
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: typeof beam = [];
    for (const state of beam) {
      const nearest = board.borders
        .map((b, index) => ({
          index,
          distance: distanceKm(b.post, state.game.runner.position),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8)
        .map((x) => x.index);
      for (let squad = 0; squad < game.squads.length; squad++)
        for (const border of new Set([...targets, ...nearest])) {
          const branch = state.game.fork();
          if (!branch.issueOrder(squad, border)) continue;
          branch.resolveOrder();
          const moves = [...state.moves, { squad, border }];
          if (branch.won) return moves;
          if (branch.outcome.kind !== "playing") continue;
          const key = JSON.stringify([
            branch.squads.map((s) => [s.border, s.guardLeft]),
            branch.runner.position.map((x) => Math.round(x * 1000)),
            depth,
          ]);
          if (seen.has(key)) continue;
          seen.add(key);
          const score =
            branch.runnerEscapeDistanceKm -
            branch.squads.reduce(
              (total, s, i) =>
                total +
                (s.border === null
                  ? 200
                  : distanceKm(s.actor.position, branch.runner.position) *
                    (branch.rules.units?.[i]?.kind === "marksman" ? 1.5 : 0.3)),
              0,
            );
          next.push({ game: branch, moves, score });
        }
    }
    beam = next.sort((a, b) => b.score - a.score).slice(0, 10);
    if (!beam.length) return null;
  }
  return null;
}

const missions: Mission[] = [];
const bases = [0, 1, 0, 1, 3, 0, 1, 3, 3, 2, 3, 3, 3, 0, 3];
for (let i = 0; i < ECONOMY.levelCount; i++) {
  const level = i + 1,
    base = board.setups[bases[i]];
  const rapidStep = level < 8 ? 1 : level < 12 ? 2 : level < 14 ? 3 : 4;
  const recommended: Mission["recommended"] =
    level < 3
      ? [
          { id: "patrol-1", step: 0 },
          { id: "patrol-2", step: 0 },
          { id: "patrol-3", step: 0 },
        ]
      : level < 6
        ? [
            { id: "patrol-1", step: 0 },
            { id: "rapid", step: rapidStep },
            { id: "patrol-3", step: 0 },
          ]
        : level < 10
          ? [
              { id: "patrol-1", step: 0 },
              { id: "rapid", step: rapidStep },
              { id: "helicopter", step: level < 8 ? 0 : 2 },
            ]
          : [
              { id: "marksman", step: Math.min(4, level - 10) },
              { id: "rapid", step: rapidStep },
              { id: "helicopter", step: level < 13 ? 2 : 4 },
            ];
  const player = newPlayer();
  player.unlocked = 15;
  recommended.forEach(
    ({ id, step }) => (player.squads[id] = { step, training: null }),
  );
  let witness: Mission["witness"] | null = null,
    mission: Mission | null = null;
  // Distinct spawns in the authored area. Earlier unused candidates remain available
  // across regeneration; no seed depends on wall-clock time or random choice.
  const region = board.nodes[base.runnerNode].region;
  const nodes = [
    base.runnerNode,
    ...board.nodes
      .map((n, index) => ({ n, index }))
      .filter(
        ({ n, index }) =>
          n.kind === "land" && n.region === region && index !== base.runnerNode,
      )
      .sort(
        (a, b) =>
          distanceKm(a.n.p, board.nodes[base.runnerNode].p) -
          distanceKm(b.n.p, board.nodes[base.runnerNode].p),
      )
      .map((x) => x.index),
  ];
  const originalTargets = base.witness.map((m) => m.border);
  for (const spawn of nodes.slice(0, 18)) {
    if (missions.some((m) => m.runnerNode === spawn)) continue;
    const posts = base.squadBorders.slice(0, 3);
    mission = {
      number: level,
      id: `india-v2-${String(level).padStart(2, "0")}`,
      title: titles[i],
      briefing: briefings[i],
      runnerNode: spawn,
      posts,
      runnerSpeed: ECONOMY.opponents[i].speedKmh,
      recommended,
      witness: [],
    };
    const selection = recommended.map((x) => x.id);
    const { game } = createMission(board, mission, player, selection, 0, nav);
    if (game.outcome.kind !== "playing") continue;
    // Existing witnesses are only candidate moves; all are replayed with new rules.
    const trial = game.fork();
    const candidate = base.witness.filter((m) => m.squad < 3);
    const issued: Mission["witness"] = [];
    for (const move of candidate) {
      if (!trial.issueOrder(move.squad, move.border)) break;
      issued.push(move);
      trial.resolveOrder();
      if (trial.won) break;
    }
    witness = trial.won ? issued : solve(game, originalTargets);
    if (witness) break;
  }
  if (!mission || !witness)
    throw new Error(`No verified setup for Level ${level}`);
  mission.witness = witness;
  const weakPlayer = newPlayer();
  weakPlayer.unlocked = 15;
  const weaker = createMission(
    board,
    mission,
    weakPlayer,
    ["patrol-1", "patrol-2", "patrol-3"],
    0,
    nav,
  ).game;
  for (const move of witness) {
    if (!weaker.issueOrder(move.squad, move.border)) break;
    weaker.resolveOrder();
  }
  const lesser = structuredClone(player);
  for (const unit of Object.values(lesser.squads))
    if (unit) unit.step = Math.max(0, unit.step - 1);
  const weakUpgrade = createMission(
    board,
    mission,
    lesser,
    recommended.map((x) => x.id),
    0,
    nav,
  ).game;
  for (const move of witness) {
    if (!weakUpgrade.issueOrder(move.squad, move.border)) break;
    weakUpgrade.resolveOrder();
  }
  mission.verification = {
    moves: witness.length,
    basicWitnessWins: weaker.won,
    weakerWitnessMoves: weakUpgrade.won ? weakUpgrade.ordersUsed : null,
  };
  missions.push(mission);
  console.log(
    `Level ${level}: ${witness.length} moves; basic same-route ${weaker.won ? "wins" : "fails"}; ${mission.runnerNode}`,
  );
}
const payload = {
  version: 2,
  country: "india",
  geometryHash: createHash("sha256")
    .update(
      JSON.stringify([board.land, board.borders, board.nodes, board.links]),
    )
    .digest("hex"),
  configHash: createHash("sha256")
    .update(JSON.stringify(ECONOMY))
    .digest("hex"),
  levels: missions,
};
writeFileSync("public/data/india-campaign.json", JSON.stringify(payload));
