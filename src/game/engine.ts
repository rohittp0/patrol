import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { distanceKm, Navigation } from "./navigation";
import type { CountryBoard, Position, StartingSetup } from "./types";
import { countryScaleKm } from "./country-scale";
import type { RunnerWaypoint } from "./runner-route";

export interface GameRules {
  squadCount: number;
  maxOrders: number;
  runnerSpeedKmh: number;
  squadSpeedKmh: number;
  minimumRunnerTravelFraction?: number;
  units?: UnitStats[];
}

export interface UnitStats {
  kind: "patrol" | "rapid" | "helicopter" | "marksman";
  speed: number;
  deploymentHours: number;
  guardMoves: number;
  radiusKm: number;
}

/** Squad allocation belongs to the hunt. The first configured count is only
 * the default for preparing new setups; existing supported allocations persist. */
export function rulesForLevel(id: string, squadCount?: number): GameRules {
  const level = CONFIG.levels.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  const allocation = squadCount ?? level.squadCounts[0];
  if (!(level.squadCounts as readonly number[]).includes(allocation)) throw new Error(`Unsupported squad allocation for ${id}: ${allocation}`);
  return { ...level, squadCount: allocation, runnerSpeedKmh: CONFIG.movement.runnerSpeedKmh, squadSpeedKmh: CONFIG.movement.runnerSpeedKmh * CONFIG.movement.squadSpeedMultiplier, minimumRunnerTravelFraction: CONFIG.movement.minimumRunnerTravelFraction };
}

type Waypoint = RunnerWaypoint;

export interface Actor {
  position: Position;
  atNode: number | null;
  edge: [number, number] | null;
  /** Reachable land anchor in the occupied face; need not be physically visited
   * when a visibility shortcut skips triangle centres. */
  lastLandNode: number;
  route: Waypoint[];
  segment: { start: Position; target: Waypoint; length: number; travelled: number } | null;
}

export interface Squad {
  border: number | null;
  actor: Actor;
  guardLeft?: number;
  deployedAt?: number;
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
  flight?: boolean;
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

  constructor(readonly board: CountryBoard, readonly setup: StartingSetup, readonly rules = rulesForLevel(board.id, setup.squadBorders.length), navigation?: Navigation) {
    const posts = setup.squadBorders.filter((border) => border >= 0);
    if (setup.squadBorders.length !== rules.squadCount || new Set(posts).size !== posts.length) throw new Error("Starting setup does not match the squad allocation");
    if (board.nodes[setup.runnerNode]?.kind !== "land") throw new Error("Runner must start on playable land");
    this.navigation = navigation ?? new Navigation(board);
    this.minimumRunnerTravelKm = countryScaleKm(board.land) * (rules.minimumRunnerTravelFraction ?? 0);
    this.runner = this.actorAt(setup.runnerNode);
    this.squads = setup.squadBorders.map((border, index) => {
      if (this.rules.units?.[index]?.kind === "helicopter") return { border: null, actor: this.actorAt(setup.runnerNode), guardLeft: 0 };
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
    // JSON storage duplicates references that structured-clone workers preserve.
    // Reconnect active segments and history before advancing the saved clock.
    for (const actor of [game.runner, ...game.squads.map((squad) => squad.actor)]) {
      if (actor.segment && actor.route.length) actor.segment.target = actor.route[0];
    }
    if (game.activeOrder) game.history[game.ordersUsed - 1] = game.activeOrder;
    return game;
  }

  /** Remaining length of the current land escape route, in kilometres. */
  get runnerEscapeDistanceKm(): number {
    let previous = this.runner.position;
    return this.runner.route.reduce((sum, point) => {
      const distance = distanceKm(previous, point.position);
      previous = point.position;
      return sum + distance;
    }, 0);
  }

  private replanRunner() {
    const pending = this.activeOrder;
    const closure = pending && this.squads[pending.squad].border === null
      ? { border: pending.to, distanceBudgetKm: Math.max(0, pending.squadArrivalHours - pending.elapsedHours) * this.rules.runnerSpeedKmh }
      : undefined;
    const route = this.navigation.runnerPath(this.runner, this.securedBorders, closure);
    this.runner.segment = null;
    this.runner.route = route?.points ?? [];
    if (!route) this.outcome = { kind: "won", score: this.rules.maxOrders - this.ordersUsed };
    this.checkFiring();
  }

  private checkFiring() {
    if (this.outcome.kind !== "playing" || this.ordersUsed === 0) return;
    if (this.firingEntry(this.runner.position, this.runner.position) === 0) {
      this.outcome = { kind: "won", score: this.rules.maxOrders - this.ordersUsed };
    }
  }

  /** Earliest circle entry along a straight runner segment, in local km.
   * Split at the entry event, so a large animation step cannot skip a shot. */
  private firingEntry(start: Position, end: Position): number | null {
    let earliest: number | null = null;
    this.squads.forEach((squad, index) => {
      const stats = this.rules.units?.[index];
      if (squad.border === null || stats?.kind !== "marksman" || stats.radiusKm <= 0) return;
      const k = 111.1950802335, cos = Math.cos(squad.actor.position[1] * Math.PI / 180);
      const x = (start[0] - squad.actor.position[0]) * k * cos, y = (start[1] - squad.actor.position[1]) * k;
      const dx = (end[0] - start[0]) * k * cos, dy = (end[1] - start[1]) * k;
      const a = dx * dx + dy * dy, c = x * x + y * y - stats.radiusKm ** 2;
      if (c <= 0) { earliest = 0; return; }
      if (a === 0) return;
      const b = 2 * (x * dx + y * dy), discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return;
      const fraction = (-b - Math.sqrt(discriminant)) / (2 * a);
      if (fraction >= 0 && fraction <= 1 && (earliest === null || fraction < earliest)) earliest = fraction;
    });
    return earliest;
  }

  previewOrder(squadIndex: number, destination: number): { nodes: number[]; points: Position[]; distanceKm: number } | null {
    const squad = this.squads[squadIndex];
    if (this.activeOrder || this.outcome.kind !== "playing" || !squad || !this.board.borders[destination] || this.securedBorders.has(destination)) return null;
    if (this.rules.units?.[squadIndex]?.kind === "helicopter") return { nodes: [], points: [[...squad.actor.position], [...this.board.borders[destination].post]], distanceKm: distanceKm(squad.actor.position, this.board.borders[destination].post) };
    if (squad.border === null) return null;
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
    const from = squad.border ?? -1;
    squad.border = null;
    squad.actor.route = path.points.map((position) => ({ node: null, position }));
    this.ordersUsed++;
    const stats = this.rules.units?.[squadIndex];
    const flight = stats?.kind === "helicopter";
    const squadArrivalHours = flight ? stats.deploymentHours : path.distanceKm / (stats?.speed ?? this.rules.squadSpeedKmh);
    this.activeOrder = {
      squad: squadIndex, from, to: destination, distanceKm: path.distanceKm,
      durationHours: Math.max(squadArrivalHours, this.minimumRunnerTravelKm / this.rules.runnerSpeedKmh),
      squadArrivalHours, runnerTravelledKm: 0, elapsedHours: 0,
      path: path.points,
      ...(flight ? { flight: true } : {}),
    };
    this.history.push(this.activeOrder);
    this.replanRunner();
    if (this.won) this.activeOrder = null;
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
      if (canEscape) {
        const fraction = this.firingEntry(actor.position, position);
        const shotDistance = fraction === null ? Infinity : fraction * length;
        if (shotDistance <= remaining + 1e-9) {
          actor.position = [actor.position[0] + (position[0] - actor.position[0]) * (fraction ?? 0), actor.position[1] + (position[1] - actor.position[1]) * (fraction ?? 0)];
          segment.travelled += shotDistance;
          this.outcome = { kind: "won", score: this.rules.maxOrders - this.ordersUsed };
          return { travelled: distance - remaining + shotDistance, escaped: false };
        }
      }
      if (canEscape && target.landNode !== undefined && Math.min(length, remaining) > 0) actor.lastLandNode = target.landNode;
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
      const actualElapsed = runnerMove.escaped || this.won ? runnerMove.travelled / this.rules.runnerSpeedKmh : elapsed;
      const speed = order.flight ? order.distanceKm / order.squadArrivalHours : this.rules.units?.[order.squad]?.speed ?? this.rules.squadSpeedKmh;
      if (travelling) this.moveActor(squad.actor, actualElapsed * speed, false);
      order.elapsedHours += actualElapsed;
      order.runnerTravelledKm += runnerMove.travelled;
      remaining = Math.max(0, remaining - actualElapsed);
      if (this.won) { this.activeOrder = null; return; }
      if (runnerMove.escaped) { this.outcome = { kind: "lost", reason: "escape" }; return; }
      if (travelling && order.squadArrivalHours - order.elapsedHours <= tolerance) {
        squad.border = order.to;
        squad.actor = this.actorAt(this.board.borders[order.to].node);
        if (order.flight) { squad.guardLeft = this.rules.units![order.squad].guardMoves; squad.deployedAt = this.ordersUsed; }
        this.replanRunner();
        if (this.won) { this.activeOrder = null; return; }
      }
      if (order.durationHours - order.elapsedHours <= tolerance) {
        this.activeOrder = null;
        let expired = false;
        this.squads.forEach((unit) => {
          if (unit.guardLeft && unit.deployedAt !== undefined && unit.deployedAt < this.ordersUsed && --unit.guardLeft === 0) { unit.border = null; expired = true; }
        });
        if (expired) this.replanRunner();
        if (this.won) return;
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
