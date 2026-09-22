// Mono-pitch (lean-to) roof structure — one sloped rafter face bearing on a wall at each end, the simplest
// pitched roof and the most common alongside a simple gable. Sized the same way every Roof-phase calculator
// is: from the drawn shape's bounding box, with the eaves length along one side and the horizontal plan span
// (high wall to low wall) along the other. The rafters bear on a wall plate at the low (eaves) wall, always,
// and at the high wall either hang from a ledger bolted to an existing wall or bear on a wall plate of their
// own — the same choice, and the same fixings, the flat roof structure already offers. Counts and lengths
// only; the rafter size for the span is checked separately (the screen reuses the flat roof's own span
// chart against this roof's true, sloped rafter length) — the rafter size, and the roof's design generally,
// stay with the span tables or an engineer. Self-contained (no cross-file runtime imports — see the note in
// CLAUDE.md about why every lib/*.ts engine here can be hand-tested with plain Node).
//
// Roof windows: openings are positioned in PLAN (their width across the eaves, their depth up the plan span,
// same as the flat roof's own rooflight openings), trimmed the same way the flat roof trims its joists — the
// trimmers go tight to the opening's own sides as `members` rafters side by side (doubled or tripled) over
// the rafter's full length, with headers between them against the opening's near and far edges, so the
// framed opening is exactly the size asked for. Any standard rafter that falls where a trimmer goes is
// replaced by it; one the opening crosses is cut short. The only wrinkle a flat roof doesn't have: a member
// running parallel to the rafters (a side trimmer, or a kerb side up the slope) is on the slope, so its true
// length is the plan length over cos(pitch) — the same factor the plain rafters already use; a member running
// parallel to the eaves (a header, or a kerb side across the slope) is horizontal and needs no such scaling.

export type MonoPitchWallConnection = 'ledger' | 'bearing'
export type MonoPitchOpeningKind = 'lantern' | 'roof-window' | 'dome' | 'hatch'

/** The thickness of a rafter, and so of each member of a doubled or tripled trimmer or header — same
 * dimension the flat roof's joists use. */
export const RAFTER_THICKNESS_MM = 47

export interface MonoPitchOpening {
  id: string
  kind: MonoPitchOpeningKind
  widthMm: number        // along the eaves — across the rafters
  depthMm: number         // along the plan span — up the slope, excluding any slope stretch
  offsetMm: number        // from the left end of the roof to the opening's left edge
  offsetSpanMm: number    // from the low (eaves) wall to the opening's near edge, in plan
  trimmers?: 2 | 3         // members in each header and side trimmer — doubled or tripled up; default 2
  kerbHeightMm?: number    // default 200
}

/** How far a trimmer or header group reaches outside its opening: its members side by side, each a rafter thick. */
export function openingTrimZoneMm(o: { trimmers?: 2 | 3 }): number {
  return (o.trimmers ?? 2) * RAFTER_THICKNESS_MM
}

export interface MonoPitchOpeningTrim {
  openingId: string
  members: number
  zoneMm: number
  leftMm: number
  rightMm: number
  headerLengthMm: number
  raftersReplaced: number
  raftersCut: number
}

/** One standard rafter in the layout: at its position along the eaves, where an opening makes it `replaced`
 * (a trimmer takes its place) or cuts it short (the plan spans of its length that are missing). */
export interface MonoPitchRafterRow {
  positionMm: number
  replaced: boolean
  cuts: [number, number][]
}

function rafterVsOpening(p: number, o: MonoPitchOpening): 'clear' | 'replaced' | 'cut' {
  const z = openingTrimZoneMm(o), h = RAFTER_THICKNESS_MM / 2
  const left = o.offsetMm, right = o.offsetMm + o.widthMm
  if (p + h > left - z && p - h < left) return 'replaced'
  if (p + h > right && p - h < right + z) return 'replaced'
  if (p - h >= left && p + h <= right) return 'cut'
  return 'clear'
}

/** The standard rafters at their centres, with what each opening does to them — used for both the counts
 * and the plan drawing. `spanMm` is the plan span (excluding the eaves overhang) — openings sit within it. */
export function monoPitchRafterLayout(lengthMm: number, spanMm: number, centresMm: number, openings: MonoPitchOpening[]): MonoPitchRafterRow[] {
  return studPositions(lengthMm, centresMm).map(positionMm => {
    let replaced = false
    const raw: [number, number][] = []
    for (const o of openings) {
      const v = rafterVsOpening(positionMm, o)
      if (v === 'replaced') replaced = true
      else if (v === 'cut') {
        const z = openingTrimZoneMm(o)
        raw.push([Math.max(0, o.offsetSpanMm - z), Math.min(spanMm, o.offsetSpanMm + o.depthMm + z)])
      }
    }
    raw.sort((a, b) => a[0] - b[0])
    const cuts: [number, number][] = []
    for (const [a, b] of raw) {
      const last = cuts[cuts.length - 1]
      if (last && a <= last[1]) last[1] = Math.max(last[1], b)
      else cuts.push([a, b])
    }
    return { positionMm, replaced, cuts }
  })
}

export interface MonoPitchRoofInput {
  lengthMm: number          // eaves length — the rafters are spaced along this
  spanMm: number            // horizontal plan span, low (eaves) wall to high wall, excluding the overhang
  pitchDeg: number          // roof pitch, degrees
  rafterCentresMm: number
  eavesOverhangMm: number   // how far the rafter extends past the low wall's face, measured horizontally
  highWallConnection: MonoPitchWallConnection
  openings?: MonoPitchOpening[]
}

export interface MonoPitchRoofGeometry {
  lengthM: number
  spanM: number
  pitchDeg: number
  /** Every standard rafter position along the eaves, whether or not an opening replaces it — matches the
   * flat roof's own joistCount convention. */
  rafterCount: number
  /** One full rafter's true, sloped length — the span plus the eaves overhang, along the slope. */
  rafterRunMm: number
  /** The true lm of standard rafter timber actually needed — a position an opening replaces isn't counted
   * (its trimmer is, in trimLm instead), and one the opening crosses is shortened. */
  rafterLm: number
  /** The rise from the low wall to the high wall, over the span (not the overhang) — how much taller the
   * high wall needs to be than the low one. Informational; not priced. */
  riseMm: number
  /** The roof's slope area before any openings are cut into it. */
  slopeAreaM2: number
  openingAreaM2: number
  /** The slope area actually covered, after the openings. */
  netSlopeAreaM2: number
  /** Headers and side trimmers round every opening, in true (slope-corrected) metres. */
  trimLm: number
  /** The upstand kerb round every opening, in true (slope-corrected) metres. */
  kerbLm: number
  kerbFaceAreaM2: number
  openingCount: number
  openingTrims: MonoPitchOpeningTrim[]
  ledgerLm: number
  ledgerBoltCount: number
  /** Wall plate at the low (eaves) wall always, and at the high wall too when it's bearing, not ledgered. */
  wallPlateLm: number
  hangerCount: number
  strapCount: number
  warnings: string[]
}

const LEDGER_BOLT_CENTRES_MM = 600
const RESTRAINT_STRAP_CENTRES_MM = 2000
const TRIMMER_HANGERS_PER_OPENING = 4 // a hanger at each end of the two headers

function studPositions(lengthMm: number, centresMm: number): number[] {
  const positions: number[] = []
  for (let x = 0; x <= lengthMm; x += centresMm) positions.push(x)
  if (positions[positions.length - 1] !== lengthMm) positions.push(lengthMm)
  return positions
}

export function calculateMonoPitchRoofGeometry(input: MonoPitchRoofInput): MonoPitchRoofGeometry {
  const { lengthMm: L, spanMm: S, pitchDeg, rafterCentresMm: C, eavesOverhangMm: overhang, highWallConnection } = input
  const openings = input.openings ?? []
  if (!(L > 0)) throw new Error('The eaves length must be greater than zero.')
  if (!(S > 0)) throw new Error('The span must be greater than zero.')
  if (!(C > 0)) throw new Error('The rafter centres must be greater than zero.')
  if (overhang < 0) throw new Error('The eaves overhang cannot be negative.')
  if (!(pitchDeg > 0) || pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')

  const pitchRad = (pitchDeg * Math.PI) / 180
  const slopeFactor = 1 / Math.cos(pitchRad)
  const rafterRunMm = (S + overhang) * slopeFactor
  const riseMm = S * Math.tan(pitchRad)
  const slopeAreaM2 = (L / 1000) * (rafterRunMm / 1000)

  const warnings: string[] = []
  if (pitchDeg < 15) warnings.push(`A ${pitchDeg}° pitch is low for most tiles and slates — check the covering's minimum pitch before committing to it.`)
  if (pitchDeg > 45) warnings.push(`A ${pitchDeg}° pitch is steep — check the covering and fixings are rated for it.`)

  // Openings that don't fit, or overlap each other — checked in plan, against the span (not the overhang).
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i]
    if (o.widthMm <= 0 || o.depthMm <= 0) throw new Error('Every rooflight opening needs a width and a length greater than zero.')
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L || o.offsetSpanMm < 0 || o.offsetSpanMm + o.depthMm > S) {
      warnings.push(`Rooflight ${i + 1} falls outside the roof — check its position and size.`)
    }
    const z = openingTrimZoneMm(o)
    if (o.offsetMm - z < 0 || o.offsetMm + o.widthMm + z > L || o.offsetSpanMm - z < 0 || o.offsetSpanMm + o.depthMm + z > S) {
      warnings.push(`Rooflight ${i + 1} is too close to the edge of the roof — its trimmers and headers need ${z}mm all round it.`)
    }
    for (let j = i + 1; j < openings.length; j++) {
      const p = openings[j]
      const overlapX = o.offsetMm < p.offsetMm + p.widthMm && p.offsetMm < o.offsetMm + o.widthMm
      const overlapY = o.offsetSpanMm < p.offsetSpanMm + p.depthMm && p.offsetSpanMm < o.offsetSpanMm + o.depthMm
      if (overlapX && overlapY) warnings.push(`Rooflights ${i + 1} and ${j + 1} overlap — check their positions.`)
    }
  }

  // Rafters: one at every position along the eaves. Where an opening sits across a rafter that rafter is cut
  // short (it stops at the header); where a trimmer goes, the rafter there is replaced by the trimmer.
  const layout = monoPitchRafterLayout(L, S, C, openings)
  const positions = layout.map(r => r.positionMm)
  const rafterCount = positions.length
  let rafterTrueMm = 0
  for (const r of layout) {
    if (r.replaced) continue
    const cutPlanMm = r.cuts.reduce((sum, [a, b]) => sum + (b - a), 0)
    rafterTrueMm += (Math.max(0, S - cutPlanMm) + overhang) * slopeFactor
  }

  // Trimming round each opening. The side trimmers run parallel to the rafters, full length, so they're
  // true (slope-corrected) metres like any rafter; the headers run parallel to the eaves — horizontal, no
  // scaling. The kerb's two sides up the slope scale the same way; its two sides along the eaves don't.
  let trimMm = 0, kerbMm = 0, kerbFaceMm2 = 0, openingAreaM2 = 0
  const openingTrims: MonoPitchOpeningTrim[] = []
  for (const o of openings) {
    const members = o.trimmers ?? 2
    trimMm += 2 * members * rafterRunMm + 2 * members * o.widthMm
    openingTrims.push({
      openingId: o.id, members, zoneMm: openingTrimZoneMm(o),
      leftMm: o.offsetMm, rightMm: o.offsetMm + o.widthMm, headerLengthMm: o.widthMm,
      raftersReplaced: positions.filter(p => rafterVsOpening(p, o) === 'replaced').length,
      raftersCut: positions.filter(p => rafterVsOpening(p, o) === 'cut').length,
    })
    const perimeterTrueMm = 2 * o.widthMm + 2 * (o.depthMm * slopeFactor)
    kerbMm += perimeterTrueMm
    kerbFaceMm2 += perimeterTrueMm * (o.kerbHeightMm ?? 200)
    openingAreaM2 += (o.widthMm / 1000) * ((o.depthMm * slopeFactor) / 1000)
  }

  let ledgerMm = 0, ledgerBolts = 0, hangers = 0, wallPlateMm = L, straps = Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1
  if (highWallConnection === 'ledger') {
    ledgerMm = L
    ledgerBolts = Math.ceil(L / LEDGER_BOLT_CENTRES_MM) + 1
    hangers = rafterCount
  } else {
    wallPlateMm += L
    straps += Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1
  }
  hangers += TRIMMER_HANGERS_PER_OPENING * openings.length

  return {
    lengthM: +(L / 1000).toFixed(3), spanM: +(S / 1000).toFixed(3), pitchDeg,
    rafterCount, rafterRunMm: +rafterRunMm.toFixed(1), rafterLm: +(rafterTrueMm / 1000).toFixed(3),
    riseMm: +riseMm.toFixed(1), slopeAreaM2: +slopeAreaM2.toFixed(3),
    openingAreaM2: +openingAreaM2.toFixed(3), netSlopeAreaM2: +(slopeAreaM2 - openingAreaM2).toFixed(3),
    trimLm: +(trimMm / 1000).toFixed(3), kerbLm: +(kerbMm / 1000).toFixed(3), kerbFaceAreaM2: +(kerbFaceMm2 / 1_000_000).toFixed(4),
    openingCount: openings.length, openingTrims,
    ledgerLm: +(ledgerMm / 1000).toFixed(3), ledgerBoltCount: ledgerBolts,
    wallPlateLm: +(wallPlateMm / 1000).toFixed(3), hangerCount: hangers, strapCount: straps,
    warnings,
  }
}
