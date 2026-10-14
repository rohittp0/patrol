import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { icon } from "./icons";

const storageKey = `patrol:tutorial:${CONFIG.tutorial.version}`;
const slides = [
  {
    tag: "GLOBAL ALERT / YOUR MISSION", title: "The world is on the run.", asset: "mission",
    copy: "A wave of coordinated prison breaks has put countries on alert. You command the squads sent to stop the escape. One runner. A country of escape routes. Close the net.",
    note: "Your mission: contain the runner before they escape by land.",
    alt: "A tactical world map shows outbreak alerts, a red runner, and blue response squads.",
  },
  {
    tag: "01 / ISSUE AN ORDER", title: "Pick a post. Send a squad.", asset: "order",
    copy: "Click a white border post to highlight its border, then click the squad you want to send. The old border opens as soon as the squad leaves. The new border becomes bright and secured on arrival.",
    note: "Each relocation costs one order. A post holds one squad.",
    alt: "A border post is selected, Squad A is chosen, and the squad follows an arc to secure the highlighted border while its old border dims.",
  },
  {
    tag: "02 / TIME YOUR MOVES", title: "Your order sets time in motion.", asset: "runner",
    copy: `The runner moves when you issue an order. Your squads travel ${CONFIG.movement.squadSpeedMultiplier}× as fast, but a long trip gives the runner more time. Even a short transfer gives the runner a minimum travel distance, scaled to the country.`,
    note: "Think as long as you like between orders. Everything is paused.",
    alt: "A squad and runner move simultaneously. The squad arrives first; the runner continues its minimum travel. Both pause before the next order.",
  },
  {
    tag: "03 / CLOSE THE NET", title: "Seal every way out.", asset: "containment",
    copy: "Muted borders are open: the runner can cross them. Bright borders are secured: the runner cannot cross. Build a closed shape around the runner using secured borders and, where available, the impassable coastline.",
    note: "A closed enclosure wins. Crossing the country's land boundary loses.",
    alt: "An open gap in a border enclosure is secured by a squad, trapping the runner between bright borders and the coastline.",
  },
  {
    tag: "04 / MAKE EVERY ORDER COUNT", title: "Need a lead? Show a hint.", asset: "hint",
    copy: "Show hint recommends a squad and a destination for the current position. Hints are free: they spend no orders or points. Follow the highlighted post and squad when you're ready.",
    note: `Your opening challenge allows ${CONFIG.levels[0].maxOrders} orders. Win in ${CONFIG.levels[0].solutionOrders} and score ${CONFIG.levels[0].maxOrders - CONFIG.levels[0].solutionOrders}. Unused orders are your points.`,
    alt: "The free Show hint button highlights a suggested border post and Squad A without moving either actor or reducing the order counter.",
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

  constructor(private onBlockingChange: () => void) {
    document.body.insertAdjacentHTML("beforeend", `
      <section id="tutorial" class="modal-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-card"></div>
      </section>
      <section id="phone-gate" class="phone-gate" hidden role="dialog" aria-modal="true" aria-labelledby="phone-title" aria-describedby="phone-description">
        <div class="phone-card"><span class="brand-mark">${icon("compass")}</span><span class="eyebrow">PATROL / COMMAND DESK</span>
        <div class="laptop-art" aria-hidden="true"><span></span></div>
        <h1 id="phone-title" tabindex="-1">Your command desk<br>needs a bigger screen.</h1>
        <p id="phone-description">Please open Patrol on a laptop or desktop to play.</p><span class="phone-url">${CONFIG.hosting.productionOrigin.replace(/^https?:\/\//, "")}${CONFIG.hosting.basePath.replace(/\/$/, "")}</span></div>
      </section>`);
    this.tutorial = document.getElementById("tutorial")!;
    this.gate = document.getElementById("phone-gate")!;
    window.addEventListener("resize", this.updateGate);
    this.coarsePointer.addEventListener("change", this.updateGate);
    document.addEventListener("keydown", (event) => {
      if (!this.blocked) return;
      // Capture prevents game shortcuts from firing through a modal.
      event.stopImmediatePropagation();
      if (event.key === "Tab") this.trapFocus(event);
      else if (!this.phone && event.key === "Escape") this.finish();
      else if (!this.phone && event.key === "ArrowRight") { event.preventDefault(); this.next(); }
      else if (!this.phone && event.key === "ArrowLeft" && this.index > 0) { event.preventDefault(); this.index--; this.renderSlide(); }
    }, true);
    this.updateGate();
    this.renderSlide(false);
    this.sync();
  }

  get blocked() { return this.phone || this.tutorialOpen; }

  open() {
    this.index = 0;
    this.tutorialOpen = true;
    this.renderSlide(false);
    this.sync();
  }

  private completed(): boolean {
    try { return localStorage.getItem(storageKey) === "complete"; } catch { return false; }
  }

  private finish() {
    if (this.phone) return;
    this.tutorialOpen = false;
    try { localStorage.setItem(storageKey, "complete"); } catch { /* An unavailable store only means another first-visit briefing. */ }
    this.sync();
  }

  private next() {
    if (this.index === slides.length - 1) this.finish();
    else { this.index++; this.renderSlide(); }
  }

  private updateGate = () => {
    const next = needsLaptop(window.innerWidth, Math.min(screen.width, screen.height), this.coarsePointer.matches);
    if (this.phone === next) return;
    this.phone = next;
    this.sync();
  };

  private sync() {
    const app = document.getElementById("app")!;
    if (this.blocked && !app.inert) this.previousFocus = document.activeElement as HTMLElement;
    app.inert = this.blocked;
    this.gate.hidden = !this.phone;
    this.tutorial.hidden = this.phone || !this.tutorialOpen;
    if (this.phone) document.getElementById("phone-title")!.focus();
    else if (this.tutorialOpen) this.tutorial.querySelector<HTMLButtonElement>("#tutorial-next")?.focus();
    else if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.onBlockingChange();
  }

  private renderSlide(focus = true) {
    const slide = slides[this.index];
    this.tutorial.querySelector(".tutorial-card")!.innerHTML = `
      <div class="tutorial-top"><span class="tutorial-brand">${icon("compass")}PATROL BRIEFING</span><button id="tutorial-skip" class="text-button">Skip tutorial</button></div>
      <div class="tutorial-visual"><picture><source media="(prefers-reduced-motion: reduce)" srcset="${import.meta.env.BASE_URL}tutorial/${slide.asset}.png"><img src="${import.meta.env.BASE_URL}tutorial/${slide.asset}.gif" alt="${slide.alt}" width="${CONFIG.tutorial.animation.widthPx}" height="${CONFIG.tutorial.animation.heightPx}"></picture><span class="visual-label">FIELD SIMULATION / ${String(this.index + 1).padStart(2, "0")}</span></div>
      <div class="tutorial-copy" aria-live="polite"><span class="eyebrow">${slide.tag}</span><h2 id="tutorial-title">${slide.title}</h2><p>${slide.copy}</p><div class="tutorial-note">${icon("info")}<span>${slide.note}</span></div></div>
      <div class="tutorial-footer"><button id="tutorial-back" class="text-button" ${this.index === 0 ? "disabled" : ""}>Back</button><div class="tutorial-progress" aria-label="Slide ${this.index + 1} of ${slides.length}">${slides.map((_, i) => `<span class="${i === this.index ? "current" : ""}"></span>`).join("")}</div><button id="tutorial-next" class="primary-button">${this.index === slides.length - 1 ? "Begin patrol" : "Next"}${icon("arrow")}</button></div>`;
    this.tutorial.querySelector("#tutorial-next")!.addEventListener("click", () => this.next());
    this.tutorial.querySelector("#tutorial-back")!.addEventListener("click", () => { if (this.index > 0) { this.index--; this.renderSlide(); } });
    this.tutorial.querySelector("#tutorial-skip")!.addEventListener("click", () => this.finish());
    if (focus && !this.phone) this.tutorial.querySelector<HTMLButtonElement>("#tutorial-next")!.focus();
  }

  private trapFocus(event: KeyboardEvent) {
    const modal = this.phone ? this.gate : this.tutorial;
    const controls = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")];
    if (!controls.length) { event.preventDefault(); document.getElementById("phone-title")!.focus(); return; }
    const first = controls[0], last = controls.at(-1)!;
    if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
