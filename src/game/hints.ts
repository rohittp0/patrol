import { PatrolGame } from "./engine";
import { distanceKm } from "./navigation";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

export interface HintOrder { squad: number; border: number }
export type HintResult =
  | { kind: "winning"; orders: HintOrder[]; shortest: boolean }
  | { kind: "survival"; order: HintOrder }
  | { kind: "none"; reason: "unavailable" | "no-safe-order" | "search-limit" };

class SearchLimit extends Error {}
interface HintTuning { searchTimeMs: number; maxSimulations: number; maxEnclosureRegions: number }

/** Current-state advice. Every recommended winning sequence is replayed in the
 * real simulation. A shortest-win claim requires an exact lower bound; hitting
 * a search limit never becomes a claim that a position is unwinnable. */
export function findHint(game: PatrolGame, tuning: HintTuning = CONFIG.hints): HintResult {
  const remaining = game.rules.maxOrders - game.ordersUsed;
  if (game.activeOrder || game.outcome.kind !== "playing" || remaining <= 0) return { kind: "none", reason: "unavailable" };
  const deadline = performance.now() + tuning.searchTimeMs;
  let simulations = 0;
  let best = null as HintOrder[] | null;
  let provenDepth = 0;
  let safest = null as { order: HintOrder; distance: number; duration: number } | null;
  const roots = new Map<string, PatrolGame | null>();
  const check = () => { if (performance.now() >= deadline || simulations >= tuning.maxSimulations) throw new SearchLimit(); };
  const legal = (state: PatrolGame, destinations = state.board.borders.map((_, i) => i), squads = state.squads.map((_, i) => i)): HintOrder[] => {
    const secured = state.securedBorders;
    return squads.flatMap((squad) => destinations.filter((border) => !secured.has(border)).map((border) => ({ squad, border })))
      .sort((a, b) => distanceKm(state.squads[a.squad].actor.position, state.board.borders[a.border].post) - distanceKm(state.squads[b.squad].actor.position, state.board.borders[b.border].post));
  };
  const simulate = (state: PatrolGame, order: HintOrder): PatrolGame | null => {
    check();
    const key = `${order.squad}:${order.border}`;
    if (state === game && roots.has(key)) return roots.get(key)!;
    simulations++;
    const branch = state.fork();
    if (!branch.issueOrder(order.squad, order.border)) { if (state === game) roots.set(key, null); return null; }
    branch.resolveOrder();
    if (state === game) {
      roots.set(key, branch);
      if (branch.outcome.kind === "playing") {
        const distance = branch.runnerEscapeDistanceKm;
        const duration = branch.history.at(-1)!.durationHours;
        if (!safest || distance > safest.distance || (distance === safest.distance && duration < safest.duration)) safest = { order, distance, duration };
      }
    }
    return branch;
  };
  const save = (orders: HintOrder[]) => { if (!best || orders.length < best.length) best = orders; };
  const exact = (state: PatrolGame, depth: number, path: HintOrder[] = []): HintOrder[] | null => {
    check();
    if (state.won) return path;
    if (state.outcome.kind !== "playing" || depth === 0) return null;
    const secured = state.securedBorders;
    for (const order of legal(state)) {
      check();
      if (depth === 1) {
        const after = new Set(secured);
        after.delete(state.squads[order.squad].border!);
        after.add(order.border);
        if (!state.navigation.canEnclose(after)) continue;
      }
      const branch = simulate(state, order);
      if (!branch) continue;
      const result = exact(branch, depth - 1, [...path, order]);
      if (result) return result;
    }
    return null;
  };

  try {
    // A matching verified campaign prefix supplies a fast, exact bound. Always
    // replay its suffix against the actual snapshot, including sub-node position.
    const witness = game.setup.witness;
    if (game.history.every((order, i) => witness[i]?.squad === order.squad && witness[i]?.border === order.to)) {
      const suffix = witness.slice(game.ordersUsed);
      if (suffix.length && suffix.length <= remaining) {
        let branch: PatrolGame | null = game;
        const path: HintOrder[] = [];
        for (const order of suffix) {
          branch = branch && simulate(branch, order);
          if (!branch) break;
          path.push(order);
          if (branch.won) { save(path); break; }
          if (branch.outcome.kind !== "playing") break;
        }
        if (best && game.setup.difficulty?.minimumOrders === game.ordersUsed + best.length) return { kind: "winning", orders: best, shortest: true };
      }
    }
    const immediate = exact(game, 1);
    if (immediate) return { kind: "winning", orders: immediate, shortest: true };
    provenDepth = 1;
    if (best?.length === 2) return { kind: "winning", orders: best, shortest: true };

    // Search small real-region enclosures first. Only squads outside a target
    // cut are moved, in every assignment/order. Simulation checks runner timing
    // and unguardable boundary fragments; geometry alone never declares a win.
    const regions = [...new Set(game.board.nodes.filter((node) => node.kind === "land").map((node) => node.region))];
    const clusters = regions.map((region) => [region]);
    const seen = new Set(regions);
    const targets: { cut: number[]; missing: number; nearby: number }[] = [];
    const cuts = new Set<string>();
    for (let index = 0; index < clusters.length; index++) {
      check();
      const cluster = clusters[index];
      const cut = game.board.borders.flatMap((border, i) => border.regions.some((region) => cluster.includes(region)) && (border.kind === "exit" || border.regions.some((region) => !cluster.includes(region))) ? [i] : []);
      const key = cut.join(":");
      if (cut.length && cut.length <= game.squads.length && !cuts.has(key)) {
        cuts.add(key);
        const missing = cut.filter((border) => !game.securedBorders.has(border)).length;
        if (missing > 0 && missing <= remaining && game.navigation.canEnclose(new Set(cut))) targets.push({ cut, missing, nearby: Math.min(...cut.map((border) => distanceKm(game.runner.position, game.board.borders[border].post))) });
      }
      if (cluster.length >= tuning.maxEnclosureRegions) continue;
      const neighbors = game.board.borders.filter((border) => border.kind === "internal" && border.regions.some((region) => cluster.includes(region))).flatMap((border) => border.regions);
      for (const neighbor of neighbors) {
        if (cluster.includes(neighbor)) continue;
        const expanded = [...cluster, neighbor].sort();
        const clusterKey = expanded.join(":");
        if (!seen.has(clusterKey)) { seen.add(clusterKey); clusters.push(expanded); }
      }
    }
    targets.sort((a, b) => a.missing - b.missing || a.nearby - b.nearby);
    const closeCut = (state: PatrolGame, cut: number[], path: HintOrder[] = []) => {
      check();
      const missing = cut.filter((border) => !state.securedBorders.has(border));
      if (!missing.length || path.length + missing.length > remaining || (best && path.length + missing.length >= best.length)) return;
      const movable = state.squads.flatMap((squad, i) => !cut.includes(squad.border!) ? [i] : []);
      for (const order of legal(state, missing, movable)) {
        const branch = simulate(state, order);
        if (!branch) continue;
        const next = [...path, order];
        if (branch.won) save(next);
        else if (branch.outcome.kind === "playing") closeCut(branch, cut, next);
      }
    };
    for (const target of targets) {
      closeCut(game, target.cut);
      if (best?.length === 2) return { kind: "winning", orders: best, shortest: true };
    }
    // Exact iterative deepening proves optimality when affordable, and explores
    // repositioning orders beyond the enclosure heuristic when necessary.
    for (let depth = 2; depth <= remaining; depth++) {
      if (best && best.length <= depth) return { kind: "winning", orders: best, shortest: true };
      const result = exact(game, depth);
      if (result) return { kind: "winning", orders: result, shortest: true };
      provenDepth = depth;
    }
    return { kind: "none", reason: "no-safe-order" };
  } catch (error) {
    if (!(error instanceof SearchLimit)) throw error;
    if (best) return { kind: "winning", orders: best, shortest: best.length <= provenDepth + 1 };
    // No winning route verified within the search budget. A survival suggestion
    // has survived a complete order, but carries no promise of eventual victory.
    if (safest) return { kind: "survival", order: safest.order };
    return { kind: "none", reason: "search-limit" };
  }
}
