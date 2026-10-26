// Walls that are joined stay joined when one of them is moved. When a wall (or one corner of it) is dragged, any other wall that ENDS at the same point comes with it, so the corner stays a corner and the neighbour stretches or shrinks;
// and a partition whose end lands on the dragged wall (a tee) is stretched along its own direction to stay on the wall's new line. Pure (plan pixels in and out), so it can be tested. No imports.

export interface Pt { x: number; y: number }
interface ShapeLike { id: string; type: 'line' | 'rect' | 'polygon'; points: Pt[] }

/** One point of another wall that follows the wall being dragged */
export interface DragLink {
  /** the other wall, and which of its points */
  elId: string
  k: number
  type: 'vertex' | 'attach'
  /** where that point was when the drag began */
  orig: Pt
  /** for a tee ('attach'): the dragged wall's side the end lands on, and the partition's other end (which stays where it is) */
  seg?: [Pt, Pt]
  far?: Pt
}

const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

function onSegment(p: Pt, a: Pt, b: Pt, tol: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  if (l2 === 0) return false
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  if (t <= 0 || t >= 1) return false   // (an end is a vertex link, not a tee)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol
}

/**
 * Which points of the other walls follow a drag. `vertexIndex` is the corner being dragged (undefined = the whole wall is being moved). A rectangle is not linked (its corners are not points of its own); another wall that is a line or
 * a polygon is. Points within `tol` plan pixels count as joined (the same distance the walls are painted as one run).
 */
export function buildDragLinks(dragged: ShapeLike, vertexIndex: number | undefined, others: ShapeLike[], tol = 3): DragLink[] {
  if (dragged.type === 'rect') return []
  const idx = vertexIndex === undefined ? dragged.points.map((_, i) => i) : [vertexIndex]
  const moved = idx.map(i => dragged.points[i]).filter(Boolean)
  // the dragged wall's sides, for the tees (a whole-wall move only: a corner being dragged changes the angle of two sides)
  const sides: [Pt, Pt][] = []
  if (vertexIndex === undefined) {
    const n = dragged.points.length
    const count = dragged.type === 'polygon' ? n : n - 1
    for (let i = 0; i < count; i++) sides.push([dragged.points[i], dragged.points[(i + 1) % n]])
  }
  const out: DragLink[] = []
  for (const o of others) {
    if (o.id === dragged.id || o.type === 'rect') continue
    o.points.forEach((p, k) => {
      if (moved.some(m => near(m, p, tol))) { out.push({ elId: o.id, k, type: 'vertex', orig: { x: p.x, y: p.y } }); return }
      // a tee: an open wall whose END lands on a side of the dragged wall
      if (o.type !== 'line' || (k !== 0 && k !== o.points.length - 1) || o.points.length < 2) return
      const seg = sides.find(([a, b]) => onSegment(p, a, b, tol))
      if (!seg) return
      const far = o.points[k === 0 ? 1 : o.points.length - 2]
      out.push({ elId: o.id, k, type: 'attach', orig: { x: p.x, y: p.y }, seg: [{ ...seg[0] }, { ...seg[1] }], far: { x: far.x, y: far.y } })
    })
  }
  return out
}

/** Where a linked point goes when the dragged wall has moved by (dx, dy): a joined end moves with it; a tee end slides along its own direction to the wall's new line (or moves with it if the two are parallel). */
export function applyLink(l: DragLink, dx: number, dy: number): Pt {
  if (l.type === 'vertex' || !l.seg || !l.far) return { x: l.orig.x + dx, y: l.orig.y + dy }
  const A = { x: l.seg[0].x + dx, y: l.seg[0].y + dy }, B = { x: l.seg[1].x + dx, y: l.seg[1].y + dy }
  const F = l.far, rx = l.orig.x - F.x, ry = l.orig.y - F.y        // the partition: F + t r
  const sx = B.x - A.x, sy = B.y - A.y                              // the wall: A + s (B - A)
  const det = rx * sy - ry * sx
  if (Math.abs(det) < 1e-9) return { x: l.orig.x + dx, y: l.orig.y + dy }
  const t = ((A.x - F.x) * sy - (A.y - F.y) * sx) / det
  return { x: F.x + t * rx, y: F.y + t * ry }
}

// ── Joining two walls at a corner ───────────────────────────────────────────────────────────────────────────────────────

export type JoinResult =
  | { ok: true; point: Pt; aIdx: number; bIdx: number; aMoved: number; bMoved: number; /** a T: this wall runs on past the crossing (the crossing is well inside it), so it stays where it is and only the other wall's end moves */ aHold: boolean; bHold: boolean }
  | { ok: false; reason: 'parallel' | 'far' | 'same' | 'cross' }

/**
 * Where two walls meet if they are extended (or trimmed) to a corner: the crossing of the two sides that were picked (side `aSeg` of the first wall's points, side `bSeg` of the second's), and which end of each side
 * moves there (the one nearer the crossing). `maxReach` is the farthest (plan pixels) an end may move: walls that would have to be dragged further than that do not belong to the same corner.
 * A T JUNCTION is a wall that stops against the side of another: when the crossing is well inside one of the two sides (at least a tenth of `maxReach`, 0.3 m for 3 m, from both its ends: a wall that runs on only a little way past is a corner that overshoots) that wall is the one that
 * runs through, so it is held and only the other wall's nearer end is moved to meet it. If the crossing is well inside BOTH sides they cross each other and there is nothing to join.
 */
export function joinCorner(a: Pt[], aSeg: number, b: Pt[], bSeg: number, maxReach: number): JoinResult {
  const A0 = a[aSeg], A1 = a[aSeg + 1], B0 = b[bSeg], B1 = b[bSeg + 1]
  if (!A0 || !A1 || !B0 || !B1) return { ok: false, reason: 'same' }
  const rx = A1.x - A0.x, ry = A1.y - A0.y, sx = B1.x - B0.x, sy = B1.y - B0.y
  const det = rx * sy - ry * sx
  if (Math.abs(det) < 1e-9 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) return { ok: false, reason: 'parallel' }
  const t = ((B0.x - A0.x) * sy - (B0.y - A0.y) * sx) / det
  const P = { x: A0.x + t * rx, y: A0.y + t * ry }
  const d = (p: Pt) => Math.hypot(p.x - P.x, p.y - P.y)
  const aIdx = d(A0) <= d(A1) ? aSeg : aSeg + 1
  const bIdx = d(B0) <= d(B1) ? bSeg : bSeg + 1
  // where along each side the crossing is (0 to 1 is between its two ends)
  const u = ((B0.x - A0.x) * ry - (B0.y - A0.y) * rx) / det
  const edge = Math.max(maxReach / 10, 1)
  const inside = (frac: number, p0: Pt, p1: Pt) => frac > 0 && frac < 1 && d(p0) > edge && d(p1) > edge
  const aHold = inside(t, A0, A1), bHold = inside(u, B0, B1)
  if (aHold && bHold) return { ok: false, reason: 'cross' }
  const aMoved = aHold ? 0 : d(a[aIdx]), bMoved = bHold ? 0 : d(b[bIdx])
  if (aMoved > maxReach || bMoved > maxReach) return { ok: false, reason: 'far' }
  return { ok: true, point: P, aIdx, bIdx, aMoved, bMoved, aHold, bHold }
}
