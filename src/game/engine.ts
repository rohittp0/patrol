import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { distanceKm, Navigation } from "./navigation";
import type { CountryBoard, Position, StartingSetup } from "./types";
import { countryScaleKm } from "./country-scale";

export interface GameRules {
  squadCount: number;
  maxOrders: number;
  runnerSpeedKmh: number;
  squadSpeedKmh: number;
  minimumRunnerTravelFraction?: number;
}

export function rulesForLevel(id: string): GameRules {
  const level = CONFIG.levels.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return { ...level, runnerSpeedKmh: CONFIG.movement.runnerSpeedKmh, squadSpeedKmh: CONFIG.movement.runnerSpeedKmh * CONFIG.movement.squadSpeedMultiplier, minimumRunnerTravelFraction: CONFIG.movement.minimumRunnerTravelFraction };
}

interface Waypoint { node: number | null; position: Position }

export interface Actor {
  position: Position;
  atNode: number | null;
  edge: [number, number] | null;
  lastLandNode: number;
  route: Waypoint[];
  segment: { start: Position; target: Waypoint; length: number; travelled: number } | null;
}

export interface Squad {
  border: number | null;
  actor: Actor;
}

export interface ActiveOrder {
  squad: number;
  from: number;
  to: number;
  distanceKm: number;
  durationHours: number;
  squadArrivalHours: number;
  runnerTravelledKm: number;
  elapsedHours: number;
  path: Position[];
}

export type Outcome = { kind: "playing" } | { kind: "won"; score: number } | { kind: "lost"; reason: "escape" | "budget" };

/** Mutable simulation state, separate from immutable geography and rules. */
export interface GameSnapshot {
  runner: Actor;
  squads: Squad[];
  history: ActiveOrder[];
  ordersUsed: number;
  activeOrder: ActiveOrder | null;
  outcome: Outcome;
}

/** Pure deterministic simulation shared by the UI and setup verification. */
export class PatrolGame {
  readonly navigation: Navigation;
  readonly runner: Actor;
  readonly squads: Squad[];
  readonly history: ActiveOrder[] = [];
  readonly minimumRunnerTravelKm: number;
  ordersUsed = 0;
  activeOrder: ActiveOrder | null = null;
  outcome: Outcome = { kind: "playing" };

  constructor(readonly board: CountryBoard, readonly setup: StartingSetup, readonly rules = rulesForLevel(board.id), navigation?: Navigation) {
    if (setup.squadBorders.length !== rules.squadCount || new Set(setup.squadBorders).size !== rules.squadCount) throw new Error("Starting setup does not match the squad allocation");
    if (board.nodes[setup.runnerNode]?.kind !== "land") throw new Error("Runner must start on playable land");
    this.navigation = navigation ?? new Navigation(board);
    this.minimumRunnerTravelKm = countryScaleKm(board.land) * (rules.minimumRunnerTravelFraction ?? 0);
    this.runner = this.actorAt(setup.runnerNode);
    this.squads = setup.squadBorders.map((border) => {
      if (!board.borders[border]) throw new Error("Invalid squad border");
      return { border, actor: this.actorAt(board.borders[border].node) };
    });
    this.replanRunner();
  }

  private actorAt(node: number): Actor {
    return { position: [...this.board.nodes[node].p], atNode: node, edge: null, lastLandNode: node, route: [], segment: null };
  }

  get securedBorders(): Set<number> {
    return new Set(this.squads.flatMap((squad) => squad.border === null ? [] : [squad.border]));
  }

  get won(): boolean {
    return this.outcome.kind === "won";
  }

  /** Independent simulation branch; immutable geography and navigation caches are shared. */
  fork(): PatrolGame {
    const copy = Object.create(PatrolGame.prototype) as PatrolGame;
    Object.assign(copy, this, structuredClone({ runner: this.runner, squads: this.squads, history: this.history, activeOrder: this.activeOrder }));
    return copy;
  }

  /** A detached, structured-cloneable state for background hint simulations. */
  snapshot(): GameSnapshot {
    return structuredClone({ runner: this.runner, squads: this.squads, history: this.history, ordersUsed: this.ordersUsed, activeOrder: this.activeOrder, outcome: this.outcome });
  }

  static fromSnapshot(board: CountryBoard, setup: StartingSetup, rules: GameRules, snapshot: GameSnapshot, navigation?: Navigation): PatrolGame {
    const game = new PatrolGame(board, setup, rules, navigation);
    Object.assign(game, structuredClone(snapshot));
    return game;
  }

  private runnerStarts(): { node: number; cost: number }[] {
    const secured = this.securedBorders;
    const candidates = this.runner.atNode === null ? this.runner.edge ?? [] : [this.runner.atNode];
    let usable = candidates.filter((node) => this.navigation.allowed(node, secured, true));
    if (!usable.length) usable = [this.runner.lastLandNode];
    return usable.map((node) => ({ node, cost: distanceKm(this.runner.position, this.board.nodes[node].p) }));
  }

  private replanRunner() {
    this.runner.segment = null;
    const route = this.navigation.shortestPath(this.runnerStarts(), (node) => this.board.nodes[node].kind === "exit", this.securedBorders, true);
    if (!route) {
      this.runner.route = [];
      this.outcome = { kind: "won", score: this.rules.maxOrders - this.ordersUsed };
    } else {
      // Prefer routes that remain usable when the moving squad closes its post.
      // A failed prediction is not containment: actual borders still determine
      // the outcome, so an unavoidable closure falls back to trying to escape.
      const pending = this.activeOrder;
      const anticipated = pending && this.squads[pending.squad].border === null ? this.navigation.shortestPath(this.runnerStarts(), (node) => this.board.nodes[node].kind === "exit", this.securedBorders, true, { border: pending.to, distanceBudgetKm: Math.max(0, pending.squadArrivalHours - pending.elapsedHours) * this.rules.runnerSpeedKmh }) : null;
      this.runner.route = (anticipated ?? route).nodes.map((node) => ({ node, position: this.board.nodes[node].p }));
    }
  }

  previewOrder(squadIndex: number, destination: number): { nodes: number[]; points: Position[]; distanceKm: number } | null {
    const squad = this.squads[squadIndex];
    if (this.activeOrder || this.outcome.kind !== "playing" || !squad || squad.border === null || !this.board.borders[destination] || this.securedBorders.has(destination)) return null;
    return this.navigation.betweenPosts(squad.border, destination);
  }

  issueOrder(squadIndex: number, destination: number): boolean {
    const path = this.previewOrder(squadIndex, destination);
    if (!path) return false;
    if (this.ordersUsed >= this.rules.maxOrders) {
      this.outcome = { kind: "lost", reason: "budget" };
      return false;
    }
    const squad = this.squads[squadIndex];
    const from = squad.border!;
    squad.border = null;
    squad.actor.route = path.points.map((position) => ({ node: null, position }));
    this.ordersUsed++;
    const squadArrivalHours = path.distanceKm / this.rules.squadSpeedKmh;
    this.activeOrder = {
      squad: squadIndex, from, to: destination, distanceKm: path.distanceKm,
      durationHours: Math.max(squadArrivalHours, this.minimumRunnerTravelKm / this.rules.runnerSpeedKmh),
      squadArrivalHours, runnerTravelledKm: 0, elapsedHours: 0,
      path: path.points,
    };
    this.history.push(this.activeOrder);
    this.replanRunner();
    return true;
  }

  private moveActor(actor: Actor, distance: number, canEscape: boolean): { travelled: number; escaped: boolean } {
    let remaining = distance;
    while (actor.route.length) {
      const target = actor.route[0];
      const position = target.position;
      if (!actor.segment || actor.segment.target !== target) actor.segment = { start: [...actor.position], target, length: distanceKm(actor.position, position), travelled: 0 };
      const segment = actor.segment;
      const length = segment.length - segment.travelled;
      if (length <= remaining + CONFIG.movement.arrivalToleranceKm) {
        remaining = Math.max(0, remaining - length);
        actor.position = [...position];
        actor.atNode = target.node;
        actor.edge = null;
        actor.segment = null;
        actor.route.shift();
        if (target.node !== null && this.board.nodes[target.node].kind === "land") actor.lastLandNode = target.node;
        if (canEscape && target.node !== null && this.board.nodes[target.node].kind === "exit") return { travelled: distance - remaining, escaped: true };
      } else {
        if (actor.atNode !== null && target.node !== null) actor.edge = [actor.atNode, target.node];
        segment.travelled += remaining;
        const fraction = segment.travelled / segment.length;
        actor.position = [segment.start[0] + (position[0] - segment.start[0]) * fraction, segment.start[1] + (position[1] - segment.start[1]) * fraction];
        actor.atNode = null;
        remaining = 0;
        break;
      }
    }
    return { travelled: distance - remaining, escaped: false };
  }

  /** Advance to each arrival/end event so border timing is frame-independent. */
  advanceHours(hours: number) {
    const order = this.activeOrder;
    if (!order || this.outcome.kind !== "playing" || !Number.isFinite(hours) || hours < 0) return;
    let remaining = Math.min(hours, Math.max(0, order.durationHours - order.elapsedHours));
    const tolerance = CONFIG.movement.arrivalToleranceKm / this.rules.squadSpeedKmh;
    while (this.activeOrder && this.outcome.kind === "playing") {
      const squad = this.squads[order.squad];
      const travelling = squad.border === null;
      const eventTime = travelling ? order.squadArrivalHours : order.durationHours;
      const elapsed = Math.min(remaining, Math.max(0, eventTime - order.elapsedHours));
      const runnerMove = this.moveActor(this.runner, elapsed * this.rules.runnerSpeedKmh, true);
      const actualElapsed = runnerMove.escaped ? runnerMove.travelled / this.rules.runnerSpeedKmh : elapsed;
      if (travelling) this.moveActor(squad.actor, actualElapsed * this.rules.squadSpeedKmh, false);
      order.elapsedHours += actualElapsed;
      order.runnerTravelledKm += runnerMove.travelled;
      remaining = Math.max(0, remaining - actualElapsed);
      if (runnerMove.escaped) { this.outcome = { kind: "lost", reason: "escape" }; return; }
      if (travelling && order.squadArrivalHours - order.elapsedHours <= tolerance) {
        squad.border = order.to;
        squad.actor = this.actorAt(this.board.borders[order.to].node);
        this.replanRunner();
        if (this.won) { this.activeOrder = null; return; }
      }
      if (order.durationHours - order.elapsedHours <= tolerance) {
        this.activeOrder = null;
        if (this.ordersUsed >= this.rules.maxOrders) this.outcome = { kind: "lost", reason: "budget" };
        return;
      }
      if (remaining <= 0) return;
    }
  }

  resolveOrder() {
    if (this.activeOrder) this.advanceHours(this.activeOrder.durationHours - this.activeOrder.elapsedHours);
  }
}
