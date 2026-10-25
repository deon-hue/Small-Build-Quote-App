// Plan symbols for the plumbing fittings placed on a Take-off drawing: a wash basin looks like a wash basin, a bath like a bath. Each is a few simple shapes in plan view, drawn at the size of the real fitting (1 unit = 10mm,
// the middle of the fitting at 0,0, its BACK (the side against the wall) at the top, -y) so the screen only has to scale them to the plan. Pure (no runtime imports), so it can be tested with plain Node.

/** How a shape is painted: the fitting itself, its inside (bowl, tub), the water points (taps, wastes), the heating parts, and thin lines. */
export type SymRole = 'body' | 'inner' | 'water' | 'waterDot' | 'heat' | 'heatDot' | 'line' | 'faint'

export type SymShape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; role: SymRole }
  | { k: 'circle'; cx: number; cy: number; r: number; role: SymRole }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; role: SymRole }
  | { k: 'path'; d: string; role: SymRole }

export interface PlumbSymbol {
  /** the size of the fitting on the plan, in units of 10mm */
  w: number
  h: number
  shapes: SymShape[]
}

const rect = (x: number, y: number, w: number, h: number, role: SymRole, r?: number): SymShape => ({ k: 'rect', x, y, w, h, role, ...(r != null ? { r } : {}) })
const circle = (cx: number, cy: number, r: number, role: SymRole): SymShape => ({ k: 'circle', cx, cy, r, role })
const ellipse = (cx: number, cy: number, rx: number, ry: number, role: SymRole): SymShape => ({ k: 'ellipse', cx, cy, rx, ry, role })
const path = (d: string, role: SymRole): SymShape => ({ k: 'path', d, role })

/** A radiator is as wide as its size (800mm to start); a towel rail 500mm. */
export const DEFAULT_RADIATOR_MM = 800

const SYMBOLS: Record<string, () => PlumbSymbol> = {
  basin: () => ({ w: 60, h: 45, shapes: [
    rect(-30, -22.5, 60, 45, 'body', 7), ellipse(0, 3, 21, 14, 'inner'), circle(0, -16, 2.6, 'waterDot'), circle(0, 3, 2.2, 'water'),
  ] }),
  wc: () => ({ w: 40, h: 70, shapes: [
    rect(-20, -35, 40, 14, 'body', 3),
    path('M-16 -19H16V6C16 22 8 35 0 35C-8 35 -16 22 -16 6Z', 'body'),
    path('M-10 -12H10V6C10 17 5 26 0 26C-5 26 -10 17 -10 6Z', 'inner'),
  ] }),
  bath: () => ({ w: 170, h: 70, shapes: [
    rect(-85, -35, 170, 70, 'body', 6), rect(-79, -29, 158, 58, 'inner', 26),
    circle(-70, -8, 2.6, 'waterDot'), circle(-70, 8, 2.6, 'waterDot'), circle(-56, 0, 3.2, 'water'),
  ] }),
  'shower-tray': () => ({ w: 80, h: 80, shapes: [
    rect(-40, -40, 80, 80, 'body', 3), rect(-34, -34, 68, 68, 'inner', 2),
    path('M-34 -34L34 34M34 -34L-34 34', 'faint'), circle(0, 0, 5, 'water'), circle(0, 0, 1.5, 'waterDot'),
  ] }),
  'shower-valve': () => ({ w: 20, h: 20, shapes: [circle(0, 0, 10, 'body'), circle(0, 0, 6, 'inner'), circle(0, 0, 1.8, 'waterDot')] }),
  bidet: () => ({ w: 32, h: 54, shapes: [
    path('M-16 -27H16V0C16 16 8 27 0 27C-8 27 -16 16 -16 0Z', 'body'),
    path('M-10 -19H10V0C10 11 5 20 0 20C-5 20 -10 11 -10 0Z', 'inner'), circle(0, -23, 2.4, 'waterDot'),
  ] }),
  'floor-drain': () => ({ w: 24, h: 24, shapes: [rect(-12, -12, 24, 24, 'body', 2), circle(0, 0, 8, 'inner'), path('M-8 0H8M0 -8V8', 'water')] }),
  'kitchen-sink': () => ({ w: 120, h: 50, shapes: [
    rect(-60, -25, 120, 50, 'body', 4), rect(-55, -20, 40, 36, 'inner', 7), rect(-10, -20, 32, 36, 'inner', 7),
    path('M28 -15H54M28 -8H54M28 -1H54M28 6H54M28 13H54', 'faint'),
    circle(-12, -22, 2.6, 'waterDot'), circle(-35, 0, 2, 'water'), circle(6, 0, 2, 'water'),
  ] }),
  'utility-sink': () => ({ w: 60, h: 44, shapes: [
    rect(-30, -22, 60, 44, 'body', 4), rect(-25, -14, 50, 32, 'inner', 6), circle(0, -18, 2.6, 'waterDot'), circle(0, 2, 2, 'water'),
  ] }),
  'washing-machine': () => ({ w: 60, h: 60, shapes: [
    rect(-30, -30, 60, 60, 'body', 4), circle(0, 4, 20, 'inner'), circle(0, 4, 13, 'line'), circle(-20, -23, 2, 'line'), circle(-12, -23, 2, 'line'),
  ] }),
  dishwasher: () => ({ w: 60, h: 60, shapes: [
    rect(-30, -30, 60, 60, 'body', 4), path('M-30 -20H30', 'line'), path('M-22 -12V24M-11 -12V24M0 -12V24M11 -12V24M22 -12V24', 'faint'), circle(22, -25, 1.8, 'line'),
  ] }),
  'fridge-supply': () => ({ w: 60, h: 66, shapes: [
    rect(-30, -30, 60, 60, 'body', 4), path('M-30 -6H30M22 -22V-12M22 2V14', 'line'), circle(0, -34, 3, 'waterDot'),
  ] }),
  softener: () => ({ w: 60, h: 32, shapes: [
    circle(-14, 0, 16, 'body'), circle(-14, 0, 9, 'inner'), rect(6, -12, 24, 24, 'body', 3), circle(-14, 0, 2, 'waterDot'),
  ] }),
  'towel-rail': () => ({ w: 50, h: 8, shapes: [
    rect(-25, -4, 50, 8, 'heat', 2), circle(-20, 0, 1.6, 'heatDot'), circle(-10, 0, 1.6, 'heatDot'), circle(0, 0, 1.6, 'heatDot'), circle(10, 0, 1.6, 'heatDot'), circle(20, 0, 1.6, 'heatDot'),
  ] }),
  'outside-tap': () => ({ w: 32, h: 14, shapes: [path('M-16 -6H16', 'line'), path('M0 -6V6H5', 'water'), circle(5, 6, 3, 'waterDot')] }),
  'heat-source': () => ({ w: 44, h: 36, shapes: [
    rect(-22, -18, 44, 36, 'heat', 4), path('M0 -10C7 -3 9 4 0 11C-9 4 -5 -3 0 -10Z', 'heatDot'),
  ] }),
}

/** The symbol for a kind of fitting at the size of the real one, or null when there is none (the screen then draws its old dot). A radiator is `widthMm` wide (800mm if not given): its panel, its fins and a valve at each end. */
export function plumbSymbol(typeId: string, widthMm?: number): PlumbSymbol | null {
  if (typeId === 'radiator') {
    const w = Math.max(20, (widthMm ?? DEFAULT_RADIATOR_MM) / 10)
    const fins: string[] = []
    for (let x = -w / 2 + 8; x < w / 2 - 3; x += 8) fins.push(`M${+x.toFixed(2)} -5V5`)
    return { w: w + 14, h: 10, shapes: [rect(-w / 2, -5, w, 10, 'heat', 2), path(fins.join(''), 'faint'), circle(-w / 2 - 4, 0, 2.6, 'heatDot'), circle(w / 2 + 4, 0, 2.6, 'heatDot')] }
  }
  const make = SYMBOLS[typeId]
  return make ? make() : null
}

/**
 * How far to turn a fitting so its back is to the nearest wall: degrees clockwise on screen, 0 when no wall side is within `maxDistPx` (it then keeps its drawn direction). `sides` are wall faces and lines in plan pixels.
 * The symbol's back is its -y side, so a wall above it gives 0, one to its right 90, one below 180.
 */
export function facingAngle(at: { x: number; y: number }, sides: [{ x: number; y: number }, { x: number; y: number }][], maxDistPx: number): number {
  let best = maxDistPx, vx = 0, vy = 0, found = false
  for (const [a, b] of sides) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / l2))
    const px = a.x + t * dx - at.x, py = a.y + t * dy - at.y
    const d = Math.hypot(px, py)
    if (d < best) { best = d; vx = px; vy = py; found = true }
  }
  if (!found || best < 1e-6) return 0
  return (Math.atan2(vx, -vy) * 180) / Math.PI
}
