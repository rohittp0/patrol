import test from "node:test";
import assert from "node:assert/strict";
import { removePortraitBackground } from "./portrait-matte";

test("newspaper matte clears connected ivory while retaining enclosed highlights and dark outlines", () => {
  const pixels = new Uint8ClampedArray(7 * 7 * 4);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const outline = x >= 2 && x <= 4 && y >= 2 && y <= 4 && (x !== 3 || y !== 3);
    pixels.set(outline ? [30, 25, 20, 255] : [246, 242, 230, 255], (y * 7 + x) * 4);
  }
  // Compression/paper variations belong to the same edge-connected matte.
  pixels.set([235, 231, 220, 255], 4);
  removePortraitBackground(pixels, 7, 7, 24);
  assert.equal(pixels[3], 0); assert.equal(pixels[7], 0);
  assert.equal(pixels[(3 * 7 + 3) * 4 + 3], 255);
  assert.equal(pixels[(2 * 7 + 3) * 4 + 3], 255);
});
