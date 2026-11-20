// Author and verify every campaign level from the difficulty plan in
// playtest.config.ts. Usage: node --import tsx scripts/prepare-campaign.ts [india|usa|europe]...
// Each country's levels are written to public/data/<country>-campaign.json.
// Results are checkpointed per level under scripts/.cache/campaign/ so an
// interrupted run resumes; a changed plan, speed or board invalidates them.
// Bounded beam search finds witnesses; it is not a proof that no shorter win
// or weaker-roster win exists.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Navigation, distanceKm } from "../src/game/navigation";
import type { PatrolGame } from "../src/game/engine";
import { ECONOMY, newPlayer, type PlayerState, type SquadId } from "../src/game/collection";
import { createMission, type Mission } from "../src/game/missions";
import type { CountryBoard } from "../src/game/types";

type Move = Mission["witness"][number];
type Tier = (typeof ECONOMY.campaignPlan)[number];
const tuning = ECONOMY.authoring;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const TEXT: Record<number, [string, string]> = {
  1: ["Close the net", "Choose a squad, pick a post, then deploy. Seal every land escape."],
  2: ["The western coast", "A new starting position. The coast can help complete your enclosure."],
  3: ["Two moves to close", "Plan both moves before the first. The fugitive reacts to every closure."],
  4: ["Across the plateau", "Long journeys give the fugitive more time. Prefer nearby posts."],
  5: ["Hold the line", "A guarded post stays closed only while its squad remains there."],
  6: ["A faster response", "Rapid Action is available in the Academy. Reach distant posts sooner."],
  7: ["Rapid pursuit", "Send Rapid Action to the post your patrols cannot reach in time."],
  8: ["A narrow window", "Preview the chase. A destination stays open until your squad arrives."],
  9: ["No time to spare", "Train your Rapid Action Squad to close the gap."],
  10: ["Speed and timing", "Combine speed with a well-timed border closure."],
  11: ["Air support", "Helicopter Squad is available. Deployment spends a move; choose your landing carefully."],
  12: ["Hold the sky", "Helicopter guarding expires. Watch the counter and prepare another deployment."],
  13: ["Faster landings", "Faster deployment gives the fugitive less time to escape."],
  14: ["Pressure on all sides", "Use your trained specialists together."],
  15: ["India: command test", "Your final India assignment. Bring your strongest roster."],
  16: ["Across the Atlantic", "A new patrol zone. Marksman Squad and a fourth slot are available."],
  17: ["Within range", "Marksman fires only while stationed. Leave it where the fugitive must pass."],
  18: ["Prairie pursuit", "The fugitive crosses open country quickly. Train for the response."],
  19: ["The northern corridor", "Watch the northern land exits and leave a squad guarding behind you."],
  20: ["Hold the crossroads", "Use four squads to close different parts of the net."],
  21: ["Beyond the bay", "The coast helps, but every inland exit still needs coverage."],
  22: ["The long detour", "Preview the whole route before moving a stationed Marksman."],
  23: ["High-country watch", "Rapid Action must reach the next post before the fugitive crosses."],
  24: ["Seal the frontier", "Guard the frontier and use firing range to cover a second route."],
  25: ["America: command test", "Your final USA assignment. Combine your four strongest units."],
  26: ["Into Europe", "One patrol zone across eight countries. National borders are yours to guard."],
  27: ["The Rhine crossing", "Dense borders give the fugitive many choices. Close the nearest first."],
  28: ["Alpine passes", "Mountain frontiers are long. Let firing range cover what squads cannot."],
  29: ["Channel watch", "The coast helps, but every land frontier still needs a guard."],
  30: ["Heart of the continent", "The fugitive starts far from any exit. Use the time to build the net."],
  31: ["Many borders, one net", "Every move reopens the border you leave. Choose who stays."],
  32: ["The eastern frontier", "Long frontiers to the east. Helicopters buy time for ground squads."],
  33: ["Low countries", "Short borders, quick crossings. Timing matters more than distance."],
  34: ["The long night", "A longer chase. Keep a squad in reserve for the final closure."],
  35: ["Between two rivers", "Preview every route. The fugitive recalculates after each closure."],
  36: ["Five-move trap", "No quick win here. Build the enclosure one border at a time."],
  37: ["Shadow on the border", "A fast fugitive. Your fully trained units are the only answer."],
  38: ["The last corridor", "Leave no route open behind a moving squad."],
  39: ["All units", "Every specialist has a part to play. Plan the whole sequence."],
  40: ["Europe: command test", "Your final assignment. The fastest fugitive on the continent."],
};

function tierFor(level: number): Tier {
  const tier = ECONOMY.campaignPlan.find((entry) => level >= entry.levels[0] && level <= entry.levels[1]);
  if (!tier) throw new Error(`No campaign plan for Level ${level}`);
  return tier;
}

function playerFor(roster: readonly (readonly [string, number])[], slots: number): PlayerState {
  const player = newPlayer();
  player.unlocked = ECONOMY.levelCount;
  if (slots === 4) { player.deploymentSlots = 4; player.selection.push(null); }
  for (const [id, step] of roster) player.squads[id as SquadId] = { step, training: null };
  return player;
}

function nearestPosts(board: CountryBoard, game: PatrolGame, count: number) {
  return board.borders.map((border, index) => ({ index, d: distanceKm(border.post, game.runner.position) }))
    .sort((a, b) => a.d - b.d).slice(0, count).map((entry) => entry.index);
}

/** Breadth-first beam search; returns the shortest witness it finds. */
function solve(board: CountryBoard, game: PatrolGame, targets: number[], depthLimit: number): Move[] | null {
  let beam = [{ game, moves: [] as Move[] }];
  const seen = new Set<string>();
  for (let depth = 0; depth < depthLimit; depth++) {
    const next: { game: PatrolGame; moves: Move[]; score: number }[] = [];
    for (const state of beam) {
      const borders = new Set([...targets, ...nearestPosts(board, state.game, tuning.nearestPosts)]);
      for (let squad = 0; squad < game.squads.length; squad++) for (const border of borders) {
        const branch = state.game.fork();
        if (!branch.issueOrder(squad, border)) continue;
        branch.resolveOrder();
        const moves = [...state.moves, { squad, border }];
        if (branch.won) return moves;
        if (branch.outcome.kind !== "playing" || depth === depthLimit - 1) continue;
        const key = JSON.stringify([branch.squads.map((s) => [s.border, s.guardLeft]), branch.runner.position.map((v) => Math.round(v * 1e4))]);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ game: branch, moves, score: branch.runnerEscapeDistanceKm });
      }
    }
    beam = next.sort((a, b) => b.score - a.score).slice(0, tuning.beam);
    if (!beam.length) return null;
  }
  return null;
}

/** Distinct first moves from which a win within the move range is still found. */
function winningOpenings(board: CountryBoard, game: PatrolGame, targets: number[], maxMoves: number, needed: number) {
  let count = 0;
  const borders = new Set([...targets, ...nearestPosts(board, game, tuning.openingPosts)]);
  for (let squad = 0; squad < game.squads.length; squad++) for (const border of borders) {
    const branch = game.fork();
    if (!branch.issueOrder(squad, border)) continue;
    branch.resolveOrder();
    if (branch.won || (branch.outcome.kind === "playing" && maxMoves > 1 && solve(board, branch, targets, maxMoves - 1))) count++;
    if (count >= needed) return count;
  }
  return count;
}

function replay(board: CountryBoard, nav: Navigation, mission: Mission, player: PlayerState, selection: (SquadId | null)[]) {
  const game = createMission(board, mission, player, selection, 0, nav).game;
  for (const move of mission.witness) {
    if (!game.issueOrder(move.squad, move.border)) break;
    game.resolveOrder();
  }
  return game;
}

function author(country: string) {
  const chapter = ECONOMY.chapters.find((entry) => entry.country === country);
  if (!chapter) throw new Error(`Unknown chapter: ${country}`);
  const board: CountryBoard = JSON.parse(readFileSync(`public/data/${country}.json`, "utf8"));
  const nav = new Navigation(board);
  const boardHash = hash([board.land, board.borders, board.nodes, board.links]);
  const cacheDir = `scripts/.cache/campaign/${country}`;
  mkdirSync(cacheDir, { recursive: true });
  const previous: Mission[] = existsSync(`public/data/${country}-campaign.json`)
    ? JSON.parse(readFileSync(`public/data/${country}-campaign.json`, "utf8")).levels : [];
  const missions: Mission[] = [];
  for (let number = chapter.first; number <= chapter.last; number++) {
    const tier = tierFor(number), roster = tier.roster;
    const slots = roster.length;
    const recommended = roster.map(([id, step]) => ({ id: id as SquadId, step }));
    const selection = recommended.map((entry) => entry.id);
    const player = playerFor(roster, slots);
    const speed = ECONOMY.opponents[number - 1].speedKmh;
    // Search bounds only change how a level is found, not whether it is valid.
    const key = hash([boardHash, tier, speed, TEXT[number], number === 1 ? previous[0] : null]);
    const cachePath = `${cacheDir}/${number}.json`;
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cached.key === key && !missions.some((m) => m.runnerNode === cached.mission.runnerNode)) {
        missions.push(cached.mission);
        console.log(`${number}: cached (${cached.mission.witness.length} moves)`);
        continue;
      }
    }
    const started = performance.now();
    const [title, briefing] = TEXT[number];
    const base: Omit<Mission, "runnerNode" | "posts" | "witness"> = {
      country, number, id: `${country}-v2-${String(number).padStart(2, "0")}`, title, briefing, runnerSpeed: speed, recommended,
    };
    let found: Mission | null = null;
    const tried = { candidates: 0, tooShort: 0, tooLong: 0, basicWins: 0, unforgiving: 0 };
    // Level 1 keeps its guided tutorial spawn, posts and witness; only rules change.
    const candidates: { runnerNode: number; posts: number[]; targets: number[]; witness?: Move[] }[] = [];
    if (number === 1 && previous[0]) candidates.push({ runnerNode: previous[0].runnerNode, posts: previous[0].posts, targets: previous[0].witness.map((m) => m.border), witness: previous[0].witness });
    for (let offset = 0; offset < board.setups.length; offset++) {
      const setup = board.setups[(number + offset) % board.setups.length];
      const region = board.nodes[setup.runnerNode].region;
      const spawns = [setup.runnerNode, ...board.nodes.map((node, index) => ({ node, index }))
        .filter(({ node, index }) => node.kind === "land" && node.region === region && index !== setup.runnerNode)
        .sort((a, b) => distanceKm(a.node.p, board.nodes[setup.runnerNode].p) - distanceKm(b.node.p, board.nodes[setup.runnerNode].p))
        .map(({ index }) => index)].slice(0, tuning.spawnsPerSetup);
      for (const runnerNode of spawns) {
        const posts = setup.squadBorders.slice(0, 3);
        // Every level carries a fourth post for players who own the fourth slot.
        const extra = board.borders.map((border, index) => ({ index, d: distanceKm(border.post, board.nodes[runnerNode].p) }))
          .filter((entry) => !posts.includes(entry.index)).sort((a, b) => slots === 4 ? a.d - b.d : b.d - a.d);
        const fourth = slots === 4 && setup.squadBorders[3] !== undefined && !posts.includes(setup.squadBorders[3]) ? setup.squadBorders[3] : extra[0].index;
        candidates.push({ runnerNode, posts: [...posts, fourth], targets: setup.witness.map((m) => m.border) });
      }
    }
    // Harder fallbacks: spawns across every region, with starting posts drawn
    // from progressively farther borders so specialists must travel.
    const exitPosts = board.borders.filter((border) => border.kind === "exit").map((border) => border.post);
    const exitDistance = (p: [number, number]) => Math.min(...exitPosts.map((post) => distanceKm(post, p)));
    const regions = [...new Set(board.nodes.filter((node) => node.kind === "land").map((node) => node.region))];
    for (const spread of tuning.farPostRanks) for (const [r, region] of regions.entries()) {
      // Prefer spawns with an exit within reach, so a strong roster still needs
      // several moves to close every route before the fugitive gets there.
      const nodes = board.nodes.map((node, index) => ({ node, index, exit: exitDistance(node.p) }))
        .filter(({ node, exit }) => node.kind === "land" && node.region === region && exit >= tuning.spawnExitKm[0] && exit <= tuning.spawnExitKm[1])
        .sort((a, b) => a.index - b.index);
      for (let k = 0; k < tuning.spawnsPerRegion; k++) {
      const pick = nodes[(number * 7 + r + k * 13) % Math.max(1, nodes.length)];
      if (!pick) continue;
      const order = board.borders.map((border, index) => ({ index, d: distanceKm(border.post, pick.node.p) })).sort((a, b) => a.d - b.d).map((entry) => entry.index);
      const posts = [0, 1, 2, 3].map((i) => order[Math.min(order.length - 1, spread + i * 3)]);
      if (slots === 3) posts[3] = order.at(-1)!;
      candidates.push({ runnerNode: pick.index, posts, targets: [] });
      }
    }
    for (const candidate of candidates) {
      if (missions.some((m) => m.runnerNode === candidate.runnerNode)) continue;
      tried.candidates++;
      const mission: Mission = { ...base, runnerNode: candidate.runnerNode, posts: candidate.posts, witness: [] } as Mission;
      const { game } = createMission(board, mission, player, slots === 4 ? selection : selection, 0, nav);
      if (game.outcome.kind !== "playing") continue;
      let witness: Move[] | null = null;
      if (candidate.witness) {
        mission.witness = candidate.witness;
        if (replay(board, nav, mission, player, selection).won) witness = candidate.witness;
      }
      witness ??= solve(board, game, candidate.targets, tier.moves[1]);
      if (!witness) { tried.tooLong++; continue; }
      if (witness.length < tier.moves[0]) { tried.tooShort++; continue; }
      mission.witness = witness;
      const basicSelection: (SquadId | null)[] = slots === 4 ? ["patrol-1", "patrol-2", "patrol-3", null] : ["patrol-1", "patrol-2", "patrol-3"];
      const basic = replay(board, nav, mission, playerFor([], slots), basicSelection);
      if (tier.basicMustFail && basic.won) { tried.basicWins++; continue; }
      if (tier.minOpenings > 0 && winningOpenings(board, game, candidate.targets, tier.moves[1], tier.minOpenings) < tier.minOpenings) { tried.unforgiving++; continue; }
      const lower = structuredClone(player);
      for (const unit of Object.values(lower.squads)) if (unit) unit.step = Math.max(0, unit.step - 1);
      const weaker = replay(board, nav, mission, lower, selection);
      mission.verification = { moves: witness.length, basicWitnessWins: basic.won, weakerWitnessMoves: weaker.won ? weaker.ordersUsed : null };
      found = mission;
      break;
    }
    if (!found) throw new Error(`No verified setup for ${country} Level ${number}: ${JSON.stringify(tried)}`);
    writeFileSync(cachePath, JSON.stringify({ key, mission: found }));
    missions.push(found);
    console.log(`${number}: ${found.witness.length} moves, ${speed} km/h, spawn ${found.runnerNode}, basic ${found.verification!.basicWitnessWins ? "wins" : "fails"}, ${Math.round((performance.now() - started) / 1000)}s ${JSON.stringify(tried)}`);
  }
  writeFileSync(`public/data/${country}-campaign.json`, JSON.stringify({ version: 2, country, geometryHash: boardHash, configHash: hash(ECONOMY), levels: missions }));
}

const requested = process.argv.slice(2);
for (const chapter of ECONOMY.chapters) if (!requested.length || requested.includes(chapter.country)) author(chapter.country);
