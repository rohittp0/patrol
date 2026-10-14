import { distanceKm } from "./navigation";
import type { CountryBoard, Position } from "./types";
import { PLAYTEST_CONFIG as CONFIG } from "./playtest.config";

type Level = (typeof CONFIG.levels)[number];

function distanceToLines(point: Position, lines: Position[][]): number {
  let closest = Infinity;
  const cosine = Math.cos(point[1] * Math.PI / 180);
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = (b[0] - a[0]) * cosine, dy = b[1] - a[1];
    const px = (point[0] - a[0]) * cosine, py = point[1] - a[1];
    const fraction = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const projection: Position = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    closest = Math.min(closest, distanceKm(point, projection));
  }
  return closest;
}

/** Distances to the authoritative polylines, not just their vertices or posts. */
export function spawnClearance(board: CountryBoard, position: Position) {
  return {
    zoneEdgeKm: distanceToLines(position, board.land.coordinates as Position[][]),
    landExitKm: distanceToLines(position, board.landExits),
    internalBorderKm: distanceToLines(position, board.borders.filter((border) => border.kind === "internal").map((border) => border.coordinates)),
  };
}

export function validSpawn(clearance: ReturnType<typeof spawnClearance>, level: Level) {
  return clearance.zoneEdgeKm >= level.minimumRunnerZoneEdgeKm && clearance.landExitKm >= level.minimumRunnerExitKm && clearance.internalBorderKm >= level.minimumRunnerInternalBorderKm;
}
