import "./campaign.css";
import "./viewport";
import { ProgressClient } from "./progress-client";
import {
  ECONOMY,
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
import type { PatrolMap } from "./map-view";
import { borderName } from "./game/presentation";
import { initTelemetry, track, gameContext } from "./telemetry";
import type { HintResult } from "./game/hints";
import { HintQuota } from "./game/hint-quota";
import { icon } from "./icons";
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
const duration = (seconds: number) =>
  seconds < 60
    ? `${Math.ceil(seconds)}s`
    : `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
const button = (label: string, action: string, extra = "", css = "button") =>
  `<button type="button" class="${css}" data-action="${action}" ${extra}>${label}</button>`;
const brand = `<span class="brand-icon">${icon("squad")}</span><span>PATROL<small>TACTICAL PURSUIT</small></span>`;
const unitIcon = (id: SquadId) => icon(isSpecialist(id) ? id : "squad");
const targetFile = () => caseForLevel(levelNumber);
let board: CountryBoard,
  levels: Mission[],
  client: ProgressClient,
  navigation: Navigation;
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
let moveFrame = 0,
  lastFrame = 0,
  ended = false,
  award: number | null = null,
  guide = false;
let worker: Worker | null = null,
  hint: HintResult | null = null,
  hintBusy = false,
  hintGeneration = 0;
const quota = new HintQuota();
let moveLog: MissionAttempt["moves"] = [];
let mapGeneration = 0;
const mission = () => levels[levelNumber - 1];
const player = () => client.player;
const toast = () =>
  `<div id="toast" class="toast${message ? " visible" : ""}" role="status">${escape(message)}${message ? button("×", "dismiss", 'aria-label="Dismiss message"', "dismiss") : ""}</div>`;
function notice(text: string) {
  message = text;
  const el = document.querySelector("#toast");
  if (el) el.outerHTML = toast();
}
function errorText(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (["unavailable", "deadline-exceeded"].includes(code))
    return "Could not sync your save. Reconnect and reload to recover your pending changes.";
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
  worker?.terminate();
  worker = null;
  hintBusy = false;
  hintGeneration++;
  map?.destroy();
  map = null;
}
function go(next: string) {
  if (route === "play" && next !== "play" && game) void saveCurrent();
  route = next;
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
function header() {
  return `<header class="site-header"><a href="#home" class="brand" aria-label="Patrol home">${brand}</a><div class="header-actions"><span class="wallet" aria-label="${player().wallet} coins">${icon("coin")} ${money(player().wallet)}</span>${button(icon(client.signedIn ? "check" : "user"), "account", `aria-label="${client.signedIn ? "Account saved" : "Save progress"}"`, "account-button")}</div></header>`;
}
function shell(content: string) {
  root.innerHTML = `${header()}<main class="page" id="page-content">${content}</main>${nav()}<div id="coach-host"></div>${toast()}<div id="modal-host"></div>`;
}
function render() {
  if (!client) return;
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
  shell(`<section class="base-screen"><div class="campaign-heading"><span class="eyebrow">INDIA CAMPAIGN</span><span>${done} / ${ECONOMY.levelCount} ${icon("trophy")}</span></div>
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
    `<div class="page-heading"><span class="eyebrow">INDIA CAMPAIGN</span><h1>The wanted list</h1><p>Tap any case for a preview.</p></div><section class="level-grid" aria-label="India levels">${levels
      .map((l) => {
        const file = caseForLevel(l.number),
          result = p.results[String(l.number)],
          locked = l.number > p.unlocked;
        return `<button type="button" class="level-card ${locked ? "locked" : result ? "completed" : "current"}" data-action="briefing" data-level="${l.number}" aria-label="Level ${l.number}: ${escape(file.name)}${locked ? ", locked preview" : ""}"><span class="level-number">${String(l.number).padStart(2, "0")}</span><img src="/${portraitPath(file)}" alt="" loading="lazy"/><span class="level-status">${icon(locked ? "lock" : result ? "check" : "play")}</span><h2>${escape(file.shortName)}</h2><span class="level-speed">${icon("speed")} ${l.runnerSpeed} km/h</span><small>${result ? `${result.bestMoves} moves · captured` : locked ? `After Level ${l.number - 1}` : "Ready to pursue"}</small></button>`;
      })
      .join(
        "",
      )}</section><div class="future-country">${icon("lock")}<span>Next country · after India</span></div>`,
  );
}
function caseContent(l: Mission, expanded = false) {
  const file = caseForLevel(l.number);
  return `<div class="case-profile"><img src="/${portraitPath(file)}" alt="Illustration of ${escape(file.name)}"/><div><span class="eyebrow">CASE ${String(l.number).padStart(2, "0")} · INDIA</span><h1>${escape(file.shortName)}</h1><div class="speed-badge">${icon("speed")} <b>${l.runnerSpeed}</b> km/h <small>running speed</small></div></div></div>${expanded ? `<p>${escape(file.intro)}</p><p class="fiction-note">Fictional India pursuit. Speed is a game value.</p><a class="source-link" href="${escape(file.source.url)}" target="_blank" rel="noopener noreferrer">Historical case · ${escape(file.source.label)} ${icon("arrow")}</a>` : ""}`;
}
function briefing(level: number) {
  const l = levels[level - 1];
  if (!l) return;
  const locked = level > player().unlocked;
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
    ${training ? `<div class="training-state" data-training="${id}">${icon("clock")}<span>Training · unavailable</span><strong data-deadline="${training.readyAt}">${duration((training.readyAt - client.now()) / 1000)}</strong></div><small class="upgrade-next">${statLabel(id, training.step)} when ready</small>` : unit ? (maxed ? `<div class="training-state">${icon("check")} Fully trained</div>` : `<div class="next-upgrade"><span>${statLabel(id, step)} ${icon("arrow")} <b>${statLabel(id, step + 1)}</b></span><small>${icon("clock")} ${duration(ECONOMY.trainingSeconds[step])}</small></div>${button(`${icon("academy")} Train ${icon("coin")} ${ECONOMY.upgradeCosts[step]}`, "train", `data-id="${id}" data-network ${p.wallet < ECONOMY.upgradeCosts[step] ? "disabled" : ""}`, "button secondary full")}`) : button(locked ? `${icon("lock")} Level ${c.unlock}` : `${icon("plus")} Recruit ${icon("coin")} ${c.price}`, "purchase", `data-id="${id}" data-network ${locked || p.wallet < c.price ? "disabled" : ""}`, "button primary full")}</article>`;
      })
      .join(
        "",
      )}</section><div class="patrol-row">${INITIAL_SQUADS.map((id) => `<div>${unitIcon(id)}<strong>${squadName(id)}</strong><small>${ECONOMY.patrolSpeedKmh} km/h</small></div>`).join("")}</div><p class="fine-print">Training runs while away. Empty deployment slots are allowed.</p>${button(`${icon("play")} Play Level ${p.unlocked}`, "choose", `data-level="${p.unlocked}"`, "button secondary full")}`,
  );
  renderCoach();
}
function renderRoster() {
  const p = player(),
    l = mission();
  shell(`<div class="page-heading"><span class="eyebrow">MISSION BRIEFING</span></div>${caseContent(l)}${button(`${icon("info")} Case file`, "briefing", `data-level="${l.number}"`, "text-button case-link")}
    <div class="section-title"><h2>Deploy your squad</h2><span>${roster.filter(Boolean).length} / 3</span></div><div class="deployment-slots">${roster.map((id, i) => button(id ? `${unitIcon(id)}<strong>${escape(squadName(id))}</strong>${icon("close")}` : `${icon("plus")}<small>Slot ${i + 1}</small>`, "remove-slot", `data-slot="${i}" aria-label="${id ? `Remove ${squadName(id)}` : `Empty slot ${i + 1}`}"`, `deployment-slot ${id ? "filled" : ""}`)).join("")}</div>
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
      )}</section><div class="roster-footer">${button(`${icon("play")} START PURSUIT`, "start", "data-network", "button primary full")}${roster.filter(Boolean).length < 3 ? "<small>Empty slots · you may still play</small>" : ""}${button(`${icon("academy")} Academy`, "academy", "", "text-button")}</div>`);
  renderCoach();
}
function restoreGame() {
  const active = client.response.active;
  if (!active) return;
  levelNumber = active.level;
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
  selectedPost = null;
  selectedSquad = null;
  forecast = null;
  ended = false;
  award = null;
  hint = null;
  guide =
    levelNumber === 1 &&
    needsFieldLesson(player()) &&
    active.selection.every((id, slot) => id === INITIAL_SQUADS[slot]) &&
    game.outcome.kind === "playing" &&
    !!guidedOrder(game);
  gameContext({
    country: "india",
    challenge_id: mission().id,
    hunt_number: levelNumber,
    attempt_id: active.id,
    moves_used: game.ordersUsed,
    moves_left: ECONOMY.maxMoves - game.ordersUsed,
    squad_count: game.squads.length,
    campaign_start_country: "india",
  });
}
async function renderPlay() {
  if (!game || !client.response.active) {
    route = "home";
    render();
    return;
  }
  stopMap();
  const generation = mapGeneration;
  root.innerHTML = `<main class="game-page"><div id="map" role="region" aria-label="India patrol map"></div><header class="game-top topbar">${button(icon("home"), "leave", 'aria-label="Return to base"', "game-back")}<button class="target-hud" data-action="briefing" data-level="${levelNumber}"><img src="/${portraitPath(targetFile())}" alt=""/><span><small>LEVEL ${levelNumber}</small><b>${escape(targetFile().shortName)}</b><small>${game.rules.runnerSpeedKmh} km/h</small></span></button>${button(icon("info"), "help", 'aria-label="How to play"', "help-button")}</header><div class="metrics"><strong id="moves-left">${ECONOMY.maxMoves - game.ordersUsed}</strong><span>MOVES</span></div><div class="game-tools map-toolbar">${button(icon("focus"), "find", 'aria-label="Find fugitive"', "map-tool")}${button(icon("fit"), "country-view", 'aria-label="Country view"', "map-tool")}${button(icon("hint"), "hint", 'aria-label="Hint"', "map-tool")}</div><div class="game-note" id="game-note"></div><section class="squad-dock" aria-label="Deployed squads"><div class="dock-heading"><span id="selected-label">Choose a squad</span>${button(icon("close"), "clear", 'aria-label="Clear selection"', "text-button")}</div><div id="game-squads" class="game-squads"></div><div class="journey" id="journey"></div><div id="deploy-control"></div></section><div id="coach-host"></div><section class="result-panel" id="result-panel" hidden></section>${toast()}<div id="modal-host"></div></main>`;
  const { PatrolMap: MapView } = await import("./map-view");
  if (generation !== mapGeneration || route !== "play" || !game) return;
  map = new MapView(
    board,
    (index) => selectPost(index),
    (fallback) => {
      if (fallback)
        notice("Basemap unavailable. Gameplay borders remain visible.");
    },
  );
  map.setTarget(targetFile().name, `/${portraitPath(targetFile())}`);
  map.renderState(game, selectedPost);
  map.startView(game);
  renderHUD();
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
    : selectedSquad === null
      ? "1 · Choose a squad"
      : selectedPost === null
        ? "2 · Choose a free post"
        : `Post ${selectedPost + 1} · ${borderName(board.borders[selectedPost])}`;
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
  note.textContent =
    hint?.kind === "winning"
      ? `Hint: Squad ${String.fromCharCode(65 + hint.orders[0].squad)} → Post ${hint.orders[0].border + 1}`
      : hint?.kind === "survival"
        ? `Try Squad ${String.fromCharCode(65 + hint.order.squad)} → Post ${hint.order.border + 1}`
        : "";
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
  if (order && !game.activeOrder && selectedSquad === order.squad)
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
      `Choose highlighted Squad ${String.fromCharCode(65 + order.squad)}, or skip the guide.`,
    );
    return;
  }
  selectedSquad = index;
  selectedPost = null;
  forecast = null;
  hint = null;
  renderHUD();
  if (order) map?.revealPost(order.border);
  else map?.revealSquad(game.squads[index].actor.position);
}
function selectPost(index: number) {
  if (!game || game.activeOrder || game.outcome.kind !== "playing") return;
  if (selectedSquad === null) {
    notice("Choose a squad below first.");
    return;
  }
  const order = guide ? guidedOrder(game) : null;
  if (order && index !== order.border) {
    notice(`Choose highlighted Post ${order.border + 1}, or skip the guide.`);
    return;
  }
  const preview = forecastOrder(game, selectedSquad, index);
  if (!preview) {
    notice("Choose an unguarded post.");
    return;
  }
  selectedPost = index;
  forecast = preview;
  hint = null;
  renderHUD();
  map?.showForecast(preview);
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
  moveLog.push({ squad: index, border: selectedPost });
  const move = game.history.at(-1)!;
  track("move_issued", {
    squad: index,
    post: selectedPost,
    from_post: move.from,
    distance_km: Math.round(move.distanceKm),
  });
  if (move.flight)
    track("helicopter_deploy", { squad: index, post: selectedPost });
  selectedPost = null;
  selectedSquad = null;
  hint = null;
  worker?.terminate();
  worker = null;
  hintBusy = false;
  hintGeneration++;
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
      else void saveCurrent();
    }
  };
  moveFrame = requestAnimationFrame(frame);
}
async function saveCurrent() {
  if (!game || !client.response.active || busy) return;
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
    track("guide_complete", { duration_ms: 0 });
  }
  showResult(won);
  if (won) {
    try {
      const response = await client.finish(moveLog);
      award = response.reward;
      track("reward_awarded", { amount: award, hunt_number: levelNumber });
      showResult(true);
      await maybePrompt();
    } catch (error) {
      award = null;
      showResult(true);
      notice(errorText(error));
    }
  } else await saveCurrent();
}
function showResult(won: boolean) {
  const panel = document.querySelector<HTMLElement>("#result-panel");
  if (!panel || !game) return;
  panel.hidden = false;
  const previous = player().results[String(levelNumber)];
  panel.innerHTML = `<img class="capture-portrait" src="/${portraitPath(targetFile())}" alt=""/><span class="eyebrow">${won ? "ASSIGNMENT COMPLETE" : "REGROUP AND RETRY"}</span><h1>${won ? `${escape(targetFile().shortName)} captured` : "They got away"}</h1><p>${won ? `Captured in ${game.ordersUsed} moves. ${previous ? `Your best: ${previous.bestMoves} moves.` : ""}` : game.outcome.kind === "lost" && game.outcome.reason === "budget" ? "Your moves are up. Train your specialists or try a different approach." : "The fugitive crossed a land exit. A faster response could make the difference."}</p>${won ? `<div class="reward-display">${award === null ? "Confirming reward…" : `+ ${icon("coin")} ${money(award)}`}</div><small>${award === 0 ? "No extra money: beat your best move count and reach a higher reward tier." : "This result is saved with your campaign."}</small>` : ""}<div class="result-actions">${won && award === null ? button("Retry saving result", "retry-award", "data-network", "button primary full") : won && levelNumber < ECONOMY.levelCount ? button("Next level →", "next", "", "button primary full") : button(won ? "India complete · View levels" : "Choose squads and retry", "retry", "", "button primary full")}${button(`${icon("academy")} Academy`, "academy", "", "text-button")}${button("Home", "home", "", "text-button")}</div>`;
  renderCoach();
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
      ? `${targetFile().shortName} runs at ${mission().runnerSpeed} km/h. Tap the highlighted squad to fill a slot.`
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
        "Your old border opens on departure. The new border closes on arrival. Time pauses after the move.";
    } else if (selectedSquad === null) {
      selector = `[data-action="select-squad"][data-squad="${order.squad}"]`;
      title = `Choose Squad ${String.fromCharCode(65 + order.squad)}`;
      body = "Select a squad before choosing where it should go.";
    } else if (selectedPost === null) {
      selector = `[data-border="${order.border}"]`;
      title = `Close Post ${order.border + 1}`;
      body =
        "Tap the glowing post. Guarded borders block the fugitive’s land escape.";
    } else {
      selector = '[data-action="deploy"]';
      title = "Read the chase, then deploy";
      body =
        "Blue is your squad; gold is the fugitive’s exact next path. Deploy uses one move. Faster squads give the fugitive less travel time.";
    }
    step = `FIRST CAPTURE · MOVE ${game.activeOrder ? game.ordersUsed : game.ordersUsed + 1} / ${game.setup.witness.length}`;
    coachLesson = "field";
  } else if (academyLesson(player()) && !(route === "play" && !game?.won)) {
    const phase = academyLesson(player());
    coachLesson = "academy";
    step = "LEVEL 3 · RAPID ACTION";
    if (route !== "academy") {
      selector = '[data-action="academy"]';
      title = "A faster squad is unlocked";
      body =
        "Open the Academy. Your first two wins cover a Rapid Action recruit and its first upgrade.";
    } else if (phase === "purchase") {
      selector = '[data-action="purchase"][data-id="rapid"]';
      title = "Recruit Rapid Action";
      body = `Spend ${ECONOMY.catalog.rapid.price} coins to own it. Each specialist is purchased once.`;
    } else if (phase === "train") {
      selector = '[data-action="train"][data-id="rapid"]';
      title = "Start your first upgrade";
      body = `${ECONOMY.upgradeCosts[0]} coins + ${ECONOMY.trainingSeconds[0]} seconds. Speed rises from ${ECONOMY.rapidSpeeds[0]} to ${ECONOMY.rapidSpeeds[1]} km/h.`;
    } else {
      selector = '[data-unit="rapid"]';
      title =
        player().squads.rapid?.training &&
        player().squads.rapid!.training!.readyAt > client.now()
          ? "Training is underway"
          : "Upgrade ready";
      body =
        "A training squad cannot deploy. The timer continues while away. When ready, select Rapid Action in your roster. Further upgrades unlock in order.";
      done = true;
    }
  }
  if (!coachLesson) {
    coachKey = "";
    return;
  }
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  target.classList.add("coach-target");
  target.setAttribute("aria-describedby", "coach-copy");
  host.innerHTML = `<aside class="coach" aria-label="Tutorial" data-lesson="${coachLesson}" aria-live="polite"><div class="coach-top"><span>${icon("compass")} ${step}</span>${button("Skip", "skip-guide", "", "text-button")}</div><h2>${title}</h2><p id="coach-copy">${body}</p>${done ? button("Got it · ready to play", "lesson-done", "", "button primary full") : ""}</aside>`;
  const key = `${route}:${selector}:${title}`;
  if (key !== coachKey) {
    coachKey = key;
    if (target instanceof HTMLButtonElement)
      target.focus({ preventScroll: true });
    if (route !== "play")
      target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
async function hintAction() {
  if (!game || game.activeOrder || game.outcome.kind !== "playing" || hintBusy)
    return;
  const availability = quota.status();
  if (!availability.remaining) {
    notice(`Hints refill in ${duration(availability.remainingMs / 1000)}.`);
    return;
  }
  hintBusy = true;
  const hintStarted = performance.now();
  track("hint_request", { hints_remaining: availability.remaining });
  notice("Checking the current position…");
  const generation = ++hintGeneration;
  worker?.terminate();
  worker = new Worker(new URL("./hint.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event) => {
    if (generation !== hintGeneration) return;
    hintBusy = false;
    if (event.data.result) {
      hint = event.data.result;
      if (hint?.kind === "winning" || hint?.kind === "survival")
        quota.consume();
      track("hint_result", {
        hint_kind: hint?.kind ?? "none",
        duration_ms: Math.round(performance.now() - hintStarted),
        hints_remaining: quota.status().remaining,
      });
      notice(
        hint?.kind === "none"
          ? "No verified recommendation found. Try training or a different roster."
          : "Hint ready.",
      );
      renderHUD();
    } else notice("A hint could not be calculated.");
    worker?.terminate();
    worker = null;
  };
  worker.onerror = () => {
    hintBusy = false;
    notice("A hint could not be calculated.");
    worker?.terminate();
    worker = null;
  };
  worker.postMessage({ kind: "board", board });
  worker.postMessage({
    kind: "search",
    setup: game.setup,
    rules: game.rules,
    snapshot: game.snapshot(),
  });
}
function modal(content: string) {
  const host = document.querySelector("#modal-host")!;
  host.innerHTML = `<dialog class="modal"><form method="dialog">${button("×", "close-modal", 'aria-label="Close"', "modal-close")}${content}</form></dialog>`;
  host.querySelector("dialog")!.showModal();
}
function accountModal() {
  modal(
    `<span class="eyebrow">KEEP YOUR CAMPAIGN</span><h2>${client.signedIn ? "Progress saved." : "Your next move. On any device."}</h2><p>${client.signedIn ? "Your campaign, squads and training are saved to your account." : "Sign in with Google to continue your campaign on another device. You can keep playing as a guest."}</p>${button(client.signedIn ? "Sign out" : "Continue with Google", client.signedIn ? "sign-out" : "google", "data-network", "button primary full")}${button("Keep playing", "close-modal", "", "text-button full")}`,
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

root.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-action]",
  );
  if (!target || target.disabled) return;
  const action = target.dataset.action;
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
  if (action === "help") {
    modal(
      `<span class="eyebrow">FIELD MANUAL</span><h2>Close every way out.</h2><p>Choose a squad, then a free post. Preview the paths and press Deploy. Its old border opens as it leaves; the new border is guarded on arrival. Gold shows the fugitive’s predicted path, including turns when borders close. The fugitive moves during each of your ${ECONOMY.maxMoves} moves. Thinking time is paused.</p><p>Rapid Action moves faster. Helicopters deploy from reserve and guard temporarily. Marksman fires only while stationed. Training makes squads unavailable, but you may play with empty slots.</p>${button("Got it", "close-modal", "", "button primary full")}`,
    );
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
        notice(`Choose highlighted ${squadName(expected)}, or skip the guide.`);
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
    hint = null;
    renderHUD();
    return;
  }
  if (action === "skip-guide" || action === "lesson-done") {
    const lesson = coachLesson;
    if (!lesson) return;
    guide = false;
    void run(async () => {
      await client.action({ kind: "tutorial", lesson });
      track(
        action === "skip-guide" ? "guide_skip" : "guide_complete",
        action === "skip-guide" ? { reason: "manual" } : { duration_ms: 0 },
      );
      if (route === "play") renderHUD();
      else render();
    });
    return;
  }
  if (action === "find") {
    if (game) map?.revealSquad(game.runner.position);
    return;
  }
  if (action === "country-view") {
    map?.fitCountry();
    return;
  }
  if (action === "hint") {
    void hintAction();
    return;
  }
  if (action === "leave") {
    go("home");
    return;
  }
  void run(async () => {
    if (action === "purchase" || action === "train") {
      const squad = target.dataset.id as Specialist;
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
      });
      renderAcademy();
      await maybePrompt();
    } else if (action === "start") {
      if (
        levelNumber === 1 &&
        needsFieldLesson(player()) &&
        INITIAL_SQUADS.some((id) => !roster.includes(id))
      ) {
        notice(
          "Choose all three Patrol squads to follow the guide, or skip guidance.",
        );
        return;
      }
      await client.start(levelNumber, roster);
      restoreGame();
      go("play");
      track("level_start", { entry: "roster", level_name: mission().id });
    } else if (action === "resume") {
      await client.load();
      restoreGame();
      go("play");
      track("game_resume", { source: "home" });
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
    } else if (action === "retry-award") {
      const response = await client.finish(moveLog);
      award = response.reward;
      showResult(true);
      await maybePrompt();
    } else if (action === "abandon") {
      await client.abandon();
      game = null;
      render();
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
  if (document.hidden) void saveCurrent();
  else if (route === "academy") renderAcademy();
});
window.addEventListener("pagehide", () => {
  if (game && client.response.active)
    client.checkpoint(moveLog, game.activeOrder?.elapsedHours ?? null);
});
window.addEventListener("online", () => {
  notice("Connection restored. Reload to recover pending changes.");
});
setInterval(() => {
  let completed = false;
  document.querySelectorAll<HTMLElement>("[data-deadline]").forEach((el) => {
    const seconds = (Number(el.dataset.deadline) - client.now()) / 1000;
    el.textContent = seconds <= 0 ? "Ready" : duration(seconds);
    if (seconds <= 0) completed = true;
  });
  if (completed && route === "academy" && !busy) renderAcademy();
}, 1000);
async function initialize() {
  showLoading("Loading the India map…");
  try {
    const started = performance.now();
    if (!board) {
      const [b, c] = await Promise.all([
        fetch("/data/india.json"),
        fetch("/data/india-campaign.json"),
      ]);
      if (!b.ok || !c.ok) throw new Error("Campaign data could not be loaded");
      board = await b.json();
      levels = (await c.json()).levels;
      navigation = new Navigation(board);
      client = new ProgressClient(board, levels, navigation);
    }
    showLoading("Calling your squads. Restoring your campaign…");
    await client.load();
    if (location.hash === "#play" && client.response.active) {
      restoreGame();
      route = "play";
    } else
      route = ["levels", "academy"].includes(location.hash.slice(1))
        ? location.hash.slice(1)
        : "home";
    render();
    performance.mark("patrol-ready");
    track("campaign_entry", { source: "india_v2" });
    track("country_load_success", {
      duration_ms: Math.round(performance.now() - started),
      country: "india",
      setup_count: ECONOMY.levelCount,
      border_count: board.borders.length,
    });
  } catch (error) {
    root.innerHTML = `<main class="loading-screen"><div class="brand">${brand}</div><h1>Let’s reconnect.</h1><p>${escape(errorText(error))}</p>${button("Retry", "reload", "data-network", "button primary")}</main>`;
  }
}
initTelemetry();
track("app_open", {
  width_px: innerWidth,
  height_px: innerHeight,
  app_version: "2.0.0",
});
void initialize();
