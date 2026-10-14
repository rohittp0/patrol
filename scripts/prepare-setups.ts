import { readFileSync, writeFileSync } from "node:fs";
import { PLAYTEST_CONFIG as CONFIG } from "../src/game/playtest.config";
import { PatrolGame, rulesForLevel } from "../src/game/engine";
import { distanceKm, Navigation } from "../src/game/navigation";
import type { CountryBoard, StartingSetup } from "../src/game/types";
import { spawnClearance, validSpawn } from "../src/game/spawn";
import { hasWinWithin } from "../src/game/setup-validation";
import { measureDifficulty, setupRulesSignature } from "../src/game/difficulty";

let seed: number = CONFIG.setups.preparationSeed;
function random() {
  seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
  return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
}
function shuffled<T>(values: T[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function combinations(values: number[], count: number): number[][] {
  if (!count) return [[]];
  return values.flatMap((value, index) => combinations(values.slice(index + 1), count - 1).map((tail) => [value, ...tail]));
}
function permutations(values: number[], count: number): number[][] {
  if (!count) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index), count - 1).map((tail) => [value, ...tail]));
}

function enclosures(board: CountryBoard, regions: string[]): string[][] {
  const clusters = regions.map((region) => [region]);
  const seen = new Set(clusters.map((cluster) => cluster.join(":")));
  for (let index = 0; index < clusters.length; index++) {
    const cluster = clusters[index];
    if (cluster.length >= CONFIG.setups.maxEnclosureRegions) continue;
    const neighbors = board.borders.filter((border) => border.kind === "internal" && border.regions.some((region) => cluster.includes(region))).flatMap((border) => border.regions);
    for (const neighbor of neighbors) {
      if (cluster.includes(neighbor)) continue;
      const expanded = [...cluster, neighbor].sort();
      const key = expanded.join(":");
      if (!seen.has(key)) { seen.add(key); clusters.push(expanded); }
    }
  }
  return clusters;
}

const requestedCountries = process.argv.slice(2);
if (requestedCountries.some((id) => !CONFIG.levels.some((level) => level.id === id))) throw new Error("Unknown country; use a configured level id");
for (const level of CONFIG.levels.filter((level) => !requestedCountries.length || requestedCountries.includes(level.id))) {
  const started = performance.now();
  const path = `public/data/${level.id}.json`;
  const board: CountryBoard = JSON.parse(readFileSync(path, "utf8"));
  const navigation = new Navigation(board);
  const rules = rulesForLevel(level.id);
  const rulesSignature = await setupRulesSignature(board, rules);
  const allBorders = board.borders.map((_, index) => index);
  const regions = [...new Set(board.nodes.filter((node) => node.kind === "land").map((node) => node.region))];
  const pool: StartingSetup[] = [];
  let attempts = 0;

  regionLoop: for (const cluster of enclosures(board, regions)) {
    const cut = allBorders.filter((index) => {
      const border = board.borders[index];
      return border.regions.some((region) => cluster.includes(region)) && (border.kind === "exit" || border.regions.some((region) => !cluster.includes(region)));
    });
    if (!cut.length || cut.length > rules.squadCount) continue;
    let regionAttempts = 0;
    console.log(`${level.name}: checking ${cluster.map((region) => board.regions.find((candidate) => candidate.id === region)?.name ?? region).join(" + ")}`);
    const candidates = board.nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.kind === "land" && cluster.includes(node.region)).map((candidate) => ({ ...candidate, clearance: spawnClearance(board, candidate.node.p) })).filter(({ clearance }) => validSpawn(clearance, level));
    candidates.sort((a, b) => b.clearance.zoneEdgeKm - a.clearance.zoneEdgeKm);
    const perRegion = cluster.map((region) => candidates.filter(({ node }) => node.region === region).slice(0, CONFIG.setups.runnerCandidatesPerRegion));
    const runnerNodes = Array.from({ length: CONFIG.setups.runnerCandidatesPerRegion }, (_, index) => perRegion.flatMap((entries) => entries[index] ? [entries[index].index] : [])).flat();
    runnerLoop: for (const runnerNode of runnerNodes) {
      let runnerAttempts = 0;
      const spawnRegion = board.nodes[runnerNode].region;
      if (pool.filter((setup) => board.nodes[setup.runnerNode].region === spawnRegion).length >= CONFIG.setups.maxSetupsPerRegion) continue;
      // Short unguardable source fragments can leave a region open. Do not
      // search travel sequences for a cut that cannot statically enclose it.
      if (navigation.shortestPath([{ node: runnerNode, cost: 0 }], (node) => board.nodes[node].kind === "exit", new Set(cut), true)) continue;
      const nearest = [...allBorders].sort((a, b) => distanceKm(board.nodes[runnerNode].p, board.borders[a].post) - distanceKm(board.nodes[runnerNode].p, board.borders[b].post));
      const startingBorders = [...new Set([...cut, ...nearest.slice(0, CONFIG.setups.initialBorderCandidates)])];
      for (const initial of shuffled(combinations(startingBorders, rules.squadCount))) {
        const missing = cut.filter((border) => !initial.includes(border));
        if (missing.length !== level.solutionOrders || missing.length > CONFIG.setups.searchDepth) continue;
        const start: StartingSetup = { id: "candidate", runnerNode, squadBorders: initial, witness: [] };
        if (new PatrolGame(board, start, rules, navigation).outcome.kind !== "playing") continue;
        for (const destinations of permutations(missing, missing.length)) {
          const movable = initial.map((border, index) => ({ border, index })).filter(({ border }) => !cut.includes(border)).map(({ index }) => index);
          for (const squads of permutations(movable, destinations.length)) {
            if (++runnerAttempts > CONFIG.setups.maxAttemptsPerRunner) continue runnerLoop;
            if (++regionAttempts > CONFIG.setups.maxAttemptsPerRegion) continue regionLoop;
            attempts++;
            const witness = destinations.map((border, index) => ({ squad: squads[index], border }));
            const game = new PatrolGame(board, start, rules, navigation);
            for (const order of witness) {
              if (!game.issueOrder(order.squad, order.border)) break;
              game.resolveOrder();
              if (game.outcome.kind !== "playing") break;
            }
            if (game.outcome.kind !== "won" || game.ordersUsed !== witness.length) continue;
            if (witness.length < CONFIG.setups.minWitnessOrders) continue;
            start.witness = witness;
            if (hasWinWithin(new PatrolGame(board, start, rules, navigation), level.solutionOrders - 1)) continue;
            start.difficulty = measureDifficulty(board, start, rules, navigation, rulesSignature);
            if (start.difficulty.escapePressure < level.escapePressureRange.min || start.difficulty.escapePressure > level.escapePressureRange.max) continue;
            start.id = `${level.countryCodes[0]}-${String(pool.length + 1).padStart(3, "0")}`;
            pool.push(start);
            console.log(`${level.name} ${start.id}: verified ${start.witness.length}-order solution after ${attempts} candidates`);
            if (pool.length >= CONFIG.setups.poolSize) break regionLoop;
            break;
          }
          if (pool.at(-1) === start) break;
        }
        if (pool.at(-1) === start) break; // Different runner position for the next setup.
      }
    }
  }
  if (pool.length < CONFIG.setups.poolSize) throw new Error(`${level.name}: only ${pool.length} verified setups; refusing to publish an incomplete pool`);
  pool.sort((a, b) => a.difficulty!.score - b.difficulty!.score || a.id.localeCompare(b.id));
  pool.forEach((setup, index) => { setup.id = `${level.countryCodes[0]}-${String(index + 1).padStart(3, "0")}`; });
  board.setups = pool;
  writeFileSync(path, JSON.stringify(board) + "\n");
  console.log(`${level.name}: prepared ${pool.length} verified setups in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}
