import type { CountryBoard, Position } from "./types";
import { LandRoute } from "./land-route";

export function distanceKm(a: Position, b: Position): number {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (b[0] - a[0]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

class MinHeap {
  private items: [number, number][] = [];
  push(node: number, cost: number) {
    const item: [number, number] = [node, cost];
    let index = this.items.length;
    this.items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent][1] <= cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop(): [number, number] | undefined {
    if (!this.items.length) return undefined;
    const result = this.items[0];
    const tail = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1][1] < this.items[child][1]) child++;
        if (tail[1] <= this.items[child][1]) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = tail;
    }
    return result;
  }
}

/** Navigation lives in land triangles; blocked portal nodes seal whole borders. */
export class Navigation {
  readonly neighbors: [number, number][][];
  private postPaths = new Map<string, { nodes: number[]; points: Position[]; distanceKm: number } | null>();
  private landRoute: LandRoute;
  private enclosureCache = new Map<string, boolean>();
  constructor(readonly board: CountryBoard) {
    this.landRoute = new LandRoute(board.land);
    this.neighbors = board.nodes.map(() => []);
    for (const [a, b, length] of board.links) {
      this.neighbors[a].push([b, length]);
      this.neighbors[b].push([a, length]);
    }
  }

  betweenPosts(from: number, to: number) {
    const key = `${from}:${to}`;
    if (!this.postPaths.has(key)) {
      const path = this.shortestPath([{ node: this.board.borders[from].node, cost: 0 }], (node) => node === this.board.borders[to].node);
      if (!path) this.postPaths.set(key, null);
      else {
        const points = this.landRoute.smooth(path.nodes.map((node) => this.board.nodes[node].p));
        const distance = points.slice(1).reduce((sum, point, index) => sum + distanceKm(points[index], point), 0);
        this.postPaths.set(key, { nodes: path.nodes, points, distanceKm: distance });
      }
    }
    return this.postPaths.get(key)!;
  }

  allowed(node: number, secured: Set<number>, runner: boolean): boolean {
    const candidate = this.board.nodes[node];
    if (!candidate) return false;
    if (!runner) return true;
    if (candidate.kind === "post") return false;
    return candidate.border === undefined || !secured.has(candidate.border);
  }

  /** Necessary condition for a win: some land must be disconnected from every exit. */
  canEnclose(secured: Set<number>): boolean {
    const key = [...secured].sort((a, b) => a - b).join(":");
    const cached = this.enclosureCache.get(key);
    if (cached !== undefined) return cached;
    const seen = new Uint8Array(this.board.nodes.length);
    const queue = new Int32Array(this.board.nodes.length);
    let tail = 0;
    this.board.nodes.forEach((node, index) => {
      if (node.kind === "exit" && this.allowed(index, secured, true)) { seen[index] = 1; queue[tail++] = index; }
    });
    for (let head = 0; head < tail; head++) for (const [next] of this.neighbors[queue[head]]) {
      if (!seen[next] && this.allowed(next, secured, true)) { seen[next] = 1; queue[tail++] = next; }
    }
    const enclosed = this.board.nodes.some((node, index) => node.kind === "land" && !seen[index]);
    this.enclosureCache.set(key, enclosed);
    return enclosed;
  }

  shortestPath(
    starts: { node: number; cost: number }[],
    goal: (node: number) => boolean,
    secured = new Set<number>(),
    runner = false,
    pendingClosure?: { border: number; distanceBudgetKm: number },
  ): { nodes: number[]; distanceKm: number } | null {
    const distances = new Float64Array(this.board.nodes.length).fill(Infinity);
    const previous = new Int32Array(this.board.nodes.length).fill(-1);
    const queue = new MinHeap();
    for (const start of starts) {
      if (!this.allowed(start.node, secured, runner) || start.cost >= distances[start.node]) continue;
      distances[start.node] = start.cost;
      queue.push(start.node, start.cost);
    }
    let current: [number, number] | undefined;
    while ((current = queue.pop())) {
      const [node, cost] = current;
      if (cost !== distances[node]) continue;
      if (goal(node)) {
        const path = [node];
        while (previous[path[0]] !== -1) path.unshift(previous[path[0]]);
        return { nodes: path, distanceKm: cost };
      }
      for (const [next, length] of this.neighbors[node]) {
        if (!this.allowed(next, secured, runner)) continue;
        const candidate = cost + length;
        // A runner must cross the destination border before its squad arrives.
        if (runner && pendingClosure && this.board.nodes[next].border === pendingClosure.border && candidate >= pendingClosure.distanceBudgetKm) continue;
        if (candidate < distances[next]) {
          distances[next] = candidate;
          previous[next] = node;
          queue.push(next, candidate);
        }
      }
    }
    return null;
  }
}
