// Keeping a Take-off drawing in step with the calculator that prices it. The calculators are sized from the drawing (a wall's length, a roof's box, a floor's area), but the size typed over inside the calculator used to stay
// in the calculator only: the price changed and the drawing, its quantity and its label did not. When a calculator is saved it now reports the size it was left at (`sizeFromValues`, read from its saved state), and Take-off scales the
// drawing to match (`planResize` / `applyResize`). Pure, so it can be tested.

export interface CalcSize { lengthMm?: number; widthMm?: number; areaM2?: number }
export type ResizeKind = 'line' | 'box' | 'area'
export interface Pt { x: number; y: number }

const pos = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

/** The size a calculator was left at, from the values it saved (namespace -> key -> value). A roof calculator can leave the values of a roof type it was switched away from behind, so when several namespaces carry a size the one
 * written to most recently (`stamps`, higher = later) is the one on screen. Reads lengthMm, widthMm (or spanMm: the pitched roofs call their width a span) and areaM2. */
export function sizeFromValues(values: Record<string, Record<string, unknown>>, stamps: Record<string, number> = {}): CalcSize {
  let best: { ns: string; stamp: number } | null = null
  for (const [ns, v] of Object.entries(values)) {
    if (!v || (pos(v.lengthMm) === undefined && pos(v.areaM2) === undefined)) continue
    const stamp = stamps[ns] ?? 0
    if (!best || stamp >= best.stamp) best = { ns, stamp }
  }
  if (!best) return {}
  const v = values[best.ns]
  const out: CalcSize = {}
  const l = pos(v.lengthMm), w = pos(v.widthMm) ?? pos(v.spanMm), a = pos(v.areaM2)
  if (l !== undefined) out.lengthMm = l
  if (w !== undefined) out.widthMm = w
  if (a !== undefined) out.areaM2 = a
  return out
}

const polylineMm = (pts: Pt[], mpp: number) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0) * mpp * 1000
const shoelaceM2 = (pts: Pt[], mpp: number) => { let a = 0; for (let i = 0; i < pts.length; i++) { const q = pts[i], r = pts[(i + 1) % pts.length]; a += q.x * r.y - r.x * q.y } return Math.abs(a) / 2 * mpp * mpp }

export interface ResizePlan { sx: number; sy: number; ox: number; oy: number; was: string; now: string }

/** How to scale a drawing so it matches the calculator, or null when it already does (within 0.2%) or the calculator gave no size for this kind of drawing.
 *   line  the drawn line's length: every point is scaled along the line from its first point
 *   box   a roof or raft: the box the shape sits in is scaled to the calculator's length and width (the long side stays the long side)
 *   area  a floor: scaled evenly (the shape keeps its proportions) to the calculator's area */
export function planResize(kind: ResizeKind, points: Pt[], mpp: number, size: CalcSize): ResizePlan | null {
  if (points.length < 2 || !(mpp > 0)) return null
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  const m = (mm: number) => (mm / 1000).toFixed(2)
  if (kind === 'line') {
    const was = polylineMm(points, mpp)
    if (!(was > 0) || !size.lengthMm) return null
    const f = size.lengthMm / was
    if (Math.abs(f - 1) < 0.002) return null
    return { sx: f, sy: f, ox: points[0].x, oy: points[0].y, was: `${m(was)} m`, now: `${m(size.lengthMm)} m` }
  }
  if (kind === 'box') {
    if (!size.lengthMm || !size.widthMm) return null
    const wPx = Math.max(...points.map(p => p.x)) - minX, hPx = Math.max(...points.map(p => p.y)) - minY
    const wMm = wPx * mpp * 1000, hMm = hPx * mpp * 1000
    if (!(wMm > 0) || !(hMm > 0)) return null
    const xIsLong = wMm >= hMm
    const sx = (xIsLong ? size.lengthMm : size.widthMm) / wMm
    const sy = (xIsLong ? size.widthMm : size.lengthMm) / hMm
    if (Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return null
    const long = Math.max(wMm, hMm), short = Math.min(wMm, hMm)
    return { sx, sy, ox: minX, oy: minY, was: `${m(long)} × ${m(short)} m`, now: `${m(size.lengthMm)} × ${m(size.widthMm)} m` }
  }
  if (!size.areaM2 || points.length < 3) return null
  const was = shoelaceM2(points, mpp)
  if (!(was > 0)) return null
  const f = Math.sqrt(size.areaM2 / was)
  if (Math.abs(f - 1) < 0.002) return null
  return { sx: f, sy: f, ox: minX, oy: minY, was: `${was.toFixed(1)} m²`, now: `${size.areaM2.toFixed(1)} m²` }
}

export function applyResize<P extends Pt>(points: P[], plan: ResizePlan): P[] {
  return points.map(p => ({ ...p, x: plan.ox + (p.x - plan.ox) * plan.sx, y: plan.oy + (p.y - plan.oy) * plan.sy }))
}
