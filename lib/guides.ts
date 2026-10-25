// Construction guides for Take-off: lines that run on across the plan (horizontal, vertical, angled, or a set distance off a wall or another guide) that drawing points snap to, like the lines a
// drafter pencils in before drawing the walls and foundations. A guide is never priced, never in the schedule and never sent to the quote. Pure (plan pixel coordinates), so it can be tested.

export interface Pt { x: number; y: number }
/** An endless line through `a` and `b` (the two points only fix its direction and where it is). */
export interface Guide { id: string; a: Pt; b: Pt }
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** The shortest a guide's two points may be apart (plan pixels), so it has a direction. */
const MIN_LEN = 0.5

export type GuideDirection = 'horizontal' | 'vertical' | 'angled'

export function guideDirection(g: Guide): GuideDirection {
  const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y
  const len = Math.hypot(dx, dy) || 1
  if (Math.abs(dy) / len < 1e-4) return 'horizontal'
  if (Math.abs(dx) / len < 1e-4) return 'vertical'
  return 'angled'
}

export const horizontalGuide = (id: string, y: number, x = 0): Guide => ({ id, a: { x, y }, b: { x: x + 100, y } })
export const verticalGuide = (id: string, x: number, y = 0): Guide => ({ id, a: { x, y }, b: { x, y: y + 100 } })

/** A guide through two points, or null when they are the same point (no direction). */
export function guideFromPoints(id: string, a: Pt, b: Pt): Guide | null {
  if (!(Math.hypot(b.x - a.x, b.y - a.y) >= MIN_LEN)) return null
  return { id, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
}

/** The part of the endless line that lies inside the box, as two points (null when it misses the box). */
export function clipToBox(line: { a: Pt; b: Pt }, box: Box): [Pt, Pt] | null {
  const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y
  if (Math.hypot(dx, dy) < 1e-9) return null
  let t0 = -Infinity, t1 = Infinity
  const clip = (p: number, q: number): boolean => {
    // Liang-Barsky: p*t <= q
    if (Math.abs(p) < 1e-12) return q >= 0
    const r = q / p
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r } else { if (r < t0) return false; if (r < t1) t1 = r }
    return true
  }
  if (!clip(-dx, line.a.x - box.x0) || !clip(dx, box.x1 - line.a.x) || !clip(-dy, line.a.y - box.y0) || !clip(dy, box.y1 - line.a.y)) return null
  if (!(t1 > t0)) return null
  return [{ x: line.a.x + dx * t0, y: line.a.y + dy * t0 }, { x: line.a.x + dx * t1, y: line.a.y + dy * t1 }]
}

/** Every guide as a two-point segment spanning the box: what the cursor snaps ONTO, anywhere along it. */
export function guideSegments(guides: Guide[], box: Box): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  for (const g of guides) { const s = clipToBox(g, box); if (s) out.push(s) }
  return out
}

/** Where guides cross each other inside the box (parallel guides never do): points the cursor snaps to like a corner. */
export function guideCrossings(guides: Guide[], box: Box): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < guides.length; i++) {
    for (let j = i + 1; j < guides.length; j++) {
      const p = guides[i].a, r = { x: guides[i].b.x - p.x, y: guides[i].b.y - p.y }
      const q = guides[j].a, s = { x: guides[j].b.x - q.x, y: guides[j].b.y - q.y }
      const den = r.x * s.y - r.y * s.x
      if (Math.abs(den) < 1e-9 * (Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) continue
      const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den
      const c = { x: p.x + t * r.x, y: p.y + t * r.y }
      if (c.x >= box.x0 && c.x <= box.x1 && c.y >= box.y0 && c.y <= box.y1) out.push(c)
    }
  }
  return out
}

/** Signed distance from `p` to the endless line through `a` and `b`: positive on the RIGHT of the way a to b goes on screen (y down), negative on the left. */
export function signedOffset(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
  if (!(len > 0)) return 0
  return ((p.x - a.x) * -dy + (p.y - a.y) * dx) / len
}

export function distanceToGuide(g: Guide, p: Pt): number {
  return Math.abs(signedOffset(g.a, g.b, p))
}

/** The guide nearest `p` within `radius`, or null. */
export function nearestGuide(guides: Guide[], p: Pt, radius: number): Guide | null {
  let best: Guide | null = null, bd = radius
  for (const g of guides) { const d = distanceToGuide(g, p); if (d <= bd) { bd = d; best = g } }
  return best
}

/** The same guide moved sideways (never along itself) so that it passes through `p`. */
export function moveGuideThrough(g: Guide, p: Pt): Guide {
  const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, len = Math.hypot(dx, dy)
  if (!(len > 0)) return g
  // the unit normal (pointing to the side signedOffset calls positive) and how far p is along it
  const nx = -dy / len, ny = dx / len
  const d = (p.x - g.a.x) * nx + (p.y - g.a.y) * ny
  return { ...g, a: { x: g.a.x + nx * d, y: g.a.y + ny * d }, b: { x: g.b.x + nx * d, y: g.b.y + ny * d } }
}

/** A line parallel to the one through `a` and `b`, `distPx` away on the side `toward` is on (a point exactly on the line goes to the right of the way it runs). */
export function offsetLine(a: Pt, b: Pt, toward: Pt, distPx: number): { a: Pt; b: Pt } {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
  if (!(len > 0)) return { a, b }
  const side = signedOffset(a, b, toward) < 0 ? -1 : 1
  const nx = (-dy / len) * side * distPx, ny = (dx / len) * side * distPx
  return { a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } }
}

export interface PickLine { a: Pt; b: Pt; /** an endless line (a guide) or only the stretch between a and b (the side of a wall) */ endless: boolean }

/** The line (or side) nearest `p` within `radius`: its index in `lines`, and how far away it is; -1 when none is near. */
export function nearestLine(p: Pt, lines: PickLine[], radius: number): { index: number; dist: number } {
  let index = -1, dist = radius
  lines.forEach((l, i) => {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, l2 = dx * dx + dy * dy
    if (!(l2 > 0)) return
    const t0 = ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / l2
    const t = l.endless ? t0 : Math.max(0, Math.min(1, t0))
    const d = Math.hypot(p.x - (l.a.x + t * dx), p.y - (l.a.y + t * dy))
    if (d <= dist) { dist = d; index = i }
  })
  return { index, dist }
}

/** What a guide is called in words: 'Horizontal guide', 'Vertical guide' or 'Guide at 35° from horizontal'. */
export function guideName(g: Guide): string {
  const dir = guideDirection(g)
  if (dir === 'horizontal') return 'Horizontal guide'
  if (dir === 'vertical') return 'Vertical guide'
  let deg = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180 / Math.PI
  deg = ((deg % 180) + 180) % 180
  if (deg > 90) deg = 180 - deg
  return `Guide at ${Math.round(deg)}° from horizontal`
}
