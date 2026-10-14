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
import { setupCuration, validSetupCuration } from "./game/setup-curation";
import { setupRulesSignature } from "./game/difficulty";
import { challengePolicy } from "./game/challenge-policy";
import { previousHunt, readProgress, restoreProgress, setupKey, writeProgress, type SavedProgress } from "./game/progress";
import { HintClient } from "./hint-client";
import type { HintResult } from "./game/hints";
import { Onboarding } from "./onboarding";
import { caseForChallenge, portraitPath } from "./game/case-files";
import { captureRegion, captureReport } from "./game/capture-report";
import { PosterStudio } from "./poster-studio";
import { playerProfile } from "./player-profile";
import { borderName, locationPhrase } from "./game/presentation";
import { gameContext, initTelemetry, measure, track } from "./telemetry";

initTelemetry();
track("app_open", { width_px: innerWidth, height_px: innerHeight, has_name: !!playerProfile().name, has_photo: !!playerProfile().photo, app_version: "0.1.0" });

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
    <div class="metrics"><div><span class="metric-label">MOVES LEFT</span><strong id="orders-left">08<span>/ 08</span></strong></div><div class="best-metric"><span class="metric-label">BEST</span><strong id="best-score">—</strong></div></div>
    <div class="topbar-actions"><button class="posts-toggle" id="toggle-posts" aria-expanded="false" aria-controls="post-drawer">Posts</button><button class="icon-button" id="restart" title="Restart this hunt" aria-label="Restart this hunt">${icon("reset")}</button><button class="new-setup previous-hunt" id="previous-hunt" title="Replay the previous hunt" disabled>${icon("arrow")}<span>Previous hunt</span></button></div>
  </header>
      <div class="objective"><h1>CLOSE THE NET</h1><div class="topbar-center"><span class="live-dot"></span><span id="game-status">Opening the case file</span></div></div>
      <div class="map-toolbar"><button id="fit-country">${icon("fit")}<span>Country view</span></button><button id="focus-runner">${icon("focus")}<span>Find fugitive</span></button><button id="case-file">${icon("info")}<span>Case file</span></button><button id="show-hint" disabled>${icon("hint")}<span>Show hint</span><small>FREE</small></button></div>
      <aside id="hint-panel" class="hint-panel" hidden aria-label="Move hint"><div class="section-heading"><h2>FIELD INTELLIGENCE <span>FREE</span></h2><button id="close-hint" class="hint-close" aria-label="Hide hint">${icon("close")}</button></div><div id="hint-content" role="status" aria-live="polite"></div></aside>
      <div class="map-caption"><span class="eyebrow">PATROL ZONE</span><strong id="map-country">India</strong><span id="map-caption-detail">Every land exit is an escape route.</span></div>
      <div class="map-note" id="map-note" hidden>The map couldn't load all its detail. Your chase can still continue.</div>
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
  private poster = new PosterStudio();
  private attemptId = "";
  private attemptStarted = 0;
  private thinkingStarted = 0;
  private hintsUsed = 0;
  private ended = false;
  private moveStarted = 0;
  private modalStarted: number | null = null;
  private lastSaveAt = 0;

  private get challengeIndex() { return this.validSetups.findIndex((setup) => setup.id === this.game.setup.id); }
  private get huntNumber() { return CONFIG.levels.findIndex((level) => level.id === this.board.id) * CONFIG.setups.poolSize + this.challengeIndex + 1; }
  private get caseFile() { return caseForChallenge(this.board.id, this.challengeIndex); }
  private syncContext() {
    if (!this.game) return;
    gameContext({ country: this.board.id, case_id: this.caseFile.id, challenge_id: this.game.setup.id, hunt_number: this.huntNumber, attempt_id: this.attemptId, moves_used: this.game.ordersUsed, moves_left: Math.max(0, this.game.rules.maxOrders - this.game.ordersUsed), squad_count: this.game.squads.length });
  }
  private abandon(reason: string) {
    if (this.game?.outcome.kind === "playing" && !this.ended) { this.syncContext(); track("level_abandon", { reason, elapsed_seconds: Math.round((performance.now() - this.attemptStarted) / 1000), hints_used: this.hintsUsed }); this.ended = true; }
  }
  private restart(source: string) { track("level_restart", { source }); this.startSetup(this.game.setup, "restart"); }
  private showCase(entry = "case_button") {
    if (!this.game) return;
    this.onboarding.showCase({ file: this.caseFile, country: this.board.name, number: this.huntNumber, total: CONFIG.levels.length * CONFIG.setups.poolSize, lead: captureRegion(this.game), squads: this.game.squads.length, moves: this.game.rules.maxOrders, entry });
  }

  constructor() {
    byId<HTMLSelectElement>("country").addEventListener("change", (event) => this.loadLevel((event.target as HTMLSelectElement).value, "header"));
    byId("restart").addEventListener("click", () => { if (this.game) this.restart("header"); });
    byId("previous-hunt").addEventListener("click", () => this.previousChallenge());
    byId("fit-country").addEventListener("click", () => { track("map_action", { action: "country_view" }); this.map?.fitCountry(); });
    byId("focus-runner").addEventListener("click", () => { if (this.game) { track("map_action", { action: "find_fugitive" }); this.map?.focusRunner(this.game); } });
    byId("case-file").addEventListener("click", () => this.showCase());
    byId("show-hint").addEventListener("click", () => void this.showHint());
    byId("close-hint").addEventListener("click", () => { this.clearHint("manual"); this.render(); });
    byId("how-to").addEventListener("click", () => this.onboarding.open());
    byId("toggle-posts").addEventListener("click", () => {
      const drawer = byId("post-drawer");
      drawer.hidden = !drawer.hidden;
      byId("toggle-posts").setAttribute("aria-expanded", String(!drawer.hidden));
      track("post_list_toggle", { action: drawer.hidden ? "close" : "open" });
    });
    document.addEventListener("keydown", (event) => {
      if (this.onboarding.blocked || this.poster.blocked) return;
      if ((event.target as HTMLElement).matches("input, select, textarea")) return;
      if (/^[1-9]$/.test(event.key)) this.selectSquad(Number(event.key) - 1, "keyboard");
      if (event.key === "Escape" && !this.game?.activeOrder) { track("selection_clear"); this.clearHint("selection_clear"); this.selectedPost = null; this.focusedSquad = null; this.render(); }
    });
    document.addEventListener("visibilitychange", () => { this.lastFrame = null; if (document.hidden) this.persistGame(); track("app_visibility", { action: document.hidden ? "hidden" : "visible" }); });
    window.addEventListener("pagehide", () => this.persistGame());
    new ResizeObserver(() => {
      byId("app").style.setProperty("--dock-height", `${document.querySelector(".squad-dock")!.getBoundingClientRect().height}px`);
    }).observe(document.querySelector(".squad-dock")!);
    this.onboarding = new Onboarding(() => {
      this.lastFrame = null;
      if (this.onboarding?.phoneBlocked) this.poster.close();
      if (this.onboarding?.blocked) this.modalStarted ??= performance.now();
      else if (this.modalStarted !== null) { this.thinkingStarted += performance.now() - this.modalStarted; this.modalStarted = null; }
    });
    let saved: SavedProgress | null = null;
    try { saved = readProgress(localStorage); } catch { /* Storage can be unavailable. */ }
    void this.loadLevel(saved?.country ?? CONFIG.levels[0].id, saved ? "resume" : "campaign", saved?.huntIndex ?? 0, saved ?? undefined);
  }

  async loadLevel(id: string, source = "campaign", targetIndex = 0, saved?: SavedProgress) {
    this.persistGame();
    this.abandon("country_change");
    track("country_selected", { country: id, from_country: this.board?.id ?? "none", source });
    gameContext({ country: id }); track("country_load_start");
    const started = performance.now();
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
      const level = CONFIG.levels.find((candidate) => candidate.id === id)!;
      const signatures = new Map<number, string>(await Promise.all(level.squadCounts.map(async (count) => [count, await setupRulesSignature(board, rulesForLevel(id, count))] as const)));
      if (generation !== this.loadGeneration) return;
      const valid = board.setups.filter((setup, index) => {
        const policy = challengePolicy(index);
        try {
          const rules = rulesForLevel(id, setup.squadBorders.length);
          if (!setup.difficulty || setup.difficulty.rulesSignature !== signatures.get(rules.squadCount) || setup.difficulty.minimumOrders !== policy.minimumOrders || setup.witness.length < policy.minimumOrders || setup.witness.length > policy.maximumWitnessOrders || setup.difficulty.solutionOrders !== setup.witness.length) return false;
          if (setup.difficulty.escapePressure < level.escapePressureRange.min || setup.difficulty.escapePressure > level.escapePressureRange.max) return false;
          if (!validSpawn(spawnClearance(board, board.nodes[setup.runnerNode].p), level)) return false;
          const game = new PatrolGame(board, setup, rules, navigation);
          if (game.outcome.kind !== "playing") return false;
          for (const order of setup.witness) {
            if (!game.issueOrder(order.squad, order.border)) return false;
            game.resolveOrder();
          }
          return validSetupCuration(game, policy) && !hasOneOrderWin(board, setup, rules, navigation);
        } catch { return false; }
      }).sort((a, b) => a.difficulty!.score - b.difficulty!.score || a.id.localeCompare(b.id));
      const curation = setupCuration(id);
      if (valid.some((setup) => valid.filter((other) => board.nodes[other.runnerNode].region === board.nodes[setup.runnerNode].region).length > curation.maxPerSpawnRegion)) throw new Error("This chase isn't ready yet.");
      if (valid.length !== CONFIG.setups.poolSize) throw new Error("This chase isn't ready yet. Try another country or come back shortly.");
      this.board = board;
      this.navigation = navigation;
      this.validSetups = valid;
      if (this.map) this.map.setBoard(board);
      else this.map = new PatrolMap(board, (border) => this.choosePost(border), (fallback) => { const note = byId("map-note"); if (fallback && note.hidden) track("map_fallback"); note.hidden = !fallback; });
      track("country_load_success", { country: id, duration_ms: Math.round(performance.now() - started), setup_count: valid.length, border_count: board.borders.length }); measure("country_prepare", started, id);
      this.startSetup(valid[Math.max(0, Math.min(valid.length - 1, targetIndex))], saved ? "resume" : "country", !saved, saved);
      byId("loading").hidden = true;
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      track("country_load_error", { country: id, duration_ms: Math.round(performance.now() - started), reason: "data_unavailable" });
      byId("loading").innerHTML = `${icon("info")}<h2>We couldn't open this case.</h2><p>Try again in a moment, or choose another country.</p><button id="retry-load">Try again</button>`;
      byId("retry-load").addEventListener("click", () => this.loadLevel(id));
    }
  }

  private persistGame() {
    if (!this.game || !this.validSetups.length) return;
    const now = performance.now();
    try {
      writeProgress(localStorage, {
        version: 1, country: this.board.id, huntIndex: this.challengeIndex,
        setupId: this.game.setup.id, setupKey: setupKey(this.game.setup), signature: this.game.setup.difficulty!.rulesSignature,
        state: this.game.snapshot(),
        attempt: { id: this.attemptId, elapsedMs: Math.max(0, now - this.attemptStarted), hintsUsed: this.hintsUsed, ended: this.ended && this.game.outcome.kind !== "playing" },
        selectedPost: this.selectedPost, focusedSquad: this.focusedSquad,
      });
    } catch { /* The chase remains playable when browser storage is unavailable. */ }
    this.lastSaveAt = now;
  }

  private previousChallenge() {
    if (!this.game || this.onboarding.blocked || this.poster.blocked || this.game.activeOrder && this.game.outcome.kind === "playing") return;
    const previous = previousHunt(this.board.id, this.challengeIndex);
    if (!previous) return;
    track("challenge_previous", { source: "header" });
    if (previous.country === this.board.id) this.startSetup(this.validSetups[previous.huntIndex], "previous_challenge", true);
    else void this.loadLevel(previous.country, "previous_challenge", previous.huntIndex);
  }

  private nextChallenge(source = "result") {
    if (!this.validSetups.length) return;
    track("challenge_next", { source, reason: this.game.outcome.kind === "won" ? "completed" : "skip" });
    const index = this.validSetups.findIndex((setup) => setup.id === this.game.setup.id);
    if (index + 1 < this.validSetups.length) { this.startSetup(this.validSetups[index + 1], "next_challenge", true); return; }
    const country = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    void this.loadLevel(CONFIG.levels[country + 1]?.id ?? CONFIG.levels[0].id);
  }

  private startSetup(setup: StartingSetup, entry = "restart", briefing = false, saved?: SavedProgress) {
    this.abandon(entry); this.poster.close();
    this.clearHint();
    cancelAnimationFrame(this.frameHandle);
    this.lastFrame = null;
    const restored = saved ? restoreProgress(saved, this.board, setup, rulesForLevel(this.board.id, setup.squadBorders.length), this.navigation) : null;
    this.game = restored ?? new PatrolGame(this.board, setup, rulesForLevel(this.board.id, setup.squadBorders.length), this.navigation);
    this.attemptId = crypto.randomUUID(); this.attemptStarted = this.thinkingStarted = performance.now(); this.hintsUsed = 0; this.ended = false;
    this.modalStarted = this.onboarding.blocked ? performance.now() : null;
    if (restored && saved) {
      this.attemptId = saved.attempt.id; this.attemptStarted -= saved.attempt.elapsedMs;
      this.hintsUsed = saved.attempt.hintsUsed; this.ended = saved.attempt.ended;
    }
    this.syncContext();
    if (restored) track("game_resume", { reason: this.game.outcome.kind, source: "refresh" });
    else { track("level_start", { entry, level_name: `${this.board.id}:${this.caseFile.id}` }); if (saved) track("progress_restore_failed", { reason: "updated_or_invalid_save" }); }
    this.map?.setTarget(this.caseFile.name, `${import.meta.env.BASE_URL}${portraitPath(this.caseFile)}`);
    this.selectedPost = null;
    this.focusedSquad = null;
    byId("toast").hidden = true;
    this.render();
    this.map?.startView(this.game);
    if (restored && saved) {
      this.selectedPost = saved.selectedPost !== null && this.board.borders[saved.selectedPost] ? saved.selectedPost : null;
      this.focusedSquad = saved.focusedSquad !== null && this.game.squads[saved.focusedSquad] ? saved.focusedSquad : null;
      this.render();
    }
    if (briefing) this.showCase("automatic");
    if (this.game.activeOrder && this.game.outcome.kind === "playing") {
      this.moveStarted = performance.now(); this.frameHandle = requestAnimationFrame(this.frame);
    }
  }

  selectSquad(index: number, source = "card") {
    if (this.onboarding.blocked || this.poster.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing" || !this.game.squads[index]) return;
    track("squad_select", { source, squad: index, ...(this.selectedPost !== null ? { post: this.selectedPost } : {}) });
    if (this.hintBusy) this.clearHint();
    this.map?.revealSquad(this.game.squads[index].actor.position);
    this.focusedSquad = index;
    if (this.selectedPost === null || this.game.securedBorders.has(this.selectedPost)) { this.render(); return; }
    const hinted = this.hint?.kind === "winning" ? this.hint.orders[0] : this.hint?.kind === "survival" ? this.hint.order : null;
    if (!this.game.issueOrder(index, this.selectedPost)) { track("move_rejected", { reason: "unreachable", squad: index, post: this.selectedPost }); this.toast("That post cannot be reached by land."); return; }
    this.syncContext(); this.moveStarted = performance.now();
    const order = this.game.activeOrder!;
    track("move_issued", { source, squad: index, from_post: order.from, post: order.to, distance_km: Math.round(order.distanceKm), think_seconds: Math.max(0, Math.round((this.moveStarted - this.thinkingStarted) / 1000)) });
    if (hinted?.squad === index && hinted.border === this.selectedPost) track("hint_followed", { squad: index, post: this.selectedPost });
    this.clearHint();
    byId("post-drawer").hidden = true;
    byId("toggle-posts").setAttribute("aria-expanded", "false");
    this.selectedPost = null;
    this.render();
    this.lastFrame = null;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  choosePost(border: number, source = "map") {
    if (this.onboarding.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing" || !this.board.borders[border]) return;
    if (this.hintBusy) this.clearHint();
    const hinted = this.hint?.kind === "winning" ? this.hint.orders[0] : this.hint?.kind === "survival" ? this.hint.order : null;
    if (hinted && hinted.border !== border) this.clearHint();
    this.selectedPost = border;
    track("post_select", { source, post: border, guarded: this.game.securedBorders.has(border) });
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
    if (order && travelling && this.game.squads[order.squad].border !== null) { track("squad_arrived", { squad: order.squad, post: order.to }); this.render(); }
    else this.map?.renderActors(this.game);
    this.renderJourney();
    if (performance.now() - this.lastSaveAt >= CONFIG.persistence.autosaveIntervalMs) this.persistGame();
    if (this.game.activeOrder && this.game.outcome.kind === "playing") this.frameHandle = requestAnimationFrame(this.frame);
    else { if (order) track("move_resolved", { duration_ms: Math.round(performance.now() - this.moveStarted), runner_distance_km: Math.round(order.runnerTravelledKm), reason: this.game.outcome.kind }); this.thinkingStarted = performance.now(); this.lastFrame = null; this.render(); }
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

  private clearHint(reason = "state_change") {
    if (this.hint || this.hintBusy || this.hintError) track("hint_hide", { reason });
    this.hintGeneration++;
    this.hints.cancel();
    this.hint = null;
    this.hintBusy = false;
    this.hintError = null;
    byId("hint-panel").hidden = true;
  }

  private async showHint() {
    if (this.onboarding.blocked || !this.game || this.game.activeOrder || this.game.outcome.kind !== "playing") return;
    if (this.hintBusy || this.hint || this.hintError) { this.clearHint("manual"); this.render(); return; }
    const started = performance.now(); this.hintsUsed++; track("hint_request");
    const generation = ++this.hintGeneration;
    this.hintBusy = true;
    this.renderHint();
    try {
      const result = await this.hints.find(this.game);
      if (generation !== this.hintGeneration) return;
      this.hint = result;
      track("hint_result", { hint_kind: result.kind, duration_ms: Math.round(performance.now() - started), ...(result.kind === "winning" ? { winning_moves: result.orders.length, shortest: result.shortest } : {}) });
      const order = result.kind === "winning" ? result.orders[0] : result.kind === "survival" ? result.order : null;
      if (order) {
        this.selectedPost = order.border;
        this.focusedSquad = order.squad;
        this.map?.revealPost(order.border);
      }
    } catch (error) {
      if (generation !== this.hintGeneration) return;
      this.hintError = "We couldn't find a lead just now. Try the hint again.";
      track("hint_result", { hint_kind: "error", duration_ms: Math.round(performance.now() - started) });
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
    if (this.hintBusy) { byId("hint-content").innerHTML = "<p class='hint-calculating'>Checking escape routes…</p><small>Time is paused. No moves or points spent.</small>"; return; }
    if (this.hintError) { byId("hint-content").textContent = this.hintError; return; }
    const order = result?.kind === "winning" ? result.orders[0] : result?.kind === "survival" ? result.order : null;
    if (!order) {
      byId("hint-content").textContent = result?.kind === "none" && result.reason === "no-safe-order" ? "No capture is within reach with the moves left. Try this hunt again with a different approach." : "No clear lead yet. Try another approach, or restart this hunt.";
      return;
    }
    const description = result?.kind === "winning" ? `${result.shortest ? "Best move" : "A promising lead"} · Catch them in ${result.orders.length} more moves.` : "This should buy you some breathing room. The capture will still take more work.";
    byId("hint-content").innerHTML = `<span class="hint-verdict">${description}</span><strong>Squad ${letter(order.squad)} → Post ${order.border + 1}</strong><p>${escapeHtml(borderName(this.board.borders[order.border]))}</p><small>The post is selected. Click the highlighted Squad ${letter(order.squad)} when you're ready to move.</small>`;
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
    byId("journey-title").textContent = travelling ? `Squad ${letter(order.squad)} en route` : "Post guarded · Fugitive on the move";
    byId("journey-value").textContent = travelling ? `${Math.ceil(Math.max(0, order.distanceKm - order.elapsedHours * this.game.rules.squadSpeedKmh))} km left` : `${Math.ceil(Math.max(0, order.durationHours - order.elapsedHours) * this.game.rules.runnerSpeedKmh)} km remaining`;
    byId("journey-bar").style.width = `${fraction * 100}%`;
  }

  render() {
    if (!this.game) return;
    const game = this.game;
    const moving = !!game.activeOrder && game.outcome.kind === "playing";
    const playing = game.outcome.kind === "playing";
    byId("game-status").textContent = !playing ? game.outcome.kind === "won" ? "Fugitive caught" : "Operation ended" : moving ? "The chase is on" : "Your move";
    byId("game-status").parentElement!.classList.toggle("is-moving", moving);
    byId("map-country").textContent = this.board.name;
    const countryIndex = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    const challengeIndex = this.validSetups.findIndex((setup) => setup.id === game.setup.id);
    const challengeNumber = countryIndex * CONFIG.setups.poolSize + challengeIndex + 1;
    byId("map-caption-detail").textContent = `HUNT ${challengeNumber} OF ${CONFIG.levels.length * CONFIG.setups.poolSize} · ${this.caseFile.shortName}`;
    byId<HTMLButtonElement>("previous-hunt").disabled = moving || previousHunt(this.board.id, challengeIndex) === null;
    byId<HTMLSelectElement>("country").value = this.board.id;
    byId<HTMLSelectElement>("country").disabled = moving;
    byId("orders-left").innerHTML = `${String(Math.max(0, game.rules.maxOrders - game.ordersUsed)).padStart(2, "0")}<span>/ ${String(game.rules.maxOrders).padStart(2, "0")}</span>`;
    if (game.outcome.kind === "won") {
      try { localStorage.setItem(this.bestScoreKey(), String(Math.max(Number(this.bestScore()) || 0, game.outcome.score))); } catch { /* Storage is optional. */ }
    }
    byId("best-score").textContent = this.bestScore();
    byId("squad-count").textContent = `${String(game.squads.length).padStart(2, "0")} SQUADS`;
    byId("squads").style.setProperty("--squad-columns", String(game.squads.length));
    byId("squads").style.setProperty("--compact-squad-columns", String(game.squads.length > 3 ? 2 : game.squads.length));
    const destination = this.selectedPost;
    const canAssign = destination !== null && !game.securedBorders.has(destination);
    byId("squads").innerHTML = game.squads.map((squad, index) => {
      const preview = canAssign ? game.previewOrder(index, destination) : null;
      return `<button class="squad-card ${this.focusedSquad === index ? "is-selected" : ""} ${canAssign ? "can-assign" : ""}" data-squad="${index}" ${moving || !playing ? "disabled" : ""} aria-label="${canAssign ? `Send Squad ${letter(index)} to post ${destination + 1}` : `View Squad ${letter(index)}`}"><span class="squad-badge">${icon("squad")}<b>${letter(index)}</b></span><span class="squad-copy"><strong>${canAssign ? "Send" : "Squad"} ${letter(index)}</strong><span>${preview ? `${Math.round(preview.distanceKm)} km to Post ${destination! + 1}` : squad.border === null ? "Relocating to a new post" : escapeHtml(borderName(this.board.borders[squad.border]))}</span></span><span class="squad-state">${squad.border === null ? "EN ROUTE" : "HOLDING"}</span></button>`;
    }).join("");
    byId("squads").querySelectorAll<HTMLButtonElement>("[data-squad]").forEach((button) => button.addEventListener("click", () => this.selectSquad(Number(button.dataset.squad))));
    byId("squad-heading").textContent = destination === null ? "YOUR SQUADS" : canAssign ? `CHOOSE A SQUAD · POST ${destination + 1}` : `POST ${destination + 1} IS GUARDED`;
    byId("border-count").textContent = `${this.board.borders.length} POSTS`;
    byId("borders").innerHTML = this.board.borders.map((border, index) => {
      const squad = game.squads.findIndex((candidate) => candidate.border === index);
      return `<button class="border-row ${squad >= 0 ? "is-secured" : ""} ${destination === index ? "is-selected" : ""}" data-border="${index}" ${moving || !playing ? "disabled" : ""} aria-label="Inspect post ${index + 1}: ${escapeHtml(borderName(border))}"><span class="border-number" style="--border-colour:${CONFIG.appearance.borderPalette[index].secured}">${String(index + 1).padStart(2, "0")}</span><span class="border-copy"><strong>${escapeHtml(borderName(border))}</strong><small>${border.kind === "exit" ? "ESCAPE ROUTE" : squad >= 0 ? "GUARDED BORDER" : "UNGUARDED BORDER"} · ${Math.round(border.lengthKm)} KM</small></span><span class="border-state">${squad >= 0 ? `<b>${letter(squad)}</b>` : icon("arrow")}</span></button>`;
    }).join("");
    byId("borders").querySelectorAll<HTMLButtonElement>("[data-border]").forEach((button) => button.addEventListener("click", () => this.choosePost(Number(button.dataset.border), "list")));
    this.renderJourney();
    byId("app").style.setProperty("--dock-height", `${document.querySelector(".squad-dock")!.getBoundingClientRect().height}px`);
    this.map?.renderState(game, this.selectedPost, this.focusedSquad);
    this.renderHint();
    this.renderResult();
    this.persistGame();
  }

  private renderResult() {
    const outcome = this.game.outcome;
    byId("result").hidden = outcome.kind === "playing";
    if (outcome.kind === "playing") return;
    const won = outcome.kind === "won";
    if (!this.ended) {
      this.syncContext();
      track("level_end", { reason: won ? "capture" : outcome.reason, score: won ? outcome.score : 0, elapsed_seconds: Math.round((performance.now() - this.attemptStarted) / 1000), hints_used: this.hintsUsed, level_name: `${this.board.id}:${this.caseFile.id}`, success: won ? 1 : 0, ...(won ? { capture_region: captureRegion(this.game) } : {}) });
      if (won) track("history_view");
      this.ended = true;
    }
    const levelIndex = CONFIG.levels.findIndex((level) => level.id === this.board.id);
    const next = CONFIG.levels[levelIndex + 1];
    const hasNextSetup = this.validSetups.findIndex((setup) => setup.id === this.game.setup.id) + 1 < this.validSetups.length;
    byId("result").className = `result-card ${won ? "won" : "lost"}`;
    const file = this.caseFile;
    byId("result").innerHTML = `<img class="result-portrait" src="${import.meta.env.BASE_URL}${portraitPath(file)}" alt="Illustrated portrait of ${escapeHtml(file.name)}"><span class="eyebrow">${won ? "CASE CLOSED" : "THE CHASE ENDS HERE"}</span><h2>${won ? `${escapeHtml(file.shortName)} caught.` : outcome.reason === "escape" ? `${escapeHtml(file.shortName)} got away.` : "Out of moves."}</h2><p>${won ? `Your squads closed the net ${escapeHtml(locationPhrase(captureRegion(this.game)))}. There's nowhere left to run.` : outcome.reason === "escape" ? "They slipped across the border and out of your reach." : "Your fugitive is still free. Give the chase another go."}</p>${won ? `<div class="result-score">+${outcome.score}<span>POINTS · ${this.game.ordersUsed} OF ${this.game.rules.maxOrders} MOVES</span></div><div class="historical-ending"><span class="eyebrow">HOW THE REAL MANHUNT ENDED · ${escapeHtml(file.endingDate)}</span><p>${escapeHtml(file.ending)}</p><a id="history-source" href="${file.source.url}" target="_blank" rel="noopener noreferrer">Read the story · ${escapeHtml(file.source.label)} ↗</a></div><button class="newspaper-button" id="make-headlines">🗞 Make headlines<span>Your capture. Your own front page.</span></button>` : ""}<div class="result-actions"><button class="primary-button" id="result-primary">${won ? hasNextSetup ? "Next hunt" : next ? `Next: ${next.name}` : "Play again" : "Try again"}${icon("arrow")}</button><button class="text-button" id="result-secondary">${won ? "Replay this hunt" : "Skip hunt"}</button></div>`;
    byId("result-primary").addEventListener("click", () => { track("result_action", { action: won ? "next" : "retry" }); won ? this.nextChallenge("result") : this.restart("result"); });
    byId("result-secondary").addEventListener("click", () => { track("result_action", { action: won ? "replay" : "skip" }); won ? this.restart("result") : this.nextChallenge("result"); });
    if (won) {
      byId("history-source").addEventListener("click", () => track("history_source_open", { link_kind: "history_source" }));
      byId("make-headlines").addEventListener("click", () => { track("result_action", { action: "poster" }); void this.poster.open(captureReport(this.game, this.challengeIndex, this.huntNumber)); });
    }
  }
}

const app = new PatrolApp();
if (import.meta.env.DEV) Object.defineProperty(window, "__PATROL__", { get: () => app });
