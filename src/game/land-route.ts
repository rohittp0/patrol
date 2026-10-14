import type * as GeoJSON from "geojson";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";
import type { Position } from "./types";

const radians = Math.PI / 180;
const epsilon = CONFIG.map.geometry.junctionToleranceKm / (6371.0088 * radians);
const interpolate = (a: Position, b: Position, t: number): Position => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Position, b: Position): Position => [a[0] - b[0], a[1] - b[1]];
const lengthKm = (a: Position, b: Position) => {
  const h = Math.sin((b[1] - a[1]) * radians / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

/** Land visibility and safe curve construction, independent of the graph search. */
export class LandRoute {
  private rings: Position[][];
  private edges: { a: Position; b: Position; minX: number; minY: number; maxX: number; maxY: number }[];

  constructor(polygon: GeoJSON.Polygon) {
    this.rings = polygon.coordinates as Position[][];
    this.edges = this.rings.flatMap((ring) => ring.slice(1).map((b, i) => ({ a: ring[i], b, minX: Math.min(ring[i][0], b[0]), maxX: Math.max(ring[i][0], b[0]), minY: Math.min(ring[i][1], b[1]), maxY: Math.max(ring[i][1], b[1]) })));
  }

  private insideRing(point: Position, ring: Position[]): boolean | "boundary" {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i], edge = subtract(b, a), offset = subtract(point, a);
      const length = Math.hypot(...edge);
      if (length && Math.abs(cross(edge, offset)) <= epsilon * length && point[0] >= Math.min(a[0], b[0]) - epsilon && point[0] <= Math.max(a[0], b[0]) + epsilon && point[1] >= Math.min(a[1], b[1]) - epsilon && point[1] <= Math.max(a[1], b[1]) + epsilon) return "boundary";
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  contains(point: Position): boolean {
    if (!this.rings.length) return true; // Synthetic engine fixtures have no land polygon.
    if (!this.insideRing(point, this.rings[0])) return false;
    return this.rings.slice(1).every((ring) => this.insideRing(point, ring) !== true);
  }

  /** Split at every boundary crossing, then check each interval, including holes. */
  allows(a: Position, b: Position): boolean {
    if (!this.rings.length) return true;
    if (!this.contains(a) || !this.contains(b)) return false;
    const direction = subtract(b, a);
    const cuts = [0, 1];
    const minX = Math.min(a[0], b[0]) - epsilon, maxX = Math.max(a[0], b[0]) + epsilon;
    const minY = Math.min(a[1], b[1]) - epsilon, maxY = Math.max(a[1], b[1]) + epsilon;
    for (const edge of this.edges) {
      if (edge.maxX < minX || edge.minX > maxX || edge.maxY < minY || edge.minY > maxY) continue;
      const side = subtract(edge.b, edge.a), offset = subtract(edge.a, a);
      const denominator = cross(direction, side);
      if (Math.abs(denominator) < epsilon * epsilon) continue;
      const t = cross(offset, side) / denominator, u = cross(offset, direction) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).every((t, i) => this.contains(interpolate(a, b, (cuts[i] + t) / 2)));
  }

  private curve(a: Position, control: Position, b: Position): Position[] {
    const count = CONFIG.movement.routeSmoothing.curveSamples;
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = i / count;
      return interpolate(interpolate(a, control, t), interpolate(control, b, t), t);
    });
  }

  private safe(points: Position[]) {
    return points.slice(1).every((point, i) => this.allows(points[i], point));
  }

  smooth(points: Position[]): Position[] {
    if (points.length < 2 || !this.rings.length) return points;
    // Pull the route taut across visible land, removing triangle-centre zigzags.
    const pulled = [points[0]];
    for (let i = 0; i < points.length - 1;) {
      let next = points.length - 1;
      while (next > i + 1 && !this.allows(points[i], points[next])) next--;
      pulled.push(points[next]);
      i = next;
    }
    const tuning = CONFIG.movement.routeSmoothing;
    if (pulled.length === 2) {
      const [a, b] = pulled, cosine = Math.cos((a[1] + b[1]) / 2 * radians);
      const dx = (b[0] - a[0]) * cosine, dy = b[1] - a[1], length = Math.hypot(dx, dy);
      if (!length) return pulled;
      const bow = Math.min(tuning.maxBowKm, lengthKm(a, b) * tuning.bowFraction) / (6371.0088 * radians);
      for (let attempt = 0; attempt < tuning.landSafetyAttempts; attempt++) for (const sign of [1, -1]) {
        const amount = bow * sign / 2 ** attempt, middle = interpolate(a, b, 0.5);
        const curve = this.curve(a, [middle[0] - dy / length * amount / cosine, middle[1] + dx / length * amount], b);
        if (this.safe(curve)) return curve;
      }
      return pulled;
    }
    const rounded = [pulled[0]];
    for (let i = 1; i < pulled.length - 1; i++) {
      const previous = pulled[i - 1], corner = pulled[i], next = pulled[i + 1];
      const before = lengthKm(previous, corner), after = lengthKm(corner, next);
      const radius = Math.min(tuning.cornerRadiusKm, before * tuning.cornerTrimFraction, after * tuning.cornerTrimFraction);
      let accepted = false;
      for (let attempt = 0; attempt < tuning.landSafetyAttempts; attempt++) {
        const trim = radius / 2 ** attempt;
        const curve = this.curve(interpolate(corner, previous, before ? trim / before : 0), corner, interpolate(corner, next, after ? trim / after : 0));
        if (this.safe(curve)) { rounded.push(...curve); accepted = true; break; }
      }
      if (!accepted) rounded.push(corner);
    }
    rounded.push(pulled.at(-1)!);
    return this.safe(rounded) ? rounded : pulled;
  }
}
