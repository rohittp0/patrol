/** Missing individual glyphs/tiles do not mean the entire basemap disappeared. */
export class BasemapStatus {
  private metadata = false;
  available = false;
  sourceData(type: string | undefined, tileLoaded: boolean) {
    if (type === "metadata") this.metadata = true;
    if (tileLoaded) {
      this.metadata = true;
      this.available = true;
    }
    return this.available;
  }
  sourceError(sourceId: unknown) {
    return sourceId === "world" && !this.metadata;
  }
}
