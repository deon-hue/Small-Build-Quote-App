// Splitting a wall drawn as one run (a U-shaped line of three sides, or a rectangle or polygon outline) into one wall per side, so each side can be clicked, edited, priced, given its own doors and windows, or deleted on its own.
// Walls of the same make-up whose ends meet are still painted as one run with mitred corners (chainWalls), so splitting changes nothing on the drawing. Pure, so it can be tested. Type-only imports.

import type { PlacedOpening } from './wall-openings'

export interface Pt { x: number; y: number }

/** The sides of a drawn wall as two-point lines: a line's own segments, or every side of a rectangle (given as two corners) or a polygon, closed. A side of no length is left out. */
export function sidesOf(el: { type: 'line' | 'rect' | 'polygon'; points: Pt[] }): Pt[][] {
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
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) out.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }])
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
