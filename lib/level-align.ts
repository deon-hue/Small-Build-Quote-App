// Lining the outside walls of one level up with the outside walls of the level below it (a first floor over a ground floor). Pure, no imports, so it can be tested with plain Node.
//
// Each point of a wall on the upper level goes to the nearest CORNER of the lower level's outside walls if there is one within the tolerance, otherwise onto the nearest lower outside WALL (the closest point on it) if
// one is within the tolerance, otherwise it stays where it is. Every point goes to the same corner, so walls that were joined stay joined.

export interface Pt { x: number; y: number }
export interface LowerWall { points: Pt[]; closed: boolean }
export interface AlignResult {
  points: Pt[]
  /** how many points went to a corner, onto a wall, or stayed (nothing near) */
  corners: number
  onWall: number
  none: number
  changed: boolean
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function nearestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return { x: a.x + dx * t, y: a.y + dy * t }
}

export function alignPointsToLower(points: Pt[], lower: LowerWall[], tol: number): AlignResult {
  const corners: Pt[] = []
  const segs: [Pt, Pt][] = []
  for (const w of lower) {
    const n = w.points.length
    for (const p of w.points) corners.push(p)
    const count = w.closed ? n : n - 1
    for (let i = 0; i < count; i++) segs.push([w.points[i], w.points[(i + 1) % n]])
  }
  let nc = 0, nw = 0, nn = 0, changed = false
  const out = points.map(p => {
    let best: Pt | null = null, bd = tol
    for (const c of corners) { const d = dist(p, c); if (d <= bd) { bd = d; best = c } }
    if (best) { nc++; if (dist(p, best) > 1e-9) changed = true; return { x: best.x, y: best.y } }
    let onWall: Pt | null = null
    bd = tol
    for (const [a, b] of segs) { const q = nearestOnSegment(p, a, b); const d = dist(p, q); if (d <= bd) { bd = d; onWall = q } }
    if (onWall) { nw++; if (dist(p, onWall) > 1e-9) changed = true; return onWall }
    nn++
    return { x: p.x, y: p.y }
  })
  return { points: out, corners: nc, onWall: nw, none: nn, changed }
}
