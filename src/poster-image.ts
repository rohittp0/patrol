/** Prepare the scene as black ink with transparency. Normal source-over then
 * reproduces grayscale multiply on the paper without a canvas filter/blend draw. */
export function sceneInk(pixels: Uint8ClampedArray): void {
  let coverage = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    coverage += pixels[i + 3];
    const grey = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    pixels[i + 3] *= (255 - grey) / 255;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
  }
  if (!coverage) throw new Error("Newspaper illustration could not be decoded. Please try again.");
}

export interface PortraitBounds { x: number; y: number; width: number; height: number }

/** Ignore transparent margins when fitting a drawn portrait to its body. */
export function portraitBounds(pixels: Uint8ClampedArray, width: number, height: number): PortraitBounds {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!pixels[(y * width + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("Newspaper portrait is empty.");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
