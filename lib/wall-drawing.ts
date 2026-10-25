// Walls drawn the way an architect draws them: a band at the wall's REAL thickness (to the plan's scale), made of its layers, each in the usual convention (facing brick, cavity, insulation, block...), with a label like
// "300 cavity". This works out what the wall is made of (from its saved calculator, else its build-up type's own layers in Back Office, else a standard for that kind of wall) and the shape of each layer. Pure (plan pixels in,
// plan pixels out), so it can be tested; the screen only paints what this returns.

export interface Pt { x: number; y: number }

export type LayerKind = 'brick' | 'block' | 'cavity' | 'insulation' | 'board' | 'timber' | 'metal' | 'render' | 'solid'
export interface WallLayer { kind: LayerKind; mm: number }
/** The layers of a wall, listed from the OUTSIDE face in (for a partition, from one face to the other). */
export interface WallSpec { layers: WallLayer[]; label: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export const totalMm = (layers: WallLayer[]) => layers.reduce((s, l) => s + l.mm, 0)

/** "300 cavity", "215 solid block", "100 stud partition": the structure's thickness (finishes of board and render left out) to the nearest 5mm (a half-way figure goes down, so 302.5 is "300"), and what kind of wall it is. */
export function wallLabel(layers: WallLayer[]): string {
  const core = layers.filter(l => l.kind !== 'board' && l.kind !== 'render')
  // a stud wall is called by its finished thickness (the boards are part of it); a masonry wall by its structure, finishes left out
  const stud = layers.some(l => l.kind === 'timber' || l.kind === 'metal')
  const t = stud ? totalMm(layers) : totalMm(core.length ? core : layers)
  const rounded = Math.max(5, Math.round(t / 5 - 1e-9) * 5)
  const masonry = layers.filter(l => l.kind === 'brick' || l.kind === 'block')
  const hasGap = layers.some(l => l.kind === 'cavity' || l.kind === 'insulation')
  let kind = 'wall'
  if (hasGap && masonry.length >= 2) kind = 'cavity'
  else if (masonry.length > 0) kind = layers[0].kind === 'board' && layers[layers.length - 1].kind === 'board' ? 'block partition' : layers.some(l => l.kind === 'brick') ? 'solid brick' : 'solid block'
  else if (layers.some(l => l.kind === 'metal')) kind = 'metal stud'
  else if (layers.some(l => l.kind === 'timber')) kind = layers.filter(l => l.kind === 'board').length >= 2 && t <= 130 ? 'stud partition' : 'timber frame'
  else if (layers.some(l => l.kind === 'solid')) kind = 'solid'
  return `${rounded} ${kind}`
}

const make = (layers: WallLayer[]): WallSpec | null => {
  const clean = layers.filter(l => l.mm > 0)
  return clean.length ? { layers: clean, label: wallLabel(clean) } : null
}

/** A cavity wall from the saved cavity wall calculator: facing brick (102.5) or block (100) outer leaf, the cavity (all insulation when it is full fill; insulation with a 25mm air gap when partial fill, plain cavity when no
 *  insulation), the inner block leaf, and a thin internal finish. */
export function cavityWallSpec(v: Record<string, unknown>, fullFill: boolean): WallSpec | null {
  const outerBlock = v.outerLeaf === 'block'
  const cavity = num(v.cavityWidthMm) ?? (fullFill ? 100 : 125)
  const inner = num(v.innerThicknessMm) ?? 100
  const insulated = v.insulation === 'pir' || v.insulation === 'wool'
  const layers: WallLayer[] = []
  if (outerBlock && v.externalFinish === 'render') layers.push({ kind: 'render', mm: 15 })
  layers.push(outerBlock ? { kind: 'block', mm: 100 } : { kind: 'brick', mm: 102.5 })
  if (!insulated) layers.push({ kind: 'cavity', mm: cavity })
  else if (fullFill) layers.push({ kind: 'insulation', mm: cavity })
  else {
    // partial fill: the insulation board the calculator was set to (75mm in a 125mm cavity to start), the rest an air gap; with no board size known, a 50mm gap in a cavity of 100mm or more
    const board = Math.min(cavity, num(v.boardThicknessMm) ?? Math.max(0, cavity >= 100 ? cavity - 50 : cavity - 25))
    layers.push({ kind: 'insulation', mm: board })
    if (cavity - board > 0) layers.push({ kind: 'cavity', mm: cavity - board })
  }
  layers.push({ kind: 'block', mm: inner })
  layers.push({ kind: 'board', mm: 12.5 })
  return make(layers)
}

/** A solid block wall from the saved calculator (a block laid flat is 215mm through the wall, otherwise its width), rendered outside and plastered inside if the calculator says so. */
export function solidBlockSpec(v: Record<string, unknown>): WallSpec | null {
  const width = v.laid === 'flat' ? 215 : (num(v.blockWidthMm) ?? 100)
  const layers: WallLayer[] = []
  if (v.externalFinish === 'render') layers.push({ kind: 'render', mm: 15 })
  layers.push({ kind: 'block', mm: width })
  if (v.internalFinish && v.internalFinish !== 'none') layers.push({ kind: 'board', mm: 12.5 })
  return make(layers)
}

/** A wall from its build-up type's layers (the Back Office wall type): every layer with a thickness, in the order listed. A partial-fill layer with no air gap listed gets the 25mm gap a real partial-fill cavity has. */
export function specFromMakeupLayers(layers: { name: string; thickness: number }[]): WallSpec | null {
  const out: WallLayer[] = []
  for (const l of layers) {
    const mm = num(l.thickness)
    if (mm === null) continue
    const n = (l.name || '').toLowerCase()
    let kind: LayerKind
    if (/brick/.test(n)) kind = 'brick'
    else if (/block/.test(n)) kind = 'block'
    else if (/insulat|batt|wool|pir|rockwool|knauf|fill/.test(n) && !/plasterboard|dry-?lin/.test(n)) kind = 'insulation'
    else if (/cavity|air gap/.test(n)) kind = 'cavity'
    else if (/dry-?lin|plasterboard|plaster|board|lining|skim/.test(n) && !/osb|sheath/.test(n)) kind = 'board'
    else if (/render|cladding finish/.test(n)) kind = 'render'
    else if (/steel stud|metal stud|c-?stud|track/.test(n)) kind = 'metal'
    else if (/timber|stud|osb|ply|sheath|larch|cladding|batten/.test(n)) kind = 'timber'
    else kind = 'solid'
    out.push({ kind, mm })
    if (kind === 'insulation' && /partial/.test(n)) out.push({ kind: 'cavity', mm: 25 })
  }
  return make(out)
}

/** What a kind of wall is when nothing more specific is known (its sub-phase's standard). */
export function defaultWallSpec(canonicalId: string | undefined): WallSpec | null {
  switch (canonicalId) {
    // (a cavity wall with nothing more known is drawn the way the calculators start: insulated, full fill with mineral wool, partial fill with PIR board)
    case 'ew-cav-full': return cavityWallSpec({ insulation: 'wool' }, true)
    case 'ew-cav-partial': return cavityWallSpec({ insulation: 'pir' }, false)
    case 'ew-blockwork-100': return make([{ kind: 'render', mm: 15 }, { kind: 'block', mm: 100 }])
    case 'ew-blockwork-215': return make([{ kind: 'render', mm: 15 }, { kind: 'block', mm: 215 }])
    case 'iw-stud-partition': return make([{ kind: 'board', mm: 12.5 }, { kind: 'timber', mm: 75 }, { kind: 'board', mm: 12.5 }])
    case 'iw-metal-stud': return make([{ kind: 'board', mm: 12.5 }, { kind: 'metal', mm: 70 }, { kind: 'board', mm: 12.5 }])
    case 'iw-block-masonry': return make([{ kind: 'board', mm: 13 }, { kind: 'block', mm: 100 }, { kind: 'board', mm: 13 }])
    case 'ew-garden-room-timber': return make([{ kind: 'timber', mm: 20 }, { kind: 'timber', mm: 11 }, { kind: 'timber', mm: 100 }, { kind: 'board', mm: 12.5 }])
    case 'ew-dwarf-wall': return make([{ kind: 'brick', mm: 102.5 }, { kind: 'cavity', mm: 75 }, { kind: 'block', mm: 100 }])
    case 'ew-sleeper-wall': return make([{ kind: 'brick', mm: 102.5 }])
    default: return null
  }
}

// ── Geometry ─────────────────────────────────────────────────────────────────────────────────────────────────────
// A positive offset is to the VISUAL RIGHT of the direction of travel on screen (y runs down): for a house outline drawn clockwise the inside is on the right, which is where an external wall builds to.

function dedupe(points: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = []
  for (const p of points) if (out.length === 0 || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 1e-6) out.push({ x: p.x, y: p.y })
  if (closed && out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-6) out.pop()
  return out
}

/** The line offset sideways by `d` plan pixels, with a mitred corner at every bend (a very sharp bend is limited so the corner does not shoot off). */
export function offsetPolyline(points: Pt[], d: number, closed = false): Pt[] {
  const pts = dedupe(points, closed)
  const n = pts.length
  if (n < 2) return pts
  const seg = (a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { nx: -dy / l, ny: dx / l } }
  const segs = (closed ? pts : pts.slice(0, -1)).map((p, i) => seg(p, pts[(i + 1) % n]))
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = closed ? segs[(i - 1 + segs.length) % segs.length] : segs[i - 1]
    const next = closed ? segs[i % segs.length] : segs[i]
    if (!prev && next) { out.push({ x: pts[i].x + next.nx * d, y: pts[i].y + next.ny * d }); continue }
    if (prev && !next) { out.push({ x: pts[i].x + prev.nx * d, y: pts[i].y + prev.ny * d }); continue }
    if (!prev || !next) { out.push(pts[i]); continue }
    let mx = prev.nx + next.nx, my = prev.ny + next.ny
    const ml = Math.hypot(mx, my)
    if (ml < 1e-9) { out.push({ x: pts[i].x + prev.nx * d, y: pts[i].y + prev.ny * d }); continue }   // a reversal: no sensible corner
    mx /= ml; my /= ml
    const cos = mx * prev.nx + my * prev.ny   // cos of half the turn
    const k = d / Math.max(cos, 0.25)          // mitre length, limited at about 4 x the offset
    out.push({ x: pts[i].x + mx * k, y: pts[i].y + my * k })
  }
  return out
}

/** Which way a closed outline runs: positive when it is drawn clockwise on screen (so its inside is on the right of travel). */
export function signedArea(points: Pt[]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) { const p = points[i], q = points[(i + 1) % points.length]; a += p.x * q.y - q.x * p.y }
  return a / 2
}

/** d is an SVG path to paint with fill-rule evenodd: one outline for an open wall, two rings (outer and inner) for a closed one, so the middle stays empty. */
export interface WallStrip { kind: LayerKind; mm: number; polygon: Pt[]; d: string }
export interface WallDrawing { strips: WallStrip[]; /** the whole band, outside face to inside face */ body: Pt[]; bodyD: string; /** the band as the rings to fill with the even-odd rule: one outline for an open wall, the outer and the inner ring for a closed one */ rings: Pt[][]; /** the line through the middle of the band, for the label */ centre: Pt[]; totalPx: number }

const ring = (p: Pt[]) => (p.length ? `M${p.map(q => `${+q.x.toFixed(2)} ${+q.y.toFixed(2)}`).join("L")}Z` : "")

// ── Corners between walls of DIFFERENT make-up ──────────────────────────────────────────────────────────────────
// Walls of the same make-up whose ends meet are one run with a mitred corner (chainWalls). Two walls of different make-up (a brick-faced wall and a rendered one, a cavity of another width) cannot be one run, so they used to be
// painted one over the other at the corner. Here each wall is moved to the corner and every layer line of it ends on ONE line through the outer corner and the inner corner (where the two inner faces meet), so one
// wall's layers stop exactly where the other's begin: no overlap and no gap, whatever the thicknesses.

/** One end of a wall that meets a wall of another make-up. */
export interface EndCut {
  /** where the walls' lines meet: the end of the wall is moved here (trimmed back or carried on along its own line) */
  P: Pt
  /** the mitre line: through p, in direction m (the same line for both walls) */
  line: { p: Pt; m: Pt }
}
export interface ChainEnds { start?: EndCut; end?: EndCut }

const unitOf = (a: Pt, b: Pt): Pt | null => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy); return l > 1e-9 ? { x: dx / l, y: dy / l } : null }
function lineHit(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const det = d.x * e.y - d.y * e.x
  if (Math.abs(det) < 1e-9) return null
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / det
  return { x: p.x + t * d.x, y: p.y + t * d.y }
}

/**
 * The cuts for every open run of walls, one entry per run (same order). `lo` and `hi` are the run's two faces as offsets across its line (wallBand), `reach` how far an end may be from the corner and still be taken as meeting
 * there (as in chainWalls: a gap up to the reach, an overshoot up to half of it). Only the ends of runs of the SAME kind (outside / inside, the part of the group before the first bar) but a different make-up are cut; a wall that
 * ends on the side of another (a tee) is left alone.
 */
export function mitreCuts(chains: { points: Pt[]; closed: boolean; group: string; reach: number; lo: number; hi: number }[], tol = 3): ChainEnds[] {
  const out: ChainEnds[] = chains.map(() => ({}))
  const kindOf = (g: string) => g.split('|')[0]
  type End = { ci: number; atStart: boolean; end: Pt; next: Pt }
  const ends: End[] = []
  chains.forEach((c, ci) => {
    if (c.closed || c.points.length < 2) return
    ends.push({ ci, atStart: true, end: c.points[0], next: c.points[1] })
    ends.push({ ci, atStart: false, end: c.points[c.points.length - 1], next: c.points[c.points.length - 2] })
  })
  const taken = new Set<string>()
  const key = (e: End) => e.ci + (e.atStart ? 's' : 'e')
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const A = ends[i], B = ends[j]
      if (A.ci === B.ci || taken.has(key(A)) || taken.has(key(B))) continue
      const ca = chains[A.ci], cb = chains[B.ci]
      if (ca.group === cb.group || kindOf(ca.group) !== kindOf(cb.group)) continue
      const dA = unitOf(A.next, A.end), dB = unitOf(B.next, B.end)   // each wall's direction INTO the corner
      if (!dA || !dB) continue
      // the corner: the ends themselves when they meet, else where the two lines cross (a gap or an overshoot, as chainWalls allows)
      let P: Pt | null = null
      if (Math.hypot(A.end.x - B.end.x, A.end.y - B.end.y) <= tol) P = { x: (A.end.x + B.end.x) / 2, y: (A.end.y + B.end.y) / 2 }
      else {
        const hit = lineHit(A.end, dA, B.end, dB)
        const r = Math.min(ca.reach, cb.reach)
        if (hit && r > 0) {
          const tA = (hit.x - A.end.x) * dA.x + (hit.y - A.end.y) * dA.y, tB = (hit.x - B.end.x) * dB.x + (hit.y - B.end.y) * dB.y
          const okA = tA >= 0 ? tA <= r : -tA <= r / 2, okB = tB >= 0 ? tB <= r : -tB <= r / 2
          if (okA && okB && (hit.x - A.next.x) * dA.x + (hit.y - A.next.y) * dA.y > 0 && (hit.x - B.next.x) * dB.x + (hit.y - B.next.y) * dB.y > 0) P = hit
        }
      }
      if (!P) continue
      const uA = { x: -dA.x, y: -dA.y }, uB = { x: -dB.x, y: -dB.y }   // away from the corner, along each wall
      if (uA.x * uB.x + uA.y * uB.y > 0.97) continue                  // the two walls fold back on each other: no sensible corner
      // each wall's own right-hand normal in the way its run travels
      const tvA = A.atStart ? uA : dA, tvB = B.atStart ? uB : dB
      const nA = { x: -tvA.y, y: tvA.x }, nB = { x: -tvB.y, y: tvB.x }
      const at = (n: Pt, o: number): Pt => ({ x: P!.x + n.x * o, y: P!.y + n.y * o })
      const bis = unitOf({ x: 0, y: 0 }, { x: uA.x + uB.x, y: uA.y + uB.y }) ?? { x: 0, y: 0 }
      // the faces of the two walls meet in two points; the right pair is the one whose line runs along the bisector of the corner (outer corner to inner corner)
      const pair = (oa1: number, ob1: number, oa2: number, ob2: number): { p: Pt; m: Pt; score: number } | null => {
        const X1 = lineHit(at(nA, oa1), dA, at(nB, ob1), dB), X2 = lineHit(at(nA, oa2), dA, at(nB, ob2), dB)
        if (!X1 || !X2) return null
        const m = unitOf(X1, X2)
        return m ? { p: X1, m, score: Math.abs(m.x * bis.x + m.y * bis.y) } : null
      }
      const p1 = pair(ca.lo, cb.lo, ca.hi, cb.hi), p2 = pair(ca.lo, cb.hi, ca.hi, cb.lo)
      const best = p1 && p2 ? (p1.score >= p2.score ? p1 : p2) : (p1 ?? p2)
      const line = best ? { p: best.p, m: best.m } : { p: P, m: (bis.x !== 0 || bis.y !== 0) ? bis : nA }
      const cutA: EndCut = { P, line }
      const cutB: EndCut = { P, line }
      out[A.ci][A.atStart ? 'start' : 'end'] = cutA
      out[B.ci][B.atStart ? 'start' : 'end'] = cutB
      taken.add(key(A)); taken.add(key(B))
    }
  }
  return out
}

/**
 * The layers of a wall as polygons.
 *   points   the drawn line (open) or outline (closed: a rectangle or polygon wall element)
 *   ref      'outer': the drawn line is the outside face and the wall builds to the inside (the right of travel; for a closed outline, towards the middle of the shape). 'centre': the line is the middle of the wall.
 *   flip     build to the other side (an open wall drawn the "wrong" way round)
 */
/** Which part of the wall the drawn line is: 'outer' = its outside face (the wall builds to the inside), 'centre' = its middle, 'inner' = its inside face (the wall builds to the outside). */
export type WallRef = 'outer' | 'centre' | 'inner'

export function wallDrawing(points: Pt[], spec: WallSpec, mpp: number, o: { ref: WallRef; closed: boolean; flip?: boolean; /** where an end meets a wall of ANOTHER make-up: see mitreCuts */ cuts?: ChainEnds }): WallDrawing | null {
  if (!(mpp > 0) || points.length < 2) return null
  const pts0 = dedupe(points, o.closed)
  if (pts0.length < 2 || (o.closed && pts0.length < 3)) return null
  // an end that meets a wall of another make-up is moved to the corner and every layer line of it ends where it meets the mitre line (instead of square across the wall)
  const cs = !o.closed ? o.cuts?.start : undefined, ce = !o.closed ? o.cuts?.end : undefined
  let pts = pts0
  if (cs) pts = [cs.P, ...pts.slice(1)]
  if (ce) pts = [...pts.slice(0, -1), ce.P]
  const firstDir = pts.length >= 2 ? unitOf(pts[0], pts[1]) : null
  const lastDir = pts.length >= 2 ? unitOf(pts[pts.length - 2], pts[pts.length - 1]) : null
  /** one offset line of the wall, its two ends carried along the wall to the mitre line */
  const trimmed = (line: Pt[]): Pt[] => {
    if (!cs && !ce) return line
    const r = line.slice()
    const reach = 6 * (Math.hypot(r[0].x - pts[0].x, r[0].y - pts[0].y) + total + 10)
    if (cs && firstDir) { const h = lineHit(r[0], firstDir, cs.line.p, cs.line.m); if (h && Math.hypot(h.x - r[0].x, h.y - r[0].y) <= reach) r[0] = h }
    if (ce && lastDir) { const k = r.length - 1; const h = lineHit(r[k], lastDir, ce.line.p, ce.line.m); if (h && Math.hypot(h.x - r[k].x, h.y - r[k].y) <= reach) r[k] = h }
    return r
  }
  const mmPx = 1 / (mpp * 1000)
  const total = totalMm(spec.layers) * mmPx
  // which way is "inside" in the offset convention
  let dir = 1
  if (o.closed && signedArea(pts) < 0) dir = -1
  if (o.flip) dir = -dir
  const start = o.ref === 'outer' ? 0 : o.ref === 'inner' ? -total : -total / 2
  const strips: WallStrip[] = []
  let at = start
  for (const l of spec.layers) {
    const d0 = at, d1 = at + l.mm * mmPx
    const a = trimmed(offsetPolyline(pts, d0 * dir, o.closed))
    const b = trimmed(offsetPolyline(pts, d1 * dir, o.closed))
    const poly = [...a, ...b.slice().reverse()]
    strips.push({ kind: l.kind, mm: l.mm, polygon: poly, d: o.closed ? ring(a) + ring(b) : ring(poly) })
    at = d1
  }
  const outerLine = trimmed(offsetPolyline(pts, start * dir, o.closed))
  const innerLine = trimmed(offsetPolyline(pts, (start + total) * dir, o.closed))
  const centre = offsetPolyline(pts0, (start + total / 2) * dir, o.closed)
  const bodyPoly = [...outerLine, ...innerLine.slice().reverse()]
  return { strips, body: bodyPoly, rings: o.closed ? [outerLine, innerLine] : [bodyPoly], bodyD: o.closed ? ring(outerLine) + ring(innerLine) : ring(bodyPoly), centre, totalPx: total }
}

/** The two faces of a wall as offsets across its drawn line (to the right of the way it runs), and which side the inside of the building is: where doors and windows are cut into it. Same rules as wallDrawing. */
export function wallBand(points: Pt[], spec: WallSpec, mpp: number, o: { ref: WallRef; closed: boolean; flip?: boolean }): { lo: number; hi: number; inside: 1 | -1 } | null {
  if (!(mpp > 0) || points.length < 2) return null
  const pts = dedupe(points, o.closed)
  if (pts.length < 2 || (o.closed && pts.length < 3)) return null
  const total = totalMm(spec.layers) / (mpp * 1000)
  let dir = 1
  if (o.closed && signedArea(pts) < 0) dir = -1
  if (o.flip) dir = -dir
  const start = o.ref === 'outer' ? 0 : o.ref === 'inner' ? -total : -total / 2
  const a = start * dir, b = (start + total) * dir
  return { lo: Math.min(a, b), hi: Math.max(a, b), inside: dir as 1 | -1 }
}

/** How each kind of layer is painted: a fill colour, a line colour, and the hatching convention (on screen it is only drawn when the layer is wide enough to show it). */
export const LAYER_STYLE: Record<LayerKind, { fill: string; line: string; hatch: 'diag' | 'cross' | 'dots' | 'zig' | 'none' | 'wood' }> = {
  brick:      { fill: '#e9b8a4', line: '#8c3a1f', hatch: 'diag' },
  block:      { fill: '#d4d6da', line: '#555a63', hatch: 'dots' },
  cavity:     { fill: '#ffffff', line: '#8a8f98', hatch: 'none' },
  insulation: { fill: '#fbf0a8', line: '#a38b00', hatch: 'zig' },
  board:      { fill: '#e6edf4', line: '#6b7f94', hatch: 'none' },
  timber:     { fill: '#e5c795', line: '#7a5420', hatch: 'wood' },
  metal:      { fill: '#c9d3dc', line: '#42525f', hatch: 'cross' },
  render:     { fill: '#f4efe6', line: '#9a8f7a', hatch: 'none' },
  solid:      { fill: '#cfcfcf', line: '#444444', hatch: 'cross' },
}


// ── Joining walls that meet ──────────────────────────────────────────────────────────────────────────────────────
// Each wall is drawn as its own line, so where two meet at a corner their bands cross and the layers do not follow the corner. Walls of the same kind whose ends meet (they were snapped to each other, so the points are
// the same) are drawn as ONE run with a proper mitred corner, and a run that comes back to where it started is a closed ring. Where a wall ends on the side of another (a partition into an outside wall) the longer wall
// is painted over the shorter's end, so the shorter stops at its face.

export interface WallPiece {
  id: string
  points: Pt[]
  /** a rectangle or polygon outline: drawn as it is, never joined to anything */
  closed: boolean
  flip: boolean
  /** walls only join walls with the same group: the same class (external / internal), reference and make-up */
  group: string
  /** how far (plan pixels) an end may be from the corner where its line crosses the other wall's line and still be taken as meeting there: about one and a half wall thicknesses. Without it, ends must be on the same point. */
  reachPx?: number
}
export interface WallChain { ids: string[]; points: Pt[]; closed: boolean; flip: boolean; group: string }

const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol
const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0)

/** The runs the pieces make, painted shortest first within each kind so the longest wall ends up on top. `tol` is how close two ends must be (plan pixels) to count as meeting. */
export function chainWalls(pieces: WallPiece[], tol = 3): WallChain[] {
  const out: WallChain[] = []
  const open: { id: string; pts: Pt[]; group: string }[] = []
  for (const p of pieces) {
    if (p.closed) out.push({ ids: [p.id], points: p.points, closed: true, flip: p.flip, group: p.group })
    else if (p.points.length >= 2) open.push({ id: p.id, pts: p.flip ? p.points.slice().reverse() : p.points, group: p.group })   // a flipped wall is drawn from its other end so the inside is always to the right of travel
  }
  // Two walls of the same make-up whose ends stop short of, or run past, the point where their lines cross are one corner (a gap, an overshoot, or walls drawn to each other's faces): they are painted as meeting exactly there,
  // so the skins join round the corner. Only the painting is changed (the walls' own lines and lengths are not): the Join Corner tool makes it real. A wall that carries on past the crossing (a tee) is not a corner.
  const reach = new Map(pieces.map(p => [p.id, p.reachPx ?? 0]))
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j]
      const r = Math.min(reach.get(a.id) ?? 0, reach.get(b.id) ?? 0)
      if (a.group !== b.group || !(r > 0)) continue
      let joined = false
      for (const ea of ['start', 'end'] as const) {
        if (joined) break
        for (const eb of ['start', 'end'] as const) {
          const ia = ea === 'start' ? 0 : a.pts.length - 1, ib = eb === 'start' ? 0 : b.pts.length - 1
          const a2 = a.pts[ea === 'start' ? 1 : a.pts.length - 2], b2 = b.pts[eb === 'start' ? 1 : b.pts.length - 2]
          if (!a2 || !b2) continue
          const A = a.pts[ia], B = b.pts[ib]
          const rx = A.x - a2.x, ry = A.y - a2.y, sx = B.x - b2.x, sy = B.y - b2.y
          const det = rx * sy - ry * sx
          if (Math.abs(det) < 1e-6 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) continue   // parallel
          const t = ((b2.x - a2.x) * sy - (b2.y - a2.y) * sx) / det
          const P = { x: a2.x + t * rx, y: a2.y + t * ry }
          // the crossing must be out beyond the next point of each wall (a wall is never turned back on itself)
          if ((P.x - a2.x) * rx + (P.y - a2.y) * ry <= 0 || (P.x - b2.x) * sx + (P.y - b2.y) * sy <= 0) continue
          const dA = Math.hypot(A.x - P.x, A.y - P.y), dB = Math.hypot(B.x - P.x, B.y - P.y)
          if (dA <= tol && dB <= tol) continue   // already meet
          // an end that stops SHORT of the crossing may be up to the reach away (a gap); one that runs PAST it only half that (an overshoot at a corner: a wall that goes on much further is a tee, not a corner)
          const limit = (end: Pt, from: Pt, dir: Pt) => ((P.x - end.x) * dir.x + (P.y - end.y) * dir.y >= 0 ? r : r / 2)
          if (dA > limit(A, a2, { x: rx, y: ry }) || dB > limit(B, b2, { x: sx, y: sy })) continue
          // each wall is moved only ALONG its own line, to the crossing
          a.pts = a.pts.slice(); b.pts = b.pts.slice()
          a.pts[ia] = { x: P.x, y: P.y }; b.pts[ib] = { x: P.x, y: P.y }
          joined = true
          break
        }
      }
    }
  }
  const used = new Set<string>()
  for (const start of open) {
    if (used.has(start.id)) continue
    used.add(start.id)
    let pts = start.pts.slice()
    const ids = [start.id]
    let grew = true
    while (grew) {
      grew = false
      for (const c of open) {
        if (used.has(c.id) || c.group !== start.group) continue
        if (near(pts[pts.length - 1], c.pts[0], tol)) { pts = [...pts, ...c.pts.slice(1)]; ids.push(c.id); used.add(c.id); grew = true; break }
        if (near(c.pts[c.pts.length - 1], pts[0], tol)) { pts = [...c.pts, ...pts.slice(1)]; ids.unshift(c.id); used.add(c.id); grew = true; break }
      }
    }
    const closed = pts.length >= 4 && near(pts[0], pts[pts.length - 1], tol)
    out.push({ ids, points: closed ? pts.slice(0, -1) : pts, closed, flip: false, group: start.group })
  }
  // external and internal kinds separately, shortest first, so a long wall covers the end of a short one that butts into it
  return out.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : lengthOf(a.points) - lengthOf(b.points)))
}

/**
 * The straight sides of a run of walls, corner to corner: consecutive pieces that point the same way (within `tolDeg`) are ONE side, so a straight stretch built from two or three walls is measured once, from one
 * corner to the next. For a closed run the side that crosses the start is joined up too. Each side is [from, to].
 */
export function mergeCollinearSides(points: Pt[], closed: boolean, tolDeg = 1): [Pt, Pt][] {
  const pts = dedupe(points, closed)
  const n = pts.length
  if (n < 2) return []
  const segCount = closed ? n : n - 1
  const dirs: Pt[] = []
  for (let i = 0; i < segCount; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; dirs.push({ x: (b.x - a.x) / l, y: (b.y - a.y) / l }) }
  const sin = Math.sin((tolDeg * Math.PI) / 180)
  const same = (i: number, j: number) => Math.abs(dirs[i].x * dirs[j].y - dirs[i].y * dirs[j].x) <= sin && dirs[i].x * dirs[j].x + dirs[i].y * dirs[j].y > 0
  // where a side begins: a segment that does not continue the one before it (for a closed run, turn the list so it starts at a corner)
  let first = 0
  if (closed) {
    first = -1
    for (let i = 0; i < segCount; i++) if (!same((i - 1 + segCount) % segCount, i)) { first = i; break }
    if (first < 0) return []   // a closed run with no corner at all
  }
  const out: [Pt, Pt][] = []
  let startSeg = first, count = 1
  for (let k = 1; k <= segCount; k++) {
    const i = (first + k) % segCount
    const continues = k < segCount && same((first + k - 1) % segCount, i)
    if (continues) { count++; continue }
    out.push([pts[startSeg % n], pts[(startSeg + count) % n]])
    startSeg = (first + k) % segCount
    count = 1
  }
  return out
}
