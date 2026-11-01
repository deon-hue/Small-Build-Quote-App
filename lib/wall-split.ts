// Splitting a wall drawn as one run (a U-shaped line of three sides, or a rectangle or polygon outline) into one wall per side, so each side can be clicked, edited, priced, given its own doors and windows, or deleted on its own.
// Walls of the same make-up whose ends meet are still painted as one run with mitred corners (chainWalls), so splitting changes nothing on the drawing. Pure, so it can be tested. Type-only imports.

import type { PlacedOpening } from './wall-openings'

export interface Pt { x: number; y: number }

/** The sides of a drawn wall as two-point lines: a line's own segments, or every side of a rectangle (given as two corners) or a polygon, closed. A side shorter than `minLen` (plan pixels; none by default) is left out: the stub a double-click leaves at the end of a wall is not a wall. */
export function sidesOf(el: { type: 'line' | 'rect' | 'polygon'; points: Pt[] }, minLen = 1e-9): Pt[][] {
  let pts = el.points
  let closed = false
  if (el.type === 'rect' && pts.length >= 2) {
    const [a, b] = pts
    pts = [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]
    closed = true
  } else if (el.type === 'polygon') closed = true
  const out: Pt[][] = []
  const n = pts.length
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    if (Math.hypot(b.x - a.x, b.y - a.y) > minLen) out.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }])
  }
  return out
}

const len = (s: Pt[]) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y)

/** The doors and windows placed on the wall that was split, moved onto the side they were on (their distance along the wall becomes the distance along that side). `newIds[i]` is the id of side i's wall. */
export function splitOpenings(placed: PlacedOpening[], wallId: string, sides: Pt[][], newIds: string[]): PlacedOpening[] {
  const total = sides.reduce((s, x) => s + len(x), 0)
  return placed.map(o => {
    if (o.wallId !== wallId) return o
    const d = Math.max(0, Math.min(total, o.distPx))
    let at = 0
    for (let i = 0; i < sides.length; i++) {
      const l = len(sides[i])
      if (d <= at + l + 1e-9 || i === sides.length - 1) return { ...o, wallId: newIds[i], distPx: Math.max(0, Math.min(l, d - at)) }
      at += l
    }
    return o
  })
}

// ── Making two walls one: the opposite of splitting ───────────────────────────────────────────────────────────────────────────────────────────

/** The length of a polyline (plan pixels) */
export function polyLen(pts: Pt[]): number {
  let t = 0
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return t
}

export type WallMergePlan =
  | { ok: true; points: Pt[]; aShift: number; bShift: number; bFlip: boolean; gap: number }
  | { ok: false; reason: 'apart' | 'short'; gap: number }

/**
 * Where two walls (each a line of points) meet end to end, and the one run they make together. The first wall keeps its direction; the second is turned round if it was drawn the other way, so the run goes
 * a ... joint ... b. The ends that are nearest are used; they must be within `tolPx` of each other (the walls must already meet: Join Corner makes them meet exactly). `aShift` and `bShift` say how far along the new
 * run each wall's own start now is, and `bFlip` that the second wall runs the other way along the run, which is what its doors and windows need to follow (see `mergeOpenings`).
 */
export function planWallMerge(a: Pt[], b: Pt[], tolPx: number): WallMergePlan {
  if (a.length < 2 || b.length < 2) return { ok: false, reason: 'short', gap: Infinity }
  const aF = a[0], aL = a[a.length - 1], bF = b[0], bL = b[b.length - 1]
  const d = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)
  const options = [
    { gap: d(aL, bF), kind: 1 }, // a then b
    { gap: d(aL, bL), kind: 2 }, // a then b reversed
    { gap: d(aF, bF), kind: 3 }, // b reversed then a
    { gap: d(aF, bL), kind: 4 }, // b then a
  ].sort((x, y) => x.gap - y.gap)
  const best = options[0]
  if (best.gap > tolPx) return { ok: false, reason: 'apart', gap: best.gap }
  const lenA = polyLen(a), lenB = polyLen(b)
  const clone = (p: Pt[]) => p.map(q => ({ x: q.x, y: q.y }))
  const rev = (p: Pt[]) => clone(p).reverse()
  switch (best.kind) {
    case 1: return { ok: true, points: [...clone(a), ...clone(b).slice(1)], aShift: 0, bShift: lenA, bFlip: false, gap: best.gap }
    case 2: return { ok: true, points: [...clone(a), ...rev(b).slice(1)], aShift: 0, bShift: lenA, bFlip: true, gap: best.gap }
    case 3: return { ok: true, points: [...rev(b), ...clone(a).slice(1)], aShift: lenB, bShift: 0, bFlip: true, gap: best.gap }
    default: return { ok: true, points: [...clone(b), ...clone(a).slice(1)], aShift: lenB, bShift: 0, bFlip: false, gap: best.gap }
  }
}

/** The doors and windows placed on either wall, moved onto the merged wall `newId`: each keeps its place along the run (the second wall's distances count from the other end when it was turned round). */
export function mergeOpenings(placed: PlacedOpening[], aId: string, bId: string, lenA: number, lenB: number, plan: Extract<WallMergePlan, { ok: true }>): PlacedOpening[] {
  return placed.map(o => {
    if (o.wallId === aId) return { ...o, wallId: aId, distPx: o.distPx + plan.aShift }
    if (o.wallId === bId) return { ...o, wallId: aId, distPx: (plan.bFlip ? lenB - o.distPx : o.distPx) + plan.bShift }
    return o
  })
}
