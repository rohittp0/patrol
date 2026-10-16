/** Deterministic paper stock, reused while editing. Grain and cut edges are
 * code-native print decoration; no extra image request or export dependency. */
let grain: HTMLCanvasElement | null = null;
const random = (initial: number) => {
  let seed = initial;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
};

export function newspaperPaper(ctx: CanvasRenderingContext2D): Path2D {
  const rng = random(8141), edge = new Path2D();
  // Small uneven teeth and a few larger nicks make a saved clipping, rather
  // than a rectangular page. Keep the type safely inside the 48px margins.
  edge.moveTo(21, 19);
  for (let x = 21; x <= 1179; x += 11) edge.lineTo(x, 16 + rng() * 7);
  edge.lineTo(1180, 21);
  for (let y = 21; y <= 1479; y += 13) edge.lineTo(1182 - rng() * 7 - (y > 1200 && y < 1228 ? 9 : 0), y);
  for (let x = 1179; x >= 21; x -= 11) edge.lineTo(x, 1481 - rng() * 8);
  for (let y = 1479; y >= 21; y -= 13) edge.lineTo(17 + rng() * 7 + (y > 718 && y < 745 ? 7 : 0), y);
  edge.closePath();
  ctx.save(); ctx.shadowColor = "#271e1840"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#ede3cc"; ctx.fill(edge); ctx.restore();
  ctx.save(); ctx.clip(edge);
  const ageing = ctx.createRadialGradient(550, 660, 100, 550, 660, 950);
  ageing.addColorStop(0, "#fffcf130"); ageing.addColorStop(.65, "#b69a5720"); ageing.addColorStop(1, "#916d3c65");
  ctx.fillStyle = ageing; ctx.fillRect(0, 0, 1200, 1500);
  if (!grain) {
    grain = document.createElement("canvas"); grain.width = grain.height = 256;
    const texture = grain.getContext("2d")!, pixels = texture.createImageData(256, 256), noise = random(921);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = noise() > .5;
      pixels.data.set(light ? [255, 251, 236, Math.floor(noise() * 40)] : [88, 65, 32, Math.floor(noise() * 25)], i);
    }
    texture.putImageData(pixels, 0, 0);
  }
  ctx.fillStyle = ctx.createPattern(grain, "repeat")!; ctx.fillRect(0, 0, 1200, 1500);
  // A worn horizontal fold and faint vertical crease remain beneath the ink.
  for (const [start, end, vertical] of [[726, 747, false], [595, 610, true]] as const) {
    const fold = vertical ? ctx.createLinearGradient(start, 0, end, 0) : ctx.createLinearGradient(0, start, 0, end);
    fold.addColorStop(0, "#67533200"); fold.addColorStop(.45, "#67533218"); fold.addColorStop(.52, "#fffae870"); fold.addColorStop(.68, "#67533212"); fold.addColorStop(1, "#67533200");
    ctx.fillStyle = fold; ctx.fillRect(0, 0, 1200, 1500);
  }
  ctx.strokeStyle = "#8f794b26"; ctx.lineWidth = 2; ctx.stroke(edge);
  ctx.restore(); return edge;
}
