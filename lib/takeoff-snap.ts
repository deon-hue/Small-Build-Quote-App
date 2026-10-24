// Drawing aids for Take-off: snapping the cursor to the corners and ends of drawings already on the plan (and their mid-points), locking a line horizontal or vertical (ortho), typing an exact length while drawing,
// and rotating a drawing. Pure (plan pixel coordinates in, plan pixel coordinates out), so it can be tested.

export interface Pt { x: number; y: number }
export interface SnapAnchor extends Pt { kind: 'end' | 'mid' }
export type SnapKind = 'end' | 'mid' | 'ortho' | 'none'
export interface SnapResult { pt: Pt; kind: SnapKind; /** the point snapped to (for the marker), if any */ target?: Pt }

interface ShapeLike { type: 'line' | 'rect' | 'polygon'; points: Pt[] }

/** The corners of a drawing as it is drawn: a rectangle is stored as two opposite corners, the others as their points. */
export function cornersOf(el: ShapeLike): Pt[] {
  if (el.type === 'rect' && el.points.length >= 2) {
    const [a, b] = el.points
    return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]
  }
  return el.points.map(p => ({ x: p.x, y: p.y }))
}

/** Every point the cursor can snap to: the ends and corners of the drawings, the middle of each of their sides, and any extra points (the ones being drawn now). A rectangle and a polygon are closed shapes. */
export function anchorsFor(elements: ShapeLike[], extra: Pt[] = []): SnapAnchor[] {
  const out: SnapAnchor[] = []
  for (const el of elements) {
    const c = cornersOf(el)
    for (const p of c) out.push({ ...p, kind: 'end' })
    const closed = el.type !== 'line'
    const n = closed ? c.length : c.length - 1
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % c.length]
      out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid' })
    }
  }
  for (const p of extra) out.push({ ...p, kind: 'end' })
  return out
}

/**
 * Where a click lands. `radius` is how close (in plan pixels: divide screen pixels by the zoom) the cursor has to be to a point to snap to it.
 *   ortho  with a previous point, the line from it is locked to horizontal or vertical (whichever the cursor is nearer to)
 *   snap   to the nearest corner or end (a corner wins over a mid-point that is a little nearer); while locked to ortho, a point that sits on the locked line is snapped to ALONG it
 */
export function snapPoint(raw: Pt, o: { anchors: SnapAnchor[]; last?: Pt; radius: number; snap: boolean; ortho: boolean }): SnapResult {
  let p: Pt = { x: raw.x, y: raw.y }
  let kind: SnapKind = 'none'
  let horizontal = false
  const locked = o.ortho && !!o.last
  if (locked && o.last) {
    horizontal = Math.abs(raw.x - o.last.x) >= Math.abs(raw.y - o.last.y)
    p = horizontal ? { x: raw.x, y: o.last.y } : { x: o.last.x, y: raw.y }
    kind = 'ortho'
  }
  if (o.snap) {
    let best: SnapAnchor | null = null, bestScore = Infinity
    for (const a of o.anchors) {
      const d = Math.hypot(a.x - p.x, a.y - p.y)
      if (d > o.radius) continue
      const score = d * (a.kind === 'mid' ? 1.3 : 1)
      if (score < bestScore) { best = a; bestScore = score }
    }
    if (best) {
      const target = { x: best.x, y: best.y }
      if (locked && o.last) return { pt: horizontal ? { x: best.x, y: o.last.y } : { x: o.last.x, y: best.y }, kind: best.kind, target }
      return { pt: target, kind: best.kind, target }
    }
  }
  return { pt: p, kind }
}

/** What was typed while drawing: "3.45" is a length in metres; "4.5x3" or "4.5,3" is a width and a height (a rectangle). Null when it is not a number or numbers above zero. */
export function parseTyped(s: string): { a: number; b?: number } | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  const parts = t.split(/[x,*]/)
  if (parts.length > 2) return null
  const nums = parts.map(x => (/^\d*\.?\d+$/.test(x) || /^\d+\.?$/.test(x) ? parseFloat(x) : NaN))
  if (nums.some(n => !(n > 0) || !Number.isFinite(n))) return null
  return nums.length === 2 ? { a: nums[0], b: nums[1] } : { a: nums[0] }
}

/** The point `lengthM` metres from `from`, in the direction of `toward` (null when the two are the same point, so there is no direction). */
export function pointAtDistance(from: Pt, toward: Pt, lengthM: number, mpp: number): Pt | null {
  const dx = toward.x - from.x, dy = toward.y - from.y
  const d = Math.hypot(dx, dy)
  if (!(d > 0) || !(mpp > 0)) return null
  const px = lengthM / mpp
  return { x: from.x + (dx / d) * px, y: from.y + (dy / d) * px }
}

/** The opposite corner of a rectangle `wM` wide and `hM` high from `from`, running the way the cursor is (a corner straight across from the cursor when it is exactly on a line through `from`). */
export function rectCornerAt(from: Pt, toward: Pt, wM: number, hM: number, mpp: number): Pt {
  const sx = toward.x < from.x ? -1 : 1, sy = toward.y < from.y ? -1 : 1
  return { x: from.x + sx * wM / mpp, y: from.y + sy * hM / mpp }
}

/** Points turned clockwise (on screen) by `deg` degrees about (cx, cy). */
export function rotatePoints<P extends Pt>(points: P[], deg: number, cx: number, cy: number): P[] {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r), sin = Math.sin(r)
  return points.map(p => ({ ...p, x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos }))
}

/** The middle of a drawing: the average of its corners (it does not move when the drawing is turned, so turning by an angle and back puts it where it was). */
export function centreOf(points: Pt[]): Pt {
  const n = points.length || 1
  return { x: points.reduce((t, p) => t + p.x, 0) / n, y: points.reduce((t, p) => t + p.y, 0) / n }
}

/** Turning a drawing: a rectangle turned a quarter turn is still a rectangle (two corners); turned any other amount it has to become a four-cornered polygon. Returns the new type and points. */
export function rotateShape<P extends Pt>(el: { type: 'line' | 'rect' | 'polygon'; points: P[] }, deg: number): { type: 'line' | 'rect' | 'polygon'; points: P[] } {
  const c = centreOf(cornersOf(el))
  if (el.type !== 'rect') return { type: el.type, points: rotatePoints(el.points, deg, c.x, c.y) }
  const corners = rotatePoints(cornersOf(el) as P[], deg, c.x, c.y)
  const quarter = Math.abs(((deg % 90) + 90) % 90) < 1e-9
  if (!quarter) return { type: 'polygon', points: corners }
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
  return { type: 'rect', points: [{ x: Math.min(...xs), y: Math.min(...ys) } as P, { x: Math.max(...xs), y: Math.max(...ys) } as P] }
}
