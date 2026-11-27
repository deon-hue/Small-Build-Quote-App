// Showing a many-page or large drawing on a phone or tablet without running it out of memory: each page is drawn no bigger than a phone can hold, and only the pages near what is on screen are kept. Pure, so it can be
// tested.

/** the most dots a page is drawn at on a touchscreen (about 24MB while it is shown), and the longest side */
export const PHONE_MAX_PIXELS = 6_000_000
export const PHONE_MAX_SIDE = 4096
export const PHONE_MAX_PAGES = 6

/** The scale to draw a page at: twice its size as before, or as much as fits the limits. `w` and `h` are the page's size at scale 1. */
export function phoneRenderScale(w: number, h: number, maxPixels = PHONE_MAX_PIXELS, maxSide = PHONE_MAX_SIDE): number {
  if (!(w > 0) || !(h > 0)) return 1
  return Math.min(2, Math.sqrt(maxPixels / (w * h)), maxSide / Math.max(w, h))
}

/** Which pages to hold: those within a screen's height of what is showing, the nearest first, at most `max`. `boxes` are each page's top and height measured from the top of the view. */
export function pagesToHold(boxes: { top: number; height: number }[], viewHeight: number, max = PHONE_MAX_PAGES): number[] {
  const middle = viewHeight / 2
  return boxes
    .map((b, i) => ({ i, near: b.top + b.height >= -viewHeight && b.top <= 2 * viewHeight, away: b.top <= middle && b.top + b.height >= middle ? 0 : Math.min(Math.abs(b.top - middle), Math.abs(b.top + b.height - middle)) }))
    .filter(p => p.near)
    .sort((a, b) => a.away - b.away || a.i - b.i)
    .slice(0, max)
    .map(p => p.i)
}
