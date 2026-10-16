/** Remove only ivory connected to the image edge. Enclosed highlights (eyes,
 * silver hair, skin) stay opaque; the original map asset is never modified. */
export function removePortraitBackground(pixels: Uint8ClampedArray, width: number, height: number, tolerance: number): void {
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, pixel) => sum + pixels[pixel * 4 + channel], 0) / corners.length);
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let start = 0, end = 0;
  const visit = (pixel: number) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    if (background.some((value, channel) => Math.abs(pixels[pixel * 4 + channel] - value) > tolerance)) return;
    pixels[pixel * 4 + 3] = 0; queue[end++] = pixel;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (start < end) {
    const pixel = queue[start++], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (y > 0) visit(pixel - width);
    if (y + 1 < height) visit(pixel + width);
  }
}
