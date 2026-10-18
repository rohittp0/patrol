import { PLAYTEST_CONFIG as CONFIG } from "./game/playtest.config";
import { freeMapRectangle, type ViewRectangle } from "./game/map-viewport";

/** Keep fixed dialogs inside the visible area when a phone keyboard opens. */
function installViewport() {
  let frame = 0;
  const update = () => {
    frame = 0;
    const viewport = window.visualViewport;
    const style = document.documentElement.style;
    style.setProperty("--visual-viewport-height", `${viewport?.height ?? innerHeight}px`);
    style.setProperty("--visual-viewport-width", `${viewport?.width ?? innerWidth}px`);
    style.setProperty("--visual-viewport-offset-top", `${viewport?.offsetTop ?? 0}px`);
    style.setProperty("--visual-viewport-offset-left", `${viewport?.offsetLeft ?? 0}px`);
    window.dispatchEvent(new Event("patrol:viewport-change"));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  update();
}
if (typeof window !== "undefined") installViewport();

/** Read layout only when camera framing or an overlay changes, never per frame. */
export function usableMapPadding(container: DOMRect, options: { includeGuide?: boolean } = {}) {
  const selectors = [".topbar", ".metrics", ".map-caption", ".squad-dock", ".map-toolbar", "#hint-panel", ".maplibregl-ctrl-group", ".maplibregl-ctrl-attrib", "#command-menu[open] .command-actions"];
  if (options.includeGuide) selectors.push('.hunt-guide:not([hidden])[data-phase="moving"] .guide-card');
  const obstacles: ViewRectangle[] = [];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width && rect.height) obstacles.push({ left: rect.left - container.left, top: rect.top - container.top, right: rect.right - container.left, bottom: rect.bottom - container.top });
  }
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0, viewportTop = viewport?.offsetTop ?? 0;
  const left = Math.max(0, viewportLeft - container.left), top = Math.max(0, viewportTop - container.top);
  const right = Math.min(container.width, viewportLeft + (viewport?.width ?? innerWidth) - container.left);
  const bottom = Math.min(container.height, viewportTop + (viewport?.height ?? innerHeight) - container.top);
  const clearance = options.includeGuide ? Math.max(CONFIG.interface.mapClearancePx, CONFIG.tutorial.guide.movementPaddingPx) : CONFIG.interface.mapClearancePx;
  const available = freeMapRectangle({ left, top, right, bottom }, obstacles, clearance);
  return { left: available.left, top: available.top, right: Math.max(0, container.width - available.right), bottom: Math.max(0, container.height - available.bottom) };
}
