import type { CaptureReport } from "./game/capture-report";
import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { GAME_URL, newspaperCopy } from "./poster-content";

export interface NewspaperAssets { scene: HTMLImageElement; officer: HTMLImageElement; mastheadFamily: string }
let assetsPromise: Promise<NewspaperAssets> | null = null;

/** The illustration and locally hosted font load only when the editor opens.
 * Cache decoded assets across opens; never request an external font at export. */
export function prepareNewspaperAssets(): Promise<NewspaperAssets> {
  if (assetsPromise) return assetsPromise;
  const image = (path: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image(); value.onload = () => resolve(value); value.onerror = reject;
    value.src = `${import.meta.env.BASE_URL}${path}`;
  });
  const masthead = async () => {
    try {
      const font = new FontFace("PatrolMasthead", `url("${import.meta.env.BASE_URL}fonts/UnifrakturCook-Bold.ttf")`, { weight: "700" });
      document.fonts.add(await font.load()); return "PatrolMasthead";
    } catch { return "Georgia, serif"; }
  };
  assetsPromise = Promise.all([image("newspaper/arrest-scene.webp"), image("newspaper/officer-portrait.webp"), masthead()])
    .then(([scene, officer, mastheadFamily]) => ({ scene, officer, mastheadFamily }))
    .catch((error) => { assetsPromise = null; throw error; });
  return assetsPromise;
}

interface Column { x: number; y: number; width: number; height: number }
interface PrintLine { words: string[]; last: boolean; paragraph: number }

/** Authored copy and artwork are composed at export resolution. Generated
 * artwork carries no lettering; all newspaper text stays crisp on export. */
export function drawNewspaper(canvas: HTMLCanvasElement, report: CaptureReport, name: string, fugitive: HTMLImageElement, player: HTMLCanvasElement | HTMLImageElement | null, assets: NewspaperAssets) {
  canvas.width = CONFIG.poster.widthPx; canvas.height = CONFIG.poster.heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvas.width / 1200, canvas.height / 1500);
  const ink = "#24231f", paper = "#f5f1e7", serif = "Georgia, serif", sans = "Arial, sans-serif";
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 1200, 1500);
  // Very faint fibre and fold marks, with crisp ink kept above the paper.
  ctx.fillStyle = "#594d3409";
  for (let i = 0; i < 4500; i++) ctx.fillRect((i * 137.7) % 1200, (i * 71.3) % 1500, .8, 1.2);
  const fold = ctx.createLinearGradient(580, 0, 620, 0); fold.addColorStop(0, "#40362000"); fold.addColorStop(.5, "#40362005"); fold.addColorStop(1, "#40362000");
  ctx.fillStyle = fold; ctx.fillRect(580, 0, 40, 1500);
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
  text("INDEPENDENT REPORTS • EXTRAORDINARY PURSUITS", 600, 36, 12, sans, "center");
  text("THE WORLD", 48, 88, 13, sans, "left", "bold"); text("ON THE RUN", 48, 109, 13, sans);
  fitLine("The Patrol Post", 600, 151, 820, 118, assets.mastheadFamily, "center", "bold");
  text("THE MANHUNT", 1152, 88, 13, sans, "right", "bold"); text("DESK", 1152, 109, 13, sans, "right");
  rule(177, 3); rule(183, .8);
  text(`VOL. I  ·  NO. ${String(report.hunt).padStart(2, "0")}`, 48, 207, 14, sans);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  text(date, 600, 207, 14, sans, "center");
  text(`${report.country.toUpperCase()}  ·  GAME EDITION`, 1152, 207, 14, sans, "right"); rule(220);
  text("CRIME & PURSUIT", 48, 253, 14, sans, "left", "bold");
  text("SPECIAL DISPATCH", 1152, 253, 14, sans, "right");
  fitLine(copy.headline, 48, 345, 1104, 91, serif, "left", "bold");
  block(copy.deck, { x: 48, y: 366, width: 1104, height: 65 }, 28, serif, "italic", 1.15, true);
  rule(440, 1.2);

  // The framed editorial illustration replaces the old flat vector cartoon.
  const photo = { x: 48, y: 456, width: 715, height: 430 };
  const scale = Math.max(photo.width / assets.scene.naturalWidth, photo.height / assets.scene.naturalHeight);
  const left = photo.x + (photo.width - assets.scene.naturalWidth * scale) / 2;
  const top = photo.y + (photo.height - assets.scene.naturalHeight * scale) / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(photo.x, photo.y, photo.width, photo.height); ctx.clip();
  ctx.filter = "grayscale(1)"; ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(assets.scene, left, top, assets.scene.naturalWidth * scale, assets.scene.naturalHeight * scale);
  const head = (source: CanvasImageSource, placement: { x: number; y: number; radius: number }) => {
    const x = left + placement.x * assets.scene.naturalWidth * scale, y = top + placement.y * assets.scene.naturalHeight * scale;
    const r = placement.radius * assets.scene.naturalWidth * scale;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    // An opaque paper backing also covers the source placeholder's fine edge.
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = paper; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = "multiply"; ctx.drawImage(source, x - r, y - r, r * 2, r * 2); ctx.restore();
  };
  head(player ?? assets.officer, CONFIG.poster.sceneHeads.player);
  head(fugitive, CONFIG.poster.sceneHeads.fugitive);
  // A light, regular screen unifies uploaded photos and the drawn scene in print.
  const screen = document.createElement("canvas"); screen.width = screen.height = 4;
  const screenCtx = screen.getContext("2d")!; screenCtx.fillStyle = "#17151118"; screenCtx.beginPath(); screenCtx.arc(1, 1, .4, 0, Math.PI * 2); screenCtx.fill();
  ctx.filter = "none"; ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = ctx.createPattern(screen, "repeat")!; ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
  ctx.restore();
  text("PATROL POST / ARTIST'S IMPRESSION", 763, 904, 11, sans, "right");
  block(copy.caption, { x: 48, y: 913, width: 715, height: 40 }, 17, serif, "italic", 1.15);
  text("By the Patrol Correspondent", 48, 978, 14, sans, "left", "bold");
  columns([copy.lead, copy.cordon, copy.follow, copy.closing], [
    { x: 48, y: 992, width: 342, height: 280 }, { x: 421, y: 992, width: 342, height: 280 },
  ], 22);
  vertical(405, 1000, 1272); vertical(784, 456, 1272);

  // Separate the sourced account from the fictional, personalized lead story.
  text("FROM THE ARCHIVES", 808, 475, 13, sans, "left", "bold");
  block(report.file.title, { x: 808, y: 490, width: 344, height: 77 }, 31, serif, "bold", 1.1);
  text("THE REAL MANHUNT", 808, 592, 12, sans, "left", "bold");
  text(report.file.endingDate, 808, 615, 16, serif, "left", "italic"); rule(630, .7, 808);
  columns([report.file.intro, report.file.ending], [{ x: 808, y: 643, width: 344, height: 429 }], 23);
  block(`Source: ${report.file.source.label}`, { x: 808, y: 1084, width: 344, height: 48 }, 14, sans);
  rule(1148, 1, 808); text("THE CAPTURE LEDGER", 808, 1171, 12, sans, "left", "bold");
  for (const [index, [label, value]] of [["Squads deployed", report.squads], ["Moves used", report.moves], ["Points earned", report.score]].entries()) {
    const y = 1200 + index * 29; text(String(label), 808, y, 19); text(String(value), 1152, y, 22, serif, "right", "bold");
  }
  rule(1290, 2); vertical(405, 1310, 1412); vertical(784, 1310, 1412);
  const briefs = [
    { x: 48, title: "Another case, another chase", copy: "The next case file is already on the desk. A new fugitive means a fresh look at the map and another chance to close the net." },
    { x: 421, title: "Every move makes the news", copy: `Careful planning pays. This operation finished with ${report.score} points on the board—and a front-page clipping for the squad's scrapbook.` },
    { x: 808, title: "Your name in tomorrow's paper?", copy: "Take command of your own patrol. Pick up a case file and see who you can catch." },
  ];
  for (const brief of briefs) {
    fitLine(brief.title, brief.x, 1325, 344, 24, serif, "left", "bold");
    block(brief.copy, { x: brief.x, y: 1337, width: 342, height: 77 }, 18, serif, "normal", 1.2);
  }
  text(GAME_URL.replace(/^https?:\/\//, ""), 808, 1424, 19, serif, "left", "bold");
  rule(1440, .8);
  text("THIS FRONT PAGE REPORTS AN IMAGINED GAME CAPTURE. HISTORICAL FACTS APPEAR IN THE ARCHIVE COLUMN.", 600, 1461, 11, sans, "center");
  text("THE PATROL POST", 48, 1483, 10, sans); text("ILLUSTRATED GAME EDITION  ·  1", 1152, 1483, 10, sans, "right");
}
