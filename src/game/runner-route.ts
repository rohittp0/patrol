import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import { LandRoute } from "./land-route";
import { distanceKm, type Navigation } from "./navigation";
import type { CountryBoard, Position } from "./types";

export interface RunnerWaypoint {
  node: number | null;
  position: Position;
  /** Land-face anchor for containment after taking a shortcut past triangle centres. */
  landNode?: number;
}
export interface RunnerLocation {
  position: Position;
  atNode: number | null;
  edge: [number, number] | null;
  lastLandNode: number;
}
export interface PendingClosure {
  border: number;
  distanceBudgetKm: number;
}
export interface RunnerPath {
  points: RunnerWaypoint[];
  distanceKm: number;
}

/** The triangle graph proves connectivity. Face-local visibility removes its
 * artificial zigzags, retaining every border and outer-exit checkpoint. */
export class RunnerRoutes {
  private faces: LandRoute[];
  private nodeFaces: number[][];
  private faceNodes: number[][];
  private faceAnchor: number[];
  private visibleStarts = new Map<string, { node: number; cost: number }[]>();
  private paths = new Map<string, RunnerPath | null>();

  constructor(
    private board: CountryBoard,
    private navigation: Navigation,
  ) {
    this.faces = board.regions.map((region) => new LandRoute(region.geometry));
    this.nodeFaces = board.nodes.map(() => []);
    this.faceNodes = this.faces.map(() => []);
    this.faceAnchor = this.faces.map(() => -1);
    const byRegion = new Map<string, number[]>();
    board.regions.forEach((region, face) =>
      byRegion.set(region.id, [...(byRegion.get(region.id) ?? []), face]),
    );
    board.nodes.forEach((node, index) => {
      if (node.kind !== "land") return;
      // A state can have several disconnected polygonized faces with the same id.
      const face = byRegion
        .get(node.region)
        ?.find((face) => this.faces[face].contains(node.p));
      if (face !== undefined) {
        this.nodeFaces[index] = [face];
        this.faceAnchor[face] = index;
      }
    });
    board.nodes.forEach((node, index) => {
      if (node.kind === "post" || node.kind === "land") return;
      this.nodeFaces[index] = [
        ...new Set(
          navigation.neighbors[index].flatMap(([next]) => this.nodeFaces[next]),
        ),
      ];
      if (!this.nodeFaces[index].length)
        this.nodeFaces[index] = (byRegion.get(node.region) ?? []).filter(
          (face) => this.faces[face].contains(node.p),
        );
    });
    this.nodeFaces.forEach((faces, node) =>
      faces.forEach((face) => this.faceNodes[face].push(node)),
    );
  }

  private starts(actor: RunnerLocation, secured: Set<number>) {
    if (!this.faces.length) {
      const legacy = (
        actor.atNode === null ? (actor.edge ?? []) : [actor.atNode]
      ).filter((node) => this.navigation.allowed(node, secured, true));
      if (!legacy.length) legacy.push(actor.lastLandNode);
      return {
        faces: [] as number[],
        starts: legacy.map((node) => ({
          node,
          cost: distanceKm(actor.position, this.board.nodes[node].p),
        })),
      };
    }
    // A closed portal belongs to the side occupied immediately before closure.
    // Once positive movement crosses it, the segment's land anchor changes sides.
    const possible =
      actor.atNode !== null &&
      this.navigation.allowed(actor.atNode, secured, true)
        ? this.nodeFaces[actor.atNode]
        : this.nodeFaces[actor.lastLandNode];
    const faces = possible.filter((face) =>
      this.faces[face].contains(actor.position),
    );
    const cacheKey = `${actor.position.join(":")}:${faces.join(":")}`;
    const cached = this.visibleStarts.get(cacheKey);
    if (cached)
      return {
        faces,
        starts: cached.filter(({ node }) =>
          this.navigation.allowed(node, secured, true),
        ),
      };
    const starts = new Map<number, number>();
    for (const face of faces) {
      const counts = new Map<string, number>();
      const candidates = this.faceNodes[face]
        .map((node) => ({
          node,
          cost: distanceKm(actor.position, this.board.nodes[node].p),
        }))
        .sort((a, b) => a.cost - b.cost);
      for (const { node, cost } of candidates) {
        const candidate = this.board.nodes[node];
        const crossing =
          candidate.kind === "exit" ||
          candidate.border !== undefined ||
          this.nodeFaces[node].length > 1;
        const key = crossing
          ? candidate.border !== undefined
            ? `border:${candidate.border}`
            : `${candidate.kind}:${this.nodeFaces[node].join(":")}`
          : "land";
        const limit = crossing
          ? CONFIG.movement.runnerRouting.visibleCrossingsPerBorder
          : CONFIG.movement.runnerRouting.visibleLandStarts;
        if (
          (counts.get(key) ?? 0) >= limit ||
          !this.faces[face].allows(actor.position, candidate.p)
        )
          continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        starts.set(node, cost);
      }
    }
    // Missing authored geometry must never invent a through-wall virtual edge.
    // Legacy graph routing remains available for polygon-free engine fixtures.
    const visible = [...starts].map(([node, cost]) => ({ node, cost }));
    if (this.visibleStarts.size >= CONFIG.movement.runnerRouting.cacheEntries)
      this.visibleStarts.delete(this.visibleStarts.keys().next().value!);
    this.visibleStarts.set(cacheKey, visible);
    return {
      faces,
      starts: visible.filter(({ node }) =>
        this.navigation.allowed(node, secured, true),
      ),
    };
  }

  private shorten(
    actor: RunnerLocation,
    startFaces: number[],
    nodes: number[],
  ): RunnerPath {
    const origin: RunnerWaypoint = { node: null, position: actor.position };
    const result: RunnerWaypoint[] = [origin];
    let chunk = [origin];
    let faces = startFaces;
    const flush = () => {
      const face = faces[0];
      const points =
        face === undefined
          ? chunk.map((point) => point.position)
          : this.faces[face].taut(chunk.map((point) => point.position));
      const anchor = face === undefined ? undefined : this.faceAnchor[face];
      for (const position of points.slice(1)) {
        const point = chunk.find((point) => point.position === position)!;
        result.push({
          ...point,
          ...(anchor !== undefined && anchor >= 0 ? { landNode: anchor } : {}),
        });
      }
    };
    for (const node of nodes) {
      const point = { node, position: this.board.nodes[node].p };
      const membership = this.nodeFaces[node];
      faces = faces.filter((face) => membership.includes(face));
      chunk.push(point);
      const checkpoint =
        this.board.nodes[node].border !== undefined ||
        this.board.nodes[node].kind === "exit" ||
        membership.length > 1;
      if (checkpoint) {
        flush();
        chunk = [point];
        faces = membership;
      }
    }
    if (chunk.length > 1) flush();
    return {
      points: result.slice(1),
      distanceKm: result
        .slice(1)
        .reduce(
          (sum, point, i) =>
            sum + distanceKm(result[i].position, point.position),
          0,
        ),
    };
  }

  path(
    actor: RunnerLocation,
    secured: Set<number>,
    pending?: PendingClosure,
  ): RunnerPath | null {
    const key = `${actor.position.join(":")}/${actor.atNode}/${actor.lastLandNode}/${actor.edge?.join(":")}/${[...secured].sort((a, b) => a - b).join(":")}/${pending?.border}:${pending?.distanceBudgetKm}`;
    if (!this.paths.has(key)) {
      const path = this.search(actor, secured, pending);
      if (this.paths.size >= CONFIG.movement.runnerRouting.cacheEntries)
        this.paths.delete(this.paths.keys().next().value!);
      this.paths.set(key, path);
    }
    const cached = this.paths.get(key)!;
    // Actors consume their route arrays. Cached waypoints are immutable and
    // every simulation receives its own array, including forks and hint probes.
    return (
      cached && { points: [...cached.points], distanceKm: cached.distanceKm }
    );
  }

  private search(
    actor: RunnerLocation,
    secured: Set<number>,
    pending?: PendingClosure,
  ): RunnerPath | null {
    const { starts, faces } = this.starts(actor, secured);
    const goal = (node: number) => this.board.nodes[node].kind === "exit";
    const raw = this.navigation.shortestPath(starts, goal, secured, true);
    if (!raw) return null;
    const direct = this.shorten(actor, faces, raw.nodes);
    if (!pending) return direct;
    const viable = (path: RunnerPath) => {
      let travelled = 0,
        previous = actor.position;
      for (const point of path.points) {
        travelled += distanceKm(previous, point.position);
        previous = point.position;
        if (
          point.node !== null &&
          this.board.nodes[point.node].border === pending.border &&
          travelled >= pending.distanceBudgetKm
        )
          return false;
      }
      return true;
    };
    // Timing is measured along the route actually travelled, up to the border
    // crossing. The destination is open now and can be beaten to the crossing.
    if (viable(direct)) return direct;
    const candidates: RunnerPath[] = [];
    const anticipated = this.navigation.shortestPath(
      starts,
      goal,
      secured,
      true,
      pending,
    );
    if (anticipated)
      candidates.push(this.shorten(actor, faces, anticipated.nodes));
    const avoiding = this.navigation.shortestPath(
      starts,
      goal,
      new Set([...secured, pending.border]),
      true,
    );
    if (avoiding) candidates.push(this.shorten(actor, faces, avoiding.nodes));
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    // A prediction is never containment. If every route will close, keep trying
    // the currently open route until the actual arrival changes connectivity.
    return candidates.find(viable) ?? direct;
  }
}
