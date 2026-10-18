import test from "node:test";
import assert from "node:assert/strict";
import { portraitBounds, sceneInk } from "../poster-image";

test("scene ink preserves multiply-on-paper appearance with normal alpha compositing", () => {
  const pixels = new Uint8ClampedArray([0,0,0,255, 128,128,128,255, 255,255,255,255, 128,128,128,128]);
  sceneInk(pixels);
  const paper = 237;
  for (let i=0; i<3; i++) {
    const composed = paper * (1 - pixels[i * 4 + 3] / 255);
    assert.ok(Math.abs(composed - paper * [0,128,255][i] / 255) < 1);
    assert.deepEqual(Array.from(pixels.slice(i*4,i*4+3)), [0,0,0]);
  }
  assert.equal(pixels[15], 64);
});

test("an empty scene raster cannot be accepted as ready newspaper art", () => {
  assert.throws(() => sceneInk(new Uint8ClampedArray(16)), /could not be decoded/);
});

test("portrait bounds exclude transparent margins while retaining every opaque edge", () => {
  const pixels = new Uint8ClampedArray(8*8*4);
  pixels[(2*8+3)*4+3] = 255;
  pixels[(6*8+5)*4+3] = 1;
  assert.deepEqual(portraitBounds(pixels,8,8), { x:3,y:2,width:3,height:5 });
  assert.throws(() => portraitBounds(new Uint8ClampedArray(16),2,2), /empty/);
});
