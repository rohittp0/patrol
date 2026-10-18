import test from "node:test";
import assert from "node:assert/strict";
import { freeMapRectangle, type ViewRectangle } from "./map-viewport";

const overlap = (a: ViewRectangle, b: ViewRectangle) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
test("portrait map clears header, squad dock, and hint panel", () => {
  const viewport = { left: 0, top: 0, right: 390, bottom: 844 };
  const obstacles = [{ left: 12, top: 12, right: 378, bottom: 80 }, { left: 12, top: 650, right: 378, bottom: 832 }, { left: 12, top: 490, right: 378, bottom: 638 }];
  const result = freeMapRectangle(viewport, obstacles, 12);
  assert(result.top >= 92 && result.bottom <= 478);
  for (const obstacle of obstacles) assert(!overlap(result, obstacle));
});
test("landscape map clears right dock and left guide without losing its height", () => {
  const result = freeMapRectangle({ left: 0, top: 0, right: 844, bottom: 390 }, [{ left: 12, top: 12, right: 832, bottom: 64 }, { left: 610, top: 80, right: 832, bottom: 378 }, { left: 12, top: 80, right: 270, bottom: 300 }], 8);
  assert(result.left >= 278 && result.right <= 602 && result.top >= 72);
  assert(result.bottom - result.top > 250);
});
test("offset visual viewport and obscured tiny viewports always yield positive bounded areas", () => {
  for (const viewport of [{ left: 5, top: 200, right: 320, bottom: 400 }, { left: 0, top: 0, right: 20, bottom: 10 }]) {
    for (const obstacles of [[], [viewport]]) {
      const result = freeMapRectangle(viewport, obstacles, 50);
      assert(result.right > result.left && result.bottom > result.top);
      assert(result.left >= viewport.left && result.top >= viewport.top && result.right <= viewport.right && result.bottom <= viewport.bottom);
    }
  }
});
