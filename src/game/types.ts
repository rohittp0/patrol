export type Position = [number, number];
export type NodeKind = "land" | "portal" | "exit" | "post";

export interface NavigationNode {
  p: Position;
  kind: NodeKind;
  region: string;
  border?: number;
}

export interface Border {
  id: string;
  name: string;
  kind: "internal" | "exit";
  regions: string[];
  coordinates: Position[];
  post: Position;
  node: number;
  lengthKm: number;
}

export interface StartingSetup {
  id: string;
  runnerNode: number;
  /** One initial post per squad; length is this hunt's allocation. Must be
   * supported by its country's configured squadCounts. */
  squadBorders: number[];
  witness: { squad: number; border: number }[];
  difficulty?: {
    /** Proven lower bound; exact when it equals solutionOrders. */
    minimumOrders: number;
    /** Length of a replayed winning sequence, within the move budget. */
    solutionOrders: number;
    initiallyGuardedFraction: number;
    meanSquadTravelKm: number;
    escapePressure: number;
    score: number;
    rulesSignature: string;
  };
}

export interface CountryBoard {
  id: string;
  name: string;
  bounds: [Position, Position];
  regions: { id: string; name: string; geometry: GeoJSON.Polygon }[];
  land: GeoJSON.Polygon;
  coasts: Position[][];
  landExits: Position[][];
  borders: Border[];
  nodes: NavigationNode[];
  /** Undirected navigation links: source, destination, geographic kilometres. */
  links: [number, number, number][];
  setups: StartingSetup[];
  source: { revision: string; files: Record<string, { url: string; sha256: string; bytes: number }> };
}
import type * as GeoJSON from "geojson";
