import type * as GeoJSON from "geojson";

/** Square root of projected playable land area, in kilometres.
 * A local equirectangular projection matches the board compiler's scale.
 * Holes are subtracted; detached islands are already excluded by compilation.
 */
export function countryScaleKm(land: GeoJSON.Polygon): number {
  if (!land.coordinates[0]?.length) return 0;
  const outer = land.coordinates[0];
  const latitude = (Math.min(...outer.map((point) => point[1])) + Math.max(...outer.map((point) => point[1]))) / 2;
  const degreesToKm = 6371.0088 * Math.PI / 180;
  const longitudeScale = degreesToKm * Math.cos(latitude * Math.PI / 180);
  const area = (ring: number[][]) => {
    const origin = ring[0];
    let twiceArea = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      twiceArea += ((a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1])) * longitudeScale * degreesToKm;
    }
    return Math.abs(twiceArea) / 2;
  };
  return Math.sqrt(Math.max(0, area(outer) - land.coordinates.slice(1).reduce((sum, ring) => sum + area(ring), 0)));
}
