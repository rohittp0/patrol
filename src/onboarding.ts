import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { icon } from "./icons";
import { portraitPath, type CaseFile } from "./game/case-files";
import { locationPhrase } from "./game/presentation";
import { track } from "./telemetry";

export interface MissionBriefing { file: CaseFile; country: string; number: number; total: number; lead: string; squads: number; moves: number; entry: string }

const storageKey = `patrol:tutorial:${CONFIG.tutorial.version}`;
const slides = [
  {
    tag: "THE CASE FILES / YOUR MISSION", title: "History remembers the escape. You lead the chase.", asset: "mission",
    copy: "Your desk is stacked with case files: prison breaks, vanished gangsters, and outlaws who knew every back road. Take command of each manhunt. Put your squads in the right places, and leave your target nowhere to run.",
    note: "An imagined pursuit. A real story to uncover after every capture.",
    alt: "A tactical world map shows outbreak alerts, a red fugitive, and blue response squads.",
  },
  {
    tag: "01 / MAKE YOUR MOVE", title: "Pick a post. Send a squad.", asset: "order",
    copy: "Pick a white border post, then choose a squad to send there. A squad guards the whole border from its post. When it leaves, that border is unguarded until another squad takes over.",
    note: "Moving a squad uses one move. Only one squad can hold each post.",
    alt: "A border post is selected, Squad A is chosen, and the squad follows an arc to secure the highlighted border while its old border dims.",
  },
  {
    tag: "02 / TIME YOUR MOVES", title: "You move. They make a break for it.", asset: "runner",
    copy: "Send a squad and your fugitive starts running too. A faraway post gives them more time to get away. Even a short hop gives them room to run, so make every move count.",
    note: "Between moves, take your time. Nobody goes anywhere while you think.",
    alt: "A squad and fugitive move simultaneously. The squad arrives first; the fugitive continues its run. Both pause before the next move.",
  },
  {
    tag: "03 / CLOSE THE NET", title: "Seal every way out.", asset: "containment",
    copy: "Your fugitive can slip across any unguarded border. Surround them with guarded borders so there's nowhere left to go. The sea can help close your trap—they can't swim away.",
    note: "Catch them before they escape the country by land.",
    alt: "An unguarded gap in a border enclosure is guarded by a squad, trapping the fugitive between bright borders and the coastline.",
  },
  {
    tag: "04 / MAKE EVERY MOVE COUNT", title: "Need a lead? Show a hint.", asset: "hint",
    copy: "Stuck on the trail? Show hint points out a squad and a post to try. It costs nothing. Once you've made the capture, put yourself on the front page with your own Patrol newspaper.",
    note: `You have ${CONFIG.levels[0].maxOrders} moves in the opening hunt. Every move you save earns a point.`,
    alt: "The free Show hint button highlights a suggested border post and Squad A without moving either actor or reducing the move counter.",
  },
] as const;

export function needsLaptop(viewportWidth: number, screenShortSide: number, coarsePointer: boolean): boolean {
  return CONFIG.deviceGate.enabled && (viewportWidth <= CONFIG.deviceGate.maxViewportWidthPx || (coarsePointer && screenShortSide <= CONFIG.deviceGate.maxTouchScreenShortSidePx));
}

/** Modal overlays live outside the inert game. The phone gate always takes
 * precedence and cannot be closed by Escape, clicks, or tutorial controls. */
export class Onboarding {
  private index = 0;
  private tutorialOpen = CONFIG.tutorial.showOnFirstVisit && !this.completed();
  private phone = false;
  private previousFocus: HTMLElement | null = null;
  private tutorial: HTMLElement;
  private gate: HTMLElement;
  private coarsePointer = matchMedia("(pointer: coarse)");
  private briefing: MissionBriefing | null = null;
  private caseModal: HTMLElement;
  private caseVisible = false;
  private caseOpenedAt = 0;
  private tutorialOpenedAt = performance.now();
  private tutorialVisible = false;

  constructor(private onBlockingChange: () => void) {
    document.body.insertAdjacentHTML("beforeend", `
      <section id="tutorial" class="modal-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-card"></div>
      </section>
      <section id="case-briefing" class="modal-backdrop case-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="case-title"><div class="case-card"></div></section>
      <section id="phone-gate" class="phone-gate" hidden role="dialog" aria-modal="true" aria-labelledby="phone-title" aria-describedby="phone-description">
        <div class="phone-card"><span class="brand-mark">${icon("compass")}</span><span class="eyebrow">PATROL / COMMAND DESK</span>
        <div class="laptop-art" aria-hidden="true"><span></span></div>
        <h1 id="phone-title" tabindex="-1">Your command desk<br>needs a bigger screen.</h1>
        <p id="phone-description">Please open Patrol on a laptop or desktop to play.</p><span class="phone-url">${CONFIG.hosting.productionOrigin.replace(/^https?:\/\//, "")}${CONFIG.hosting.basePath.replace(/\/$/, "")}</span></div>
      </section>`);
    this.tutorial = document.getElementById("tutorial")!;
    this.gate = document.getElementById("phone-gate")!;
    this.caseModal = document.getElementById("case-briefing")!;
    window.addEventListener("resize", this.updateGate);
    this.coarsePointer.addEventListener("change", this.updateGate);
    document.addEventListener("keydown", (event) => {
      if (!this.blocked) return;
      // Capture prevents game shortcuts from firing through a modal.
      event.stopImmediatePropagation();
      if (event.key === "Tab") this.trapFocus(event);
      else if (!this.phone && event.key === "Escape") this.tutorialOpen ? this.finish("escape") : this.beginCase("escape");
      else if (!this.phone && this.tutorialOpen && event.key === "ArrowRight") { event.preventDefault(); this.next(); }
      else if (!this.phone && this.tutorialOpen && event.key === "ArrowLeft" && this.index > 0) { event.preventDefault(); track("tutorial_navigate", { action: "back", slide_number: this.index + 1, slide_id: slides[this.index].asset }); this.index--; this.renderSlide(); }
    }, true);
    if (this.tutorialOpen) track("tutorial_begin", { entry: "first_visit" });
    this.renderSlide(false);
    this.updateGate();
    this.sync();
  }

  get blocked() { return this.phone || this.tutorialOpen || !!this.briefing; }
  get phoneBlocked() { return this.phone; }

  showCase(briefing: MissionBriefing) {
    this.briefing = briefing;
    this.caseVisible = false;
    const { file, country, lead, number, total, squads, moves } = briefing;
    this.caseModal.querySelector(".case-card")!.innerHTML = `<div class="case-top"><span class="eyebrow">PATROL CASE FILES</span><span>HUNT ${number} OF ${total}</span></div><div class="case-content"><div class="case-portrait"><img src="${import.meta.env.BASE_URL}${portraitPath(file)}" alt="Illustrated portrait of ${file.name}"><span>ON THE RUN</span></div><div class="case-story"><span class="eyebrow">${country} / ${file.era}</span><h2 id="case-title">${file.name}</h2><h3>${file.title}</h3><p>${file.intro}</p></div></div><div class="case-assignment"><span class="eyebrow">YOUR LEAD</span><p>Last seen <strong>${locationPhrase(lead)}</strong>. Get your ${squads} squads into position and cut off every way out. You have ${moves} moves.</p></div><div class="case-footer"><small>Illustrated portrait · An imagined chase inspired by a real case.</small><button class="primary-button" id="case-start">Start the chase${icon("arrow")}</button></div>`;
    this.caseModal.querySelector("#case-start")!.addEventListener("click", () => this.beginCase("button"));
    this.sync();
  }

  private beginCase(reason: string) {
    if (!this.briefing || this.phone) return;
    track("case_intro_start", { reason, duration_ms: Math.round(performance.now() - this.caseOpenedAt) });
    this.briefing = null;
    this.sync();
  }

  open() {
    this.index = 0;
    this.tutorialOpen = true;
    this.tutorialOpenedAt = performance.now();
    track("tutorial_begin", { entry: "how_to_play" });
    this.renderSlide(false);
    this.sync();
  }

  private completed(): boolean {
    try { return localStorage.getItem(storageKey) === "complete"; } catch { return false; }
  }

  private finish(reason = "skip") {
    if (this.phone) return;
    this.tutorialOpen = false;
    track(reason === "complete" ? "tutorial_complete" : "tutorial_skip", { reason, slide_number: this.index + 1, duration_ms: Math.round(performance.now() - this.tutorialOpenedAt) });
    try { localStorage.setItem(storageKey, "complete"); } catch { /* An unavailable store only means another first-visit briefing. */ }
    this.sync();
  }

  private next() {
    if (this.index === slides.length - 1) this.finish("complete");
    else { track("tutorial_navigate", { action: "next", slide_number: this.index + 1, slide_id: slides[this.index].asset }); this.index++; this.renderSlide(); }
  }

  private updateGate = () => {
    const next = needsLaptop(window.innerWidth, Math.min(screen.width, screen.height), this.coarsePointer.matches);
    if (this.phone === next) return;
    this.phone = next;
    track(next ? "device_gate_view" : "device_gate_exit", { width_px: innerWidth, height_px: innerHeight, orientation: innerWidth > innerHeight ? "landscape" : "portrait" });
    this.sync();
  };

  private sync() {
    const app = document.getElementById("app")!;
    if (this.blocked && !app.inert) this.previousFocus = document.activeElement as HTMLElement;
    app.inert = this.blocked;
    this.gate.hidden = !this.phone;
    const showTutorial = !this.phone && this.tutorialOpen;
    this.tutorial.hidden = !showTutorial;
    if (showTutorial && !this.tutorialVisible) track("tutorial_slide_view", { slide_id: slides[this.index].asset, slide_number: this.index + 1 });
    this.tutorialVisible = showTutorial;
    const showCase = !this.phone && !this.tutorialOpen && !!this.briefing;
    this.caseModal.hidden = !showCase;
    if (showCase && !this.caseVisible) { this.caseOpenedAt = performance.now(); track("case_intro_view", { entry: this.briefing!.entry }); }
    this.caseVisible = showCase;
    this.onBlockingChange();
    if (this.phone) document.getElementById("phone-title")!.focus();
    else if (this.tutorialOpen) this.tutorial.querySelector<HTMLButtonElement>("#tutorial-next")?.focus();
    else if (showCase) this.caseModal.querySelector<HTMLButtonElement>("#case-start")?.focus();
    else if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  private renderSlide(focus = true) {
    const slide = slides[this.index];
    if (this.tutorialVisible && !this.phone) track("tutorial_slide_view", { slide_id: slide.asset, slide_number: this.index + 1 });
    this.tutorial.querySelector(".tutorial-card")!.innerHTML = `
      <div class="tutorial-top"><span class="tutorial-brand">${icon("compass")}PATROL BRIEFING</span><button id="tutorial-skip" class="text-button">Skip tutorial</button></div>
      <div class="tutorial-visual"><picture><source media="(prefers-reduced-motion: reduce)" srcset="${import.meta.env.BASE_URL}tutorial/${slide.asset}.png"><img src="${import.meta.env.BASE_URL}tutorial/${slide.asset}.gif" alt="${slide.alt}" width="${CONFIG.tutorial.animation.widthPx}" height="${CONFIG.tutorial.animation.heightPx}"></picture><span class="visual-label">FIELD SIMULATION / ${String(this.index + 1).padStart(2, "0")}</span></div>
      <div class="tutorial-copy" aria-live="polite"><span class="eyebrow">${slide.tag}</span><h2 id="tutorial-title">${slide.title}</h2><p>${slide.copy}</p><div class="tutorial-note">${icon("info")}<span>${slide.note}</span></div></div>
      <div class="tutorial-footer"><button id="tutorial-back" class="text-button" ${this.index === 0 ? "disabled" : ""}>Back</button><div class="tutorial-progress" aria-label="Slide ${this.index + 1} of ${slides.length}">${slides.map((_, i) => `<span class="${i === this.index ? "current" : ""}"></span>`).join("")}</div><button id="tutorial-next" class="primary-button">${this.index === slides.length - 1 ? "Begin patrol" : "Next"}${icon("arrow")}</button></div>`;
    this.tutorial.querySelector("#tutorial-next")!.addEventListener("click", () => this.next());
    this.tutorial.querySelector("#tutorial-back")!.addEventListener("click", () => { if (this.index > 0) { track("tutorial_navigate", { action: "back", slide_number: this.index + 1, slide_id: slides[this.index].asset }); this.index--; this.renderSlide(); } });
    this.tutorial.querySelector("#tutorial-skip")!.addEventListener("click", () => this.finish());
    if (focus && !this.phone) this.tutorial.querySelector<HTMLButtonElement>("#tutorial-next")!.focus();
  }

  private trapFocus(event: KeyboardEvent) {
    const modal = this.phone ? this.gate : this.tutorialOpen ? this.tutorial : this.caseModal;
    const controls = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")];
    if (!controls.length) { event.preventDefault(); document.getElementById("phone-title")!.focus(); return; }
    const first = controls[0], last = controls.at(-1)!;
    if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
