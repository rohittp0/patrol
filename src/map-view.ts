import { Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { track } from "./telemetry";
import { borderName } from "./game/presentation";
import { distanceKm } from "./game/navigation";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type * as GeoJSON from "geojson";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import type { PatrolGame } from "./game/engine";
import type { CountryBoard, Position } from "./game/types";
import { icon } from "./icons";
import { usableMapPadding } from "./viewport";
import type { OrderForecast } from "./game/order-forecast";

// Bundle MapLibre's worker explicitly so both Vite and /patrol/ static builds
// serve the correct URL instead of a missing dependency-prebundle sibling.
setWorkerUrl(mapWorkerUrl);

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (coordinates: Position[], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });
const fallback: StyleSpecification = { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#dde8e8" } }] };

export class PatrolMap {
  readonly map: Map;
  private posts: { marker: Marker; element: HTMLButtonElement }[] = [];
  private runner: Marker;
  private movingSquad: Marker;
  private movingVisible = false;
  private game: PatrolGame | null = null;
  private selected: number | null = null;
  private focusedSquad: number | null = null;
  private ready = false;
  private usedFallback = false;
  private cleanup = () => {};
  private forecast: OrderForecast | null = null;
  private ranges: { position: Position; radius: number }[] = [];

  constructor(private board: CountryBoard, onPost: (border: number) => void, onMapStatus: (fallback: boolean) => void) {
    this.map = new Map({ container: "map", style: CONFIG.map.styleUrl, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, maxPitch: 0 });
    this.map.touchZoomRotate.disableRotation();
    this.map.touchPitch.disable();
    this.map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    this.map.on("dragend", (event) => { if (event.originalEvent) track("map_gesture", { action: "pan", zoom: Math.round(this.map.getZoom() * 10) / 10 }); });
    this.map.on("zoomend", (event) => { if (event.originalEvent) track("map_gesture", { action: "zoom", zoom: Math.round(this.map.getZoom() * 10) / 10 }); });
    this.map.on("error", () => {
      // Do not log the remote style or tile URLs: they contain the owner's key.
      if (!this.ready && !this.usedFallback) {
        this.usedFallback = true;
        this.map.setStyle(fallback);
      }
      onMapStatus(true);
    });
    this.map.on("style.load", () => {
      this.ready = true;
      this.map.setProjection({ type: "mercator" });
      this.addLayers();
      this.refreshGeometry();
      if (this.game) this.renderState(this.game, this.selected, this.focusedSquad);
      this.setRanges(this.ranges);
      this.setForecast(this.forecast);
      onMapStatus(this.usedFallback);
    });
    const runnerElement = document.createElement("div");
    runnerElement.className = "actor-marker runner-marker";
    runnerElement.innerHTML = icon("runner");
    runnerElement.style.setProperty("--actor-size", `${CONFIG.appearance.runnerMarker.sizePx}px`);
    runnerElement.style.setProperty("--actor-colour", CONFIG.appearance.runnerMarker.iconColor);
    runnerElement.setAttribute("role", "img");
    runnerElement.setAttribute("aria-label", "Fugitive position");
    this.runner = new Marker({ element: runnerElement, anchor: "center" }).setLngLat(board.nodes[0].p).addTo(this.map);
    const squadElement = document.createElement("div");
    squadElement.className = "actor-marker squad-marker";
    squadElement.innerHTML = icon("squad");
    squadElement.setAttribute("role", "img");
    squadElement.setAttribute("aria-label", "Moving squad");
    squadElement.style.setProperty("--actor-size", `${CONFIG.appearance.squadMarker.sizePx}px`);
    squadElement.style.setProperty("--actor-colour", CONFIG.appearance.squadMarker.iconColor);
    this.movingSquad = new Marker({ element: squadElement, anchor: "center" });
    this.onPost = onPost;
    this.createPosts();
    this.fitCountry(false);
    let resizeFrame = 0;
    const resize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        this.map.resize();
        if (!this.game) return;
        // Preserve player zoom/pan; only reveal a selected destination on a new viewport.
        if (this.selected !== null) this.revealPost(this.selected);
        else if (document.querySelector('.hunt-guide:not([hidden])[data-phase="moving"]')) this.showGuidedMovement(this.game);
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.getElementById("map")!);
    window.addEventListener("patrol:viewport-change", resize);
    this.cleanup = () => { observer.disconnect(); window.removeEventListener("patrol:viewport-change", resize); cancelAnimationFrame(resizeFrame); };
  }

  private onPost: (border: number) => void;

  setTarget(name: string, portrait: string) {
    const element = this.runner.getElement();
    const image = document.createElement("img"); image.src = portrait; image.alt = "";
    element.replaceChildren(image); element.dataset.name = name;
    element.setAttribute("aria-label", `${name}'s position`);
  }

  setBoard(board: CountryBoard) {
    this.board = board;
    this.posts.forEach(({ marker }) => marker.remove());
    this.posts = [];
    this.createPosts();
    this.refreshGeometry();
    this.fitCountry();
  }

  private createPosts() {
    this.board.borders.forEach((border, index) => {
      const element = document.createElement("button");
      element.className = "border-post";
      element.dataset.border = String(index);
      element.style.setProperty("--border-colour", CONFIG.appearance.borderPalette[index].open);
      element.style.setProperty("--post-diameter", `${CONFIG.appearance.borderPost.radiusPx * 2}px`);
      element.style.setProperty("--post-fill", CONFIG.appearance.borderPost.fillColor);
      element.style.setProperty("--post-outline", `${CONFIG.appearance.borderPost.outlineWidthPx}px`);
      let pointer: { x: number; y: number; id: number } | null = null;
      let dragged = false;
      element.addEventListener("pointerdown", (event) => { pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }; dragged = false; });
      element.addEventListener("pointermove", (event) => {
        if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > CONFIG.interface.postTapSlopPx) dragged = true;
      });
      element.addEventListener("pointercancel", () => { pointer = null; dragged = true; });
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail === 0 || !dragged) this.onPost(index);
        pointer = null;
      });
      element.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>`;
      const marker = new Marker({ element, anchor: "center" }).setLngLat(border.post).addTo(this.map);
      this.posts.push({ marker, element });
    });
  }

  private addLayers() {
    const empty = collection([]);
    for (const name of ["land", "outside", "coast", "frontiers", "borders", "route", "ranges", "intent", "forecast", "forecast-end"]) this.map.addSource(`patrol-${name}`, { type: "geojson", data: empty });
    this.map.addLayer({ id: "patrol-range-fill", type: "fill", source: "patrol-ranges", paint: { "fill-color": "#c46f47", "fill-opacity": 0.18 } });
    this.map.addLayer({ id: "patrol-range-line", type: "line", source: "patrol-ranges", paint: { "line-color": "#e7a688", "line-width": 1.5, "line-dasharray": [3, 3] } });
    this.map.addLayer({ id: "patrol-outside", type: "fill", source: "patrol-outside", paint: { "fill-color": "#081519", "fill-opacity": 0.42 } });
    this.map.addLayer({ id: "patrol-land", type: "fill", source: "patrol-land", paint: { "fill-color": "#617b49", "fill-opacity": 0.045 } });
    this.map.addLayer({ id: "patrol-coast", type: "line", source: "patrol-coast", paint: { "line-color": "#2c8994", "line-opacity": 0.65, "line-width": 1.5 } });
    this.map.addLayer({ id: "patrol-frontiers", type: "line", source: "patrol-frontiers", paint: { "line-color": "#9c6551", "line-opacity": 0.5, "line-width": 1.5, "line-dasharray": [2, 3] } });
    this.map.addLayer({ id: "patrol-border-halo", type: "line", source: "patrol-borders", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": CONFIG.appearance.borderCasing.color, "line-opacity": CONFIG.appearance.borderCasing.opacity, "line-width": ["case", ["get", "selected"], CONFIG.appearance.selectedBorder.widthPx + CONFIG.appearance.borderCasing.extraWidthPx, ["get", "secured"], CONFIG.appearance.borderWidthPx.secured + CONFIG.appearance.borderCasing.extraWidthPx, CONFIG.appearance.borderWidthPx.open + CONFIG.appearance.borderCasing.extraWidthPx] } });
    this.map.addLayer({ id: "patrol-secured-glow", type: "line", source: "patrol-borders", filter: ["==", ["get", "secured"], true], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": CONFIG.appearance.securedBorderGlow.color, "line-width": CONFIG.appearance.securedBorderGlow.widthPx, "line-blur": CONFIG.appearance.securedBorderGlow.blurPx, "line-opacity": CONFIG.appearance.securedBorderGlow.opacity } });
    this.map.addLayer({ id: "patrol-borders", type: "line", source: "patrol-borders", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "colour"], "line-width": ["case", ["get", "secured"], CONFIG.appearance.borderWidthPx.secured, CONFIG.appearance.borderWidthPx.open], "line-opacity": ["case", ["get", "secured"], CONFIG.appearance.borderOpacity.secured, CONFIG.appearance.borderOpacity.open] } });
    this.map.addLayer({ id: "patrol-selected-border", type: "line", source: "patrol-borders", filter: ["==", ["get", "selected"], true], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": CONFIG.appearance.selectedBorder.color, "line-width": CONFIG.appearance.selectedBorder.widthPx } });
    this.map.addLayer({ id: "patrol-intent", type: "line", source: "patrol-intent", paint: { "line-color": "#b66b25", "line-width": 2, "line-dasharray": [2,3], "line-opacity": 0.65 } });
    this.map.addLayer({ id: "patrol-forecast", type: "line", source: "patrol-forecast", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4, "line-dasharray": [2,1] } });
    this.map.addLayer({ id: "patrol-forecast-end", type: "circle", source: "patrol-forecast-end", paint: { "circle-color": "#f6b94d", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#1b2825" } });
    this.map.addLayer({ id: "patrol-route", type: "line", source: "patrol-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": CONFIG.appearance.squadMarker.iconColor, "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
  }

  private setData(name: string, data: GeoJSON.FeatureCollection) {
    (this.map.getSource(`patrol-${name}`) as GeoJSONSource | undefined)?.setData(data);
  }

  setRanges(ranges: { position: Position; radius: number }[]) {
    this.ranges = ranges;
    if (!this.ready) return;
    this.setData("ranges", collection(ranges.map(({ position: [lon, lat], radius }) => ({
      type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [Array.from({ length: 65 }, (_, i) => {
        const a = i / 64 * Math.PI * 2;
        return [lon + Math.cos(a) * radius / (111.1950802335 * Math.cos(lat * Math.PI / 180)), lat + Math.sin(a) * radius / 111.1950802335];
      })] },
    }))));
  }

  destroy() { this.cleanup(); this.map.remove(); }

  private refreshGeometry() {
    if (!this.ready) return;
    this.setData("land", collection([{ type: "Feature", properties: {}, geometry: this.board.land }]));
    this.setData("outside", collection([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], [...this.board.land.coordinates[0]].reverse()] } }]));
    this.setData("coast", collection(this.board.coasts.map((coordinates) => line(coordinates))));
    this.setData("frontiers", collection(this.board.landExits.map((coordinates) => line(coordinates))));
  }

  renderState(game: PatrolGame, selected: number | null, focusedSquad: number | null = null) {
    this.game = game;
    this.selected = selected;
    this.focusedSquad = focusedSquad;
    const secured = game.securedBorders;
    const travelling = game.activeOrder && game.squads[game.activeOrder.squad].border === null;
    if (this.ready) {
      this.setData("borders", collection(this.board.borders.map((border, index) => line(border.coordinates, { colour: CONFIG.appearance.borderPalette[index][secured.has(index) ? "secured" : "open"], secured: secured.has(index), selected: index === selected || !!travelling && index === game.activeOrder?.to }))));
      this.setData("intent", collection(game.runner.route.length ? [line([game.runner.position,...game.runner.route.map(point=>point.position)])] : []));
      this.setData("route", collection(travelling && game.activeOrder ? [line(game.activeOrder.path)] : []));
    }
    this.posts.forEach(({ element }, index) => {
      const squad = game.squads.findIndex((candidate) => candidate.border === index);
      // MapLibre adds positioning classes to this element. Preserve them when
      // updating game state, or posts fall into normal document flow.
      element.classList.toggle("secured", squad >= 0);
      element.classList.toggle("open", squad < 0);
      element.classList.toggle("selected", index === selected);
      const focusedBorder = focusedSquad === null ? null : game.squads[focusedSquad].border ?? (game.activeOrder?.squad === focusedSquad ? game.activeOrder.from : null);
      element.classList.toggle("focused", index === focusedBorder);
      element.classList.toggle("destination", !!travelling && game.activeOrder?.to === index);
      element.style.setProperty("--border-colour", CONFIG.appearance.borderPalette[index][squad >= 0 ? "secured" : "open"]);
      element.innerHTML = `<span>${squad >= 0 ? String.fromCharCode(65 + squad) : String(index + 1).padStart(2, "0")}</span>`;
      element.disabled = !!game.activeOrder || game.outcome.kind !== "playing";
      const name = borderName(this.board.borders[index]);
      element.title = squad >= 0 ? `Squad ${String.fromCharCode(65 + squad)} · ${name}` : `Post ${index + 1} · ${name}`;
      element.setAttribute("aria-label", `Inspect post ${String(index + 1).padStart(2, "0")}: ${name}${squad >= 0 ? ` · Squad ${String.fromCharCode(65 + squad)}` : ""}`);
      element.setAttribute("aria-pressed", String(index === selected));
    });
    this.renderActors(game);
  }

  renderActors(game: PatrolGame) {
    this.runner.setLngLat(game.runner.position);
    if (game.activeOrder && game.squads[game.activeOrder.squad].border === null) {
      this.movingSquad.getElement().dataset.squad = String.fromCharCode(65 + game.activeOrder.squad);
      this.movingSquad.getElement().setAttribute("aria-label", `Squad ${String.fromCharCode(65 + game.activeOrder.squad)} moving`);
      this.movingSquad.setLngLat(game.squads[game.activeOrder.squad].actor.position);
      if (!this.movingVisible) { this.movingSquad.addTo(this.map); this.movingVisible = true; }
    } else if (this.movingVisible) { this.movingSquad.remove(); this.movingVisible = false; }
  }

  setForecast(forecast: OrderForecast | null) {
    this.forecast = forecast;
    if (!this.ready) return;
    this.setData("forecast", collection(forecast ? [line(forecast.squadPath, {color:"#3389dc"}), ...(forecast.runnerPath.length>1 ? [line(forecast.runnerPath,{color:"#d98a18"})] : [])] : []));
    this.setData("forecast-end", collection(forecast ? [{type:"Feature",properties:{},geometry:{type:"Point",coordinates:forecast.runnerPath.at(-1)!}}] : []));
  }

  showForecast(forecast: OrderForecast) {
    const points = [...forecast.squadPath,...forecast.runnerPath];
    this.map.fitBounds([[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]], {padding:this.cameraPadding(true),absolutePadding:true,maxZoom:CONFIG.map.runnerFocusZoom,duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : CONFIG.map.focusDurationMs});
  }

  fitCountry(animate = true) {
    this.map.fitBounds(this.board.bounds, { padding: this.cameraPadding(), absolutePadding: true, duration: animate && !matchMedia("(prefers-reduced-motion: reduce)").matches ? CONFIG.map.focusDurationMs : 0 });
  }

  revealPost(border: number) {
    this.revealSquad(this.board.borders[border].post);
  }

  showGuidedMovement(game: PatrolGame) {
    if (!game.activeOrder) return;
    const points: Position[] = [...game.activeOrder.path, game.runner.position];
    let remaining = game.activeOrder.durationHours * game.rules.runnerSpeedKmh;
    let previous = game.runner.position;
    for (const waypoint of game.runner.route) {
      const distance = distanceKm(previous, waypoint.position);
      if (distance > remaining) {
        const fraction = remaining / distance;
        points.push([previous[0] + (waypoint.position[0] - previous[0]) * fraction, previous[1] + (waypoint.position[1] - previous[1]) * fraction]);
        break;
      }
      points.push(waypoint.position); remaining -= distance; previous = waypoint.position;
    }
    const padding = this.cameraPadding(true);
    this.map.fitBounds([[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]], {
      padding,
      absolutePadding: true, maxZoom: CONFIG.map.runnerFocusZoom,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : CONFIG.map.focusDurationMs,
    });
  }

  revealSquad(position: Position) {
    const point = this.map.project(position);
    const padding = this.cameraPadding();
    const { clientWidth: width, clientHeight: height } = this.map.getContainer();
    if (point.x >= padding.left && point.x <= width - padding.right && point.y >= padding.top && point.y <= height - padding.bottom) return;
    this.map.easeTo({ center: position, padding, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : CONFIG.map.focusDurationMs });
  }

  private cameraPadding(includeGuide = false) {
    return usableMapPadding(this.map.getContainer().getBoundingClientRect(), { includeGuide });
  }


  startView(game: PatrolGame) {
    const radius = CONFIG.levels.find((level) => level.id === this.board.id)!.initialViewRadiusKm;
    const [longitude, latitude] = game.runner.position;
    const latitudeSpan = radius / (Math.PI * 6371.0088 / 180);
    const longitudeSpan = latitudeSpan / Math.cos(latitude * Math.PI / 180);
    this.map.fitBounds([[longitude - longitudeSpan, latitude - latitudeSpan], [longitude + longitudeSpan, latitude + latitudeSpan]], { padding: this.cameraPadding(), absolutePadding: true, maxZoom: CONFIG.map.runnerFocusZoom, duration: 0 });
  }
}
