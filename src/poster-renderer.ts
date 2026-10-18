import type { CaptureReport } from "./game/capture-report";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { GAME_URL, newspaperCopy, playerName } from "./poster-content";
import { removePortraitBackground } from "./game/portrait-matte";
import { newspaperPaper } from "./poster-paper";
import { portraitBounds, sceneInk, type PortraitBounds } from "./poster-image";

export const newspaperArtwork = (country: string) => CONFIG.poster.artwork[country === "india" ? "india" : "shared"];
interface PrintedPortrait { canvas: HTMLCanvasElement; bounds: PortraitBounds }
export interface NewspaperAssets { scene: HTMLCanvasElement; officer: PrintedPortrait; mastheadFamily: string; artwork: ReturnType<typeof newspaperArtwork> }
const assetsByArtwork = new Map<string, Promise<NewspaperAssets>>();
let mastheadPromise: Promise<string> | null = null;
const portraitCache = new WeakMap<HTMLImageElement, PrintedPortrait>();
const playerCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, PrintedPortrait>();

function printPortrait(image: HTMLImageElement | HTMLCanvasElement, drawn: boolean, officer = false): PrintedPortrait {
  const cached = drawn ? portraitCache.get(image as HTMLImageElement) : playerCache.get(image);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  canvas.height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (drawn) removePortraitBackground(pixels.data, canvas.width, canvas.height, CONFIG.poster.portraitMatteTolerance);
  const neck = CONFIG.poster.officerNeck;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = (y * canvas.width + x) * 4, data = pixels.data;
    if (officer && (y >= canvas.height * neck.bottom ||
      (y >= canvas.height * neck.shoulderY && (x < canvas.width * neck.left || x >= canvas.width * neck.right)))) data[i + 3] = 0;
    // Prepare once; the final compositor needs neither filters nor blend modes.
    data[i] = data[i + 1] = data[i + 2] = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
  }
  const bounds = drawn ? portraitBounds(pixels.data, canvas.width, canvas.height) : { x: 0, y: 0, width: canvas.width, height: canvas.height };
  ctx.putImageData(pixels, 0, 0);
  const printed = { canvas, bounds };
  if (drawn) portraitCache.set(image as HTMLImageElement, printed); else playerCache.set(image, printed);
  return printed;
}

function printScene(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(image.naturalWidth, CONFIG.poster.sceneRasterWidthPx);
  canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  sceneInk(pixels.data); ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** The illustration and locally hosted font load only when the editor opens.
 * Cache decoded assets across opens; never request an external font at export. */
export function prepareNewspaperAssets(country: string): Promise<NewspaperAssets> {
  const artwork = newspaperArtwork(country), cached = assetsByArtwork.get(artwork.id);
  if (cached) return cached;
  const image = async (path: string) => {
    const value = new Image(); value.src = `${import.meta.env.BASE_URL}${path}`;
    await value.decode(); return value;
  };
  const masthead = async () => {
    try {
      const font = new FontFace("PatrolMasthead", `url("${import.meta.env.BASE_URL}fonts/UnifrakturCook-Bold.ttf")`, { weight: "700" });
      document.fonts.add(await font.load()); return "PatrolMasthead";
    } catch { return "Georgia, serif"; }
  };
  mastheadPromise ??= masthead();
  const promise = Promise.all([image(artwork.scenePath), image(artwork.officerPath), mastheadPromise])
    .then(([scene, officer, mastheadFamily]) => ({ scene: printScene(scene), officer: printPortrait(officer, true, true), mastheadFamily, artwork }))
    .catch((error) => { assetsByArtwork.delete(artwork.id); throw error; });
  assetsByArtwork.set(artwork.id, promise);
  return promise;
}

interface Column { x: number; y: number; width: number; height: number }
interface PrintLine { words: string[]; last: boolean; paragraph: number }

/** Authored copy and artwork are composed at export resolution. Generated
 * artwork carries no lettering; all newspaper text stays crisp on export. */
export function drawNewspaper(canvas: HTMLCanvasElement, report: CaptureReport, name: string, fugitive: HTMLImageElement, player: HTMLCanvasElement | HTMLImageElement | null, assets: NewspaperAssets) {
  canvas.width = CONFIG.poster.widthPx; canvas.height = CONFIG.poster.heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvas.width / 1200, canvas.height / 1500);
  const ink = "#29271f", accent = "#87372c", serif = "Georgia, serif", sans = "Arial, sans-serif";
  const clipping = newspaperPaper(ctx); ctx.save(); ctx.clip(clipping);
  const rule = (y: number, width = 1, x = 48, end = 1152) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(end, y); ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.stroke(); };
  const vertical = (x: number, y: number, end: number) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, end); ctx.strokeStyle = "#99958b"; ctx.lineWidth = .7; ctx.stroke(); };
  const font = (size: number, family = serif, weight = "normal") => { ctx.font = `${weight} ${size}px ${family}`; };
  const text = (value: string, x: number, y: number, size: number, family = serif, align: CanvasTextAlign = "left", weight = "normal") => {
    font(size, family, weight); ctx.fillStyle = ink; ctx.textAlign = align; ctx.fillText(value, x, y);
  };
  const fitLine = (value: string, x: number, y: number, width: number, preferred: number, family = serif, align: CanvasTextAlign = "left", weight = "normal") => {
    let size = preferred; font(size, family, weight);
    while (ctx.measureText(value).width > width && size > 12) font(--size, family, weight);
    text(value, x, y, size, family, align, weight);
  };
  // Break even a long unspaced player name at Unicode character boundaries.
  const wrap = (value: string, width: number, size: number, family = serif, weight = "normal") => {
    font(size, family, weight);
    const words = value.split(/\s+/).flatMap((word) => {
      const chunks: string[] = []; let current = "";
      for (const character of word) {
        if (current && ctx.measureText(current + character).width > width) { chunks.push(current); current = character; } else current += character;
      }
      if (current) chunks.push(current); return chunks;
    });
    const lines: string[][] = []; let line: string[] = [];
    for (const word of words) {
      if (line.length && ctx.measureText([...line, word].join(" ")).width > width) { lines.push(line); line = [word]; } else line.push(word);
    }
    if (line.length) lines.push(line); return lines;
  };
  const block = (value: string, box: Column, preferred: number, family = serif, weight = "normal", leading = 1.25, balanced = false) => {
    let size = preferred, lines = wrap(value, box.width, size, family, weight);
    while (lines.length * size * leading > box.height && size > 12) lines = wrap(value, box.width, --size, family, weight);
    if (balanced && lines.length === 2) {
      const words = lines.flat(); let difference = Infinity;
      for (let index = 1; index < words.length; index++) {
        const a = words.slice(0, index), b = words.slice(index);
        const aw = ctx.measureText(a.join(" ")).width, bw = ctx.measureText(b.join(" ")).width;
        if (Math.max(aw, bw) <= box.width && Math.abs(aw - bw) < difference) { difference = Math.abs(aw - bw); lines = [a, b]; }
      }
    }
    lines.forEach((words, i) => text(words.join(" "), box.x, box.y + size + i * size * leading, size, family, "left", weight));
    return lines.length * size * leading;
  };
  const columns = (paragraphs: string[], boxes: Column[], preferred: number) => {
    // All columns share a type size. Paragraph gaps and widow avoidance count
    // toward capacity, so longer names/case histories cannot hit the footer.
    let size = preferred, placed: { line: PrintLine; column: number; row: number }[] = [];
    for (;;) {
      const lines = paragraphs.flatMap((value, paragraph) => wrap(value, boxes[0].width, size).map((words, i, all) => ({ words, last: i === all.length - 1, paragraph })));
      placed = []; let column = 0, row = 0, previous = -1, overflow = false;
      for (const line of lines) {
        if (previous >= 0 && previous !== line.paragraph) row += .5;
        if ((row + 1) * size * 1.24 > boxes[column].height) { column++; row = 0; }
        if (column >= boxes.length) { overflow = true; break; }
        placed.push({ line, column, row }); row++; previous = line.paragraph;
      }
      if (!overflow || size <= 14) break;
      size--;
    }
    font(size); ctx.textAlign = "left"; ctx.fillStyle = ink;
    for (const { line, column, row } of placed) {
      const box = boxes[column], y = box.y + size + row * size * 1.24;
      const widths = line.words.map((word) => ctx.measureText(word).width);
      const natural = ctx.measureText(line.words.join(" ")).width;
      const justify = !line.last && line.words.length > 1 && natural > box.width * .8;
      const gap = justify ? (box.width - widths.reduce((a, b) => a + b, 0)) / (line.words.length - 1) : ctx.measureText(" ").width;
      let x = box.x;
      line.words.forEach((word, index) => { ctx.fillText(word, x, y); x += widths[index] + gap; });
    }
    return size;
  };
  const copy = newspaperCopy(report, name);
  text("EXTRA!", 48, 75, 27, serif, "left", "bold"); text("EXTRA!", 48, 100, 27, serif, "left", "bold");
  fitLine("The Patrol Post", 600, 143, 810, 116, assets.mastheadFamily, "center", "bold");
  text("BAD NEWS FOR", 1152, 77, 12, sans, "right", "bold"); text("FUGITIVES.", 1152, 98, 18, serif, "right", "bold");
  text("GOOD MAPS. GREAT ESCAPES. BETTER CAPTURES.", 600, 168, 12, sans, "center");
  rule(177, 3); rule(183, .8);
  text(`VOL. I  ·  NO. ${String(report.hunt).padStart(2, "0")}`, 48, 207, 14, sans);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  text(date, 600, 207, 14, sans, "center");
  text(`${report.country.toUpperCase()}  ·  GAME EDITION`, 1152, 207, 14, sans, "right"); rule(220);
  fitLine(copy.kicker.toUpperCase(), 600, 270, 1104, 37, serif, "center", "bold");
  fitLine(copy.headline, 600, 375, 1104, 128, serif, "center", "bold");
  block(copy.deck, { x: 48, y: 393, width: 1104, height: 39 }, 27, serif, "italic", 1.1, true);
  rule(440, 1.2);

  // The framed editorial illustration replaces the old flat vector cartoon.
  const photo = { x: 48, y: 456, width: 715, height: 430 };
  const scene = assets.scene;
  const scale = Math.max(photo.width / scene.width, photo.height / scene.height);
  const left = photo.x + (photo.width - scene.width * scale) / 2;
  const top = photo.y + (photo.height - scene.height * scale) * CONFIG.poster.sceneVerticalAlign;
  ctx.save(); ctx.beginPath(); ctx.rect(photo.x, photo.y, photo.width, photo.height); ctx.clip();
  ctx.drawImage(scene, left, top, scene.width * scale, scene.height * scale);
  const head = (portrait: PrintedPortrait, placement: { x: number; y: number; width: number; height: number }) => {
    const box = portrait.bounds;
    const fit = Math.min(placement.width * scene.width / box.width, placement.height * scene.height / box.height) * scale;
    const width = box.width * fit, height = box.height * fit;
    const x = left + placement.x * scene.width * scale - width / 2;
    const y = top + placement.y * scene.height * scale - height;
    ctx.drawImage(portrait.canvas, box.x, box.y, box.width, box.height, x, y, width, height);
  };
  head(player ? printPortrait(player, false) : assets.officer, player ? assets.artwork.sceneHeads.playerPhoto : assets.artwork.sceneHeads.player);
  head(printPortrait(fugitive, true), assets.artwork.sceneHeads.fugitive);
  // A light, regular screen unifies uploaded photos and the drawn scene in print.
  const screen = document.createElement("canvas"); screen.width = screen.height = 4;
  const screenCtx = screen.getContext("2d")!; screenCtx.fillStyle = "#17151118"; screenCtx.beginPath(); screenCtx.arc(1, 1, .4, 0, Math.PI * 2); screenCtx.fill();
  ctx.fillStyle = ctx.createPattern(screen, "repeat")!; ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
  ctx.restore();
  text("PATROL POST / ARTIST'S IMPRESSION", 763, 902, 10, sans, "right");
  block(copy.caption, { x: 48, y: 913, width: 715, height: 40 }, 17, serif, "italic", 1.15);
  // The margin is the player's bragging column, with one old-fashioned stamp.
  ctx.save(); ctx.translate(980, 512); ctx.rotate(-.065); ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.strokeRect(-163, -38, 326, 76); ctx.lineWidth = 1; ctx.strokeRect(-157, -32, 314, 64);
  font(38, sans, "bold"); ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.fillText("CASE CLOSED", 0, 13); ctx.restore();
  text("THE CAPTAIN'S REPORT", 980, 590, 13, sans, "center", "bold"); rule(607, .8, 808);
  for (const [index, [label, value]] of [["MOVES", report.moves], ["SQUADS", report.squads], ["POINTS", report.score]].entries()) {
    const x = 857 + index * 119; text(String(value).padStart(2, "0"), x, 665, 48, serif, "center", "bold"); text(String(label), x, 689, 12, sans, "center");
  }
  rule(710, .8, 808);
  block(copy.quote, { x: 815, y: 731, width: 330, height: 111 }, 36, serif, "italic", 1.12);
  fitLine(`— ${playerName(name)}`, 1145, 874, 330, 18, serif, "right", "italic");
  vertical(784, 456, 886); rule(963, 1.2);
  text("FILED BY OUR MAP DESK", 48, 991, 12, sans, "left", "bold");
  columns([copy.lead, copy.follow], [{ x: 48, y: 1008, width: 342, height: 251 }], 22);
  vertical(405, 985, 1260);
  // Preserve the actual ending as a clearly separate, shorter historical box.
  text("THE REAL MANHUNT / FROM THE ARCHIVES", 428, 991, 12, sans, "left", "bold");
  fitLine(report.file.title, 428, 1030, 724, 30, serif, "left", "bold");
  text(report.file.endingDate, 428, 1057, 16, serif, "left", "italic");
  columns([report.file.ending], [{ x: 428, y: 1072, width: 724, height: 153 }], 22);
  fitLine(`Source: ${report.file.source.label}`, 428, 1253, 724, 13, sans);
  // A classified invitation belongs in the paper; it is intentionally much
  // more readable than the old tiny footer URL, without a web-ad button.
  rule(1280, 2);
  ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.strokeRect(49, 1297, 1102, 133); ctx.restore();
  text("SQUAD LEADER WANTED", 72, 1331, 17, sans, "left", "bold");
  text("Your turn to make headlines.", 72, 1372, 31, serif, "left", "bold");
  text(copy.invitation, 72, 1404, 20, serif, "left", "italic");
  text("PICK UP YOUR NEXT CASE AT", 1128, 1340, 12, sans, "right");
  text(GAME_URL.replace(/^https?:\/\//, ""), 1128, 1386, 40, serif, "right", "bold");
  text("PLAY PATROL · FREE TO TAKE COMMAND", 1128, 1411, 11, sans, "right");
  text("AN IMAGINED GAME CAPTURE. THE ARCHIVE COLUMN TELLS THE REAL STORY.", 600, 1458, 11, sans, "center");
  ctx.restore();
}
