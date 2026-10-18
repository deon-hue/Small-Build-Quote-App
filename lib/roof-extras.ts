// Two things the pitched roof structure calculators (gable, hip and mono-pitch) share:
//
//  1. A VAULTED CEILING. The ceiling follows the rafters instead of a flat ceiling across the joists, so there are no ceiling joists tying the rafter feet together, and the ridge has to be a
//     proper beam (steel or LVL) carrying the load instead of a ridge board. The rafters are deeper, to take the insulation between them. The insulation and the plasterboard lining of a vaulted
//     ceiling are NOT priced in the roof structure: they belong under Plastering & Boarding, and the calculator says so.
//
//  2. A ROOF THAT JOINS AN EXISTING ROOF. Three ways it happens, each priced for what it involves:
//       roof-abut    the new roof goes up onto the slope of an existing roof and stops against it: a bearer fixed to the existing rafters, the existing tiles opened up along the join for the lead
//                    flashing, then made good.
//       roof-valley  the new ridge runs into the existing slope, with a valley down each side: valley rafters, the existing roof opened up between the valleys and its rafters trimmed, valley lead.
//       roof-over    the new roof is built over part of the existing roof: the existing covering over that area is stripped, a bearer and ties fix the new roof to the old, and the edge is flashed.
//     A join to an existing WALL is the existing 'existing-wall' treatment of each calculator, not here.
//
// Pure (no imports), so the sums can be hand-tested. Every rate is a sample, editable in the calculator's breakdown. The valley lengths assume the new roof has the same pitch as the existing one,
// which is the usual case; a different pitch changes them and is a design job.

export type CeilingKind = 'flat' | 'vaulted'
export const CEILING_LABEL: Record<CeilingKind, string> = {
  flat: 'Flat ceiling (ceiling joists across the span)',
  vaulted: 'Vaulted ceiling (follows the rafters, no ceiling joists)',
}

export type RidgeBeamKind = 'lvl' | 'steel'
export const RIDGE_BEAM: Record<RidgeBeamKind, { label: string; perLm: number }> = {
  lvl:   { label: 'LVL ridge beam (63 × 300)', perLm: 36 },
  steel: { label: 'Steel ridge beam (203 × 133 UB, galvanised)', perLm: 52 },
}
/** a padstone, post or bearing for each end of the ridge beam, £ each (sample) */
export const RIDGE_BEAM_BEARING_EACH = 85

/** What a vaulted roof needs saying: the ridge beam and its bearings are an engineer's design, and the lining is priced elsewhere. */
export function vaultedWarnings(roof: 'gable' | 'hip' | 'mono'): string[] {
  const w = ['The insulation and the plasterboard lining of a vaulted ceiling are not priced here: add them under Plastering & Boarding (the Vaulted ceiling tasks).']
  if (roof !== 'mono') w.push('With no ceiling joists tying the rafter feet together, the ridge beam and its bearings carry the roof: their sizes are the structural engineer\'s to design.')
  else w.push('The rafters are visible from below, so they are usually deeper to take the insulation between them: their size is for the span tables or an engineer.')
  return w
}

export type RoofJoinKind = 'roof-abut' | 'roof-valley' | 'roof-over'
export const ROOF_JOIN_LABEL: Record<RoofJoinKind, string> = {
  'roof-abut': 'Goes up onto an existing roof (abuts its slope, lead flashing along the join)',
  'roof-valley': 'Joins into an existing roof (the ridge runs into its slope, with a valley each side)',
  'roof-over': 'Built over part of an existing roof (its covering stripped, the new roof tied in)',
}
export const isRoofJoin = (x: string): x is RoofJoinKind => x === 'roof-abut' || x === 'roof-valley' || x === 'roof-over'

export interface RoofJoinInput {
  kind: RoofJoinKind
  /** how wide the join is along the new roof's edge, mm: the span at a gable or hip end, the length at a mono-pitch roof's high edge */
  joinMm: number
  /** the new roof's span (eaves to eaves), mm: sets the valley lengths */
  spanMm: number
  pitchDeg: number
  rafterCentresMm: number
  /** roof-over: the area of existing covering stripped, m² (default: the join times 2m) */
  strippedAreaM2?: number | null
}

export interface RoofJoinGeometry {
  kind: RoofJoinKind
  joinLm: number
  /** a timber bearer fixed to the existing rafters, lm */
  bearerLm: number
  /** rafter ties, hangers and cleats tying the new roof to the old, nr */
  fixingCount: number
  /** valleys: how many, the true length of one, and the valley rafters in all (lm) */
  valleyCount: number
  valleyEachLm: number
  valleyRafterLm: number
  /** doubled trimmers and headers in the existing roof, lm */
  trimmerLm: number
  /** existing rafters cut and trimmed */
  cutRafters: number
  /** existing covering stripped to open up and to flash, m² */
  strippedAreaM2: number
  /** temporary weather protection while it is open, m² */
  protectionM2: number
  /** the covering's side: lead flashing along the join, valley lead or GRP, and the existing tiling made good */
  abutmentLm: number
  valleyLeadLm: number
  makeGoodM2: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateRoofJoin(i: RoofJoinInput): RoofJoinGeometry {
  if (!(i.joinMm > 0)) throw new Error('The width of the join must be greater than zero.')
  if (!(i.spanMm > 0)) throw new Error('The span must be greater than zero.')
  if (!(i.pitchDeg > 0) || i.pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')
  if (!(i.rafterCentresMm > 0)) throw new Error('The rafter centres must be greater than zero.')
  const J = i.joinMm / 1000
  const S = i.spanMm / 1000
  const centres = i.rafterCentresMm / 1000
  const th = (i.pitchDeg * Math.PI) / 180
  const warnings: string[] = []
  const base = { joinLm: round2(J), bearerLm: 0, fixingCount: 0, valleyCount: 0, valleyEachLm: 0, valleyRafterLm: 0, trimmerLm: 0, cutRafters: 0, strippedAreaM2: 0, protectionM2: 0, abutmentLm: 0, valleyLeadLm: 0, makeGoodM2: 0 }

  if (i.kind === 'roof-abut') {
    const stripped = i.strippedAreaM2 != null && i.strippedAreaM2 >= 0 ? i.strippedAreaM2 : J * 0.6
    warnings.push('The existing roof is opened up along the join (a band about 600mm wide) for the flashing: check the existing rafters can carry the new roof.')
    return { kind: i.kind, ...base, bearerLm: round2(J), fixingCount: Math.ceil(J / centres) + 1, strippedAreaM2: round2(stripped), protectionM2: round2(stripped), abutmentLm: round2(J), makeGoodM2: round2(stripped), warnings }
  }

  if (i.kind === 'roof-valley') {
    // two valleys of equal pitch meeting an existing slope: each runs the half-span in plan, stretched by the square root of two on its diagonal, up to the same rise
    const r = S / 2
    const each = r * Math.sqrt(2 + Math.pow(Math.tan(th), 2))
    const opening = (S * S) / (4 * Math.cos(th))
    const stripped = i.strippedAreaM2 != null && i.strippedAreaM2 >= 0 ? i.strippedAreaM2 : opening
    const cut = Math.ceil(S / centres)
    warnings.push('The valleys are worked out for a new roof at the same pitch as the existing one. A different pitch changes them.')
    warnings.push('The existing rafters cut by the opening are trimmed to an engineer\'s design.')
    return {
      kind: i.kind, ...base, valleyCount: 2, valleyEachLm: round2(each), valleyRafterLm: round2(2 * each), trimmerLm: round2(2 * S), cutRafters: cut, fixingCount: cut * 2 + 4,
      strippedAreaM2: round2(stripped), protectionM2: round2(stripped), valleyLeadLm: round2(2 * each), makeGoodM2: round2(2 * each * 0.8), warnings,
    }
  }

  // roof-over
  const stripped = i.strippedAreaM2 != null && i.strippedAreaM2 >= 0 ? i.strippedAreaM2 : J * 2
  warnings.push('The existing covering over the new roof is stripped and its structure checked: the new roof is tied to the old by an engineer\'s detail.')
  return { kind: i.kind, ...base, bearerLm: round2(J), fixingCount: Math.ceil(J / centres) + 1, trimmerLm: round2(J), strippedAreaM2: round2(stripped), protectionM2: round2(stripped), abutmentLm: round2(J), makeGoodM2: round2(J * 0.6), warnings }
}

/** The plain-English lines for the quote description of one join. */
export function describeRoofJoin(g: RoofJoinGeometry): string {
  if (g.kind === 'roof-abut') return `The new roof goes up onto the existing roof: the existing tiles are opened up along the ${g.joinLm.toFixed(1)}m join, a bearer is fixed to the existing rafters, and the join is flashed in lead and the existing tiling made good.`
  if (g.kind === 'roof-valley') return `The new roof joins into the existing roof: the existing roof is opened up and its rafters trimmed, valley rafters are fitted (${g.valleyCount} valleys, about ${g.valleyEachLm.toFixed(1)}m each), and the valleys are lined in lead.`
  return `The new roof is built over part of the existing roof: about ${g.strippedAreaM2.toFixed(1)}m² of the existing covering is stripped, the new roof is tied to the existing structure, and the edge is flashed in lead.`
}

/** Sample rates for the structure side of a join (the covering's side is priced in Roof Coverings). */
export const JOIN_RATES = { bearerPerLm: 3.4, fixingEach: 4.2, valleyRafterPerLm: 5.4, trimmerPerLm: 4.85, protectionPerM2: 2.2 }
