import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { PLAYTEST_CONFIG as CONFIG } from "../src/game/playtest.config";
import { PatrolGame, rulesForLevel } from "../src/game/engine";
import { distanceKm, Navigation } from "../src/game/navigation";
import type { CountryBoard, StartingSetup } from "../src/game/types";
import { spawnClearance, validSpawn } from "../src/game/spawn";
import { hasWinWithin } from "../src/game/setup-validation";
import { measureDifficulty, setupRulesSignature } from "../src/game/difficulty";
import { setupCuration, validSetupCuration } from "../src/game/setup-curation";
import { challengePolicy, type ChallengePolicy } from "../src/game/challenge-policy";

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
      const expanded = [...cluster, neighbor].sort(), key = expanded.join(":");
      if (!seen.has(key)) { seen.add(key); clusters.push(expanded); }
    }
  }
  return clusters;
}

type Order = StartingSetup["witness"][number];
const revalidate = process.argv.includes("--revalidate");
const resume = process.argv.includes("--resume");
const requested = process.argv.slice(2).filter((arg) => !["--revalidate", "--resume"].includes(arg));
if (requested.some((id) => !CONFIG.levels.some((level) => level.id === id))) throw new Error("Unknown country; use a configured level id");

for (const level of CONFIG.levels.filter((level) => !requested.length || requested.includes(level.id))) {
  const started = performance.now(), path = `public/data/${level.id}.json`;
  const board: CountryBoard = JSON.parse(readFileSync(path, "utf8"));
  const navigation = new Navigation(board), curation = setupCuration(level.id);
  const signatures = new Map<number, string>(await Promise.all(level.squadCounts.map(async (count) => [count, await setupRulesSignature(board, rulesForLevel(level.id, count))] as const)));
  const checkpointPath = `scripts/.cache/setup-candidates/${level.id}.json`;
  const intro: StartingSetup[] = [], main: StartingSetup[] = [], usedRegions = new Set<string>();
  const allBorders = board.borders.map((_, index) => index);
  const prepared = board.setups.map((setup) => board.nodes[setup.runnerNode]).filter((node) => node?.kind === "land");
  const regions = [...new Set(board.nodes.filter((node) => node.kind === "land").map((node) => node.region))];
  const internalCount = new Map(regions.map((region) => [region, board.borders.filter((border) => border.kind === "internal" && border.regions.includes(region)).length]));
  const candidates = board.nodes.flatMap((node, index) => node.kind === "land" && internalCount.get(node.region)! >= curation.minimumSpawnInternalBorders && validSpawn(spawnClearance(board, node.p), level) ? [{ node, index }] : []);
  const validNodes = new Set(candidates.map(({ index }) => index));
  const proofCache = new Map<string, boolean>();
  let attempts = 0;
  const bucket = (policy: ChallengePolicy) => policy.minimumOrders === CONFIG.progression.introductory.minimumOrders ? intro : main;
  const quota = (policy: ChallengePolicy) => policy.minimumOrders === CONFIG.progression.introductory.minimumOrders ? CONFIG.progression.introductoryHunts : CONFIG.setups.poolSize - CONFIG.progression.introductoryHunts;
  const pool = () => [...intro, ...main];
  const checkpoint = () => {
    mkdirSync("scripts/.cache/setup-candidates", { recursive: true });
    writeFileSync(checkpointPath, JSON.stringify({ candidates: pool() }) + "\n");
  };
  const accept = (original: StartingSetup, witness: Order[], policy: ChallengePolicy): boolean => {
    const spawn = board.nodes[original.runnerNode]?.region;
    if (!(level.squadCounts as readonly number[]).includes(original.squadBorders.length) || original.squadBorders.some((border) => !board.borders[border])) return false;
    const rules = rulesForLevel(level.id, original.squadBorders.length);
    if (bucket(policy).length >= quota(policy) || usedRegions.has(spawn) || !validNodes.has(original.runnerNode) || witness.length < policy.minimumOrders || witness.length > policy.maximumWitnessOrders) return false;
    const setup: StartingSetup = { id: "candidate", runnerNode: original.runnerNode, squadBorders: [...original.squadBorders], witness: [...witness] };
    const game = new PatrolGame(board, setup, rules, navigation);
    if (game.outcome.kind !== "playing") return false;
    const pressure = game.minimumRunnerTravelKm / Math.max(CONFIG.movement.arrivalToleranceKm, game.runnerEscapeDistanceKm);
    if (pressure < level.escapePressureRange.min || pressure > level.escapePressureRange.max) return false;
    for (const order of witness) { if (!game.issueOrder(order.squad, order.border)) return false; game.resolveOrder(); }
    if (!game.won || game.ordersUsed !== witness.length || !validSetupCuration(game, policy)) return false;
    const key = `${setup.runnerNode}:${setup.squadBorders.join(":")}:${policy.minimumOrders}`;
    if (!proofCache.has(key)) proofCache.set(key, !hasWinWithin(new PatrolGame(board, setup, rules, navigation), policy.minimumOrders - 1));
    if (!proofCache.get(key)) return false;
    setup.difficulty = measureDifficulty(board, setup, rules, navigation, signatures.get(rules.squadCount)!, policy);
    setup.id = `candidate-${pool().length + 1}`;
    bucket(policy).push(setup); usedRegions.add(spawn); checkpoint();
    console.log(`${level.name}: ${pool().length}/${CONFIG.setups.poolSize}, ${board.regions.find((region) => region.id === spawn)?.name ?? spawn}: >=${policy.minimumOrders} moves, ${witness.length}-move win, ${Math.round(setup.difficulty.meanSquadTravelKm)} km mean trip, ${Math.round(setup.difficulty.initiallyGuardedFraction * 100)}% trap guarded at spawn`);
    return true;
  };

  if (revalidate) {
    if (board.setups.length !== CONFIG.setups.poolSize) throw new Error(`${level.id}: incomplete pool`);
    for (const [index, setup] of board.setups.entries()) if (!accept(setup, setup.witness, challengePolicy(index))) throw new Error(`${setup.id}: no longer meets its hunt's requirements`);
  } else {
    const previousCandidates: StartingSetup[] = [...board.setups];
    if (resume && existsSync(checkpointPath)) {
      const saved = JSON.parse(readFileSync(checkpointPath, "utf8"));
      // Checkpoints supply suggestions only. Every allocation, witness and
      // shorter-solution proof is rebuilt, even if rules changed since saving.
      previousCandidates.push(...saved.candidates as StartingSetup[]);
    }
    for (const original of previousCandidates) {
      const policy = original.witness.length === CONFIG.progression.introductory.minimumOrders ? CONFIG.progression.introductory : CONFIG.progression.main;
      accept(original, original.witness, policy);
    }

    // A tail of an existing chase is a useful two-move introduction. Its new
    // spawn is a real, cleared land node and its full solution is reverified.
    for (const setup of board.setups.filter((setup) => (level.squadCounts as readonly number[]).includes(setup.squadBorders.length))) {
      const rules = rulesForLevel(level.id, setup.squadBorders.length);
      if (intro.length >= CONFIG.progression.introductoryHunts) break;
      const prefix = setup.witness.slice(0, -CONFIG.progression.introductory.minimumOrders);
      if (!prefix.length) continue;
      const game = new PatrolGame(board, setup, rules, navigation);
      for (const order of prefix) { game.issueOrder(order.squad, order.border); game.resolveOrder(); }
      if (game.outcome.kind !== "playing" || game.squads.some((squad) => squad.border === null)) continue;
      const nearest = [...candidates].filter(({ node }) => !usedRegions.has(node.region)).sort((a, b) => distanceKm(a.node.p, game.runner.position) - distanceKm(b.node.p, game.runner.position)).slice(0, CONFIG.setups.runnerCandidatesPerRegion);
      for (const candidate of nearest) if (accept({ ...setup, runnerNode: candidate.index, squadBorders: game.squads.map((squad) => squad.border!) }, setup.witness.slice(prefix.length), CONFIG.progression.introductory)) break;
    }

    const clusters = enclosures(board, regions);
    if (CONFIG.setups.preferPreparedAreas) clusters.sort((a, b) => Number(prepared.some((node) => b.includes(node.region))) - Number(prepared.some((node) => a.includes(node.region))));
    for (const policy of [CONFIG.progression.introductory, CONFIG.progression.main]) {
      if (bucket(policy).length >= quota(policy)) continue;
      const orderedClusters = [...clusters];
      if (CONFIG.setups.preferLandExitEnclosures) {
        const hasExit = (cluster: string[]) => board.borders.some((border) => border.kind === "exit" && border.regions.some((region) => cluster.includes(region)));
        orderedClusters.sort((a, b) => Number(hasExit(b)) - Number(hasExit(a)));
      }
      clusterLoop: for (const cluster of orderedClusters) {
        if (bucket(policy).length >= quota(policy)) break;
        const cut = allBorders.filter((index) => board.borders[index].regions.some((region) => cluster.includes(region)) && (board.borders[index].kind === "exit" || board.borders[index].regions.some((region) => !cluster.includes(region))));
        const allocation = level.squadCounts.find((count) => count >= cut.length);
        if (allocation === undefined || cut.length < policy.minimumOrders || cut.length < curation.minimumEnclosureBorders) continue;
        const rules = rulesForLevel(level.id, allocation);
        const neighbors = [...new Set(board.borders.filter((border) => border.kind === "internal" && border.regions.some((region) => cluster.includes(region))).flatMap((border) => border.regions))].filter((region) => !cluster.includes(region));
        const sourceRegions = curation.requireRunnerRegionChange ? neighbors : CONFIG.setups.neighboringSpawnCountries.includes(level.id) ? [...cluster, ...neighbors] : cluster;
        const nearby = candidates.filter(({ node }) => sourceRegions.includes(node.region) && !usedRegions.has(node.region));
        nearby.sort((a, b) => {
          const toPrepared = (candidate: typeof a) => {
            const anchors = CONFIG.setups.preferPreparedAreas ? prepared.filter((node) => node.region === candidate.node.region) : [];
            return anchors.length ? Math.min(...anchors.map((node) => distanceKm(node.p, candidate.node.p))) : Infinity;
          };
          return toPrepared(a) - toPrepared(b) || distanceKm(a.node.p, board.borders[cut[0]].post) - distanceKm(b.node.p, board.borders[cut[0]].post);
        });
        const perRegion = sourceRegions.map((region) => nearby.filter(({ node }) => node.region === region).slice(0, CONFIG.setups.runnerCandidatesPerRegion));
        const runners = Array.from({ length: CONFIG.setups.runnerCandidatesPerRegion }, (_, i) => perRegion.flatMap((entries) => entries[i] ? [entries[i]] : [])).flat();
        let regionAttempts = 0;
        console.log(`${level.name}: searching >=${policy.minimumOrders} moves around ${cluster.join(" + ")}`);
        runnerLoop: for (const runner of runners) {
          if (usedRegions.has(runner.node.region)) continue;
          if (cluster.includes(runner.node.region) && navigation.shortestPath([{ node: runner.index, cost: 0 }], (node) => board.nodes[node].kind === "exit", new Set(cut), true)) continue;
          let runnerAttempts = 0;
          const nearest = [...allBorders].sort((a, b) => distanceKm(runner.node.p, board.borders[a].post) - distanceKm(runner.node.p, board.borders[b].post));
          const posts = [...new Set([...cut, ...nearest.slice(0, CONFIG.setups.initialBorderCandidates)])];
          const initials = shuffled(combinations(posts, rules.squadCount)).flatMap((initial) => {
            const missing = cut.filter((border) => !initial.includes(border));
            if (!missing.length || missing.length > policy.maximumWitnessOrders || (cut.length - missing.length) / cut.length > policy.maximumInitiallyGuardedFraction) return [];
            const movable = initial.filter((border) => !cut.includes(border));
            const cost = Math.min(...permutations(movable, missing.length).map((sources) => sources.reduce((sum, source, i) => sum + distanceKm(board.borders[source].post, board.borders[missing[i]].post), 0)));
            return [{ initial, cost, extra: Math.max(0, policy.minimumOrders - missing.length) }];
          }).sort((a, b) => a.extra - b.extra || a.cost - b.cost);
          for (const { initial } of initials) {
            const setup: StartingSetup = { id: "candidate", runnerNode: runner.index, squadBorders: initial, witness: [] };
            const game = new PatrolGame(board, setup, rules, navigation);
            if (game.outcome.kind !== "playing" || game.minimumRunnerTravelKm / game.runnerEscapeDistanceKm > level.escapePressureRange.max) continue;
            let exhausted = false;
            const search = (state: PatrolGame, remaining: number, path: Order[]): Order[] | null => {
              if (state.won) return path;
              if (state.outcome.kind !== "playing" || remaining <= 0) return null;
              const missing = cut.filter((border) => !state.securedBorders.has(border));
              if (!missing.length || missing.length > remaining) return null;
              const movable = state.squads.flatMap((squad, squadIndex) => squad.border !== null && !cut.includes(squad.border) ? [squadIndex] : []);
              const orders = movable.flatMap((squad) => missing.map((border) => ({ squad, border })));
              if (remaining > missing.length) for (const squad of movable) {
                const source = state.squads[squad].border!;
                const toCut = (post: number) => Math.min(...missing.map((target) => distanceKm(board.borders[post].post, board.borders[target].post)));
                const temporary = allBorders.filter((border) => !cut.includes(border) && !state.securedBorders.has(border) && toCut(border) < toCut(source)).sort((a, b) => toCut(a) - toCut(b)).slice(0, CONFIG.setups.repositionCandidatesPerSquad);
                orders.push(...temporary.map((border) => ({ squad, border })));
              }
              orders.sort((a, b) => distanceKm(state.squads[a.squad].actor.position, board.borders[a.border].post) - distanceKm(state.squads[b.squad].actor.position, board.borders[b.border].post));
              for (const order of orders) {
                if (++runnerAttempts > CONFIG.setups.maxAttemptsPerRunner || ++regionAttempts > CONFIG.setups.maxAttemptsPerRegion) { exhausted = true; return null; }
                attempts++;
                const branch = state.fork();
                if (!branch.issueOrder(order.squad, order.border)) continue;
                branch.resolveOrder();
                const result = search(branch, remaining - 1, [...path, order]);
                if (result) return result;
              }
              return null;
            };
            for (let depth = policy.minimumOrders; depth <= Math.min(policy.maximumWitnessOrders, CONFIG.setups.searchDepth); depth++) {
              const witness = search(game, depth, []);
              if (witness && accept(setup, witness, policy)) continue runnerLoop;
              if (witness && witness.length < policy.minimumOrders) break;
              if (exhausted) {
                if (regionAttempts > CONFIG.setups.maxAttemptsPerRegion) continue clusterLoop;
                continue runnerLoop;
              }
            }
          }
        }
      }
    }
  }
  if (intro.length !== CONFIG.progression.introductoryHunts || main.length !== CONFIG.setups.poolSize - CONFIG.progression.introductoryHunts) throw new Error(`${level.name}: ${intro.length} introductory and ${main.length} later hunts verified; checkpoint saved, incomplete pool not published`);
  intro.sort((a, b) => a.difficulty!.score - b.difficulty!.score);
  main.sort((a, b) => a.difficulty!.score - b.difficulty!.score);
  board.setups = pool();
  board.setups.forEach((setup, index) => { setup.id = `${level.countryCodes[0]}-${String(index + 1).padStart(3, "0")}`; });
  writeFileSync(`${path}.tmp`, JSON.stringify(board) + "\n");
  renameSync(`${path}.tmp`, path);
  console.log(`${level.name}: published ${board.setups.length} verified hunts in ${((performance.now() - started) / 1000).toFixed(1)}s (${attempts} simulations)`);
}
