import type { CountryBoard } from "./types";
import type { Navigation } from "./navigation";
export interface LevelWorld { board: CountryBoard; navigation?: Navigation }
/** Existing single-board callers remain supported; campaign saves resolve by level. */
export type BoardSource = CountryBoard | ((level: number) => LevelWorld);
export function worldFor(source: BoardSource, level: number, navigation?: Navigation): LevelWorld {
  return typeof source === "function" ? source(level) : { board: source, navigation };
}
