// Rooms that keep up with their walls (Take-off & Draw). A room found from walls follows them by itself (it is found again); this is for the things that are drawn: a room drawn as a shape and a room edge (the line
// that closes a room across an opening). A corner of one that sits on a wall moves when that wall is moved, and a room's name stays with its room when a wall passes the point it was written at. Pure (plan pixels in, plan
// pixels out), so it can be tested.

import { pointInPolygon, rectFromCorners, isAxisRect, type Pt, type DetectedRoom, type RoomLabel } from './rooms-from-walls'

/** A wall as it matters here: its drawn line, and how far its two faces are from it (plan pixels, to the right of the way it was drawn: lo is the smaller) */
export interface FollowWall { id: string; points: Pt[]; closed: boolean; lo: number; hi: number }
/** A drawn thing that can follow walls: a room's outline (`rect` = it stays a rectangle), or a room edge (whose ends also follow the end of a wall as it is made longer or shorter) */
export interface FollowTarget { points: Pt[]; kind: 'room' | 'edge'; rect?: boolean }

const EPS = 1e-6
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS

interface Side { a0: Pt; b0: Pt; a1: Pt; b1: Pt; lo: number; hi: number }

/** the sides of the walls that have moved: walls present before and after with the same number of corners */
function movedSides(before: FollowWall[], after: FollowWall[]): Side[] {
  const now = new Map(after.map(w => [w.id, w]))
  const out: Side[] = []
  for (const w of before) {
    const v = now.get(w.id)
    if (!v || v.points.length !== w.points.length) continue
    const n = w.points.length
    for (let i = 0; i < (w.closed ? n : n - 1); i++) {
      const a0 = w.points[i], b0 = w.points[(i + 1) % n], a1 = v.points[i], b1 = v.points[(i + 1) % n]
      if (same(a0, a1) && same(b0, b1)) continue
      out.push({ a0, b0, a1, b1, lo: w.lo, hi: w.hi })
    }
  }
  return out
}

/** how far one point moves with the walls it sits on (zero when none of them has moved) */
function shiftFor(p: Pt, sides: Side[], tol: number, followEnds: boolean): Pt {
  // one move for each direction: two walls in line that both move take the point once, two walls at a corner each move it their own way
  const parts: Pt[] = []
  const add = (v: Pt) => {
    const m = Math.hypot(v.x, v.y)
    if (m < EPS) return
    const k = parts.findIndex(q => Math.abs(q.x * v.x + q.y * v.y) / (Math.hypot(q.x, q.y) * m) > 0.9)
    if (k < 0) parts.push(v)
    else if (m > Math.hypot(parts[k].x, parts[k].y)) parts[k] = v
  }
  for (const s of sides) {
    const dx = s.b0.x - s.a0.x, dy = s.b0.y - s.a0.y, len = Math.hypot(dx, dy)
    if (len < EPS) continue
    const u = { x: dx / len, y: dy / len }, n = { x: -u.y, y: u.x }
    const off = (p.x - s.a0.x) * n.x + (p.y - s.a0.y) * n.y
    const along = (p.x - s.a0.x) * u.x + (p.y - s.a0.y) * u.y
    if (Math.min(Math.abs(off - s.lo), Math.abs(off - s.hi), Math.abs(off)) > tol) continue
    const reach = Math.max(Math.abs(s.lo), Math.abs(s.hi), s.hi - s.lo) + tol      // the corner of a room is a wall's thickness beyond the end of the drawn line
    if (along < -reach || along > len + reach) continue
    const f = Math.max(0, Math.min(1, along / len))
    const dA = { x: s.a1.x - s.a0.x, y: s.a1.y - s.a0.y }, dB = { x: s.b1.x - s.b0.x, y: s.b1.y - s.b0.y }
    const d = { x: dA.x + (dB.x - dA.x) * f, y: dA.y + (dB.y - dA.y) * f }
    const across = d.x * n.x + d.y * n.y
    add({ x: n.x * across, y: n.y * across })
    if (followEnds) {
      // the end of a room edge sitting at the end of a wall goes with that end when the wall is made longer or shorter
      const end = along <= reach ? dA : along >= len - reach ? dB : null
      if (end) { const lengthwise = end.x * u.x + end.y * u.y; add({ x: u.x * lengthwise, y: u.y * lengthwise }) }
    }
  }
  return parts.reduce((t, v) => ({ x: t.x + v.x, y: t.y + v.y }), { x: 0, y: 0 })
}

/** Where each drawn thing goes now the walls have moved: its new points, or null where it does not move. `tol` is how near a face (or the drawn line) a point must be to sit on a wall, plan pixels. */
export function followWalls(before: FollowWall[], after: FollowWall[], targets: FollowTarget[], tol: number): (Pt[] | null)[] {
  const sides = movedSides(before, after)
  if (sides.length === 0) return targets.map(() => null)
  return targets.map(t => {
    const shifts = t.points.map(p => shiftFor(p, sides, tol, t.kind === 'edge'))
    if (shifts.every(s => Math.abs(s.x) < EPS && Math.abs(s.y) < EPS)) return null
    if (t.kind === 'room' && t.rect && isAxisRect(t.points)) {
      // a rectangle stays a rectangle: each of its four sides takes the biggest move of its corners
      const xs = t.points.map(p => p.x), ys = t.points.map(p => p.y)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      const most = (at: (p: Pt) => boolean, v: (s: Pt) => number) => t.points.reduce((best, p, i) => (at(p) && Math.abs(v(shifts[i])) > Math.abs(best) ? v(shifts[i]) : best), 0)
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-3
      const nx0 = x0 + most(p => near(p.x, x0), s => s.x), nx1 = x1 + most(p => near(p.x, x1), s => s.x)
      const ny0 = y0 + most(p => near(p.y, y0), s => s.y), ny1 = y1 + most(p => near(p.y, y1), s => s.y)
      if (!(nx1 - nx0 > 1) || !(ny1 - ny0 > 1)) return null      // squashed to nothing: it is left where it was
      return rectFromCorners({ x: nx0, y: ny0 }, { x: nx1, y: ny1 })
    }
    return t.points.map((p, i) => ({ x: p.x + shifts[i].x, y: p.y + shifts[i].y }))
  })
}

/**
 * The names brought along when the rooms found from walls change: a name whose point no longer falls in any room (a wall moved past it) goes to the room that now covers most of the room it was in, if that room has no name
 * of its own. Returns the new list, or null when nothing needs to move.
 */
export function reanchorLabels(labels: RoomLabel[], before: DetectedRoom[], after: DetectedRoom[]): RoomLabel[] | null {
  let changed = false
  const out = labels.slice()
  for (let k = 0; k < out.length; k++) {
    const l = out[k]
    const was = before.find(r => pointInPolygon(l, r.polygon))
    if (!was || after.some(r => pointInPolygon(l, r.polygon))) continue
    const xs = was.polygon.map(p => p.x), ys = was.polygon.map(p => p.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const hits = after.map(() => 0)
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
      const q = { x: x0 + ((x1 - x0) * (i + 0.5)) / 20, y: y0 + ((y1 - y0) * (j + 0.5)) / 20 }
      if (!pointInPolygon(q, was.polygon)) continue
      const at = after.findIndex(r => pointInPolygon(q, r.polygon))
      if (at >= 0) hits[at]++
    }
    const best = hits.reduce((b, h, i) => (h > (b < 0 ? 0 : hits[b]) ? i : b), -1)
    if (best < 0 || out.some((o, i) => i !== k && pointInPolygon(o, after[best].polygon))) continue
    out[k] = { ...l, x: after[best].labelAt.x, y: after[best].labelAt.y }
    changed = true
  }
  return changed ? out : null
}

/** The rooms that are new since last time (not there before at about the same size) and have no name: the ones to ask a name for, the biggest first */
export function newUnnamedRooms(before: DetectedRoom[], after: DetectedRoom[], labels: RoomLabel[]): DetectedRoom[] {
  return after
    .filter(r => !labels.some(l => l.name.trim() && pointInPolygon(l, r.polygon)))
    .filter(r => !before.some(b => pointInPolygon(r.labelAt, b.polygon) && Math.abs(b.areaM2 - r.areaM2) <= 0.05 * r.areaM2))
    .sort((a, b) => b.areaM2 - a.areaM2)
}
