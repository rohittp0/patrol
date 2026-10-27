import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import type { CaptureReport } from "./game/capture-report";
import { portraitPath } from "./game/case-files";
import { playerProfile, savePlayerProfile } from "./player-profile";
import { newspaperCopy } from "./poster-content";
import { drawNewspaper, newspaperArtwork, prepareNewspaperAssets, type NewspaperAssets } from "./poster-renderer";
import { measure, track } from "./telemetry";
import type { AnalyticsParams, EventName } from "./telemetry/events";
import "./poster-responsive.css";

interface PosterOptions { entry: "second_country_win" | "result_button"; onSkip?: () => void }

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
});

/** Original uploads and crop coordinates live only in this open editor. The
 * persisted profile contains the final, transparent circular head crop. */
export class PosterStudio {
  private dialog: HTMLDialogElement;
  private canvas: HTMLCanvasElement;
  private crop: HTMLCanvasElement;
  private name: HTMLInputElement;
  private photo: HTMLImageElement | null = null;
  private fugitive: HTMLImageElement | null = null;
  private assets: NewspaperAssets | null = null;
  private head: HTMLCanvasElement | HTMLImageElement | null = null;
  private report: CaptureReport | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private drag: { x: number; y: number; id: number } | null = null;
  private photoUrl: string | null = null;
  private generation = 0;
  private photoGeneration = 0;
  private cropFrame = 0;
  private renderFrame = 0;
  private adjustingZoom = false;
  private exportRevision = 0;
  private exporting = false;
  private preparedFile: File | null = null;
  private openedAt = 0;
  private options: PosterOptions = { entry: "result_button" };

  constructor() {
    this.dialog = document.createElement("dialog");
    this.dialog.className = "poster-dialog";
    this.dialog.setAttribute("aria-labelledby", "poster-title");
    this.dialog.innerHTML = `<div class="poster-toolbar"><div><span class="eyebrow">THE PATROL POST</span><h2 id="poster-title">You made the front page.</h2><p>A good chase deserves a clipping. Make it yours, then pass it around.</p></div><button id="poster-close" class="icon-button" aria-label="Close newspaper">✕</button></div>
      <div class="poster-layout"><div class="poster-preview"><canvas id="newspaper" aria-label="Your shareable Patrol newspaper"></canvas></div>
      <section class="poster-controls" aria-label="Personalize your newspaper"><p class="poster-share-note">One closed case. Unlimited bragging rights.</p><label for="player-name">Who's leading the squad?</label><input id="player-name" autocomplete="off" placeholder="Your name" maxlength="64">
      <label class="photo-upload" for="player-photo">Put yourself in the picture<input id="player-photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <div id="crop-editor" hidden><p>Drag to frame your face.</p><canvas id="head-crop" tabindex="0" role="img" aria-label="Circular head crop. Drag or use arrow keys to move your photo."></canvas><label for="photo-zoom">Zoom</label><input id="photo-zoom" type="range" min="1" max="${CONFIG.poster.maxPhotoZoom}" step="0.01" value="1"></div>
      <button id="photo-remove" class="text-button" hidden>Remove photo</button><p class="poster-local-note">Your finished head crop stays in this browser.</p>
      <div id="share-caption" hidden><label for="poster-caption">Send this with your newspaper</label><textarea id="poster-caption" readonly rows="5"></textarea><button id="copy-caption" class="text-button">Copy invitation</button></div></section></div>
      <footer class="poster-export"><p id="poster-message" role="status" aria-live="polite"></p><div class="poster-export-buttons"><button id="poster-share" class="primary-button" disabled>Share the scoop ↗</button><button id="poster-download" class="secondary-button" disabled>Keep the clipping ↓</button></div></footer>`;
    document.body.append(this.dialog);
    this.canvas = this.get<HTMLCanvasElement>("newspaper"); this.crop = this.get<HTMLCanvasElement>("head-crop"); this.name = this.get<HTMLInputElement>("player-name");
    this.get("poster-close").onclick = () => this.dismiss("button");
    this.dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.dismiss("escape"); });
    this.name.oninput = () => { this.name.value = [...this.name.value].slice(0, CONFIG.poster.maxNameLength).join(""); this.render(); };
    this.name.onblur = () => this.saveName(true);
    this.get<HTMLInputElement>("player-photo").onchange = (event) => void this.choosePhoto((event.target as HTMLInputElement).files?.[0]);
    const zoom = this.get<HTMLInputElement>("photo-zoom");
    zoom.oninput = () => { this.zoom = Number(zoom.value); this.scheduleCrop(); };
    zoom.onpointerdown = () => { this.adjustingZoom = true; };
    const endZoom = () => { this.adjustingZoom = false; this.commitCrop("zoom"); };
    zoom.onchange = endZoom;
    zoom.onpointerup = zoom.onpointercancel = () => { if (this.adjustingZoom) endZoom(); };
    this.crop.onpointerdown = (event) => { this.drag = { x: event.clientX, y: event.clientY, id: event.pointerId }; this.crop.setPointerCapture(event.pointerId); };
    this.crop.onpointermove = (event) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const scale = CONFIG.poster.cropSizePx / this.crop.getBoundingClientRect().width;
      this.pan.x += (event.clientX - this.drag.x) * scale; this.pan.y += (event.clientY - this.drag.y) * scale;
      this.drag.x = event.clientX; this.drag.y = event.clientY; this.scheduleCrop();
    };
    const endDrag = () => { if (this.drag) { this.drag = null; this.commitCrop("pan"); } };
    this.crop.onpointerup = endDrag; this.crop.onpointercancel = endDrag;
    this.crop.onkeydown = (event) => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!delta[event.key]) return; event.preventDefault();
      this.pan.x += delta[event.key][0] * CONFIG.poster.keyboardPanPx; this.pan.y += delta[event.key][1] * CONFIG.poster.keyboardPanPx;
      this.renderCrop(); this.commitCrop("keyboard");
    };
    this.get("photo-remove").onclick = () => {
      this.discardOriginal(); this.head = null; this.get("crop-editor").hidden = true; this.get("photo-remove").hidden = true;
      this.store({ photo: null }); this.log("poster_photo_remove"); this.render();
    };
    this.get("poster-download").onclick = () => this.download();
    this.get("poster-share").onclick = () => void this.share();
    this.get("copy-caption").onclick = async () => {
      try { await navigator.clipboard.writeText(this.get<HTMLTextAreaElement>("poster-caption").value); this.message("Invitation copied. Send it with your newspaper."); this.log("poster_caption_copy", { reason: "success" }); }
      catch { this.get<HTMLTextAreaElement>("poster-caption").select(); this.message("Select and copy the invitation above."); this.log("poster_caption_copy", { reason: "manual" }); }
    };
  }

  get blocked() { return this.dialog.open; }
  get automatic() { return this.dialog.open && this.options.entry === "second_country_win"; }
  private log(name: EventName, parameters: AnalyticsParams = {}) { track(name, { entry: this.options.entry, newspaper_version: CONFIG.poster.designVersion, newspaper_artwork: newspaperArtwork(this.report?.countryId ?? "").id, ...parameters }); }
  private dismiss(reason: "button" | "escape") {
    const advance = this.options.onSkip;
    if (advance) this.log("poster_skip", { reason, duration_ms: Math.round(performance.now() - this.openedAt) });
    this.close(reason);
    advance?.();
  }
  private get<T extends HTMLElement = HTMLElement>(id: string) { return this.dialog.querySelector<T>(`#${id}`)!; }
  private message(value: string) { this.get("poster-message").textContent = value; }
  private store(update: Parameters<typeof savePlayerProfile>[0]) {
    const saved = savePlayerProfile(update);
    if (!saved) { this.message("This browser couldn't save your profile. You can still download your newspaper."); this.log("poster_error", { reason: "storage" }); }
  }
  private saveName(log: boolean) {
    const value = [...this.name.value.replace(/\s+/g, " ").trim()].slice(0, CONFIG.poster.maxNameLength).join("");
    this.name.value = value;
    if (value !== playerProfile().name) { this.store({ name: value }); if (log) this.log("poster_profile_edit", { has_name: !!value, name_length: [...value].length }); }
    // newspaperCopy already applies this exact normalization. Avoid invalidating
    // the prepared export on blur just before the Share button receives a click.
  }

  async open(report: CaptureReport, options: PosterOptions = { entry: "result_button" }) {
    if (this.dialog.open) this.close();
    this.options = options;
    const close = this.get<HTMLButtonElement>("poster-close"), automatic = options.entry === "second_country_win";
    close.className = automatic ? "secondary-button poster-skip" : "icon-button";
    close.textContent = automatic ? "Skip →" : "✕";
    close.setAttribute("aria-label", automatic ? "Skip newspaper and start next hunt" : "Close newspaper");
    const generation = ++this.generation, started = performance.now(); this.openedAt = started;
    this.report = report; this.fugitive = null; this.head = null; this.assets = null; this.preparedFile = null;
    const profile = playerProfile(); this.name.value = profile.name;
    this.canvas.hidden = true; this.get("crop-editor").hidden = true; this.get("photo-remove").hidden = true; this.get("share-caption").hidden = true;
    this.get<HTMLInputElement>("player-photo").disabled = true;
    this.get<HTMLButtonElement>("poster-download").disabled = true; this.get<HTMLButtonElement>("poster-share").disabled = true;
    this.message("Setting the front page…"); this.dialog.showModal();
    this.log("poster_open", { has_name: !!profile.name, has_photo: !!profile.photo });
    try {
      const [fugitive, player, assets] = await Promise.all([loadImage(`${import.meta.env.BASE_URL}${portraitPath(report.file)}`), profile.photo ? loadImage(profile.photo).catch(() => null) : null, prepareNewspaperAssets(report.countryId)]);
      if (generation !== this.generation) return;
      this.fugitive = fugitive; this.head = player; this.assets = assets; this.get("photo-remove").hidden = !player;
      this.render(); this.canvas.hidden = false; this.message("");
      this.get<HTMLInputElement>("player-photo").disabled = false;
      this.log("poster_ready", { duration_ms: Math.round(performance.now() - started), has_name: !!profile.name, has_photo: !!player }); measure("poster_prepare", started, report.countryId);
    } catch { if (generation === this.generation) { this.message(automatic ? "The newspaper couldn't load. Skip to your next case, or try again from the result card later." : "The newspaper couldn't load. Close it and try again."); this.log("poster_error", { reason: "portrait_load" }); } }
  }

  close(reason = "state_change") {
    if (!this.dialog.open) return;
    this.saveName(true); this.log("poster_close", { reason, duration_ms: Math.round(performance.now() - this.openedAt) });
    ++this.generation; this.discardOriginal(); this.head = null; this.fugitive = null; this.report = null; this.assets = null;
    cancelAnimationFrame(this.renderFrame); this.renderFrame = 0; this.invalidateExport();
    this.dialog.close();
  }
  private discardOriginal() {
    ++this.photoGeneration;
    cancelAnimationFrame(this.cropFrame); this.cropFrame = 0; this.adjustingZoom = false;
    this.photo = null; this.drag = null;
    this.zoom = 1; this.pan = { x: 0, y: 0 };
    this.crop.getContext("2d")!.clearRect(0, 0, this.crop.width, this.crop.height);
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl); this.photoUrl = null;
    this.get<HTMLInputElement>("player-photo").value = "";
  }

  private scheduleCrop() {
    this.invalidateExport();
    if (!this.cropFrame) this.cropFrame = requestAnimationFrame(() => { this.cropFrame = 0; this.renderCrop(); });
  }
  private async choosePhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > CONFIG.poster.maxPhotoMiB * 1024 * 1024) {
      this.message(`Choose a JPG, PNG, or WebP photo under ${CONFIG.poster.maxPhotoMiB} MB.`); this.log("poster_error", { reason: "photo_format_or_size" }); return;
    }
    this.log("poster_photo_select", { file_type: file.type, file_size_kb: Math.round(file.size / 1024) });
    this.discardOriginal(); this.get("crop-editor").hidden = true; const generation = this.photoGeneration;
    const url = URL.createObjectURL(file); this.photoUrl = url;
    try {
      const photo = await loadImage(url); if (generation !== this.photoGeneration || !this.dialog.open) return;
      this.photo = photo; this.zoom = 1; this.pan = { x: 0, y: 0 }; this.get<HTMLInputElement>("photo-zoom").value = "1";
      this.get("crop-editor").hidden = false; this.get("photo-remove").hidden = false;
      this.message(""); this.renderCrop(); this.saveCrop(); this.log("poster_photo_ready");
    } catch { if (generation === this.photoGeneration) { this.message("That photo couldn't open. Try another image."); this.log("poster_error", { reason: "photo_decode" }); this.discardOriginal(); } }
  }

  private renderCrop() {
    if (!this.photo) return;
    const size = CONFIG.poster.cropSizePx, image = this.photo;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * this.zoom;
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    this.pan.x = Math.max(-(width - size) / 2, Math.min((width - size) / 2, this.pan.x));
    this.pan.y = Math.max(-(height - size) / 2, Math.min((height - size) / 2, this.pan.y));
    this.crop.width = size; this.crop.height = size;
    const ctx = this.crop.getContext("2d")!; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(image, (size - width) / 2 + this.pan.x, (size - height) / 2 + this.pan.y, width, height);
    const head = document.createElement("canvas"); head.width = head.height = CONFIG.poster.storedPhotoSizePx;
    const output = head.getContext("2d")!; output.scale(head.width / size, head.height / size);
    output.beginPath(); output.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); output.clip();
    output.drawImage(image, (size - width) / 2 + this.pan.x, (size - height) / 2 + this.pan.y, width, height);
    this.head = head; this.render();
  }
  private saveCrop() { if (this.head instanceof HTMLCanvasElement) this.store({ photo: this.head.toDataURL("image/png") }); }
  private commitCrop(action: string) {
    if (!this.photo || !this.dialog.open) return;
    if (this.cropFrame) { cancelAnimationFrame(this.cropFrame); this.cropFrame = 0; this.renderCrop(); }
    this.saveCrop(); this.prepareExport(); this.log("poster_crop_adjust", { action, photo_zoom: Math.round(this.zoom * 100) / 100 });
  }
  private render() {
    if (!this.report || !this.fugitive || !this.assets) return;
    this.invalidateExport();
    if (!this.renderFrame) this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0;
      if (!this.report || !this.fugitive || !this.assets || !this.dialog.open) return;
      drawNewspaper(this.canvas, this.report, this.name.value, this.fugitive, this.head, this.assets);
      this.get<HTMLTextAreaElement>("poster-caption").value = newspaperCopy(this.report, this.name.value).share;
      this.prepareExport();
    });
  }

  private invalidateExport() {
    ++this.exportRevision; this.preparedFile = null;
    this.get<HTMLButtonElement>("poster-download").disabled = true;
    this.get<HTMLButtonElement>("poster-share").disabled = true;
  }
  /** Encode ahead of the click: awaiting canvas.toBlob inside Share loses
   * transient user activation in browsers such as mobile Safari. Only one
   * encode runs at a time; edits invalidate its result instead of sharing it. */
  private prepareExport() {
    if (this.exporting || this.renderFrame || this.cropFrame || this.drag || this.adjustingZoom || !this.report || !this.dialog.open) return;
    const revision = this.exportRevision, generation = this.generation, filename = `patrol-${this.report.file.id}-front-page.png`;
    this.exporting = true;
    const finish = (blob: Blob | null) => {
      this.exporting = false;
      if (generation !== this.generation || revision !== this.exportRevision) { this.prepareExport(); return; }
      if (!blob) { this.message("Couldn't prepare the newspaper. Edit your name or photo to try again."); this.log("poster_error", { reason: "export" }); return; }
      this.preparedFile = new File([blob], filename, { type: "image/png" });
      this.get<HTMLButtonElement>("poster-download").disabled = false;
      this.get<HTMLButtonElement>("poster-share").disabled = false;
    };
    try { this.canvas.toBlob(finish, "image/png"); } catch { finish(null); }
  }
  private deliver(file: File) {
    const url = URL.createObjectURL(file), link = document.createElement("a"); link.href = url; link.download = file.name;
    this.dialog.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.log("poster_download", { method: "download", has_name: !!this.name.value, has_photo: !!this.head });
  }
  private download() {
    if (!this.preparedFile) return;
    try { this.deliver(this.preparedFile); this.message("Front page ready. Your download is on its way."); }
    catch { this.message("Couldn't export the newspaper. Try again."); this.log("poster_error", { reason: "export" }); }
  }
  private async share() {
    const file = this.preparedFile, report = this.report, generation = this.generation;
    if (!file || !report) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        this.log("poster_share_attempt", { method: "native" });
        try { await navigator.share({ title: "The Patrol Post", text: newspaperCopy(report, this.name.value).share, files: [file] }); if (generation !== this.generation) return; this.log("poster_share_result", { method: "native", reason: "success" }); this.message("The scoop is out."); }
        catch (error) { if (generation !== this.generation) return; const cancelled = error instanceof DOMException && error.name === "AbortError"; this.log("poster_share_result", { method: "native", reason: cancelled ? "cancelled" : "failed" }); if (!cancelled) { this.get("share-caption").hidden = false; this.message("Sharing couldn't open. Download the newspaper and copy the invitation instead."); } }
      } else {
        this.log("poster_share_attempt", { method: "fallback" }); this.deliver(file); this.get("share-caption").hidden = false;
        this.message("Newspaper downloaded. Copy the invitation and share them together."); this.log("poster_share_result", { method: "fallback", reason: "downloaded" });
      }
    } catch { this.message("Couldn't prepare the newspaper. Try again."); this.log("poster_error", { reason: "export" }); }
  }
}
