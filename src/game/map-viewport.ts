export interface ViewRectangle { left: number; top: number; right: number; bottom: number }

/** Largest axis-aligned map area not obscured by visible controls. */
export function freeMapRectangle(viewport: ViewRectangle, obstacles: readonly ViewRectangle[], clearance: number): ViewRectangle {
  const width = Math.max(1, viewport.right - viewport.left), height = Math.max(1, viewport.bottom - viewport.top);
  // Never let margins alone consume a small browser/keyboard viewport.
  const inset = Math.max(0, Math.min(clearance, (width - 1) / 2, (height - 1) / 2));
  const bounds = { left: viewport.left + inset, top: viewport.top + inset, right: viewport.right - inset, bottom: viewport.bottom - inset };
  const blocks = obstacles.map(rect => ({ left: Math.max(bounds.left, rect.left - inset), right: Math.min(bounds.right, rect.right + inset), top: Math.max(bounds.top, rect.top - inset), bottom: Math.min(bounds.bottom, rect.bottom + inset) })).filter(rect => rect.left < rect.right && rect.top < rect.bottom);
  const xs = [...new Set([bounds.left, bounds.right, ...blocks.flatMap(rect => [rect.left, rect.right])])].sort((a,b) => a-b);
  let best: ViewRectangle | null = null, bestArea = 0;
  for (let i = 0; i < xs.length - 1; i++) for (let j = i + 1; j < xs.length; j++) {
    const left = xs[i], right = xs[j];
    const intervals = blocks.filter(rect => rect.left < right && rect.right > left).sort((a,b) => a.top - b.top);
    let top = bounds.top;
    const consider = (bottom: number) => {
      const area = (right-left) * (bottom-top);
      if (area > bestArea) { bestArea = area; best = { left, right, top, bottom }; }
    };
    for (const interval of intervals) { consider(interval.top); top = Math.max(top, interval.bottom); }
    consider(bounds.bottom);
  }
  // Entirely covered: provide a valid tiny camera viewport, avoiding negative padding.
  return best ?? { left: bounds.left, top: bounds.top, right: bounds.left + Math.min(1, width), bottom: bounds.top + Math.min(1, height) };
}
