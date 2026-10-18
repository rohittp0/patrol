import type { Map } from "maplibre-gl";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import type { PatrolGame } from "./game/engine";
import { guidedHuntStep, type GuideStep } from "./game/guided-hunt";
import { track } from "./telemetry";

const tuning = CONFIG.tutorial.guide;
const storageKey = `patrol:guided-hunt:${tuning.version}`;

/** A coach for the actual controls. It never issues a move or owns game state. */
export class HuntGuide {
  private root: HTMLElement;
  private card: HTMLElement;
  private spotlight: HTMLElement;
  private pointer: HTMLElement;
  private shades: HTMLElement[];
  private skipButton: HTMLButtonElement;
  private target: HTMLElement | null = null;
  private step: GuideStep | null = null;
  private dismissed = false;
  private startedAt: number | null = null;
  private viewedStep = "";
  private camera: Map | null = null;
  private observing = false;
  private positionFrame = 0;
  private observer: ResizeObserver;
  private game: PatrolGame | null = null;
  private movementSpotlight: HTMLElement;
  private movingShade: SVGSVGElement;
  private journeyHole: SVGRectElement;
  private movementHole: SVGRectElement;
  private pathBounds: { left: number; top: number; right: number; bottom: number } | null = null;
  private mapOffset = { left: 0, top: 0 };

  constructor(private onDismiss: () => void) {
    try { this.dismissed = ["complete", "skipped"].includes(localStorage.getItem(storageKey) ?? ""); } catch { /* Storage is optional. */ }
    this.root = document.createElement("div");
    this.root.className = "hunt-guide"; this.root.hidden = true;
    this.root.style.setProperty("--guide-width", `${tuning.cardWidthPx}px`);
    this.root.style.setProperty("--guide-pulse", `${tuning.pointerPulseMs}ms`);
    this.root.style.setProperty("--guide-shade", String(tuning.shadeOpacity));
    this.root.innerHTML = `<div class="guide-shade"></div><div class="guide-shade"></div><div class="guide-shade"></div><div class="guide-shade"></div>
      <svg class="guide-moving-shade" aria-hidden="true"><defs><mask id="hunt-guide-moving-mask" maskUnits="userSpaceOnUse" x="0" y="0"><rect class="guide-mask-background" fill="white"/><rect class="guide-journey-hole" fill="black" rx="12"/><rect class="guide-movement-hole" fill="black" rx="18"/></mask></defs><rect class="guide-mask-shade" mask="url(#hunt-guide-moving-mask)"/></svg>
      <div class="guide-movement-spotlight" aria-hidden="true"><span>THE CHASE</span></div>
      <div class="guide-spotlight" aria-hidden="true"></div>
      <div class="guide-pointer" aria-hidden="true"><svg viewBox="0 0 32 40" fill="none"><path d="M12 22V5a3 3 0 0 1 6 0v12l2-2a3 3 0 0 1 4 2l2 1a3 3 0 0 1 3 3v9l-5 8H12L4 25a3 3 0 0 1 5-3l3 4" fill="#f3f5df" stroke="#102126" stroke-width="2" stroke-linejoin="round"/></svg></div>
      <aside class="guide-card" role="region" aria-labelledby="hunt-guide-title"><div class="guide-card-top"><span class="eyebrow">YOUR FIRST CAPTURE</span><button class="guide-skip" type="button">Skip guidance</button></div>
        <div aria-live="polite" aria-atomic="true"><span class="guide-progress"></span><h2 id="hunt-guide-title"></h2><p id="hunt-guide-body"></p></div>
        <div class="guide-footnote"></div></aside>`;
    document.body.append(this.root);
    this.card = this.root.querySelector(".guide-card")!;
    this.spotlight = this.root.querySelector(".guide-spotlight")!;
    this.movementSpotlight = this.root.querySelector(".guide-movement-spotlight")!;
    this.movingShade = this.root.querySelector(".guide-moving-shade")!;
    this.journeyHole = this.root.querySelector(".guide-journey-hole")!;
    this.movementHole = this.root.querySelector(".guide-movement-hole")!;
    this.pointer = this.root.querySelector(".guide-pointer")!;
    this.shades = [...this.root.querySelectorAll<HTMLElement>(".guide-shade")];
    this.skipButton = this.root.querySelector(".guide-skip")!;
    this.skipButton.addEventListener("click", () => this.skip("button"));
    this.observer = new ResizeObserver(this.schedulePosition);
    document.addEventListener("click", this.filterClick, true);
    document.addEventListener("keydown", this.filterKey, true);
  }

  get active() { return !this.dismissed && this.step !== null && this.step.kind !== "complete"; }
  allowsPost(border: number) { return !this.active || this.step?.kind === "post" && this.step.order.border === border; }
  allowsSquad(squad: number) { return !this.active || this.step?.kind === "squad" && this.step.order.squad === squad; }

  bindMap(camera: Map) { this.camera = camera; }

  update(game: PatrolGame, eligible: boolean, selectedPost: number | null, suspended: boolean, revealPost: (border: number) => void, revealMovement: () => void) {
    this.game = game;
    this.step = eligible && tuning.enabled && !this.dismissed ? guidedHuntStep(game, selectedPost) : null;
    if (this.step?.kind === "complete") {
      this.dismissed = true; this.remember("complete"); this.hide();
      if (this.startedAt !== null) {
        track("guide_complete", { duration_ms: Math.round(performance.now() - this.startedAt) });
        if (!document.querySelector("dialog[open]")) document.getElementById("result-primary")?.focus();
      }
      return;
    }
    if (!this.active || suspended || !this.step) { this.hide(); return; }
    const step = this.step;
    const key = `${game.setup.id}:${step.move}:${step.kind}`;
    const target = step.kind === "post" ? document.querySelector<HTMLElement>(`.border-post[data-border="${step.order.border}"]`)
      : step.kind === "squad" ? document.querySelector<HTMLElement>(`.squad-card[data-squad="${step.order.squad}"]`)
      : document.getElementById("journey");
    // A loading/hidden control must not leave an invisible trap over the game.
    if (!target || target.hidden) { this.hide(); return; }
    const changed = key !== this.viewedStep, wasHidden = this.root.hidden;
    if (this.startedAt === null) { this.startedAt = performance.now(); track("guide_begin", { entry: game.ordersUsed ? "resume" : "first_hunt" }); }
    if (this.target !== target) {
      this.target?.removeAttribute("aria-describedby"); this.observer.disconnect();
      this.target = target;
    }
    this.target.setAttribute("aria-describedby", "hunt-guide-body");
    this.root.hidden = false;
    this.root.dataset.phase = step.kind;
    this.root.dataset.move = String(step.move + 1);
    this.camera?.getContainer().classList.toggle("guide-show-movement", step.kind === "moving");
    if (changed) {
      this.viewedStep = key;
      const last = step.move === game.setup.witness.length - 1;
      const squad = String.fromCharCode(65 + step.order.squad), post = step.order.border + 1;
      const copy = step.kind === "post"
        ? { title: last ? "Close the last gap." : "Cut off the first way out.", body: `Select post ${post}, the highlighted circle. ${last ? "This is the last unguarded border in our trap." : "Your fugitive can cross unguarded borders. Let's close this one."}`, note: "Take your time. The chase pauses between moves." }
        : step.kind === "squad"
        ? { title: `Send Squad ${squad}.`, body: `Select the highlighted squad card to guard post ${post}. ${last ? "This move will seal the enclosure." : "A move starts the chase for both your squad and the fugitive."}`, note: "One squad relocation uses one move." }
        : { title: last ? "The net is closing." : "Now watch the chase.", body: "Your squad and the fugitive move together. The old border opens as the squad leaves; the new border is guarded only when it arrives.", note: "Wait for the move to finish. Then time pauses again." };
      this.root.querySelector(".guide-progress")!.textContent = `MOVE ${step.move + 1} OF ${game.setup.witness.length} · ${step.kind === "post" ? "PICK A POST" : step.kind === "squad" ? "SEND A SQUAD" : "THE CHASE"}`;
      this.root.querySelector("#hunt-guide-title")!.textContent = copy.title;
      this.root.querySelector("#hunt-guide-body")!.textContent = copy.body;
      this.root.querySelector(".guide-footnote")!.textContent = copy.note;
      track("guide_step_view", { guide_step: step.kind, guide_move: step.move + 1 });
      if (step.kind === "post") revealPost(step.order.border);
      if (step.kind === "moving") {
        // Camera framing reads the actual responsive guide rectangle.
        this.position();
        revealMovement();
      }
    }
    if (!this.observing) {
      this.observing = true;
      this.camera?.on("move", this.schedulePosition);
      window.addEventListener("resize", this.schedulePosition);
      window.visualViewport?.addEventListener("resize", this.schedulePosition);
      window.visualViewport?.addEventListener("scroll", this.schedulePosition);
    }
    this.observer.observe(target); this.observer.observe(this.card);
    this.schedulePosition();
    if (changed || wasHidden) (step.kind === "moving" ? this.skipButton : target).focus({ preventScroll: true });
  }

  private remember(value: "complete" | "skipped") { try { localStorage.setItem(storageKey, value); } catch { /* Keep this session playable without storage. */ } }
  private skip(reason: string) {
    if (!this.active) return;
    const step = this.step!;
    if (step.kind !== "complete") track("guide_skip", { guide_step: step.kind, guide_move: step.move + 1, reason, duration_ms: Math.round(performance.now() - (this.startedAt ?? performance.now())) });
    this.dismissed = true; this.remember("skipped"); this.hide(); this.onDismiss();
    document.querySelector<HTMLElement>("#command-menu summary")?.focus();
  }

  private hide() {
    this.root.hidden = true; this.target?.removeAttribute("aria-describedby");
    this.camera?.getContainer().classList.remove("guide-show-movement");
    this.pathBounds = null;
    this.observer.disconnect(); cancelAnimationFrame(this.positionFrame); this.positionFrame = 0;
    if (this.observing) {
      this.camera?.off("move", this.schedulePosition);
      window.removeEventListener("resize", this.schedulePosition);
      window.visualViewport?.removeEventListener("resize", this.schedulePosition);
      window.visualViewport?.removeEventListener("scroll", this.schedulePosition);
      this.observing = false;
    }
  }

  private filterClick = (event: MouseEvent) => {
    if (this.root.hidden) return;
    const target = event.target as Node;
    if (this.card.contains(target) || this.step?.kind !== "moving" && this.target?.contains(target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  private filterKey = (event: KeyboardEvent) => {
    if (this.root.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); this.skip("escape"); return; }
    const controls = this.step?.kind === "moving" ? [this.skipButton] : [this.target!, this.skipButton];
    if (event.key === "Tab") {
      event.preventDefault(); event.stopImmediatePropagation();
      const current = controls.indexOf(document.activeElement as HTMLElement);
      controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus(); return;
    }
    if ((event.key === "Enter" || event.key === " ") && controls.includes(document.activeElement as HTMLElement)) return;
    if (this.step?.kind === "squad" && event.key === String(this.step.order.squad + 1)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };

  private schedulePosition = () => {
    if (this.root.hidden || this.positionFrame) return;
    this.positionFrame = requestAnimationFrame(() => { this.positionFrame = 0; this.position(); });
  };
  private position() {
    if (this.root.hidden || !this.target?.isConnected) return;
    const rect = this.target.getBoundingClientRect(), pad = tuning.spotlightPaddingPx;
    const width = innerWidth, height = innerHeight, margin = tuning.viewportMarginPx, gap = tuning.cardGapPx;
    const left = Math.max(0, Math.min(width, rect.left - pad)), top = Math.max(0, Math.min(height, rect.top - pad));
    const right = Math.max(left, Math.min(width, rect.right + pad)), bottom = Math.max(top, Math.min(height, rect.bottom + pad));
    const place = (element: HTMLElement, x: number, y: number, w: number, h: number) => Object.assign(element.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    place(this.spotlight, left, top, right - left, bottom - top);
    place(this.shades[0], 0, 0, width, top); place(this.shades[1], 0, bottom, width, height - bottom);
    place(this.shades[2], 0, top, left, bottom - top); place(this.shades[3], right, top, width - right, bottom - top);
    const visual = window.visualViewport;
    const safe = getComputedStyle(this.root);
    const viewport = {
      left: (visual?.offsetLeft ?? 0) + margin + parseFloat(safe.paddingLeft || "0"),
      top: (visual?.offsetTop ?? 0) + margin + parseFloat(safe.paddingTop || "0"),
      right: (visual?.offsetLeft ?? 0) + (visual?.width ?? width) - margin - parseFloat(safe.paddingRight || "0"),
      bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? height) - margin - parseFloat(safe.paddingBottom || "0"),
    };
    this.card.style.maxHeight = `${Math.max(44, viewport.bottom - viewport.top)}px`;
    const cardWidth = this.card.offsetWidth, cardHeight = this.card.offsetHeight;
    const clampX = (value: number) => Math.max(viewport.left, Math.min(viewport.right - cardWidth, value));
    const clampY = (value: number) => Math.max(viewport.top, Math.min(viewport.bottom - cardHeight, value));
    const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? viewport.top;
    let x = viewport.left, y = Math.max(viewport.top, headerBottom + margin);
    if (this.step?.kind === "moving" && this.camera && this.game?.activeOrder) {
      // Portrait reserves a top strip; short landscape reserves a left column.
      // The camera uses this measured card rather than a desktop-width constant.
      this.movingShade.setAttribute("width", String(width)); this.movingShade.setAttribute("height", String(height));
      for (const element of this.movingShade.querySelectorAll("mask, .guide-mask-background, .guide-mask-shade")) { element.setAttribute("width", String(width)); element.setAttribute("height", String(height)); }
      this.svgRect(this.journeyHole, left, top, right - left, bottom - top);
      const offset = this.camera.getContainer().getBoundingClientRect();
      this.mapOffset = { left: offset.left, top: offset.top };
      const points = this.game.activeOrder.path.map(point => this.camera!.project(point));
      this.pathBounds = { left: Math.min(...points.map(p => p.x)) + offset.left, top: Math.min(...points.map(p => p.y)) + offset.top,
        right: Math.max(...points.map(p => p.x)) + offset.left, bottom: Math.max(...points.map(p => p.y)) + offset.top };
      this.followMovement();
    }
    else {
      const centerX = (left + right - cardWidth) / 2;
      const centerY = (top + bottom - cardHeight) / 2;
      const candidates = [
        { x: centerX, y: top - gap - cardHeight },
        { x: centerX, y: bottom + gap },
        { x: right + gap, y: centerY },
        { x: left - gap - cardWidth, y: centerY },
        { x: viewport.left, y: headerBottom + margin },
      ].map(point => ({ x: clampX(point.x), y: clampY(point.y) }));
      const dock = document.querySelector(".squad-dock")?.getBoundingClientRect();
      const overlap = (point: { x: number; y: number }, obstacle: { left: number; top: number; right: number; bottom: number }) =>
        Math.max(0, Math.min(point.x + cardWidth, obstacle.right) - Math.max(point.x, obstacle.left)) *
        Math.max(0, Math.min(point.y + cardHeight, obstacle.bottom) - Math.max(point.y, obstacle.top));
      const score = (point: { x: number; y: number }) =>
        overlap(point, { left, top, right, bottom }) * 100 +
        (dock ? overlap(point, dock) : 0) + Math.max(0, headerBottom - point.y) * cardWidth;
      const best = candidates.reduce((best, point) => score(point) < score(best) ? point : best);
      x = best.x; y = best.y;
    }
    this.card.style.left = `${clampX(x)}px`;
    this.card.style.top = `${clampY(y)}px`;
    // The finger stays outside the highlighted control and never captures input.
    this.pointer.style.left = `${Math.min(viewport.right - 36, Math.max(viewport.left, right + pad / 2))}px`;
    this.pointer.style.top = `${Math.min(viewport.bottom - 45, Math.max(viewport.top, bottom + pad / 2))}px`;

  }

  /** Only active travel updates this cutout. Marker halos follow MapLibre's own
   * transforms; the guide does not read layout or emit telemetry per frame. */
  followMovement() {
    if (this.root.hidden || this.step?.kind !== "moving" || !this.camera || !this.pathBounds || !this.game?.activeOrder) return;
    const squad = this.camera.project(this.game.squads[this.game.activeOrder.squad].actor.position);
    const fugitive = this.camera.project(this.game.runner.position), pad = tuning.movementPaddingPx;
    const left = Math.max(0, Math.min(this.pathBounds.left, squad.x + this.mapOffset.left, fugitive.x + this.mapOffset.left) - pad);
    const top = Math.max(0, Math.min(this.pathBounds.top, squad.y + this.mapOffset.top, fugitive.y + this.mapOffset.top) - pad);
    const right = Math.min(innerWidth, Math.max(this.pathBounds.right, squad.x + this.mapOffset.left, fugitive.x + this.mapOffset.left) + pad);
    const bottom = Math.min(innerHeight, Math.max(this.pathBounds.bottom, squad.y + this.mapOffset.top, fugitive.y + this.mapOffset.top) + pad);
    this.svgRect(this.movementHole, left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    Object.assign(this.movementSpotlight.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px` });
  }
  private svgRect(element: SVGRectElement, x: number, y: number, width: number, height: number) {
    for (const [key, value] of Object.entries({ x, y, width, height })) element.setAttribute(key, String(value));
  }
}
