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
  else { layers.push({ kind: 'insulation', mm: Math.max(0, cavity - 25) }); layers.push({ kind: 'cavity', mm: Math.min(25, cavity) }) }
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
    case 'ew-cav-full': return cavityWallSpec({}, true)
    case 'ew-cav-partial': return cavityWallSpec({}, false)
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
export interface WallDrawing { strips: WallStrip[]; /** the whole band, outside face to inside face */ body: Pt[]; bodyD: string; /** the line through the middle of the band, for the label */ centre: Pt[]; totalPx: number }

const ring = (p: Pt[]) => (p.length ? `M${p.map(q => `${+q.x.toFixed(2)} ${+q.y.toFixed(2)}`).join("L")}Z` : "")

/**
 * The layers of a wall as polygons.
 *   points   the drawn line (open) or outline (closed: a rectangle or polygon wall element)
 *   ref      'outer': the drawn line is the outside face and the wall builds to the inside (the right of travel; for a closed outline, towards the middle of the shape). 'centre': the line is the middle of the wall.
 *   flip     build to the other side (an open wall drawn the "wrong" way round)
 */
export function wallDrawing(points: Pt[], spec: WallSpec, mpp: number, o: { ref: 'outer' | 'centre'; closed: boolean; flip?: boolean }): WallDrawing | null {
  if (!(mpp > 0) || points.length < 2) return null
  const pts = dedupe(points, o.closed)
  if (pts.length < 2 || (o.closed && pts.length < 3)) return null
  const mmPx = 1 / (mpp * 1000)
  const total = totalMm(spec.layers) * mmPx
  // which way is "inside" in the offset convention
  let dir = 1
  if (o.closed && signedArea(pts) < 0) dir = -1
  if (o.flip) dir = -dir
  const start = o.ref === 'outer' ? 0 : -total / 2
  const strips: WallStrip[] = []
  let at = start
  for (const l of spec.layers) {
    const d0 = at, d1 = at + l.mm * mmPx
    const a = offsetPolyline(pts, d0 * dir, o.closed)
    const b = offsetPolyline(pts, d1 * dir, o.closed)
    strips.push({ kind: l.kind, mm: l.mm, polygon: [...a, ...b.slice().reverse()], d: o.closed ? ring(a) + ring(b) : ring([...a, ...b.slice().reverse()]) })
    at = d1
  }
  const outerLine = offsetPolyline(pts, start * dir, o.closed)
  const innerLine = offsetPolyline(pts, (start + total) * dir, o.closed)
  const centre = offsetPolyline(pts, (start + total / 2) * dir, o.closed)
  return { strips, body: [...outerLine, ...innerLine.slice().reverse()], bodyD: o.closed ? ring(outerLine) + ring(innerLine) : ring([...outerLine, ...innerLine.slice().reverse()]), centre, totalPx: total }
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
