// Doors and windows placed ON a drawn wall in Take-off & Draw. An opening is stored as a distance along its wall's drawn line (plan pixels from the wall's first point), a width and height in mm, a kind and (for a door that swings) which
// way it opens, so it keeps its place when the wall is reshaped and moves with the wall. This module is pure (plan pixels in, plan pixels out) so it can be tested: where along a wall a click lands, where an opening sits and how it
// is drawn (the gap in the wall, the jambs, a window's glass lines, a door leaf with its swing arc, bi-fold panels, a sliding door...). The screen only paints the shapes returned here.

import type { OpeningKind, WdSwing } from './wd-units'

export interface Pt { x: number; y: number }

/** An opening placed on a wall of the drawing */
export interface PlacedOpening {
  id: string
  /** the drawn wall (DrawnElement id) it is in */
  wallId: string
  /** how far along that wall's line its CENTRE is, in plan pixels from the wall's first point */
  distPx: number
  kind: OpeningKind
  widthMm: number
  heightMm: number
  /** which way a door opens (seen from the side you push it open from), used by doors that swing */
  swing: WdSwing
  /** W1, D1, ID1 ... */
  ref: string
  /** the room or wall it is in */
  location?: string
  /** the plan (sheet) the wall is on */
  sheetId?: string
  /** turned over to face the other side of the wall: a bay window projecting inside instead of outside, a bi-fold folding the other way (a door that swings is turned by changing its swing) */
  flipped?: boolean
  /** a drawing only: shown in the wall (the hole stays in it) but not estimated: not given to the Windows & Doors calculator, so not priced */
  notEstimated?: boolean
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** The wall's points as a path: a closed outline (a rectangle or polygon wall) comes back to its start */
function legs(points: Pt[], closed: boolean): { a: Pt; b: Pt; len: number; start: number }[] {
  const out: { a: Pt; b: Pt; len: number; start: number }[] = []
  let at = 0
  const n = points.length
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % n]
    const len = dist(a, b)
    if (len <= 1e-9) continue
    out.push({ a, b, len, start: at })
    at += len
  }
  return out
}

export function pathLength(points: Pt[], closed: boolean): number {
  const l = legs(points, closed)
  return l.length ? l[l.length - 1].start + l[l.length - 1].len : 0
}

export interface OnPath { dist: number; x: number; y: number; tx: number; ty: number; seg: number; /** how far the asked-for point is from the path */ off: number }

/** The nearest point of the wall's line to a point (a click): how far along it is, the point itself, the direction of the wall there, and how far off the line the click was. */
export function locateOnPath(points: Pt[], closed: boolean, p: Pt): OnPath | null {
  const ls = legs(points, closed)
  let best: OnPath | null = null
  ls.forEach((l, i) => {
    const dx = (l.b.x - l.a.x) / l.len, dy = (l.b.y - l.a.y) / l.len
    const t = Math.max(0, Math.min(l.len, (p.x - l.a.x) * dx + (p.y - l.a.y) * dy))
    const x = l.a.x + dx * t, y = l.a.y + dy * t
    const off = Math.hypot(p.x - x, p.y - y)
    if (!best || off < best.off) best = { dist: l.start + t, x, y, tx: dx, ty: dy, seg: i, off }
  })
  return best
}

/** The point at a distance along the wall's line and the direction of the wall there (a closed wall wraps round; an open wall stops at its ends). */
export function pointAtDist(points: Pt[], closed: boolean, d: number): OnPath | null {
  const ls = legs(points, closed)
  if (ls.length === 0) return null
  const total = ls[ls.length - 1].start + ls[ls.length - 1].len
  const at = closed ? ((d % total) + total) % total : Math.max(0, Math.min(total, d))
  let i = ls.findIndex(l => at <= l.start + l.len + 1e-9)
  if (i < 0) i = ls.length - 1
  const l = ls[i]
  const dx = (l.b.x - l.a.x) / l.len, dy = (l.b.y - l.a.y) / l.len
  const t = Math.max(0, Math.min(l.len, at - l.start))
  return { dist: at, x: l.a.x + dx * t, y: l.a.y + dy * t, tx: dx, ty: dy, seg: i, off: 0 }
}

/** Keeps an opening's centre where the whole opening stays on ONE straight length of the wall (an opening never wraps a corner). If the length is shorter than the opening it sits in the middle of it. */
export function clampDist(points: Pt[], closed: boolean, d: number, halfPx: number): number {
  const ls = legs(points, closed)
  if (ls.length === 0) return 0
  const total = ls[ls.length - 1].start + ls[ls.length - 1].len
  const at = closed ? ((d % total) + total) % total : Math.max(0, Math.min(total, d))
  let l = ls.find(x => at <= x.start + x.len + 1e-9) ?? ls[ls.length - 1]
  if (l.len <= 2 * halfPx) return l.start + l.len / 2
  return Math.max(l.start + halfPx, Math.min(l.start + l.len - halfPx, at))
}

/** The band of the wall across its line: lo and hi are the two faces as offsets along the normal (to the right of the way the line runs), and `inside` is +1 or -1: which way the inside of the building is. */
export interface WallBand { lo: number; hi: number; inside: 1 | -1 }

export type Prim =
  | { type: 'poly'; pts: Pt[]; style: 'gap' }
  | { type: 'line'; a: Pt; b: Pt; style: 'jamb' | 'frame' | 'glass' | 'leaf' | 'dash' }
  | { type: 'arc'; centre: Pt; r: number; from: Pt; to: Pt; sweep: 0 | 1; style: 'arc' }

export interface OpeningShape {
  /** where the middle of the opening is on the wall's line */
  centre: Pt
  /** the direction of the wall there */
  tangent: Pt
  /** the width of the opening in plan pixels */
  widthPx: number
  prims: Prim[]
  /** where the reference label goes: just clear of the wall on the side the leaf does NOT swing into */
  labelAt: Pt
  /** the four corners of the gap (for picking it with the mouse) */
  gap: Pt[]
}

const isLeafDoor = (k: OpeningKind) => k === 'door-front' || k === 'door-back' || k === 'door-composite' || k === 'door-security' || k === 'door-int-single' || k === 'door-int-fire'
const isDoublePair = (k: OpeningKind) => k === 'door-french' || k === 'door-int-double'

/** Does a kind of opening get a swing choice (a door leaf that hinges)? */
export const hasSwing = (k: OpeningKind) => isLeafDoor(k) || isDoublePair(k)

/** How many panels a bi-fold of this width has (about 700mm each, at least two) */
export const bifoldPanels = (widthMm: number) => Math.max(2, Math.round(widthMm / 700))

/**
 * How an opening is drawn. `path` is the wall's line, `band` its two faces, `mpp` the plan's metres per pixel, `labelGapPx` how far clear of the wall the label sits (a screen size divided by the zoom).
 * Returns null if the wall has no length. Coordinates are plan pixels; with `p(a, b)` = the point `a` along the wall and `b` across it from the line.
 */
export function openingShape(path: Pt[], closed: boolean, o: Pick<PlacedOpening, 'distPx' | 'kind' | 'widthMm' | 'swing'> & { flipped?: boolean }, mpp: number, band: WallBand, labelGapPx = 10): OpeningShape | null {
  if (!(mpp > 0)) return null
  const w = o.widthMm / (mpp * 1000)
  const half = w / 2
  const at = pointAtDist(path, closed, clampDist(path, closed, o.distPx, half))
  if (!at) return null
  const T = { x: at.tx, y: at.ty }
  const N = { x: -at.ty, y: at.tx }   // to the right of the way the line runs on screen
  const C = { x: at.x, y: at.y }
  const p = (a: number, b: number): Pt => ({ x: C.x + T.x * a + N.x * b, y: C.y + T.y * a + N.y * b })
  const { lo, hi, inside } = band
  const mid = (lo + hi) / 2
  const prims: Prim[] = []
  const gap = [p(-half, lo), p(half, lo), p(half, hi), p(-half, hi)]
  prims.push({ type: 'poly', pts: gap, style: 'gap' })
  prims.push({ type: 'line', a: p(-half, lo), b: p(-half, hi), style: 'jamb' })
  prims.push({ type: 'line', a: p(half, lo), b: p(half, hi), style: 'jamb' })

  const kind = o.kind
  const thick = Math.abs(hi - lo)
  const inOut = o.swing.startsWith('in') ? 1 : -1                 // +1: the leaf swings to the inside
  const left = o.swing.endsWith('left') ? 1 : -1
  // the side the leaf swings into, as a sign along N, and which end of the opening it is hinged at (see WdSwing: seen from the side you push it open from)
  const swingN = inOut * inside
  const hingeT = inside * inOut * left
  let labelSide: 1 | -1 = (-inside) as 1 | -1                       // outside, by default

  if (kind.startsWith('win-')) {
    prims.push({ type: 'line', a: p(-half, lo), b: p(half, lo), style: 'frame' })
    prims.push({ type: 'line', a: p(-half, hi), b: p(half, hi), style: 'frame' })
    prims.push({ type: 'line', a: p(-half, mid - thick * 0.08), b: p(half, mid - thick * 0.08), style: 'glass' })
    prims.push({ type: 'line', a: p(-half, mid + thick * 0.08), b: p(half, mid + thick * 0.08), style: 'glass' })
    if (kind === 'win-bay') {
      // the bay's projection, dashed: outside the wall, or inside it when the window is turned over
      const faceOut = inside === 1 ? lo : hi, faceIn = inside === 1 ? hi : lo
      const o1 = o.flipped ? faceIn : faceOut
      const out = o.flipped ? inside : -inside
      const dep = Math.min(w * 0.25, thick * 3)
      prims.push({ type: 'line', a: p(-half, o1), b: p(-half * 0.7, o1 + out * dep), style: 'dash' })
      prims.push({ type: 'line', a: p(-half * 0.7, o1 + out * dep), b: p(half * 0.7, o1 + out * dep), style: 'dash' })
      prims.push({ type: 'line', a: p(half * 0.7, o1 + out * dep), b: p(half, o1), style: 'dash' })
    }
  } else if (isLeafDoor(kind)) {
    const H = p(hingeT * half, mid)
    const J = p(-hingeT * half, mid)
    const E = { x: H.x + N.x * swingN * w, y: H.y + N.y * swingN * w }
    prims.push({ type: 'line', a: H, b: E, style: 'leaf' })
    prims.push({ type: 'arc', centre: H, r: w, from: E, to: J, sweep: ((E.x - H.x) * (J.y - H.y) - (E.y - H.y) * (J.x - H.x)) > 0 ? 1 : 0, style: 'arc' })
    labelSide = (-swingN) as 1 | -1
  } else if (isDoublePair(kind)) {
    const r = half
    for (const s of [-1, 1] as const) {
      const H = p(s * half, mid)
      const J = p(0, mid)
      const E = { x: H.x + N.x * swingN * r, y: H.y + N.y * swingN * r }
      prims.push({ type: 'line', a: H, b: E, style: 'leaf' })
      prims.push({ type: 'arc', centre: H, r, from: E, to: J, sweep: ((E.x - H.x) * (J.y - H.y) - (E.y - H.y) * (J.x - H.x)) > 0 ? 1 : 0, style: 'arc' })
    }
    labelSide = (-swingN) as 1 | -1
  } else if (kind === 'door-bifold') {
    const n = bifoldPanels(o.widthMm)
    const dep = Math.min(w / n, Math.max(thick * 1.5, w * 0.08))
    const foldN = o.flipped ? -swingN : swingN   // which way the panels fold, turned over with the door
    let prev = p(-half, mid)
    for (let i = 1; i <= n; i++) {
      const next = p(-half + (w * i) / n, mid + (i === n ? 0 : i % 2 === 1 ? foldN * dep : 0))
      prims.push({ type: 'line', a: prev, b: next, style: 'leaf' })
      prev = next
    }
    prims.push({ type: 'line', a: p(-half, mid), b: p(half, mid), style: 'dash' })
    labelSide = (-inside) as 1 | -1
  } else if (kind === 'door-sliding') {
    prims.push({ type: 'line', a: p(-half, mid - thick * 0.15), b: p(half * 0.1, mid - thick * 0.15), style: 'glass' })
    prims.push({ type: 'line', a: p(-half * 0.1, mid + thick * 0.15), b: p(half, mid + thick * 0.15), style: 'glass' })
  } else if (kind === 'door-garage') {
    prims.push({ type: 'line', a: p(-half, mid), b: p(half, mid), style: 'dash' })
    prims.push({ type: 'line', a: p(-half, lo), b: p(half, lo), style: 'frame' })
    prims.push({ type: 'line', a: p(-half, hi), b: p(half, hi), style: 'frame' })
  } else if (kind === 'door-int-pocket') {
    // the door as it stands half open, and the slot it slides into dashed in the wall beside the opening
    prims.push({ type: 'line', a: p(-half, mid), b: p(0, mid), style: 'leaf' })
    prims.push({ type: 'line', a: p(0, mid), b: p(half, mid), style: 'dash' })
    prims.push({ type: 'line', a: p(half, mid), b: p(half + w, mid), style: 'dash' })
  } else {
    prims.push({ type: 'line', a: p(-half, mid), b: p(half, mid), style: 'frame' })
  }

  const reach = Math.abs(hi - lo) / 2 + labelGapPx
  const labelAt = p(0, mid + labelSide * reach)
  return { centre: C, tangent: T, widthPx: w, prims, labelAt, gap }
}

/** The distance along the wall of the middle of the straight length that a distance falls on: where to put an opening to centre it on its side of the wall. */
export function segmentMiddle(points: Pt[], closed: boolean, d: number): number {
  const ls = legs(points, closed)
  if (ls.length === 0) return 0
  const total = ls[ls.length - 1].start + ls[ls.length - 1].len
  const at = closed ? ((d % total) + total) % total : Math.max(0, Math.min(total, d))
  const l = ls.find(x => at <= x.start + x.len + 1e-9) ?? ls[ls.length - 1]
  return l.start + l.len / 2
}

/** The swing of a door turned over to the other side of the wall, with the hinge staying at the same end: in becomes out and left becomes right (seen from the side you push it open from, which has changed). */
export function flippedSwing(swing: WdSwing): WdSwing {
  const [dir, hand] = swing.split('-') as ['in' | 'out', 'left' | 'right']
  return ((dir === 'in' ? 'out' : 'in') + '-' + (hand === 'left' ? 'right' : 'left')) as WdSwing
}

/** The next reference for an opening of a kind among those already placed: W1, W2 (windows), D1, D2 (external doors), ID1, ID2 (internal doors). */
export function nextOpeningRef(existing: { ref: string; kind: OpeningKind }[], kind: OpeningKind): string {
  const group = (k: string) => (k.startsWith('win-') ? 'W' : k.startsWith('door-int-') ? 'ID' : 'D')
  const g = group(kind)
  const used = new Set(existing.map(o => o.ref.trim().toUpperCase()))
  let n = existing.filter(o => group(o.kind) === g).length + 1
  while (used.has(`${g}${n}`)) n++
  return `${g}${n}`
}

// ── What a wall takes from its openings ──────────────────────────────────────────────────────────────────────────────

/** The kind of opening a wall's own opening list (Properties: window, door, bifold, French doors, garage door) calls it */
export function wallOpeningTypeFor(kind: OpeningKind): 'window' | 'door' | 'bifold' | 'french_door' | 'garage_door' {
  if (kind.startsWith('win-')) return 'window'
  if (kind === 'door-bifold') return 'bifold'
  if (kind === 'door-french') return 'french_door'
  if (kind === 'door-garage') return 'garage_door'
  return 'door'
}

/** An opening as the cavity wall calculator knows it: where it is along the wall (mm from the wall's first end to its LEFT edge), its size and its kind */
export interface PlanWallOpening { id: string; ref: string; kind: 'window' | 'door' | 'bifold' | 'custom'; widthMm: number; heightMm: number; offsetMm: number }

/** The openings placed on one wall, as that wall's calculator wants them (a garage door is a custom opening, and any door that is not a bi-fold is a door) */
export function planWallOpenings(placed: PlacedOpening[], wallId: string, mpp: number): PlanWallOpening[] {
  if (!(mpp > 0)) return []
  return placed.filter(o => o.wallId === wallId).sort((a, b) => a.distPx - b.distPx).map(o => ({
    id: o.id,
    ref: o.ref,
    kind: o.kind.startsWith('win-') ? 'window' : o.kind === 'door-bifold' ? 'bifold' : o.kind === 'door-garage' ? 'custom' : 'door',
    widthMm: o.widthMm,
    heightMm: o.heightMm,
    offsetMm: Math.max(0, Math.round(o.distPx * mpp * 1000 - o.widthMm / 2)),
  }))
}

export const planWallSig = (p: PlanWallOpening) => [p.kind, p.widthMm, p.heightMm, p.offsetMm, p.ref].join('|')

/**
 * A wall calculator's openings brought in step with the drawing, the way mergePlanOpenings does for the schedule: a drawn opening is added (`make` gives a new one with its kind's usual lintel), one already there follows the drawing
 * when the drawing's opening changes and is otherwise left as typed (so its lintel choice stays), and one whose drawing opening has gone leaves. Openings typed in the calculator with no drawing opening are never touched.
 */
export function mergePlanWallOpenings<T extends { id: string; kind: PlanWallOpening['kind']; widthMm: number; heightMm: number; offsetMm: number; planId?: string; fromPlan?: string }>(
  existing: T[], plan: PlanWallOpening[], make: (p: PlanWallOpening) => T,
): T[] {
  const byPlan = new Map(plan.map(p => [p.id, p]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const e of existing) {
    if (!e.planId) { out.push(e); continue }
    const p = byPlan.get(e.planId)
    if (!p) continue
    seen.add(p.id)
    const sig = planWallSig(p)
    if (e.fromPlan === sig) { out.push(e); continue }
    const base = e.kind === p.kind ? e : { ...make(p), id: e.id }
    out.push({ ...base, kind: p.kind, widthMm: p.widthMm, heightMm: p.heightMm, offsetMm: p.offsetMm, planId: p.id, fromPlan: sig })
  }
  for (const p of plan) if (!seen.has(p.id)) out.push({ ...make(p), id: 'po-' + p.id, planId: p.id, fromPlan: planWallSig(p) })
  return out
}
