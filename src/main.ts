import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { PatrolGame, rulesForLevel } from "./game/engine";
import { Navigation } from "./game/navigation";
import type { CountryBoard, StartingSetup } from "./game/types";
import { PatrolMap } from "./map-view";
import { icon } from "./icons";
import { spawnClearance, validSpawn } from "./game/spawn";
import { hasOneOrderWin } from "./game/setup-validation";
import { setupRulesSignature } from "./game/difficulty";
import { HintClient } from "./hint-client";
import type { HintResult } from "./game/hints";
import { Onboarding } from "./onboarding";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const letter = (index: number) => String.fromCharCode(65 + index);

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="workspace">
    <section class="map-panel" aria-label="Patrol map">
      <div id="map"></div>
  <header class="topbar">
    <div class="hud-identity">
    <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Patrol home"><span class="brand-mark">${icon("compass")}</span><span>PATROL<span class="brand-sub">CLOSE THE NET</span></span></a>
    <div class="country-row"><select id="country" aria-label="Choose patrol country">${CONFIG.levels.map((level, index) => `<option value="${level.id}">${String(index + 1).padStart(2, "0")} / ${level.name}</option>`).join("")}</select><span class="country-arrow">⌄</span></div></div>
    <div class="metrics"><div><span class="metric-label">ORDERS LEFT</span><strong id="orders-left">08<span>/ 08</span></strong></div><div class="best-metric"><span class="metric-label">BEST</span><strong id="best-score">—</strong></div></div>
    <div class="topbar-actions"><button class="posts-toggle" id="toggle-posts" aria-expanded="false" aria-controls="post-drawer">Posts</button><button class="icon-button" id="restart" title="Restart this setup" aria-label="Restart this setup">${icon("reset")}</button><button class="new-setup" id="new-setup" title="Skip to the next challenge">${icon("arrow")}<span>Next challenge</span></button></div>
  </header>
      <div class="objective"><h1>CONTAIN THE RUNNER</h1><div class="topbar-center"><span class="live-dot"></span><span id="game-status">Preparing operation</span></div></div>
      <div class="map-toolbar"><button id="fit-country">${icon("fit")}<span>Country view</span></button><button id="focus-runner">${icon("focus")}<span>Focus runner</span></button><button id="show-hint" disabled>${icon("hint")}<span>Show hint</span><small>FREE</small></button></div>
      <aside id="hint-panel" class="hint-panel" hidden aria-label="Move hint"><div class="section-heading"><h2>FIELD INTELLIGENCE <span>FREE</span></h2><button id="close-hint" class="hint-close" aria-label="Hide hint">${icon("close")}</button></div><div id="hint-content" role="status" aria-live="polite"></div></aside>
      <div class="map-caption"><span class="eyebrow">PATROL ZONE</span><strong id="map-country">India</strong><span id="map-caption-detail">Every land exit is an escape route.</span></div>
      <div class="map-legend"><span><i class="legend-line secured-line"></i>Secured</span><span><i class="legend-line open-line"></i>Open</span><span><i class="legend-line coast-line"></i>Coastline</span></div>
      <div class="map-note" id="map-note" hidden>Map detail is unavailable. Patrol geometry is still playable.</div>
      <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
      <section class="result-card" id="result" aria-live="polite" hidden></section>
      <div class="loading-screen" id="loading"><span class="loading-compass">${icon("compass")}</span><p>Preparing the patrol zone…</p></div>
    <section class="squad-dock" aria-label="Your squads">
      <div class="section-heading"><h2 id="squad-heading">YOUR SQUADS</h2><span id="squad-count">03 AVAILABLE</span></div>
      <div id="squads" class="squads"></div>
      <section class="journey" id="journey" hidden><div><strong id="journey-title"></strong><span id="journey-value"></span></div><div class="journey-track"><span id="journey-bar"></span></div></section>
    </section>
    <aside class="post-drawer" id="post-drawer" aria-label="Border posts" hidden><div class="section-heading border-heading"><h2>Border posts</h2><span id="border-count"></span></div>
      <div class="border-list" id="borders"></div>
    </aside>
    <button class="how-to" id="how-to">${icon("info")}<span>How to play</span></button>
    </section>
  </main>`;

class PatrolApp {
  game!: PatrolGame;
  board!: CountryBoard;
  private map: PatrolMap | null = null;
  private selectedPost: number | null = null;
  private focusedSquad: number | null = null;
  private navigation!: Navigation;
  private validSetups: StartingSetup[] = [];
  private loadGeneration = 0;
  private lastFrame: number | null = null;
  private frameHandle = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private onboarding: Onboarding;
  private hints = new HintClient();
  private hint: HintResult | null = null;
  private hintBusy = false;
  private hintError: string | null = null;
  private hintGeneration = 0;

  constructor() {
    byId<HTMLSelectElement>("country").addEventListener("change", (event) => this.loadLevel((event.target as HTMLSelectElement).value));
    byId("restart").addEventListener("click", () => { if (this.game) this.startSetup(this.game.setup); });
    byId("new-setup").addEventListener("click", () => this.nextChallenge());
    byId("fit-country").addEventListener("click", () => this.map?.fitCountry());
    byId("focus-runner").addEventListener("click", () => { if (this.game) this.map?.focusRunner(this.game); });
    byId("show-hint").addEventListener("click", () => void this.showHint());
    byId("close-hint").addEventListener("click", () => { this.clearHint(); this.render(); });
    byId("how-to").addEventListener("click", () => this.onboarding.open());
    byId("toggle-posts").addEventListener("click", () => {
      const drawer = byId("post-drawer");
      drawer.hidden = !drawer.hidden;
      byId("toggle-posts").setAttribute("aria-expanded", String(!drawer.hidden));
    });
    document.addEventListener("keydown", (event) => {
      if (this.onboarding.blocked) return;
      if ((event.target as HTMLElement).matches("input, select, textarea")) return;
      if (/^[1-9]$/.test(event.key)) this.selectSquad(Number(event.key) - 1);
      if (event.key === "Escape" && !this.game?.activeOrder) { this.clearHint(); this.selectedPost = null; this.focusedSquad = null; this.render(); }
    });
    document.addEventListener("visibilitychange", () => { this.lastFrame = null; });
    new ResizeObserver(() => {
      byId("app").style.setProperty("--dock-height", `${document.querySelector(".squad-dock")!.getBoundingClientRect().height}px`);
    }).observe(document.querySelector(".squad-dock")!);
    this.onboarding = new Onboarding(() => { this.lastFrame = null; });
    void this.loadLevel(CONFIG.levels[0].id);
  }

  async loadLevel(id: string) {
    this.clearHint();
    byId<HTMLButtonElement>("show-hint").disabled = true;
    const generation = ++this.loadGeneration;
    cancelAnimationFrame(this.frameHandle);
    byId("loading").hidden = false;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${id}.json`);
      if (!response.ok) throw new Error(`Country data could not be loaded (${response.status}).`);
      const board: CountryBoard = await response.json();
      if (generation !== this.loadGeneration) return;
      const navigation = new Navigation(board);
      const rules = rulesForLevel(id);
      const level = CONFIG.levels.find((candidate) => candidate.id === id)!;
      const signature = await setupRulesSignature(board, rules);
      if (generation !== this.loadGeneration) return;
      const valid = board.setups.filter((setup) => {
        try {
          if (setup.difficulty?.rulesSignature !== signature || setup.difficulty.minimumOrders !== level.solutionOrders || setup.witness.length !== level.solutionOrders) return false;
          if (setup.difficulty.escapePressure < level.escapePressureRange.min || setup.difficulty.escapePressure > level.escapePressureRange.max) return false;
          if (!validSpawn(spawnClearance(board, board.nodes[setup.runnerNode].p), level)) return false;
          const game = new PatrolGame(board, setup, rules, navigation);
          if (game.outcome.kind !== "playing") return false;
          for (const order of setup.witness) {
            if (!game.issueOrder(order.squad, order.border)) return false;
            game.resolveOrder();
          }
          return game.won && !hasOneOrderWin(board, setup, rules, navigation);
        } catch { return false; }
      }).sort((a, b) => a.difficulty!.score - b.difficulty!.score || a.id.localeCompare(b.id));
      if (!valid.length) throw new Error("No verified setups match the tuning values. Run npm run prepare:setups after changing game rules.");
      this.board = board;
      this.navigation = navigation;
      this.validSetups = valid;
      if (this.map) this.map.setBoard(board);
      else this.map = new PatrolMap(board, (border) => this.choosePost(border), (fallback) => { byId("map-note").hidden = !fallback; });
      this.startSetup(valid[0]);
      byId("loading").hidden = true;
    } catch (error) {
      byId("loading").innerHTML = `${icon("info")}<h2>Operation unavailable</h2><p>${escapeHtml(error instanceof Error ? error.message : "Could not load this country.")}</p><button id="retry-load">Try again</button>`;
      byId("retry-load").addEventListener("click", () => this.loadLevel(id));
    }
  }

  private nextChallenge() {
    if (!this.validSetups.length) return;
    const index = this.validSetups.findIndex((setup) => setup.id === this.game.setup.id);
    if (index + 1 < this.validSetups.length) { this.startSetup(this.validSetups[index + 1]); return; }
    const country = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    void this.loadLevel(CONFIG.levels[country + 1]?.id ?? CONFIG.levels[0].id);
  }

  private startSetup(setup: StartingSetup) {
    this.clearHint();
    cancelAnimationFrame(this.frameHandle);
    this.lastFrame = null;
    this.game = new PatrolGame(this.board, setup, rulesForLevel(this.board.id), this.navigation);
    this.selectedPost = null;
    this.focusedSquad = null;
    byId("toast").hidden = true;
    this.render();
    this.map?.startView(this.game);
  }

  selectSquad(index: number) {
    if (this.onboarding.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing" || !this.game.squads[index]) return;
    if (this.hintBusy) this.clearHint();
    this.map?.revealSquad(this.game.squads[index].actor.position);
    this.focusedSquad = index;
    if (this.selectedPost === null || this.game.securedBorders.has(this.selectedPost)) { this.render(); return; }
    if (!this.game.issueOrder(index, this.selectedPost)) { this.toast("That post cannot be reached by land."); return; }
    this.clearHint();
    byId("post-drawer").hidden = true;
    byId("toggle-posts").setAttribute("aria-expanded", "false");
    this.selectedPost = null;
    this.render();
    this.lastFrame = null;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  choosePost(border: number) {
    if (this.onboarding.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing" || !this.board.borders[border]) return;
    if (this.hintBusy) this.clearHint();
    const hinted = this.hint?.kind === "winning" ? this.hint.orders[0] : this.hint?.kind === "survival" ? this.hint.order : null;
    if (hinted && hinted.border !== border) this.clearHint();
    this.selectedPost = border;
    this.focusedSquad = null;
    this.render();
    byId("post-drawer").hidden = true;
    byId("toggle-posts").setAttribute("aria-expanded", "false");
  }

  private frame = (timestamp: number) => {
    if (this.onboarding.blocked) { this.lastFrame = null; this.frameHandle = requestAnimationFrame(this.frame); return; }
    const seconds = this.lastFrame === null ? 0 : Math.min(CONFIG.movement.maxFrameSeconds, (timestamp - this.lastFrame) / 1000);
    this.lastFrame = timestamp;
    const playbackRate = Math.max(CONFIG.movement.simulatedSecondsPerRealSecond, (this.game.activeOrder?.durationHours ?? 0) * 3600 / CONFIG.movement.maxOrderPlaybackSeconds);
    const order = this.game.activeOrder;
    const travelling = order ? this.game.squads[order.squad].border === null : false;
    this.game.advanceHours(seconds * playbackRate / 3600);
    if (order && travelling && this.game.squads[order.squad].border !== null) this.render();
    else this.map?.renderActors(this.game);
    this.renderJourney();
    if (this.game.activeOrder && this.game.outcome.kind === "playing") this.frameHandle = requestAnimationFrame(this.frame);
    else { this.lastFrame = null; this.render(); }
  };

  private toast(message: string) {
    clearTimeout(this.toastTimer);
    byId("toast").textContent = message;
    byId("toast").hidden = false;
    this.toastTimer = setTimeout(() => { byId("toast").hidden = true; }, 3500);
  }

  private bestScore(): string {
    try { return localStorage.getItem(this.bestScoreKey()) ?? "—"; } catch { return "—"; }
  }

  private clearHint() {
    this.hintGeneration++;
    this.hints.cancel();
    this.hint = null;
    this.hintBusy = false;
    this.hintError = null;
    byId("hint-panel").hidden = true;
  }

  private async showHint() {
    if (this.onboarding.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing") return;
    if (this.hintBusy || this.hint || this.hintError) { this.clearHint(); this.render(); return; }
    const generation = ++this.hintGeneration;
    this.hintBusy = true;
    this.renderHint();
    try {
      const result = await this.hints.find(this.game);
      if (generation !== this.hintGeneration) return;
      this.hint = result;
      const order = result.kind === "winning" ? result.orders[0] : result.kind === "survival" ? result.order : null;
      if (order) {
        this.selectedPost = order.border;
        this.focusedSquad = order.squad;
        this.map?.revealPost(order.border);
      }
    } catch (error) {
      if (generation !== this.hintGeneration) return;
      this.hintError = error instanceof Error ? error.message : "Hint unavailable. Try again.";
    }
    this.hintBusy = false;
    this.render();
  }

  private renderHint() {
    const visible = this.hintBusy || !!this.hint || !!this.hintError;
    const button = byId<HTMLButtonElement>("show-hint");
    button.disabled = !this.game || !!this.game.activeOrder || this.game.outcome.kind !== "playing";
    button.innerHTML = `${icon("hint")}<span>${visible ? "Hide hint" : "Show hint"}</span><small>FREE</small>`;
    button.setAttribute("aria-expanded", String(visible));
    button.setAttribute("aria-controls", "hint-panel");
    byId("hint-panel").hidden = !visible;
    if (!visible) return;
    byId("hint-panel").setAttribute("aria-busy", String(this.hintBusy));
    const result = this.hint;
    if (this.hintBusy) { byId("hint-content").innerHTML = "<p class='hint-calculating'>Checking escape routes…</p><small>Time is paused. No orders or points spent.</small>"; return; }
    if (this.hintError) { byId("hint-content").textContent = this.hintError; return; }
    const order = result?.kind === "winning" ? result.orders[0] : result?.kind === "survival" ? result.order : null;
    if (!order) {
      byId("hint-content").textContent = result?.kind === "none" && result.reason === "no-safe-order" ? "No winning route remains within the order budget. Restart this challenge to try a different approach." : "No safe move was verified in this search. Hide the hint and try again, or restart the challenge.";
      return;
    }
    const description = result?.kind === "winning" ? `${result.shortest ? "Best move" : "Recommended move"} · verified ${result.orders.length}-order win from here.` : "This move leaves the longest escape route of the options checked. A winning continuation has not been verified.";
    byId("hint-content").innerHTML = `<span class="hint-verdict">${description}</span><strong>Squad ${letter(order.squad)} → Post ${order.border + 1}</strong><p>${escapeHtml(this.board.borders[order.border].name)}</p><small>The post is selected. Click the highlighted Squad ${letter(order.squad)} when you're ready to issue the order.</small>`;
  }

  private bestScoreKey(): string {
    const setup = this.game.setup;
    return `patrol:best:${setup.difficulty?.rulesSignature}:${setup.id}:${setup.runnerNode}:${setup.squadBorders.join("-")}`;
  }

  private renderJourney() {
    const order = this.game.activeOrder;
    byId("journey").hidden = !order || this.game.outcome.kind !== "playing";
    if (!order) return;
    const fraction = order.durationHours ? Math.min(1, order.elapsedHours / order.durationHours) : 1;
    const travelling = this.game.squads[order.squad].border === null;
    byId("journey-title").textContent = travelling ? `Squad ${letter(order.squad)} en route` : "Post secured · Runner moving";
    byId("journey-value").textContent = travelling ? `${Math.ceil(Math.max(0, order.distanceKm - order.elapsedHours * this.game.rules.squadSpeedKmh))} km left` : `${Math.ceil(Math.max(0, order.durationHours - order.elapsedHours) * this.game.rules.runnerSpeedKmh)} km remaining`;
    byId("journey-bar").style.width = `${fraction * 100}%`;
  }

  render() {
    if (!this.game) return;
    const game = this.game;
    const moving = !!game.activeOrder && game.outcome.kind === "playing";
    const playing = game.outcome.kind === "playing";
    byId("game-status").textContent = !playing ? game.outcome.kind === "won" ? "Runner contained" : "Operation ended" : moving ? "Order in progress" : "Awaiting orders";
    byId("game-status").parentElement!.classList.toggle("is-moving", moving);
    byId("map-country").textContent = this.board.name;
    const countryIndex = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    const challengeIndex = this.validSetups.findIndex((setup) => setup.id === game.setup.id);
    const challengeNumber = countryIndex * CONFIG.setups.poolSize + challengeIndex + 1;
    byId("map-caption-detail").textContent = `CHALLENGE ${String(challengeNumber).padStart(2, "0")} / ${CONFIG.levels.length * CONFIG.setups.poolSize} · SETUP ${game.setup.id}`;
    const finalChallenge = countryIndex === CONFIG.levels.length - 1 && challengeIndex === this.validSetups.length - 1;
    byId("new-setup").innerHTML = `${icon(finalChallenge ? "reset" : "arrow")}<span>${finalChallenge ? "Restart campaign" : "Next challenge"}</span>`;
    byId("new-setup").title = finalChallenge ? "Restart from the first challenge" : "Skip to the next challenge";
    byId("new-setup").setAttribute("aria-label", finalChallenge ? "Restart campaign" : "Skip to the next challenge");
    byId<HTMLSelectElement>("country").value = this.board.id;
    byId<HTMLSelectElement>("country").disabled = moving;
    byId("orders-left").innerHTML = `${String(Math.max(0, game.rules.maxOrders - game.ordersUsed)).padStart(2, "0")}<span>/ ${String(game.rules.maxOrders).padStart(2, "0")}</span>`;
    if (game.outcome.kind === "won") {
      try { localStorage.setItem(this.bestScoreKey(), String(Math.max(Number(this.bestScore()) || 0, game.outcome.score))); } catch { /* Storage is optional. */ }
    }
    byId("best-score").textContent = this.bestScore();
    byId("squad-count").textContent = `${String(game.squads.length).padStart(2, "0")} SQUADS · ${CONFIG.movement.squadSpeedMultiplier}× SPEED`;
    byId("squads").style.setProperty("--squad-columns", String(game.squads.length));
    byId("squads").style.setProperty("--compact-squad-columns", String(game.squads.length > 3 ? 2 : game.squads.length));
    const destination = this.selectedPost;
    const canAssign = destination !== null && !game.securedBorders.has(destination);
    byId("squads").innerHTML = game.squads.map((squad, index) => {
      const preview = canAssign ? game.previewOrder(index, destination) : null;
      return `<button class="squad-card ${this.focusedSquad === index ? "is-selected" : ""} ${canAssign ? "can-assign" : ""}" data-squad="${index}" ${moving || !playing ? "disabled" : ""} aria-label="${canAssign ? `Send Squad ${letter(index)} to post ${destination + 1}` : `View Squad ${letter(index)}`}"><span class="squad-badge">${icon("squad")}<b>${letter(index)}</b></span><span class="squad-copy"><strong>${canAssign ? "Send" : "Squad"} ${letter(index)}</strong><span>${preview ? `${Math.round(preview.distanceKm)} km to Post ${destination! + 1}` : squad.border === null ? "Relocating to a new post" : escapeHtml(this.board.borders[squad.border].name)}</span></span><span class="squad-state">${squad.border === null ? "EN ROUTE" : "HOLDING"}</span></button>`;
    }).join("");
    byId("squads").querySelectorAll<HTMLButtonElement>("[data-squad]").forEach((button) => button.addEventListener("click", () => this.selectSquad(Number(button.dataset.squad))));
    byId("squad-heading").textContent = destination === null ? "YOUR SQUADS" : canAssign ? `CHOOSE A SQUAD · POST ${destination + 1}` : `POST ${destination + 1} IS SECURED`;
    byId("border-count").textContent = `${this.board.borders.length} POSTS`;
    byId("borders").innerHTML = this.board.borders.map((border, index) => {
      const squad = game.squads.findIndex((candidate) => candidate.border === index);
      return `<button class="border-row ${squad >= 0 ? "is-secured" : ""} ${destination === index ? "is-selected" : ""}" data-border="${index}" ${moving || !playing ? "disabled" : ""} aria-label="Inspect post ${index + 1}: ${escapeHtml(border.name)}"><span class="border-number" style="--border-colour:${CONFIG.appearance.borderPalette[index].secured}">${String(index + 1).padStart(2, "0")}</span><span class="border-copy"><strong>${escapeHtml(border.name)}</strong><small>${border.kind === "exit" ? "OUTER LAND BOUNDARY" : "INTERNAL BORDER"} · ${Math.round(border.lengthKm)} KM</small></span><span class="border-state">${squad >= 0 ? `<b>${letter(squad)}</b>` : icon("arrow")}</span></button>`;
    }).join("");
    byId("borders").querySelectorAll<HTMLButtonElement>("[data-border]").forEach((button) => button.addEventListener("click", () => this.choosePost(Number(button.dataset.border))));
    this.renderJourney();
    byId("app").style.setProperty("--dock-height", `${document.querySelector(".squad-dock")!.getBoundingClientRect().height}px`);
    this.map?.renderState(game, this.selectedPost, this.focusedSquad);
    this.renderHint();
    this.renderResult();
  }

  private renderResult() {
    const outcome = this.game.outcome;
    byId("result").hidden = outcome.kind === "playing";
    if (outcome.kind === "playing") return;
    const won = outcome.kind === "won";
    const levelIndex = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    const next = CONFIG.levels[levelIndex + 1];
    const hasNextSetup = this.validSetups.findIndex((setup) => setup.id === this.game.setup.id) + 1 < this.validSetups.length;
    byId("result").className = `result-card ${won ? "won" : "lost"}`;
    byId("result").innerHTML = `<span class="result-icon">${icon(won ? "lock" : "runner")}</span><span class="eyebrow">${won ? "OPERATION COMPLETE" : "OPERATION ENDED"}</span><h2>${won ? "Runner contained." : outcome.reason === "escape" ? "The runner escaped." : "Out of orders."}</h2><p>${won ? "Every escape route is sealed. The net is closed." : outcome.reason === "escape" ? "The runner crossed the patrol zone’s land boundary." : "The runner is still free. Try closing the net with fewer relocations."}</p>${won ? `<div class="result-score">+${outcome.score}<span>POINTS · ${this.game.ordersUsed} OF ${this.game.rules.maxOrders} ORDERS</span></div>` : ""}<div class="result-actions"><button class="primary-button" id="result-primary">${won ? hasNextSetup ? "Next challenge" : next ? `Next: ${next.name}` : "Play again" : "Try again"}${icon("arrow")}</button><button class="text-button" id="result-secondary">${won ? "Replay this setup" : "Skip challenge"}</button></div>`;
    byId("result-primary").addEventListener("click", () => won ? this.nextChallenge() : this.startSetup(this.game.setup));
    byId("result-secondary").addEventListener("click", () => won ? this.startSetup(this.game.setup) : this.nextChallenge());
  }
}

const app = new PatrolApp();
if (import.meta.env.DEV) Object.defineProperty(window, "__PATROL__", { get: () => app });
