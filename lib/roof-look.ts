// What a roof's STRUCTURE looks like on the Take-off plan, the same picture the roof calculator draws: the joists or rafters at their centres, the ridge, the hips and jacks of a hipped end, the trimmers framing a rooflight
// and the rooflights themselves, and a bar at an end that is a gable or an existing wall. Pure and self-contained (no imports), so it can be tested with plain Node. Positions are in mm in the roof's own plan:
// x runs along its LENGTH (the eaves, the way the members are spaced), y across its SPAN; the screen maps that onto the drawn shape (the longer side is the length, as the calculators size it).

export type RoofKind = 'flat' | 'mono' | 'gable' | 'hip'
export type RoofLineRole = 'member' | 'ridge' | 'hip'

export interface RoofLine { x1: number; y1: number; x2: number; y2: number; role: RoofLineRole }
/** A trimmer or header: a solid member, in mm (thickness 47mm), as the calculators draw them. */
export interface RoofTrimmer { x: number; y: number; w: number; h: number }
export interface RoofLookOpening { x: number; y: number; w: number; h: number; kind: string }
export interface RoofLook {
  kind: RoofKind
  /** the roof's length and span the picture was worked out at (mm) */
  lengthMm: number
  spanMm: number
  lines: RoofLine[]
  trimmers: RoofTrimmer[]
  openings: RoofLookOpening[]
  /** a gable end or an existing wall at the start (x = 0) or the end (x = length): a bar drawn along it */
  ends: { at: 'start' | 'end'; kind: 'gable' | 'existing-wall' }[]
  /** the words for the roof on the plan, e.g. "Hip roof, 400mm rafters" */
  label: string
}

export const MEMBER_THICKNESS_MM = 47

/** Which way the roof's LENGTH (the side its members are spaced along) lies on the plan: along x when the joists run up and down (`vertical`), along y when they run left to right (`horizontal`), and with no choice made along the longer side (the joists then run across the shorter). */
export function lengthAlongX(w: number, h: number, dir?: 'vertical' | 'horizontal'): boolean {
  return dir === 'vertical' ? true : dir === 'horizontal' ? false : w >= h
}
const DEFAULT_CENTRES = 400

interface OpeningIn { id?: string; kind?: string; widthMm: number; depthMm: number; offsetMm: number; offsetSpanMm: number; trimmers?: number }

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)

/** Where the members stand along a length: every `centresMm` from the start, and one at the far end. */
export function memberPositions(lengthMm: number, centresMm: number): number[] {
  const out: number[] = []
  for (let x = 0; x <= lengthMm + 1e-6; x += centresMm) out.push(x)
  if (out[out.length - 1] !== lengthMm) out.push(lengthMm)
  return out
}

function trimZone(o: OpeningIn): number { return (o.trimmers === 3 ? 3 : 2) * MEMBER_THICKNESS_MM }

/** The members across the span, each as the stretches of it that are there: one that falls where an opening's trimmer goes is left out (the trimmer takes its place) and one the opening crosses stops at the headers. */
function acrossMembers(lengthMm: number, spanMm: number, centresMm: number, openings: OpeningIn[]): RoofLine[] {
  const out: RoofLine[] = []
  const h = MEMBER_THICKNESS_MM / 2
  for (const p of memberPositions(lengthMm, centresMm)) {
    let replaced = false
    const raw: [number, number][] = []
    for (const o of openings) {
      const z = trimZone(o), left = o.offsetMm, right = o.offsetMm + o.widthMm
      if ((p + h > left - z && p - h < left) || (p + h > right && p - h < right + z)) replaced = true
      else if (p - h >= left && p + h <= right) raw.push([Math.max(0, o.offsetSpanMm - z), Math.min(spanMm, o.offsetSpanMm + o.depthMm + z)])
    }
    if (replaced) continue
    raw.sort((a, b) => a[0] - b[0])
    const cuts: [number, number][] = []
    for (const [a, b] of raw) { const last = cuts[cuts.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else cuts.push([a, b]) }
    let from = 0
    const segs: [number, number][] = []
    for (const [a, b] of cuts) { if (a > from) segs.push([from, a]); from = Math.max(from, b) }
    if (from < spanMm) segs.push([from, spanMm])
    for (const [a, b] of segs) out.push({ x1: p, y1: a, x2: p, y2: b, role: 'member' })
  }
  return out
}

/** The trimmers round each opening: `members` joists side by side down each side over the whole span, with the headers between them against the opening's near and far edges. */
function trimmersFor(spanMm: number, openings: OpeningIn[]): RoofTrimmer[] {
  const T = MEMBER_THICKNESS_MM
  const out: RoofTrimmer[] = []
  for (const o of openings) {
    const n = o.trimmers === 3 ? 3 : 2
    const right = o.offsetMm + o.widthMm, bottom = o.offsetSpanMm + o.depthMm
    for (let i = 0; i < n; i++) {
      out.push(
        { x: o.offsetMm - (i + 1) * T, y: 0, w: T, h: spanMm },
        { x: right + i * T, y: 0, w: T, h: spanMm },
        { x: o.offsetMm, y: o.offsetSpanMm - (i + 1) * T, w: o.widthMm, h: T },
        { x: o.offsetMm, y: bottom + i * T, w: o.widthMm, h: T },
      )
    }
  }
  return out
}

const openingShapes = (openings: OpeningIn[]): RoofLookOpening[] => openings.map(o => ({ x: o.offsetMm, y: o.offsetSpanMm, w: o.widthMm, h: o.depthMm, kind: o.kind ?? 'hatch' }))

export interface RoofLookInput {
  kind: RoofKind
  lengthMm: number
  spanMm: number
  centresMm?: number
  openings?: OpeningIn[]
  /** gable and hip: how each end of the ridge is finished ('hip' only on a hip roof) */
  endA?: string
  endB?: string
}

/** The picture of a roof's structure, from its kind and sizes. */
export function roofLook(i: RoofLookInput): RoofLook {
  const L = i.lengthMm, S = i.spanMm
  const centres = i.centresMm && i.centresMm > 0 ? i.centresMm : DEFAULT_CENTRES
  const openings = (i.openings ?? []).filter(o => o.widthMm > 0 && o.depthMm > 0)
  const base = { lengthMm: L, spanMm: S, trimmers: [] as RoofTrimmer[], openings: [] as RoofLookOpening[], ends: [] as RoofLook['ends'] }
  const endKind = (e?: string): 'gable' | 'existing-wall' | null => (e === 'existing-wall' ? 'existing-wall' : e === 'gable' ? 'gable' : null)

  if (i.kind === 'flat' || i.kind === 'mono') {
    return { ...base, kind: i.kind, lines: acrossMembers(L, S, centres, openings), trimmers: trimmersFor(S, openings), openings: openingShapes(openings), label: (i.kind === 'flat' ? 'Flat roof' : 'Mono-pitch roof') + `, ${centres}mm centres` }
  }

  if (i.kind === 'gable') {
    const lines: RoofLine[] = memberPositions(L, centres).map(x => ({ x1: x, y1: 0, x2: x, y2: S, role: 'member' as const }))
    lines.push({ x1: 0, y1: S / 2, x2: L, y2: S / 2, role: 'ridge' })
    const ends: RoofLook['ends'] = []
    const a = endKind(i.endA), b = endKind(i.endB)
    if (a) ends.push({ at: 'start', kind: a })
    if (b) ends.push({ at: 'end', kind: b })
    return { ...base, kind: 'gable', lines, ends, label: `Gable roof, ${centres}mm rafters` }
  }

  // hip: commons in the ridge zone, a hip from each corner of a hipped end to the end of the ridge, and jacks filling each hipped face
  const half = S / 2
  const hipA = i.endA !== 'gable' && i.endA !== 'existing-wall', hipB = i.endB !== 'gable' && i.endB !== 'existing-wall'
  const ridgeStart = hipA ? half : 0
  const ridgeEnd = hipB ? L - half : L
  const pyramid = ridgeEnd - ridgeStart <= 1e-6 || ridgeEnd < ridgeStart
  const lines: RoofLine[] = []
  if (!pyramid) {
    const rl = ridgeEnd - ridgeStart
    for (let d = 0; d <= rl + 1e-6; d += centres) lines.push({ x1: ridgeStart + d, y1: 0, x2: ridgeStart + d, y2: S, role: 'member' })
    const rem = rl % centres
    if (rem > 1e-6 && centres - rem > 1e-6) lines.push({ x1: ridgeEnd, y1: 0, x2: ridgeEnd, y2: S, role: 'member' })   // a member at the end of the ridge zone too
    lines.push({ x1: ridgeStart, y1: half, x2: ridgeEnd, y2: half, role: 'ridge' })
  }
  const apexA = pyramid ? L / 2 : ridgeStart, apexB = pyramid ? L / 2 : ridgeEnd
  if (hipA) {
    lines.push({ x1: 0, y1: 0, x2: apexA, y2: half, role: 'hip' }, { x1: 0, y1: S, x2: apexA, y2: half, role: 'hip' })
    for (let d = centres; d < half - 1e-6; d += centres) lines.push({ x1: d, y1: 0, x2: d, y2: d, role: 'member' }, { x1: d, y1: S, x2: d, y2: S - d, role: 'member' })
  }
  if (hipB) {
    lines.push({ x1: L, y1: 0, x2: apexB, y2: half, role: 'hip' }, { x1: L, y1: S, x2: apexB, y2: half, role: 'hip' })
    for (let d = centres; d < half - 1e-6; d += centres) lines.push({ x1: L - d, y1: 0, x2: L - d, y2: d, role: 'member' }, { x1: L - d, y1: S, x2: L - d, y2: S - d, role: 'member' })
  }
  const ends: RoofLook['ends'] = []
  const a = endKind(i.endA), b = endKind(i.endB)
  if (a) ends.push({ at: 'start', kind: a })
  if (b) ends.push({ at: 'end', kind: b })
  return { ...base, kind: 'hip', lines, ends, label: pyramid ? `Hip roof (pyramid), ${centres}mm rafters` : `Hip roof, ${centres}mm rafters` }
}

/**
 * The look of a roof from what the screen knows of its item: its calculator (`canonicalId`: 'roof-structure') or Build-Up Type (a cold or warm flat roof), and the saved calculator state
 * (`vals`, by calculator name). Only the roof STRUCTURE is drawn: the covering, the gutters, the rooflights and the fascias have no structure to show (null). With nothing saved the roof is a flat one at the
 * drawn size, as the roof calculator starts. `drawn` is the drawn shape's length and span (its longer and shorter sides), used when no size is saved.
 */
export function roofLookFromState(canonicalId: string | undefined, makeupId: string | undefined, vals: Record<string, Record<string, unknown>> | undefined, drawn: { lengthMm: number; spanMm: number }, preferDrawn = false): RoofLook | null {
  // (a roof drawn with the Roof Coverings, Gutters, Rooflights or Fascias calculator also carries a flat roof Build-Up Type, which used to give it the members of the structure: only the structure calculator, the whole flat roof, or no calculator at all draws them)
  const otherRoofCalc = !!canonicalId && canonicalId.startsWith('roof-') && canonicalId !== 'roof-structure' && canonicalId !== 'roof-flat'
  if (otherRoofCalc) return null
  if (canonicalId !== 'roof-structure' && makeupId !== 'cold_flat_roof' && makeupId !== 'warm_flat_roof') return null
  const v = vals ?? {}
  const saved = (v.AssemblyRoofStructureDemo?.type as string | undefined)
  const kind: RoofKind = saved === 'mono' || saved === 'gable' || saved === 'hip' ? saved : 'flat'
  const openingsOf = (x: unknown): OpeningIn[] => (Array.isArray(x) ? x.filter((o): o is OpeningIn => !!o && typeof o === 'object' && typeof (o as OpeningIn).widthMm === 'number' && typeof (o as OpeningIn).offsetMm === 'number') : [])
  if (kind === 'flat') {
    const s = v.AssemblyFlatRoofDemo ?? {}
    return roofLook({ kind, lengthMm: (preferDrawn ? undefined : num(s.lengthMm)) ?? drawn.lengthMm, spanMm: (preferDrawn ? undefined : num(s.widthMm)) ?? drawn.spanMm, centresMm: num(s.centresMm), openings: openingsOf(s.openings) })
  }
  if (kind === 'mono') {
    const s = v.AssemblyMonoPitchRoofDemo ?? {}
    return roofLook({ kind, lengthMm: (preferDrawn ? undefined : num(s.lengthMm)) ?? drawn.lengthMm, spanMm: (preferDrawn ? undefined : num(s.spanMm)) ?? drawn.spanMm, centresMm: num(s.rafterCentresMm), openings: openingsOf(s.openings) })
  }
  const s = (kind === 'gable' ? v.AssemblyGableRoofDemo : v.AssemblyHipRoofDemo) ?? {}
  return roofLook({ kind, lengthMm: (preferDrawn ? undefined : num(s.lengthMm)) ?? drawn.lengthMm, spanMm: (preferDrawn ? undefined : num(s.spanMm)) ?? drawn.spanMm, centresMm: num(s.rafterCentresMm), endA: typeof s.endA === 'string' ? s.endA : kind === 'hip' ? 'hip' : 'gable', endB: typeof s.endB === 'string' ? s.endB : kind === 'hip' ? 'hip' : 'gable' })
}

// ── What a roof COVERING looks like on the plan: not the members under it, but the surface on top, in the material chosen ─────────────────────────────────────────────────────────────────────────────────────────────

export type CoveringMaterial = 'grp' | 'epdm' | 'tpo' | 'concrete-tile' | 'clay-tile' | 'natural-slate' | 'fibre-cement-slate'
export interface CoveringStyle {
  label: string
  fill: string
  line: string
  /** mat: a glass-fibre mat (fine crossing lines); plain: one colour; seams: welded seams every metre or so; courses: rows of tiles or slates, each row's joints half a unit along from the one above */
  pattern: 'mat' | 'plain' | 'seams' | 'courses'
  /** courses: the distance between rows (the batten gauge) and the width of one tile or slate, mm */
  gaugeMm?: number
  unitWidthMm?: number
}
export const COVERING_STYLE: Record<CoveringMaterial, CoveringStyle> = {
  'grp': { label: 'GRP (fibreglass) flat roof covering', fill: '#cfd8dc', line: '#607d8b', pattern: 'mat' },
  'epdm': { label: 'EPDM rubber flat roof covering', fill: '#52525b', line: '#18181b', pattern: 'plain' },
  'tpo': { label: 'TPO single-ply flat roof covering', fill: '#e4e4e7', line: '#71717a', pattern: 'seams' },
  'concrete-tile': { label: 'Concrete tile roof covering', fill: '#a8998d', line: '#57534e', pattern: 'courses', gaugeMm: 345, unitWidthMm: 300 },
  'clay-tile': { label: 'Clay tile roof covering', fill: '#c9683d', line: '#7c2d12', pattern: 'courses', gaugeMm: 100, unitWidthMm: 165 },
  'natural-slate': { label: 'Natural slate roof covering', fill: '#4b5d70', line: '#1e293b', pattern: 'courses', gaugeMm: 225, unitWidthMm: 250 },
  'fibre-cement-slate': { label: 'Fibre cement slate roof covering', fill: '#6b7c8f', line: '#334155', pattern: 'courses', gaugeMm: 225, unitWidthMm: 300 },
}
const FLAT_COVERINGS: CoveringMaterial[] = ['grp', 'epdm', 'tpo']
const PITCHED_COVERINGS: CoveringMaterial[] = ['concrete-tile', 'clay-tile', 'natural-slate', 'fibre-cement-slate']

export interface CoveringLook {
  family: 'flat' | 'pitched'
  material: CoveringMaterial
  style: CoveringStyle
  lengthMm: number
  spanMm: number
  /** a pitched roof: the ridge and the hips, as the structure draws them (no members) */
  lines: RoofLine[]
  /** the distance between rows of tiles or slates, from the saved batten gauge when there is one */
  gaugeMm: number
  /** the words for the plan, e.g. "Concrete tile roof covering, hip roof" */
  label: string
}

/**
 * The look of a roof COVERING from what the screen knows of its item: only the Roof Coverings calculator (`canonicalId` 'roof-covering') has one. The family and material come from its saved state (a flat covering: GRP, EPDM or
 * single-ply TPO; a pitched covering: concrete or clay tile, natural or fibre cement slate), GRP flat when nothing is saved, as the calculator starts. A pitched covering also shows the ridge and the hips of its roof shape.
 */
export function roofCoveringLookFromState(canonicalId: string | undefined, vals: Record<string, Record<string, unknown>> | undefined, drawn: { lengthMm: number; spanMm: number }): CoveringLook | null {
  if (canonicalId !== 'roof-covering') return null
  const v = vals ?? {}
  const pitched = v.AssemblyRoofCoveringDemo?.family === 'pitched'
  if (!pitched) {
    const s = v.AssemblyFlatRoofDemo ?? {}
    const m = FLAT_COVERINGS.includes(s.covering as CoveringMaterial) ? (s.covering as CoveringMaterial) : 'grp'
    const style = COVERING_STYLE[m]
    return { family: 'flat', material: m, style, lengthMm: num(s.lengthMm) ?? drawn.lengthMm, spanMm: num(s.widthMm) ?? drawn.spanMm, lines: [], gaugeMm: 0, label: style.label }
  }
  const s = v.AssemblyPitchedRoofCoveringDemo ?? {}
  const m = PITCHED_COVERINGS.includes(s.material as CoveringMaterial) ? (s.material as CoveringMaterial) : 'concrete-tile'
  const style = COVERING_STYLE[m]
  const shape: RoofKind = s.roofType === 'mono' || s.roofType === 'hip' || s.roofType === 'gable' ? (s.roofType as RoofKind) : 'gable'
  const lengthMm = num(s.lengthMm) ?? drawn.lengthMm, spanMm = num(s.spanMm) ?? drawn.spanMm
  const endA = shape === 'hip' ? (typeof s.hipEndA === 'string' ? s.hipEndA : 'hip') : (typeof s.gableEndA === 'string' ? s.gableEndA : 'gable')
  const endB = shape === 'hip' ? (typeof s.hipEndB === 'string' ? s.hipEndB : 'hip') : (typeof s.gableEndB === 'string' ? s.gableEndB : 'gable')
  // only the ridge and the hips of the shape are drawn over the covering, not the rafters under it
  const lines = shape === 'mono' ? [] : roofLook({ kind: shape, lengthMm, spanMm, endA, endB }).lines.filter(l => l.role === 'ridge' || l.role === 'hip')
  return { family: 'pitched', material: m, style, lengthMm, spanMm, lines, gaugeMm: num(s.battenGaugeMm) ?? style.gaugeMm ?? 345, label: `${style.label}, ${shape === 'hip' ? 'hipped roof' : shape === 'mono' ? 'mono-pitch roof' : 'gable roof'}` }
}
