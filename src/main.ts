import "./campaign.css";
import "./viewport";
import { ProgressClient } from "./progress-client";
import {
  ECONOMY,
  chapterForLevel,
  slotCount,
  INITIAL_SQUADS,
  isSpecialist,
  readySquad,
  squadName,
  statsFor,
  type Specialist,
  type SquadId,
} from "./game/collection";
import { PatrolGame } from "./game/engine";
import { advancePlayback } from "./game/playback";
import { Navigation } from "./game/navigation";
import type { CountryBoard } from "./game/types";
import type { Mission, MissionAttempt } from "./game/missions";
import type { LevelWorld } from "./game/campaign-world";
import type { PatrolMap } from "./map-view";
import { borderName } from "./game/presentation";
import { initTelemetry, track, gameContext } from "./telemetry";
import { icon } from "./icons";
import { GameAudio } from "./game/audio";
import { PLAYTEST_CONFIG } from "./game/playtest.config";
import { caseForLevel, portraitPath } from "./game/case-files";
import {
  academyLesson,
  needsFieldLesson,
  guidedOrder,
} from "./game/onboarding";
import { forecastOrder, type OrderForecast } from "./game/order-forecast";

const root = document.querySelector<HTMLDivElement>("#app")!;
// The HTML loader paints before the JS bundle arrives; preserve its animation.
const loadingMarkup = root.innerHTML;
function showLoading(stage: string) {
  if (!root.querySelector(".boot-screen")) root.innerHTML = loadingMarkup;
  const label = root.querySelector("#loading-stage");
  if (label) label.textContent = stage;
}
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number) => n.toLocaleString("en-IN");
const duration = (seconds: number) => {
  const n = Math.max(0, Math.ceil(seconds));
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m${n % 60 ? ` ${n % 60}s` : ""}`;
  return `${Math.floor(n / 3600)}h${Math.ceil((n % 3600) / 60) ? ` ${Math.ceil((n % 3600) / 60)}m` : ""}`;
};
const button = (label: string, action: string, extra = "", css = "button") =>
  `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`;
const brand = `<span class="brand-icon">${icon("squad")}</span><span>PATROL<small>TACTICAL PURSUIT</small></span>`;
const unitIcon = (id: SquadId) => icon(isSpecialist(id) ? id : "squad");
const targetFile = () => caseForLevel(levelNumber);
let board: CountryBoard,
  levels: Mission[],
  client: ProgressClient,
  navigation: Navigation;
const worlds = new Map<string, LevelWorld>();
const worldLoads = new Map<string, Promise<LevelWorld>>();
async function prepareWorld(level: number): Promise<LevelWorld> {
  const chapter = chapterForLevel(level);
  const cached = worlds.get(chapter.country);
  if (cached) return cached;
  const pending = worldLoads.get(chapter.country);
  if (pending) return pending;
  const started = performance.now();
  const load = (async () => {
    const response = await fetch(`/data/${chapter.country}.json`);
    if (!response.ok) throw new Error(`${chapter.name} map could not be loaded. Please retry.`);
    const countryBoard: CountryBoard = await response.json();
    const world = { board: countryBoard, navigation: new Navigation(countryBoard) };
    worlds.set(chapter.country, world);
    track("country_load_success", { country: chapter.country, duration_ms: Math.round(performance.now() - started), setup_count: chapter.last - chapter.first + 1, border_count: countryBoard.borders.length });
    return world;
  })();
  worldLoads.set(chapter.country, load);
  try { return await load; } finally { worldLoads.delete(chapter.country); }
}
function currentWorld(level: number): LevelWorld {
  const world = worlds.get(chapterForLevel(level).country);
  if (!world) throw new Error("The patrol map is still loading");
  return world;
}
let route = "home",
  levelNumber = 1,
  busy = false,
  message = "",
  map: PatrolMap | null = null,
  game: PatrolGame | null = null;
let roster: (SquadId | null)[] = [...INITIAL_SQUADS],
  selectedPost: number | null = null,
  selectedSquad: number | null = null;
let forecast: OrderForecast | null = null;
let coachLesson: "field" | "academy" | null = null;
let coachKey = "";
let analyticsScreen = "";
let appEntryTracked = false;
const lessonStarted = new Map<"field" | "academy", number>();
function updateAnalyticsContext() {
  gameContext({
    country: chapterForLevel(route === "play" || route === "roster" ? levelNumber : player().unlocked).country,
    hunt_number: route === "play" || route === "roster" ? levelNumber : player().unlocked,
    ...(route === "play" && game ? {
      challenge_id: mission().id,
      moves_used: game.ordersUsed,
      moves_left: ECONOMY.maxMoves - game.ordersUsed,
      squad_count: game.squads.length,
    } : {}),
  });
}
function completeLesson(lesson: "field" | "academy") {
  track("guide_complete", {
    lesson,
    hunt_number: lesson === "field" ? 1 : 3,
    duration_ms: Math.round(performance.now() - (lessonStarted.get(lesson) ?? performance.now())),
  });
}
let moveFrame = 0,
  lastFrame = 0,
  ended = false,
  award: number | null = null,
  guide = false;
const audio = new GameAudio();
let resultTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let resultBefore = { wallet: 0, paid: 0 };
let moveLog: MissionAttempt["moves"] = [];
let mapGeneration = 0;
const mission = () => levels[levelNumber - 1];
const player = () => client.player;
const toast = () =>
  `<div id="toast" class="toast${message ? " visible" : ""}" role="status">${escape(message)}${message ? button("×", "dismiss", 'aria-label="Dismiss message"', "dismiss") : ""}</div>`;
function notice(text: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  message = text;
  const el = document.querySelector("#toast");
  if (el) el.outerHTML = toast();
  if (text)
    toastTimer = setTimeout(
      () => notice(""),
      PLAYTEST_CONFIG.interface.toastDurationMs,
    );
}
function errorText(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (["unavailable", "deadline-exceeded"].includes(code))
    return "Connection interrupted. Keep this tab open and reconnect to sync.";
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  )
    return "Sign-in cancelled. You can continue as a guest.";
  return error instanceof Error
    ? error.message.replace(/^Firebase: /, "")
    : "Something went wrong. Please retry.";
}
function setBusy(value: boolean) {
  busy = value;
  root.setAttribute("aria-busy", String(value));
  document
    .querySelectorAll<HTMLButtonElement>("[data-network]")
    .forEach((b) => (b.disabled = value));
}
async function run(task: () => Promise<void>) {
  if (busy) return;
  setBusy(true);
  try {
    await task();
  } catch (error) {
    notice(errorText(error));
  } finally {
    setBusy(false);
  }
}
function stopMap() {
  mapGeneration++;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = null;
  map?.destroy();
  map = null;
}
function go(next: string) {
  const fieldLocked =
    (route === "play" && guide && game?.outcome.kind === "playing") ||
    (route === "roster" && levelNumber === 1 && needsFieldLesson(player()));
  if (fieldLocked && !["play", "roster"].includes(next)) {
    notice("Follow the highlighted control to finish field training.");
    location.hash = route;
    return;
  }
  if (
    next === "academy" &&
    academyLesson(player()) &&
    client.response.active &&
    game?.outcome.kind !== "won"
  ) {
    client.backupForTutorial();
    void client.abandon();
    game = null;
  }
  if (route === "play" && next !== "play" && game) void saveCurrent();
  route = next;
  audio.scene(next === "play" ? "pursuit" : "base");
  location.hash = next;
  render();
}

function nav() {
  return `<nav class="bottom-nav" aria-label="Main navigation">${[
    ["home", "home", "Base"],
    ["levels", "levels", "Cases"],
    ["academy", "academy", "Academy"],
  ]
    .map(([name, symbol, label]) =>
      button(
        `${icon(symbol)}<span>${label}</span>`,
        name,
        `aria-current="${route === name ? "page" : "false"}"`,
        `nav-item ${route === name ? "active" : ""}`,
      ),
    )
    .join("")}</nav>`;
}
function soundButton(css = "audio-button") {
  return button(
    icon(audio.enabled ? "sound" : "mute"),
    "toggle-audio",
    `aria-label="${audio.enabled ? "Mute music and sound" : "Enable music and sound"}" aria-pressed="${audio.enabled}"`,
    css,
  );
}
function syncBadge() {
  return `<span class="sync-badge ${client.syncStatus}" role="status" aria-label="${escape(client.syncMessage)}" title="${escape(client.syncMessage)}">${icon(client.syncStatus === "saved" ? "cloud" : client.syncStatus === "conflict" ? "info" : "clock")}</span>`;
}
function header() {
  return `<header class="site-header"><a href="#home" class="brand" aria-label="Patrol home">${brand}</a><div class="header-actions">${soundButton()}<span class="wallet" aria-label="${player().wallet} coins">${icon("coin")} ${money(player().wallet)}${syncBadge()}</span>${button(icon(client.signedIn ? "check" : "user"), "account", `aria-label="${client.signedIn ? "Your account" : "Save progress"}"`, "account-button")}</div></header>`;
}
function shell(content: string) {
  root.innerHTML = `${header()}<main class="page" id="page-content">${content}</main>${nav()}<div id="coach-host"></div>${toast()}<div id="modal-host"></div>`;
}
function render() {
  if (!client) return;
  updateAnalyticsContext();
  if (analyticsScreen !== route) {
    analyticsScreen = route;
    track("page_view", { screen: route });
  }
  if (route !== "play") stopMap();
  if (route === "home") renderHome();
  else if (route === "levels") renderLevels();
  else if (route === "academy") renderAcademy();
  else if (route === "roster") renderRoster();
  else if (route === "play")
    void renderPlay().catch((error) => notice(errorText(error)));
  else {
    route = "home";
    renderHome();
  }
}
function renderHome() {
  const p = player(),
    done = Object.keys(p.results).length;
  const next =
    client.response.active?.level ?? Math.min(ECONOMY.levelCount, p.unlocked);
  const file = caseForLevel(next),
    l = levels[next - 1];
  const training = Object.values(p.squads).filter(
    (s) => s?.training && s.training.readyAt > client.now(),
  ).length;
  shell(`<section class="base-screen"><div class="campaign-heading"><span class="eyebrow">${chapterForLevel(next).name.toUpperCase()} CAMPAIGN</span><span>${done} / ${ECONOMY.levelCount} ${icon("trophy")}</span></div>
    <article class="wanted-card"><span class="case-stamp">CASE ${String(next).padStart(2, "0")}</span><div class="target-art"><div class="radar-ring"></div><img src="/${portraitPath(file)}" alt="Illustration of ${escape(file.name)}"/><span class="wanted-tag">WANTED</span></div>
    <h1>${escape(file.shortName)}</h1><div class="target-stats"><span>${icon("speed")} ${l.runnerSpeed} <small>km/h</small></span><span>${ECONOMY.maxMoves} <small>moves</small></span></div>
    ${button(`${icon("play")} ${client.response.active ? "RESUME" : `PLAY LEVEL ${next}`}`, client.response.active ? "resume" : "choose", `data-level="${next}"`, "button primary play-button")}
    ${button(`${icon("info")} Case file`, "briefing", `data-level="${next}"`, "text-button")}</article>
    <div class="base-shortcuts">${button(`${icon("academy")}<span>Academy<small>${training ? `${training} training` : "Recruit & train"}</small></span>`, "academy", "", "base-tile")}${button(`${icon("levels")}<span>Case files<small>${ECONOMY.levelCount} pursuits</small></span>`, "levels", "", "base-tile")}</div>
    ${client.response.active ? button("Abandon saved pursuit", "abandon", "data-network", "text-button") : ""}</section>`);
  renderCoach();
}
function renderLevels() {
  const p = player();
  shell(
    `<div class="page-heading"><span class="eyebrow">WORLD CAMPAIGN</span><h1>The wanted list</h1><p>Tap any case for a preview.</p></div><section class="level-grid" aria-label="Campaign levels">${levels
      .map((l) => {
        const file = caseForLevel(l.number),
          result = p.results[String(l.number)],
          locked = l.number > p.unlocked;
        return `${l.number === 1 || l.number === 16 ? `<div class="chapter-heading"><span>${chapterForLevel(l.number).name}</span><small>LEVELS ${chapterForLevel(l.number).first}–${chapterForLevel(l.number).last}</small></div>` : ""}<button type="button" class="level-card ${locked ? "locked" : result ? "completed" : "current"}" data-action="briefing" data-level="${l.number}" aria-label="Level ${l.number}: ${escape(file.name)}${locked ? ", locked preview" : ""}"><span class="level-number">${String(l.number).padStart(2, "0")}</span><img src="/${portraitPath(file)}" alt="" loading="lazy"/><span class="level-status">${icon(locked ? "lock" : result ? "check" : "play")}</span><h2>${escape(file.shortName)}</h2><span class="level-speed">${icon("speed")} ${l.runnerSpeed} km/h</span><small>${result ? `${result.bestMoves} moves · captured` : locked ? `After Level ${l.number - 1}` : "Ready to pursue"}</small></button>`;
      })
      .join(
        "",
      )}</section><div class="future-country">${icon("lock")}<span>More countries coming after the USA</span></div>`,
  );
}
function caseContent(l: Mission, expanded = false) {
  const file = caseForLevel(l.number);
  return `<div class="case-profile"><img src="/${portraitPath(file)}" alt="Illustration of ${escape(file.name)}"/><div><span class="eyebrow">CASE ${String(l.number).padStart(2, "0")} · ${chapterForLevel(l.number).name.toUpperCase()}</span><h1>${escape(file.shortName)}</h1><div class="speed-badge">${icon("speed")} <b>${l.runnerSpeed}</b> km/h <small>running speed</small></div></div></div>${expanded ? `<p>${escape(file.intro)}</p><p class="fiction-note">Fictional ${chapterForLevel(l.number).name} pursuit. Speed is a game value.</p><a class="source-link" href="${escape(file.source.url)}" target="_blank" rel="noopener noreferrer">Historical case · ${escape(file.source.label)} ${icon("arrow")}</a>` : ""}`;
}
function briefing(level: number) {
  const l = levels[level - 1];
  if (!l) return;
  const locked = level > player().unlocked;
  track("level_briefing", { hunt_number: level, level_name: l.id, locked });
  modal(
    `${caseContent(l, true)}<div class="mission-summary"><span>${ECONOMY.maxMoves} moves</span><span>${icon("coin")} ${(ECONOMY.baseReward + (level - 1) * ECONOMY.rewardStep) * 3} max</span></div>${locked ? `<div class="locked-notice">${icon("lock")} Complete Level ${level - 1} to play</div>` : button(`${icon("squad")} Choose squads`, "choose", `data-level="${level}"`, "button primary full")}`,
  );
}
function statLabel(id: SquadId, step: number) {
  const stats = statsFor(id, step);
  return id === "rapid"
    ? `${stats.speed} km/h`
    : id === "helicopter"
      ? `${stats.guardMoves} moves guarding · ${stats.deploymentHours}h deployment`
      : id === "marksman"
        ? `${stats.radiusKm} km firing radius`
        : `${stats.speed} km/h · Border guarding`;
}
function renderAcademy() {
  const p = player();
  shell(
    `<div class="page-heading"><span class="eyebrow">BUILD YOUR FORCE</span><h1>Academy</h1></div><section class="academy-grid">${(
      Object.entries(ECONOMY.catalog) as [
        Specialist,
        (typeof ECONOMY.catalog)[Specialist],
      ][]
    )
      .map(([id, c]) => {
        const unit = p.squads[id],
          locked = p.unlocked < c.unlock,
          step =
            unit?.training && unit.training.readyAt <= client.now()
              ? unit.training.step
              : (unit?.step ?? 0);
        const training =
          unit?.training && unit.training.readyAt > client.now()
            ? unit.training
            : null;
        const maxed = step === ECONOMY.upgradeCosts.length;
        return `<article class="squad-card ${id} ${locked ? "locked" : ""}" data-unit="${id}"><div class="squad-card-top"><span class="specialist-icon ${id}">${unitIcon(id)}</span><span class="badge">${locked ? `${icon("lock")} LEVEL ${c.unlock}` : unit ? `RANK ${step + 1}` : "NEW RECRUIT"}</span></div><h2>${c.name}</h2><div class="stat-line">${icon(id === "rapid" ? "speed" : id === "helicopter" ? "clock" : "marksman")}${statLabel(id, step)}</div><p>${id === "rapid" ? "Faster ground response" : id === "helicopter" ? "Any post · temporary guard" : "Stationary firing range"}</p><div class="upgrade-track" aria-label="${step} upgrades complete">${Array.from({ length: 5 }, (_, i) => `<span class="${i <= step && unit ? "filled" : ""}"></span>`).join("")}</div>
    ${training ? `<div class="training-state" data-training="${id}">${icon("clock")}<span>Training · unavailable</span><strong data-deadline="${training.readyAt}">${duration((training.readyAt - client.now()) / 1000)}</strong></div><small class="upgrade-next">${statLabel(id, training.step)} when ready</small>` : unit ? (maxed ? `<div class="training-state">${icon("check")} Fully trained</div>` : `<div class="next-upgrade"><span>${statLabel(id, step)} ${icon("arrow")} <b>${statLabel(id, step + 1)}</b></span><small>${icon("clock")} ${duration(ECONOMY.trainingSeconds[id][step])}</small></div>${button(`${icon("academy")} Train ${icon("coin")} ${ECONOMY.upgradeCosts[step]}`, "train", `data-id="${id}" data-network ${p.wallet < ECONOMY.upgradeCosts[step] ? "disabled" : ""}`, "button secondary full")}`) : button(locked ? `${icon("lock")} Level ${c.unlock}` : `${icon("plus")} Recruit ${icon("coin")} ${c.price}`, "purchase", `data-id="${id}" data-network ${locked || p.wallet < c.price ? "disabled" : ""}`, "button primary full")}</article>`;
      })
      .join(
        "",
      )}</section><article class="slot-upgrade" data-slot-upgrade><span class="specialist-icon">${icon("squad")}</span><div><h2>Fourth deployment slot</h2><p>${slotCount(p) === 4 ? "Owned · take four squads into any level" : p.unlocked < ECONOMY.fourthSlot.unlock ? "Unlocks at Level 15" : "Add another squad to your deployment"}</p></div>${slotCount(p) === 4 ? `<span class="badge">${icon("check")} OWNED</span>` : button(`${icon("plus")} ${icon("coin")} ${ECONOMY.fourthSlot.price}`, "buy-slot", `data-network ${p.unlocked < ECONOMY.fourthSlot.unlock || p.wallet < ECONOMY.fourthSlot.price || !!client.response.active ? "disabled" : ""}`, "button secondary")}${client.response.active && slotCount(p) < 4 ? `<small>Finish or abandon your saved level before expanding.</small>` : ""}</article><div class="patrol-row">${INITIAL_SQUADS.map((id) => `<div>${unitIcon(id)}<strong>${squadName(id)}</strong><small>${ECONOMY.patrolSpeedKmh} km/h</small></div>`).join("")}</div><p class="fine-print">Training runs while away. Empty deployment slots are allowed.</p>${button(`${icon("play")} Play Level ${p.unlocked}`, "choose", `data-level="${p.unlocked}"`, "button secondary full")}`,
  );
  renderCoach();
}
function renderRoster() {
  const p = player(),
    l = mission();
  shell(`<div class="page-heading"><span class="eyebrow">MISSION BRIEFING</span></div>${caseContent(l)}${button(`${icon("info")} Case file`, "briefing", `data-level="${l.number}"`, "text-button case-link")}
    <div class="section-title"><h2>Deploy your squad</h2><span>${roster.filter(Boolean).length} / ${slotCount(p)}</span></div><div class="deployment-slots">${roster.map((id, i) => button(id ? `${unitIcon(id)}<strong>${escape(squadName(id))}</strong>${icon("close")}` : `${icon("plus")}<small>Slot ${i + 1}</small>`, "remove-slot", `data-slot="${i}" aria-label="${id ? `Remove ${squadName(id)}` : `Empty slot ${i + 1}`}"`, `deployment-slot ${id ? "filled" : ""}`)).join("")}</div>
    <section class="roster-list" aria-label="Available squads">${(
      Object.keys(p.squads) as SquadId[]
    )
      .map((id) => {
        const unit = p.squads[id]!,
          ready = readySquad(p, id, client.now()),
          selected = roster.includes(id),
          step = unit.training && ready ? unit.training.step : unit.step;
        return button(
          `<span class="unit-badge ${isSpecialist(id) ? id : ""}">${unitIcon(id)}</span><span><strong>${escape(squadName(id))}</strong><small>${ready ? statLabel(id, step) : "In training"}</small></span><span class="roster-check">${icon(selected ? "check" : ready ? "plus" : "clock")}</span>`,
          "add-squad",
          `data-id="${id}" ${!ready ? "disabled" : ""} aria-pressed="${selected}"`,
          `roster-row ${selected ? "selected" : ""}`,
        );
      })
      .join(
        "",
      )}</section><div class="roster-footer">${button(`${icon("play")} START PURSUIT`, "start", "data-network", "button primary full")}${roster.filter(Boolean).length < slotCount(p) ? "<small>Empty slots · you may still play</small>" : ""}${button(`${icon("academy")} Academy`, "academy", "", "text-button")}</div>`);
  renderCoach();
}
function restoreGame() {
  const active = client.response.active;
  if (!active) return false;
  levelNumber = active.level;
  const world = currentWorld(levelNumber);
  board = world.board;
  navigation = world.navigation!;
  moveLog = [...active.moves];
  game = new PatrolGame(board, active.setup, active.rules, navigation);
  for (let i = 0; i < moveLog.length; i++) {
    const move = moveLog[i];
    if (!game.issueOrder(move.squad, move.border))
      throw new Error("Saved level no longer matches its rules");
    if (i === moveLog.length - 1 && client.response.pendingHours !== null)
      game.advanceHours(client.response.pendingHours);
    else game.resolveOrder();
  }
  const requiredField = levelNumber === 1 && needsFieldLesson(player());
  const validField =
    active.selection.every((id, slot) => id === INITIAL_SQUADS[slot]) &&
    !!guidedOrder(game);
  if (
    game.outcome.kind === "playing" &&
    ((requiredField && !validField) ||
      (levelNumber === 3 && academyLesson(player())))
  ) {
    client.backupForTutorial();
    roster = requiredField
      ? [null, null, null]
      : player().selection.map((id) =>
          id && readySquad(player(), id, client.now()) ? id : null,
        );
    guide = false;
    game = null;
    return false;
  }
  selectedPost = null;
  selectedSquad = null;
  forecast = null;
  ended = false;
  award = null;
  guide =
    levelNumber === 1 &&
    needsFieldLesson(player()) &&
    active.selection.every((id, slot) => id === INITIAL_SQUADS[slot]) &&
    game.outcome.kind === "playing" &&
    !!guidedOrder(game);
  return true;
}
async function renderPlay() {
  if (!game || !client.response.active) {
    route = "home";
    render();
    return;
  }
  stopMap();
  const generation = mapGeneration;
  root.innerHTML = `<main class="game-page"><div id="map" role="region" aria-label="${chapterForLevel(levelNumber).name} patrol map"></div><header class="game-top topbar">${button(icon("home"), "leave", 'aria-label="Return to base"', "game-back")}<button class="target-hud" data-action="briefing" data-level="${levelNumber}"><img src="/${portraitPath(targetFile())}" alt=""/><span><small>LEVEL ${levelNumber}</small><b>${escape(targetFile().shortName)}</b><small>${game.rules.runnerSpeedKmh} km/h</small></span></button>${soundButton("audio-button game-sound")}</header><div class="metrics"><strong id="moves-left">${ECONOMY.maxMoves - game.ordersUsed}</strong><span>MOVES</span></div><div class="game-note" id="game-note"></div><section class="squad-dock" aria-label="Deployed squads"><div class="dock-heading"><span id="selected-label">Choose a squad or a free post</span>${button(icon("close"), "clear", 'aria-label="Clear selection"', "text-button")}</div><div id="game-squads" class="game-squads"></div><div class="journey" id="journey"></div><div id="deploy-control"></div></section><div id="coach-host"></div><section class="result-panel" id="result-panel" hidden></section>${toast()}<div id="modal-host"></div></main>`;
  const { PatrolMap: MapView } = await import("./map-view");
  if (generation !== mapGeneration || route !== "play" || !game) return;
  let fallbackReported = false;
  map = new MapView(
    board,
    (index) => selectPost(index),
    (fallback) => {
      if (fallback) {
        if (!fallbackReported) track("map_fallback");
        fallbackReported = true;
        notice("Map detail is offline. The chase remains playable.");
      } else if (message === "Map detail is offline. The chase remains playable.")
        notice("");
    },
  );
  map.setTarget(targetFile().name, `/${portraitPath(targetFile())}`);
  map.renderState(game, selectedPost);
  renderHUD();
  map.startView(game);
  if (game.activeOrder) animate();
  else if (game.outcome.kind !== "playing") void finish();
}
function renderHUD() {
  if (!game || !map) return;
  document.querySelector("#moves-left")!.textContent = String(
    ECONOMY.maxMoves - game.ordersUsed,
  );
  const ids = client.response.active!.selection.filter(
    (id): id is SquadId => id !== null,
  );
  const order = guide ? guidedOrder(game) : null;
  document.querySelector("#selected-label")!.textContent = game.activeOrder
    ? "Pursuit in motion"
    : selectedPost !== null
      ? selectedSquad === null
        ? `Post ${selectedPost + 1} selected · choose a squad`
        : `Post ${selectedPost + 1} · ${borderName(board.borders[selectedPost])}`
      : selectedSquad !== null
        ? `Squad ${String.fromCharCode(65 + selectedSquad)} selected · choose a post`
        : "Choose a squad or a free post";
  document.querySelector("#game-squads")!.innerHTML = ids.length
    ? ids
        .map((id, index) => {
          const squad = game!.squads[index],
            stats = game!.rules.units![index];
          const label =
            stats.kind === "helicopter"
              ? squad.border === null
                ? "Reserve"
                : `${squad.guardLeft} moves left`
              : `${stats.speed} km/h · ${squad.border === null ? "Moving" : `Post ${squad.border + 1}`}`;
          return button(
            `<span class="unit-badge ${stats.kind}">${unitIcon(id)}</span><strong>${String.fromCharCode(65 + index)} · ${escape(squadName(id).replace(" Squad", ""))}</strong><small>${label}</small>`,
            "select-squad",
            `data-squad="${index}" aria-pressed="${selectedSquad === index}" ${game!.activeOrder || game!.outcome.kind !== "playing" ? "disabled" : ""}`,
            `game-squad ${selectedSquad === index ? "selected" : ""}`,
          );
        })
        .join("")
    : '<p class="empty-roster">No squads. Return to base to choose a roster.</p>';
  document.querySelector("#journey")!.innerHTML = game.activeOrder
    ? `${icon("runner")} Both units moving · time pauses after this move`
    : forecast
      ? `${icon("runner")} Fugitive travels <b>${Math.round(forecast.runnerDistanceKm)} km</b> · ${forecast.arrivalHours.toFixed(1)}h to arrive`
      : `${icon("clock")} Time paused · plan your next move`;
  document.querySelector("#deploy-control")!.innerHTML =
    forecast && !game.activeOrder
      ? `<div class="forecast-key"><span><i></i>Your squad</span><span><i></i>Fugitive</span><b>${forecast.outcome.kind === "lost" && forecast.outcome.reason === "escape" ? "ESCAPE RISK" : forecast.outcome.kind === "won" ? "CAPTURE" : "PREVIEW"}</b></div>${button(`${icon("arrow")} DEPLOY · 1 MOVE`, "deploy", "", "button primary full")}`
      : "";
  const note = document.querySelector("#game-note")!;
  note.textContent = "";
  map.renderState(game, selectedPost, selectedSquad);
  map.setForecast(forecast);
  const ranges = game.squads.flatMap((s, index) =>
    s.border !== null && game!.rules.units?.[index]?.kind === "marksman"
      ? [
          {
            position: s.actor.position,
            radius: game!.rules.units[index].radiusKm,
          },
        ]
      : [],
  );
  map.setRanges(ranges);
  document
    .querySelectorAll(".border-post.guided")
    .forEach((el) => el.classList.remove("guided"));
  if (order && !game.activeOrder)
    document
      .querySelector(`[data-border="${order.border}"]`)
      ?.classList.add("guided");
  renderCoach();
}
function selectSquad(index: number) {
  if (!game || game.activeOrder || game.outcome.kind !== "playing") return;
  const order = guide ? guidedOrder(game) : null;
  if (order && order.squad !== index) {
    notice(
      `Choose highlighted Squad ${String.fromCharCode(65 + order.squad)} to continue training.`,
    );
    return;
  }
  audio.effect("select");
  selectedSquad = index;
  forecast =
    selectedPost === null ? null : forecastOrder(game, index, selectedPost);
  renderHUD();
  if (forecast) map?.showForecast(forecast);
  else if (selectedPost !== null)
    notice("This squad cannot reach that post. Choose another squad or post.");
  else if (order) map?.revealPost(order.border);
}
function selectPost(index: number) {
  if (!game || game.activeOrder || game.outcome.kind !== "playing") return;
  audio.unlock();
  const order = guide ? guidedOrder(game) : null;
  if (order && index !== order.border) {
    notice(`Choose highlighted Post ${order.border + 1} to continue training.`);
    return;
  }
  if (game.securedBorders.has(index)) {
    notice("Choose an unguarded post.");
    return;
  }
  audio.effect("target");
  selectedPost = index;
  forecast =
    selectedSquad === null ? null : forecastOrder(game, selectedSquad, index);
  renderHUD();
  if (forecast) map?.showForecast(forecast);
  else if (selectedSquad !== null)
    notice("This squad cannot reach that post. Choose another squad or post.");
}
function issueMove() {
  if (
    !game ||
    !map ||
    game.activeOrder ||
    game.outcome.kind !== "playing" ||
    selectedPost === null ||
    selectedSquad === null
  )
    return;
  const index = selectedSquad;
  if (!game.issueOrder(index, selectedPost)) return;
  audio.effect("deploy");
  moveLog.push({ squad: index, border: selectedPost });
  selectedPost = null;
  selectedSquad = null;
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = null;
  renderHUD();
  if (game.outcome.kind !== "playing") void finish();
  else {
    void saveCurrent();
    animate();
  }
}
function animate() {
  if (!game?.activeOrder) return;
  cancelAnimationFrame(moveFrame);
  lastFrame = 0;
  const frame = (time: number) => {
    if (!game || route !== "play") return;
    if (document.hidden) {
      lastFrame = 0;
      moveFrame = requestAnimationFrame(frame);
      return;
    }
    const elapsed = lastFrame ? Math.min(0.1, (time - lastFrame) / 1000) : 0;
    lastFrame = time;
    const active = game.activeOrder;
    if (!active) return;
    advancePlayback(game, elapsed);
    map?.renderActors(game);
    if (game.activeOrder) moveFrame = requestAnimationFrame(frame);
    else {
      forecast = null;
      renderHUD();
      if (game.outcome.kind !== "playing") void finish();
      else {
        audio.effect("arrive");
        map?.revealSquad(game.runner.position);
        void saveCurrent();
      }
    }
  };
  moveFrame = requestAnimationFrame(frame);
}
async function saveCurrent() {
  if (!game || !client.response.active) return;
  try {
    await client.save(moveLog, game.activeOrder?.elapsedHours ?? null);
  } catch (error) {
    notice(errorText(error));
  }
}
async function finish() {
  if (!game || ended) return;
  ended = true;
  const won = game.won;
  updateAnalyticsContext();
  track("level_end", {
    reason: won
      ? "capture"
      : game.outcome.kind === "lost"
        ? game.outcome.reason
        : "unknown",
    score: won ? ECONOMY.maxMoves - game.ordersUsed : 0,
    success: won ? 1 : 0,
    moves_used: game.ordersUsed,
    hunt_number: levelNumber,
    level_name: mission().id,
  });
  if (guide && won) {
    guide = false;
    completeLesson("field");
  }
  resultBefore = {
    wallet: player().wallet,
    paid: player().results[String(levelNumber)]?.paid ?? 0,
  };
  if (won) {
    audio.effect("win");
    try {
      const response = await client.finish(moveLog);
      award = response.reward;
      track("reward_awarded", { amount: award, hunt_number: levelNumber });
      map?.celebrateCapture(game);
      const page = document.querySelector(".game-page");
      if (page) {
        page.classList.add("capture-moment");
        const burst = document.createElement("div");
        burst.className = "capture-celebration";
        burst.innerHTML = `<div class="capture-word">${icon("trophy")} CAPTURED</div>${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 47) % 100}%;--drift:${(i % 2 ? 1 : -1) * (20 + i * 3)}px;--delay:${(i % 5) * 60}ms;--spin:${i * 43}deg"></i>`).join("")}`;
        page.append(burst);
      }
      const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : PLAYTEST_CONFIG.celebration.resultDelayMs;
      resultTimer = setTimeout(() => {
        resultTimer = null;
        showResult(true);
        void maybePrompt();
      }, delay);
    } catch (error) {
      notice(errorText(error));
      showResult(false);
    }
  } else {
    audio.effect("lose");
    showResult(false);
    await saveCurrent();
  }
}
function showResult(won: boolean) {
  const panel = document.querySelector<HTMLElement>("#result-panel");
  if (!panel || !game) return;
  panel.hidden = false;
  panel.classList.toggle("victory", won);
  const base = ECONOMY.baseReward + (levelNumber - 1) * ECONOMY.rewardStep,
    multiplier = game.ordersUsed < 3 ? 3 : game.ordersUsed <= 5 ? 2 : 1,
    gross = base * multiplier;
  panel.innerHTML = `<div class="result-medal">${icon(won ? "trophy" : "reset")}</div><span class="eyebrow">${won ? "CASE CLOSED" : "REGROUP"}</span><h1>${won ? `${escape(targetFile().shortName)} captured` : "They got away"}</h1><p>${won ? `${game.ordersUsed} moves · ${game.ordersUsed < 3 ? "Lightning response" : game.ordersUsed <= 5 ? "Sharp tactics" : "Mission complete"}` : game.outcome.kind === "lost" && game.outcome.reason === "budget" ? "Moves exhausted. Train or try another approach." : "The fugitive reached a land exit."}</p>
  ${won ? `<section class="reward-breakdown" aria-label="Reward calculation"><div class="reward-equation"><span><small>BASE</small>${icon("coin")} ${money(base)}</span><b>×</b><span><small>${game.ordersUsed} MOVES</small>${multiplier}</span><b>=</b><span><small>LEVEL TOTAL</small>${icon("coin")} ${money(gross)}</span></div>${resultBefore.paid ? `<p class="replay-reward">Best reward already collected: ${money(resultBefore.paid)}. Replays pay only the improvement.</p>` : ""}<div class="reward-earned"><span>NEW COINS</span><strong>+ ${money(award ?? 0)}</strong></div><div class="balance-equation">Your balance <b>${money(resultBefore.wallet)} + ${money(award ?? 0)} = ${money(player().wallet)}</b></div></section>` : ""}
  <div class="result-actions">${won ? (levelNumber < ECONOMY.levelCount ? button(`${levelNumber === 15 ? "USA · LEVEL 16" : "NEXT LEVEL"} ${icon("arrow")}`, "next", "", "button primary full") : button(`${icon("levels")} CAMPAIGN COMPLETE`, "levels", "", "button primary full")) : button(`${icon("reset")} TRY AGAIN`, "retry", "", "button primary full")}${button(`${icon("home")} HOME`, "home", "", "button secondary full")}${!won ? button(`${icon("academy")} Academy`, "academy", "", "text-button") : ""}</div>`;
  renderCoach();
  panel.setAttribute("aria-label", won ? "Capture reward" : "Retry mission");
  if (!coachLesson)
    panel
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
}

function renderCoach() {
  const host = document.querySelector<HTMLElement>("#coach-host");
  if (!host) return;
  document.querySelectorAll(".coach-target").forEach((el) => {
    el.classList.remove("coach-target");
    el.removeAttribute("aria-describedby");
  });
  host.innerHTML = "";
  coachLesson = null;
  if (document.querySelector("dialog[open]")) return;
  let selector = "",
    title = "",
    body = "",
    step = "",
    done = false;
  if (route === "roster" && levelNumber === 1 && needsFieldLesson(player())) {
    const missing = INITIAL_SQUADS.find((id) => !roster.includes(id));
    selector = missing
      ? `[data-action="add-squad"][data-id="${missing}"]`
      : '[data-action="start"]';
    title = missing ? `Select ${squadName(missing)}` : "Your squad is ready";
    body = missing
      ? `${targetFile().shortName}: ${mission().runnerSpeed} km/h. Tap the glowing squad to fill a slot.`
      : "Three guards, fifteen moves. Start the pursuit.";
    step = "FIRST CAPTURE · SELECT YOUR SQUADS";
    coachLesson = "field";
  } else if (
    route === "play" &&
    guide &&
    game &&
    game.outcome.kind === "playing"
  ) {
    const order = guidedOrder(game);
    if (!order) return;
    if (game.activeOrder) {
      selector = "#journey";
      title = "Watch both paths";
      body =
        "Both move together. Your old border opens; the new one closes on arrival.";
    } else if (selectedSquad === null) {
      selector = `[data-action="select-squad"][data-squad="${order.squad}"]`;
      title = `Choose Squad ${String.fromCharCode(65 + order.squad)}`;
      body =
        selectedPost === null
          ? "Choose your squad. You can pick a post first, too."
          : `Post ${selectedPost + 1} is selected. Choose this squad to preview the chase.`;
    } else if (selectedPost === null) {
      selector = `[data-border="${order.border}"]`;
      title = `Close Post ${order.border + 1}`;
      body =
        "Tap the glowing post. Guarded borders block the fugitive’s land escape.";
    } else {
      selector = '[data-action="deploy"]';
      title = "Read the chase, then deploy";
      body = "Blue: your squad. Gold: the fugitive. Deploy spends one move.";
    }
    step = `FIRST CAPTURE · MOVE ${game.activeOrder ? game.ordersUsed : game.ordersUsed + 1} / ${game.setup.witness.length}`;
    coachLesson = "field";
  } else if (academyLesson(player()) && !(route === "play" && !game?.won)) {
    const phase = academyLesson(player());
    coachLesson = "academy";
    step = "LEVEL 3 · RAPID ACTION";
    if (route !== "academy") {
      selector =
        route === "play" && game?.won
          ? '[data-action="next"]'
          : '[data-action="academy"]';
      title = "Rapid Action unlocked!";
      body =
        route === "play"
          ? "Continue to Level 3. Your first specialist is ready to recruit."
          : "Open the Academy. Your two wins cover a recruit and its first upgrade.";
    } else if (phase === "purchase") {
      selector = '[data-action="purchase"][data-id="rapid"]';
      title = "Recruit Rapid Action";
      body = `Spend ${ECONOMY.catalog.rapid.price} coins to own it. Each specialist is purchased once.`;
    } else if (phase === "train") {
      selector = '[data-action="train"][data-id="rapid"]';
      title = "Start your first upgrade";
      body = `${ECONOMY.upgradeCosts[0]} coins + ${ECONOMY.trainingSeconds.rapid[0]} seconds. Speed rises from ${ECONOMY.rapidSpeeds[0]} to ${ECONOMY.rapidSpeeds[1]} km/h.`;
    } else {
      selector = '[data-unit="rapid"]';
      title =
        player().squads.rapid?.training &&
        player().squads.rapid!.training!.readyAt > client.now()
          ? "Training is underway"
          : "Upgrade ready";
      body =
        "Training squads cannot deploy. The timer runs while away. Pick Rapid Action when it is ready.";
      done = true;
    }
  }
  if (!coachLesson) {
    coachKey = "";
    return;
  }
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  if (!lessonStarted.has(coachLesson)) {
    lessonStarted.set(coachLesson, performance.now());
    track("guide_begin", {
      lesson: coachLesson,
      hunt_number: coachLesson === "field" ? 1 : 3,
      entry: route,
    });
  }
  target.classList.add("coach-target");
  target.setAttribute("aria-describedby", "coach-copy");
  const phase = done
    ? "timer"
    : route === "roster"
      ? "roster"
      : route === "play" && game?.outcome.kind === "playing"
        ? game.activeOrder
          ? "moving"
          : selectedSquad === null
            ? "squad"
            : selectedPost === null
              ? "post"
              : "deploy"
        : route === "academy"
          ? (academyLesson(player()) ?? "academy")
          : "academy";
  const stages =
    coachLesson === "field"
      ? [
          ["squad", "SQUAD"],
          ["focus", "POST"],
          ["arrow", "DEPLOY"],
          ["check", "CHASE"],
        ]
      : [
          ["academy", "ACADEMY"],
          ["rapid", "RECRUIT"],
          ["clock", "TRAIN"],
        ];
  const progress =
    coachLesson === "field"
      ? phase === "roster"
        ? 0
        : phase === "squad"
          ? 0
          : phase === "post"
            ? 1
            : phase === "deploy"
              ? 2
              : 3
      : phase === "purchase"
        ? 1
        : phase === "train" || phase === "timer"
          ? 2
          : 0;
  host.dataset.phase = phase;
  host.innerHTML = `<aside class="coach command-coach" aria-label="Tutorial" data-lesson="${coachLesson}" data-phase="${phase}" aria-live="polite"><div class="coach-top"><span class="commander-badge">${icon("commander")}</span><div><strong>FIELD COMMAND</strong><small>${step}</small></div><span class="radio-signal"><i></i><i></i><i></i></span></div><div class="coach-stage-track">${stages.map(([symbol, label], i) => `<span class="${i <= progress || (coachLesson === "field" && selectedPost !== null && i === 1) ? "lit" : ""} ${i === progress ? "current" : ""}">${icon(symbol)}<small>${label}</small></span>`).join("")}</div><h2>${title}</h2><p id="coach-copy">${body}</p>${done ? button(`UNDERSTOOD ${icon("arrow")}`, "lesson-done", "", "button primary full") : `<div class="coach-required">${icon("lock")} Follow the glowing control</div>`}</aside>`;

  const key = `${route}:${selector}:${title}`;
  if (key !== coachKey) {
    coachKey = key;
    if (target instanceof HTMLButtonElement)
      target.focus({ preventScroll: true });
    if (route !== "play") {
      const bounds = target.getBoundingClientRect(),
        card = host.querySelector(".coach")!.getBoundingClientRect();
      const delta =
        bounds.bottom > card.top - 18
          ? bounds.bottom - card.top + 18
          : bounds.top < 85
            ? bounds.top - 85
            : 0;
      if (delta)
        window.scrollBy({
          top: delta,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
    }
  }
}
function modal(content: string) {
  const host = document.querySelector("#modal-host")!;
  host.innerHTML = `<dialog class="modal"><form method="dialog">${button("×", "close-modal", 'aria-label="Close"', "modal-close")}${content}</form></dialog>`;
  host.querySelector("dialog")!.showModal();
}
function accountModal() {
  modal(
    `<span class="eyebrow">KEEP YOUR CAMPAIGN</span><h2>${client.signedIn ? "Your campaign." : "Keep your campaign."}</h2><p>${escape(client.syncMessage)}. ${client.signedIn ? "Your account keeps your campaign across devices." : "Link Google to continue on another device. Guest play is always available."}</p>${button(client.signedIn ? "Sign out" : "Continue with Google", client.signedIn ? "sign-out" : "google", "data-network", "button primary full")}${client.syncStatus === "conflict" ? button("Use newer cloud save", "reload-cloud", "data-network", "button secondary full") : ""}${button("Keep playing", "close-modal", "", "text-button full")}`,
  );
}
async function maybePrompt() {
  if (
    client.signedIn ||
    player().loginPrompted ||
    !(player().results["4"] || player().firstPurchase)
  )
    return;
  await client.action({ kind: "prompt" });
  accountModal();
  track("sign_in_prompt", {
    source: player().firstPurchase ? "purchase" : "level_4",
  });
}

root.addEventListener(
  "click",
  (event) => {
    if (!coachLesson || document.querySelector("dialog[open]")) return;
    const element = event.target as Element,
      action = element.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (
      action === "toggle-audio" ||
      action === "dismiss" ||
      action === "lesson-done" ||
      (action === "home" && game?.won && coachLesson === "academy")
    )
      return;
    if (guide && game?.outcome.kind === "playing") {
      const order = guidedOrder(game),
        post = element.closest<HTMLElement>("[data-border]"),
        squad = element.closest<HTMLElement>('[data-action="select-squad"]');
      if (
        order &&
        ((post && Number(post.dataset.border) === order.border) ||
          (squad && Number(squad.dataset.squad) === order.squad))
      )
        return;
    }
    const target = document.querySelector(".coach-target");
    if (target?.contains(element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    audio.effect("error");
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Tab" ||
    !coachLesson ||
    document.querySelector("dialog[open]")
  )
    return;
  const controls = [
    document.querySelector<HTMLElement>(".coach-target"),
    document.querySelector<HTMLElement>('.coach [data-action="lesson-done"]'),
    document.querySelector<HTMLElement>('[data-action="toggle-audio"]'),
  ].filter(
    (el): el is HTMLElement => !!el && el.matches("button:not(:disabled)"),
  );
  if (!controls.length) return;
  event.preventDefault();
  const i = controls.indexOf(document.activeElement as HTMLElement);
  controls[
    (i + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  ].focus({ preventScroll: true });
});
root.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  audio.unlock();
  if (action === "toggle-audio") {
    audio.toggle();
    document
      .querySelectorAll<HTMLElement>('[data-action="toggle-audio"]')
      .forEach((el) => {
        el.innerHTML = icon(audio.enabled ? "sound" : "mute");
        el.setAttribute("aria-pressed", String(audio.enabled));
        el.setAttribute(
          "aria-label",
          audio.enabled ? "Mute music and sound" : "Enable music and sound",
        );
      });
    return;
  }
  if (!["deploy", "select-squad", "purchase", "train"].includes(action ?? ""))
    audio.effect("select");
  if (["home", "levels", "academy"].includes(action!)) {
    go(action!);
    return;
  }
  if (action === "dismiss") {
    notice("");
    return;
  }
  if (action === "close-modal") {
    document.querySelector<HTMLDialogElement>("dialog")?.close();
    renderCoach();
    return;
  }
  if (action === "briefing") {
    briefing(Number(target.dataset.level));
    return;
  }
  if (action === "select-squad") {
    selectSquad(Number(target.dataset.squad));
    return;
  }
  if (action === "deploy") {
    issueMove();
    return;
  }
  if (action === "account") {
    accountModal();
    return;
  }
  if (action === "choose" || action === "retry" || action === "next") {
    levelNumber =
      action === "next"
        ? Math.min(ECONOMY.levelCount, levelNumber + 1)
        : action === "choose"
          ? Number(target.dataset.level)
          : levelNumber;
    if (action === "retry" && game?.won && levelNumber === ECONOMY.levelCount) {
      go("levels");
      return;
    }
    if (levelNumber > player().unlocked) {
      briefing(levelNumber);
      return;
    }
    document.querySelector<HTMLDialogElement>("dialog")?.close();
    roster =
      levelNumber === 1 && needsFieldLesson(player())
        ? [null, null, null]
        : player().selection.map((id) =>
            id && readySquad(player(), id, client.now()) ? id : null,
          );
    void prepareWorld(levelNumber).catch(() => { /* Start provides a visible retry on failure. */ });
    go("roster");
    return;
  }
  if (action === "remove-slot") {
    roster[Number(target.dataset.slot)] = null;
    renderRoster();
    return;
  }
  if (action === "add-squad") {
    const id = target.dataset.id as SquadId,
      index = roster.indexOf(id);
    if (levelNumber === 1 && needsFieldLesson(player())) {
      const expected = INITIAL_SQUADS.find((squad) => !roster.includes(squad));
      if (index < 0 && expected && id !== expected) {
        notice(
          `Choose highlighted ${squadName(expected)}, to continue training.`,
        );
        return;
      }
    }
    if (index >= 0) roster[index] = null;
    else {
      const empty = roster.indexOf(null);
      if (empty < 0) {
        notice("Remove a selected squad to make room.");
        return;
      }
      roster[empty] = id;
    }
    renderRoster();
    return;
  }
  if (action === "clear") {
    selectedPost = null;
    selectedSquad = null;
    forecast = null;
    renderHUD();
    return;
  }
  if (action === "lesson-done") {
    if (coachLesson !== "academy" || academyLesson(player()) !== "timer")
      return;
    void run(async () => {
      await client.action({ kind: "tutorial", lesson: "academy" });
      audio.effect("ready");
      completeLesson("academy");
      render();
    });
    return;
  }
  if (action === "buy-slot") {
    void run(async () => {
      await client.action({ kind: "buy-slot" });
      track("deployment_slot_purchase", { amount: ECONOMY.fourthSlot.price });
      roster = [...player().selection];
      audio.effect("purchase");
      renderAcademy();
    });
    return;
  }
  if (action === "leave") {
    go("home");
    return;
  }
  void run(async () => {
    if (action === "purchase" || action === "train") {
      const squad = target.dataset.id as Specialist;
      const firstPurchase = action === "purchase" && !player().firstPurchase &&
        !Object.keys(player().squads).some(isSpecialist);
      const spent =
        action === "purchase"
          ? ECONOMY.catalog[squad].price
          : ECONOMY.upgradeCosts[player().squads[squad]!.step];
      await client.action({
        kind: action === "purchase" ? "purchase" : "train",
        squad: target.dataset.id as Specialist,
      });
      track(action === "purchase" ? "squad_purchase" : "squad_training", {
        squad_type: target.dataset.id!,
        amount: spent,
        ...(action === "train" ? {
          upgrade_rank: player().squads[squad]!.training!.step + 1,
          training_seconds: ECONOMY.trainingSeconds[squad][player().squads[squad]!.training!.step - 1],
        } : {}),
      });
      if (firstPurchase) track("first_squad_purchase", {
        squad_type: squad,
        amount: spent,
      });
      audio.effect(action === "purchase" ? "purchase" : "train");
      renderAcademy();
      await maybePrompt();
    } else if (action === "start") {
      if (
        levelNumber === 1 &&
        needsFieldLesson(player()) &&
        INITIAL_SQUADS.some((id) => !roster.includes(id))
      ) {
        notice(
          "Choose all three Patrol squads to follow the guide, to begin your first capture.",
        );
        return;
      }
      if (levelNumber === 3 && academyLesson(player())) {
        go("academy");
        return;
      }
      const replacedLevel = !game || game.outcome.kind === "playing"
        ? client.response.active?.level : undefined;
      await client.start(levelNumber, roster);
      if (replacedLevel) track("level_abandon", { hunt_number: replacedLevel, reason: "replaced" });
      const restored = restoreGame();
      go(restored ? "play" : "roster");
      if (restored) {
        const rank = (id: Specialist) => {
          const slot = client.response.active!.selection.filter(Boolean).indexOf(id);
          return slot < 0 ? 0 : client.response.active!.steps[slot] + 1;
        };
        track("level_start", {
          entry: "roster", level_name: mission().id,
          empty_slots: roster.filter((id) => id === null).length,
          rapid_rank: rank("rapid"), helicopter_rank: rank("helicopter"), marksman_rank: rank("marksman"),
        });
      }
    } else if (action === "resume") {
      await client.load();
      const restored = restoreGame();
      go(restored ? "play" : "roster");
      if (restored) track("game_resume", { source: "home" });
    } else if (action === "google") {
      await client.google();
      document.querySelector<HTMLDialogElement>("dialog")?.close();
      game = null;
      go("home");
      track("sign_in_complete", { source: "google" });
    } else if (action === "sign-out") {
      await client.signOut();
      game = null;
      go("home");
    } else if (action === "abandon") {
      const abandonedLevel = !game || game.outcome.kind === "playing"
        ? client.response.active?.level : undefined;
      await client.abandon();
      if (abandonedLevel) track("level_abandon", { hunt_number: abandonedLevel, reason: "explicit" });
      game = null;
      render();
    } else if (action === "reload-cloud") {
      await client.reloadCloud();
      game = null;
      go("home");
    } else if (action === "reload") {
      await initialize();
    }
  });
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (["home", "levels", "academy"].includes(next) && route !== next) go(next);
});
document.addEventListener("visibilitychange", () => {
  lastFrame = 0;
  audio.visibility();
  if (document.hidden) void saveCurrent();
  else if (route === "academy") renderAcademy();
});
window.addEventListener("pagehide", () => {
  if (game && client.response.active)
    client.checkpoint(moveLog, game.activeOrder?.elapsedHours ?? null);
});
window.addEventListener("patrol:sync-change", () => {
  document
    .querySelectorAll(".sync-badge")
    .forEach((el) => (el.outerHTML = syncBadge()));
  if (client?.syncStatus === "conflict") notice(client.syncMessage);
});
window.addEventListener("online", () => {
  client?.retry();
});
setInterval(() => {
  let completed = false;
  document.querySelectorAll<HTMLElement>("[data-deadline]").forEach((el) => {
    const seconds = (Number(el.dataset.deadline) - client.now()) / 1000;
    el.textContent = seconds <= 0 ? "Ready" : duration(seconds);
    if (seconds <= 0) completed = true;
  });
  if (completed && route === "academy" && !busy) {
    audio.effect("ready");
    renderAcademy();
  }
}, 1000);
async function initialize() {
  showLoading("Loading your campaign…");
  try {
    const started = performance.now();
    if (!levels) {
      const responses = await Promise.all(ECONOMY.chapters.map(chapter => fetch(`/data/${chapter.country}-campaign.json`)));
      if (responses.some(response => !response.ok)) throw new Error("Campaign data could not be loaded");
      const chapters = await Promise.all(responses.map(response => response.json()));
      levels = chapters.flatMap(chapter => chapter.levels).sort((a, b) => a.number - b.number);
      client = new ProgressClient(currentWorld, levels, undefined, prepareWorld);
    }
    showLoading("Calling your squads. Restoring your campaign…");
    await client.load();
    if (!appEntryTracked) {
      appEntryTracked = true;
      track("app_open", { width_px: innerWidth, height_px: innerHeight, app_version: "2.0.0" });
    }
    if (location.hash === "#play" && client.response.active) {
      route = restoreGame() ? "play" : "roster";
      if (route === "roster") location.hash = "roster";
    } else
      route = ["levels", "academy"].includes(location.hash.slice(1))
        ? location.hash.slice(1)
        : "home";
    audio.scene(route === "play" ? "pursuit" : "base");
    render();
    if (route === "play") track("game_resume", { source: "refresh" });
    if (client.recoveryMessage) notice(client.recoveryMessage);
    performance.mark("patrol-ready");
    track("campaign_entry", { source: "india_usa_v2", country: chapterForLevel(player().unlocked).country, duration_ms: Math.round(performance.now() - started) });
  } catch (error) {
    track("country_load_error", { reason: "initialization_failed" });
    root.innerHTML = `<main class="loading-screen"><div class="brand">${brand}</div><h1>Let’s reconnect.</h1><p>${escape(errorText(error))}</p>${button("Retry", "reload", "data-network", "button primary")}</main>`;
  }
}
initTelemetry();
void initialize();
