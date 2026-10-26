import "./campaign.css";
import "./viewport";
import { ProgressClient } from "./progress-client";
import {
  ECONOMY,
  INITIAL_SQUADS,
  isSpecialist,
  readySquad,
  squadName,
  squadSymbol,
  statsFor,
  type Specialist,
  type SquadId,
} from "./game/collection";
import { PatrolGame } from "./game/engine";
import { Navigation } from "./game/navigation";
import type { CountryBoard } from "./game/types";
import type { Mission, MissionAttempt } from "./game/missions";
import type { PatrolMap } from "./map-view";
import { borderName } from "./game/presentation";
import { initTelemetry, track, gameContext } from "./telemetry";
import type { HintResult } from "./game/hints";
import { HintQuota } from "./game/hint-quota";

const root = document.querySelector<HTMLDivElement>("#app")!;
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
  `<button class="${css}" data-action="${action}" ${extra}>${label}</button>`;
const brand = `<span class="brand-icon">✦</span><span>PATROL<small>CLOSE THE NET</small></span>`;
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
  selectedPost: number | null = null;
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
  if (
    [
      "functions/unavailable",
      "functions/not-found",
      "functions/internal",
      "functions/deadline-exceeded",
    ].includes(code)
  )
    return "Progress service is unavailable. Your last confirmed save is safe. Retry when connected.";
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
    ["home", "⌂", "Home"],
    ["levels", "▦", "Levels"],
    ["academy", "↗", "Academy"],
  ]
    .map(([name, symbol, label]) =>
      button(
        `<span>${symbol}</span>${label}`,
        name,
        `aria-current="${route === name ? "page" : "false"}"`,
        route === name ? "nav-item active" : "nav-item",
      ),
    )
    .join("")}</nav>`;
}
function header() {
  return `<header class="site-header"><a href="#home" class="brand" aria-label="Patrol home">${brand}</a><div class="header-actions"><span class="wallet" aria-label="${player().wallet} money"><span>◈</span> ${money(player().wallet)}</span>${button(client.signedIn ? "Saved ✓" : "Save progress", "account", "", "account-button")}</div></header>`;
}
function shell(content: string) {
  root.innerHTML = `${header()}<main class="page" id="page-content">${content}</main>${nav()}${toast()}<div id="modal-host"></div>`;
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
    done = Object.keys(p.results).length,
    training = Object.values(p.squads).filter((s) => s?.training).length;
  const next = Math.min(ECONOMY.levelCount, p.unlocked),
    nextMission = levels[next - 1];
  shell(
    `<div class="eyebrow section-eyebrow"><i></i> INDIA CAMPAIGN · FIELD OPERATIONS</div><section class="hero"><div class="hero-copy"><span class="eyebrow muted">YOUR NEXT ASSIGNMENT</span><h1>Think ahead.<br>Close the <em>net.</em></h1><p>Command your squads across India. Cut off the escape. Build a force that gets there first.</p><div class="hero-actions">${button(client.response.active ? "Resume level →" : `Play Level ${next} →`, client.response.active ? "resume" : "choose", `data-level="${next}"`, "button primary")}${button("Explore levels", "levels", "", "text-button")}</div></div><div class="hero-map" aria-hidden="true"><svg viewBox="0 0 400 410"><defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#b3b98d" stroke-width=".4" opacity=".2"/></pattern></defs><rect width="400" height="410" fill="url(#grid)"/><path class="india-shape" d="M151 26L190 38 215 25 225 54 205 75 230 100 225 122 253 142 288 149 312 132 344 126 362 143 334 163 316 179 299 166 278 183 251 195 243 226 220 256 215 285 197 316 181 353 169 378 157 358 151 326 136 306 130 276 112 260 115 232 94 217 72 193 57 176 78 159 109 171 122 148 139 144 145 120 159 105 145 87 155 66 139 49Z"/><g class="map-lines"><path d="M109 171L168 181 205 151 253 142M115 232L171 215 205 151M130 276L191 257 243 226M168 181L171 215 191 257 181 353M145 120L205 151M171 215L251 195"/></g><circle cx="171" cy="215" r="67" class="radar"/><circle cx="171" cy="215" r="102" class="radar outer"/><circle cx="171" cy="215" r="7" fill="#efb85d"/><circle cx="205" cy="151" r="6" fill="#d7dfb8"/><circle cx="130" cy="276" r="6" fill="#d7dfb8"/><circle cx="243" cy="226" r="6" fill="#d7dfb8"/></svg><span class="map-tag">OPERATIONS / INDIA</span><span class="map-coordinate">20.5937° N &nbsp; 78.9629° E</span></div></section><section class="progress-overview"><div><span class="eyebrow muted">CAMPAIGN PROGRESS</span><strong>${String(done).padStart(2, "0")} <span>/ ${ECONOMY.levelCount} levels</span></strong></div><div class="progress-track"><span style="width:${(done / ECONOMY.levelCount) * 100}%"></span></div><p>${done === ECONOMY.levelCount ? "India complete. Replay to improve your records." : `Next up · ${escape(nextMission.title)}`}</p></section>${client.response.active ? `<div class="saved-attempt"><span>Saved assignment · Level ${client.response.active.level}</span>${button("Abandon saved level", "abandon", "data-network", "text-button")}</div>` : ""}<section class="home-cards"><button class="feature-card" data-action="academy"><span class="card-icon">↗</span><div><span class="eyebrow muted">BUILD YOUR ADVANTAGE</span><h2>Training academy</h2><p>${training ? `${training} squad${training === 1 ? "" : "s"} in training` : "Recruit specialists. Train for the next challenge."}</p></div><span class="arrow">↗</span></button><button class="feature-card" data-action="levels"><span class="card-icon">▦</span><div><span class="eyebrow muted">ONE LEVEL AT A TIME</span><h2>The road ahead</h2><p>${ECONOMY.levelCount} assignments. An increasingly difficult pursuit.</p></div><span class="arrow">↗</span></button></section><p class="home-footer">A strategy game on the real map. <span>One move can change everything.</span></p>`,
  );
}
function renderLevels() {
  const p = player();
  shell(
    `<div class="page-heading"><span class="eyebrow">THE CAMPAIGN</span><h1>Across <em>India.</em></h1><p>Each win opens the next assignment. Return to earlier levels to beat your move count.</p></div><div class="campaign-banner"><span>01 / INDIA</span><span>${Object.keys(p.results).length} OF ${ECONOMY.levelCount} COMPLETE</span></div><section class="level-grid" aria-label="India levels">${levels
      .map((l) => {
        const result = p.results[String(l.number)],
          locked = l.number > p.unlocked;
        return `<button class="level-card ${locked ? "locked" : result ? "completed" : "current"}" data-action="choose" data-level="${l.number}" ${locked ? "disabled" : ""}><span class="level-top"><span class="level-number">${String(l.number).padStart(2, "0")}</span><span class="level-status">${locked ? "LOCKED" : result ? "COMPLETE ✓" : "AVAILABLE"}</span></span><h2>${escape(l.title)}</h2><p>${locked ? `Complete Level ${l.number - 1}` : result ? `Best: ${result.bestMoves} moves` : `${ECONOMY.maxMoves} moves · ${l.recommended.some((s) => isSpecialist(s.id)) ? "Specialist tactics" : "Patrol basics"}`}</p><div class="level-bottom"><span>◈ ${money((ECONOMY.baseReward + (l.number - 1) * ECONOMY.rewardStep) * 3)} <small>max total</small></span><span>${locked ? "◇" : "→"}</span></div></button>`;
      })
      .join(
        "",
      )}</section><div class="future-country"><span class="card-icon">⌁</span><div><h2>Beyond India</h2><p>New countries follow in sequence. More campaigns are coming.</p></div><span class="badge">COMING LATER</span></div>`,
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
    `<div class="page-heading"><span class="eyebrow">THE TRAINING ACADEMY</span><h1>A stronger <em>response.</em></h1><p>One of each specialist. Train them step by step. Choose the right force for every level.</p></div><div class="section-title"><h2>Specialist squads</h2><span>YOUR MONEY &nbsp; ◈ ${money(p.wallet)}</span></div><section class="academy-grid">${(
      Object.entries(ECONOMY.catalog) as [
        Specialist,
        (typeof ECONOMY.catalog)[Specialist],
      ][]
    )
      .map(([id, c]) => {
        const unit = p.squads[id],
          locked = p.unlocked < c.unlock,
          step = unit?.step ?? 0,
          training = unit?.training,
          maxed = step === ECONOMY.upgradeCosts.length;
        return `<article class="squad-card ${locked ? "locked" : ""}"><div class="squad-card-top"><span class="specialist-icon ${id}">${c.symbol}</span><span class="badge">${locked ? `LEVEL ${c.unlock}` : unit ? `UPGRADE ${step} / ${ECONOMY.upgradeCosts.length}` : "AVAILABLE"}</span></div><h2>${c.name}</h2><p>${c.description}</p><div class="stat-line">${statLabel(id, step)}</div><div class="upgrade-track" aria-label="${step} upgrades complete">${Array.from({ length: ECONOMY.upgradeCosts.length + 1 }, (_, i) => `<span class="${i <= step && unit ? "filled" : ""}"></span>`).join("")}</div>${training ? `<div class="training-state"><span class="training-dot"></span>Training step ${training.step}<strong data-deadline="${training.readyAt}">${duration((training.readyAt - client.now()) / 1000)}</strong></div>` : unit ? (maxed ? `<div class="training-state">Fully trained <strong>✓</strong></div>` : `<div class="next-upgrade"><span>Next: ${statLabel(id, step + 1)}</span><small>${duration(ECONOMY.trainingSeconds[step])} training · unavailable while training</small></div>${button(`Train · ◈ ${money(ECONOMY.upgradeCosts[step])}`, "train", `data-id="${id}" data-network ${p.wallet < ECONOMY.upgradeCosts[step] ? "disabled" : ""}`, "button secondary full")}`) : button(locked ? `Unlocks at Level ${c.unlock}` : `Recruit · ◈ ${money(c.price)}`, "purchase", `data-id="${id}" data-network ${locked || p.wallet < c.price ? "disabled" : ""}`, "button primary full")}</article>`;
      })
      .join(
        "",
      )}</section><div class="section-title"><h2>Your starting force</h2><span>ALWAYS OWNED</span></div><div class="patrol-row">${INITIAL_SQUADS.map((id) => `<div><span class="unit-badge">◆</span><strong>${squadName(id)}</strong><small>Standard border guarding</small></div>`).join("")}</div><p class="fine-print">Training continues while you are away. You can start a level with empty slots while squads train.</p>`,
  );
}
function renderRoster() {
  const p = player(),
    l = mission();
  shell(
    `<div class="page-heading"><span class="eyebrow">INDIA / LEVEL ${l.number}</span><h1>${escape(l.title)}<em>.</em></h1><p>${escape(l.briefing)}</p></div><div class="mission-summary"><span>${ECONOMY.maxMoves} MOVES</span><span>◈ ${money((ECONOMY.baseReward + (l.number - 1) * ECONOMY.rewardStep) * 3)} MAX REWARD</span></div><div class="section-title"><h2>Choose your squads</h2><span>${roster.filter(Boolean).length} / 3 SELECTED</span></div><p class="muted">Tap a selected squad to leave its slot empty. Tap a ready squad to add it.</p><div class="deployment-slots">${roster.map((id, i) => button(id ? `<span>${squadSymbol(id)}</span><strong>${escape(squadName(id))}</strong><small>Remove from slot ${i + 1}</small>` : `<span>＋</span><strong>Empty slot ${i + 1}</strong><small>Optional</small>`, "remove-slot", `data-slot="${i}"`, "deployment-slot")).join("")}${ECONOMY.futureSlots.map((n) => `<div class="deployment-slot future"><span>◇</span><strong>Level ${n}</strong><small>Future slot purchase</small></div>`).join("")}</div><section class="roster-list" aria-label="Owned squads">${(
      Object.keys(p.squads) as SquadId[]
    )
      .map((id) => {
        const unit = p.squads[id]!,
          ready = readySquad(p, id, client.now()),
          selected = roster.includes(id);
        return button(
          `<span class="unit-badge ${isSpecialist(id) ? id : ""}">${squadSymbol(id)}</span><span><strong>${escape(squadName(id))}</strong><small>${!ready ? "In training" : statLabel(id, unit.step)}</small></span><span class="roster-check">${selected ? "✓" : ready ? "＋" : "◷"}</span>`,
          "add-squad",
          `data-id="${id}" ${!ready ? "disabled" : ""} aria-pressed="${selected}"`,
          selected ? "roster-row selected" : "roster-row",
        );
      })
      .join(
        "",
      )}</section><div class="roster-footer"><p>${roster.filter(Boolean).length < 3 ? "You are choosing to start with empty slots." : "Ground squads start on posts. Helicopters wait in reserve."}</p>${button("Start level →", "start", "data-network", "button primary full")}${button("Back to levels", "levels", "", "text-button full")}</div>`,
  );
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
  ended = false;
  award = null;
  hint = null;
  guide =
    levelNumber === 1 &&
    active.selection.every((id, slot) => id === INITIAL_SQUADS[slot]) &&
    !player().results["1"] &&
    localStorage.getItem("patrol:guide:v2") !== "skip" &&
    game.outcome.kind === "playing";
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
  root.innerHTML = `<main class="game-page"><div id="map" role="region" aria-label="India patrol map"></div><header class="game-top topbar">${button("‹ Home", "leave", "", "game-back")}<span>INDIA <b>/ LEVEL ${levelNumber}</b></span>${button("?", "help", 'aria-label="How to play"', "help-button")}</header><div class="metrics"><strong id="moves-left">${ECONOMY.maxMoves - game.ordersUsed}</strong><span>MOVES LEFT</span></div><div class="game-tools">${button("Find fugitive", "find", "", "map-tool")}${button("Country view", "country-view", "", "map-tool")}${button("Hint", "hint", "", "map-tool")}</div><div class="game-note" id="game-note"></div><section class="squad-dock" aria-label="Deployed squads"><div class="dock-heading"><span id="selected-label">Select a border post</span>${button("Clear", "clear", "", "text-button")}</div><div id="game-squads" class="game-squads"></div><div class="journey" id="journey"></div></section><section class="result-panel" id="result-panel" hidden></section>${toast()}<div id="modal-host"></div></main>`;
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
  const selectedLabel = document.querySelector("#selected-label")!;
  selectedLabel.textContent =
    selectedPost === null
      ? "Select a border post"
      : `Post ${selectedPost + 1} · ${borderName(board.borders[selectedPost])}`;
  const active = client.response.active!;
  const ids = active.selection.filter((id): id is SquadId => id !== null);
  const guideMove = guide ? mission().witness[game.ordersUsed] : null;
  document.querySelector("#game-squads")!.innerHTML = ids.length
    ? ids
        .map((id, index) => {
          const squad = game!.squads[index],
            stats = game!.rules.units![index],
            path =
              selectedPost === null
                ? null
                : game!.previewOrder(index, selectedPost);
          const border = squad.border;
          const label =
            stats.kind === "helicopter"
              ? border === null
                ? "In reserve"
                : `${squad.guardLeft} moves guarding`
              : border === null
                ? "Relocating"
                : `Post ${border + 1}`;
          const guideTarget =
            guideMove &&
            guideMove.squad === index &&
            selectedPost === guideMove.border;
          return button(
            `<span class="unit-badge ${stats.kind}">${squadSymbol(id)}</span><strong>${escape(squadName(id))}</strong><small>${escape(label)}</small>${selectedPost !== null ? `<b>${path ? (stats.kind === "helicopter" ? "Deploy →" : "Move →") : "Unavailable"}</b>` : ""}`,
            "move",
            `data-squad="${index}" ${game!.activeOrder || game!.outcome.kind !== "playing" || (selectedPost !== null && !path) ? "disabled" : ""}`,
            `game-squad${guideTarget ? " guided" : ""}`,
          );
        })
        .join("")
    : `<p class="empty-roster">No squads selected. Return home to choose a roster.</p>`;
  document.querySelector("#journey")!.textContent = game.activeOrder
    ? `${game.activeOrder.flight ? "Deploying" : "Squad moving"} · Fugitive is moving`
    : "Thinking time is paused. Each move advances the pursuit.";
  const note = document.querySelector("#game-note")!;
  note.innerHTML =
    guide && guideMove
      ? `<span>FIELD TRAINING</span> ${selectedPost === guideMove.border ? `Choose squad ${String.fromCharCode(65 + guideMove.squad)} below.` : `Select highlighted Post ${guideMove.border + 1}.`} ${button("Skip guide", "skip-guide", "", "text-button")}`
      : hint?.kind === "winning"
        ? `Verified winning move: choose squad ${String.fromCharCode(65 + hint.orders[0].squad)} and Post ${hint.orders[0].border + 1}.`
        : hint?.kind === "survival"
          ? `Try squad ${String.fromCharCode(65 + hint.order.squad)} to Post ${hint.order.border + 1}. This is a survival suggestion.`
          : "";
  map.renderState(game, selectedPost);
  if (guideMove && !game.activeOrder)
    document
      .querySelector(`[data-border="${guideMove.border}"]`)
      ?.classList.add("guided");
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
}
function selectPost(index: number) {
  if (!game || game.activeOrder || game.outcome.kind !== "playing") return;
  const guidedMove = guide ? mission().witness[game.ordersUsed] : null;
  if (guidedMove && index !== guidedMove.border) {
    notice(
      `Follow the guide to Post ${guidedMove.border + 1}, or skip guidance.`,
    );
    return;
  }
  selectedPost = index;
  hint = null;
  renderHUD();
  map?.revealPost(index);
}
function issueMove(index: number) {
  if (!game || !map || game.activeOrder || game.outcome.kind !== "playing")
    return;
  if (selectedPost === null) {
    const squad = game.squads[index];
    map.revealSquad(squad.actor.position);
    notice("Select a free border post first.");
    return;
  }
  const guidedMove = guide ? mission().witness[game.ordersUsed] : null;
  if (
    guidedMove &&
    (guidedMove.squad !== index || guidedMove.border !== selectedPost)
  )
    return;
  if (!game.issueOrder(index, selectedPost)) return;
  moveLog.push({ squad: index, border: selectedPost });
  track("move_issued", {
    squad: index,
    post: selectedPost,
    from_post: game.history.at(-1)!.from,
    distance_km: Math.round(game.history.at(-1)!.distanceKm),
  });
  if (game.history.at(-1)?.flight)
    track("helicopter_deploy", { squad: index, post: selectedPost });
  selectedPost = null;
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
    const rate = Math.max(
      ECONOMY.playbackScale / 3600,
      active.durationHours / ECONOMY.maximumPlaybackSeconds,
    );
    game.advanceHours(elapsed * rate);
    map?.renderActors(game);
    if (game.activeOrder) moveFrame = requestAnimationFrame(frame);
    else {
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
    localStorage.setItem("patrol:guide:v2", "complete");
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
  panel.innerHTML = `<span class="eyebrow">${won ? "ASSIGNMENT COMPLETE" : "REGROUP AND RETRY"}</span><h1>${won ? "Case closed." : "They got away."}</h1><p>${won ? `Captured in ${game.ordersUsed} moves. ${previous ? `Your best: ${previous.bestMoves} moves.` : ""}` : game.outcome.kind === "lost" && game.outcome.reason === "budget" ? "Your moves are up. Train your specialists or try a different approach." : "The fugitive crossed a land exit. A faster response could make the difference."}</p>${won ? `<div class="reward-display">${award === null ? "Confirming reward…" : `+ ◈ ${money(award)}`}</div><small>${award === 0 ? "No extra money: beat your best move count and reach a higher reward tier." : "Rewards are confirmed against your saved move history."}</small>` : ""}<div class="result-actions">${won && award === null ? button("Retry saving result", "retry-award", "data-network", "button primary full") : won && levelNumber < ECONOMY.levelCount ? button("Next level →", "next", "", "button primary full") : button(won ? "India complete · View levels" : "Choose squads and retry", "retry", "", "button primary full")}${button("Training academy", "academy", "", "text-button")}${button("Home", "home", "", "text-button")}</div>`;
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
      track("hint_result", { hint_kind: hint?.kind ?? "none", duration_ms: Math.round(performance.now() - hintStarted), hints_remaining: quota.status().remaining });
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
    `<span class="eyebrow">KEEP YOUR CAMPAIGN</span><h2>${client.signedIn ? "Progress saved." : "Your next move. On any device."}</h2><p>${client.signedIn ? "Your campaign, squads and training are saved to your account." : "Sign in with Google to continue your campaign on another device. You can keep playing as a guest."}</p>${button(client.signedIn ? "Sign out" : "Continue with Google", client.signedIn ? "sign-out" : "google", 'type="button" data-network', "button primary full")}${button("Keep playing", "close-modal", "", "text-button full")}`,
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
    return;
  }
  if (action === "account") {
    accountModal();
    return;
  }
  if (action === "help") {
    modal(
      `<span class="eyebrow">FIELD MANUAL</span><h2>Close every way out.</h2><p>Select a border post, then a squad. Its old border opens as it leaves; the new border is guarded on arrival. The fugitive moves during each of your ${ECONOMY.maxMoves} moves. Thinking time is paused.</p><p>Rapid Action moves faster. Helicopters deploy from reserve and guard temporarily. Marksman fires only while stationed. Training makes squads unavailable, but you may play with empty slots.</p>${button("Got it", "close-modal", "", "button primary full")}`,
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
    roster = player().selection.map((id) =>
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
  if (action === "move") {
    issueMove(Number(target.dataset.squad));
    return;
  }
  if (action === "clear") {
    selectedPost = null;
    hint = null;
    renderHUD();
    return;
  }
  if (action === "skip-guide") {
    guide = false;
    localStorage.setItem("patrol:guide:v2", "skip");
    track("guide_skip", { reason: "manual" });
    renderHUD();
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
      const spent = action === "purchase" ? ECONOMY.catalog[squad].price : ECONOMY.upgradeCosts[player().squads[squad]!.step];
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
  root.innerHTML = `<div class="loading-screen"><div class="brand">${brand}</div><div class="loading-line"></div><p>Preparing your campaign…</p></div>`;
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
      client = new ProgressClient(board, levels);
    }
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
