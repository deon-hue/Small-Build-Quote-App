// Hip roof structure — sides slope down to the eaves along the two long walls; each of the two ends (along
// the ridge direction) is independently hipped, a gable, or built against an existing wall — a common real
// case (a rear extension hipped at the garden end, tied into the house at the other; a side return hipped at
// the front, gabled at the back). A ridge (set back by half the span at each hipped end, since the hips are
// 45° in plan) with common rafters along its length on the two long sides, hip rafters running diagonally
// from each hipped corner up to a ridge end, and jack rafters filling each hip triangle — progressively
// shorter rafters landing on the hip instead of the ridge. If both ends are hipped and the ridge length would
// come out at zero or less (the span is at least as long as the building), it's a pyramid hip: no ridge, the
// four hips meet at a point instead. A gabled or existing-wall end needs no hip or jack rafters at all — the
// ridge and common rafters simply run the full way to that end, the same as a gable roof's. Sized the same
// way every Roof-phase calculator is: from the drawn shape's bounding box, ridge-direction length along one
// side and the overall span (eaves wall to eaves wall, the two long sides) along the other. Symmetric — one
// pitch, uniform hips — which covers the ordinary case; a roof with unequal-pitch hips is a design job, not a
// pricing one. Counts and lengths only, same as the flat, mono-pitch and gable roofs: the rafter size for the
// span is checked separately (the screen reuses the flat roof's own span chart against this roof's true,
// sloped rafter length). Self-contained (no cross-file runtime imports — see the note in CLAUDE.md about why
// every lib/*.ts engine here can be hand-tested with plain Node).
//
// The geometry: the roof surface is one uniform pitch everywhere (commons, hips and jacks all lie in the
// same sloped planes), so the total slope area is simply the plan area — including the eaves overhang all
// round — divided by cos(pitch); no need to sum each rafter's own strip. A jack rafter shares its roof
// plane's pitch with the common rafters it runs parallel to, so its true length follows the very same
// formula as a common rafter, just with its own (shorter) horizontal run — its distance in from the corner —
// in place of the half-span. A hip rafter runs diagonally in plan (its horizontal run is the half-span-plus-
// overhang stretched by √2, a 45° hip), reaching the same ridge height as everything else, so its true
// length comes from Pythagoras on that diagonal run and the common rise — not from the roof's own pitch angle
// the way a common or jack rafter's does.
//
// Per end: a wall plate is credited along a hipped or gabled end's own width — a gable wall is priced under
// External Walls, but (same as every other roof here) the wall plate that receives the rafters is this
// calculator's scope regardless of who built the wall under it. An existing-wall end gets no wall plate at
// all — nothing new is built there — but still gets restraint straps tying the end rafters back to it.

export type HipEndTreatment = 'hip' | 'gable' | 'existing-wall'

export interface HipRoofInput {
  lengthMm: number          // ridge-direction length — the building's longer run, ideally
  spanMm: number             // overall span, eaves wall to eaves wall (the two long sides)
  pitchDeg: number           // pitch, every face, degrees
  rafterCentresMm: number
  eavesOverhangMm: number    // horizontal overhang all round, measured horizontally
  /** The end at length-position 0. Default 'hip'. */
  endA?: HipEndTreatment
  /** The end at length-position lengthMm. Default 'hip'. */
  endB?: HipEndTreatment
}

export interface HipRoofGeometry {
  lengthM: number
  spanM: number
  pitchDeg: number
  endA: HipEndTreatment
  endB: HipEndTreatment
  /** Whether both ends are hipped and the ridge length comes out at zero — hips meeting at a point. */
  isPyramid: boolean
  ridgeLm: number
  commonRafterPairCount: number
  commonRafterCount: number
  /** One common rafter's true, sloped length — half the span plus the eaves overhang, along the slope. */
  commonRafterRunMm: number
  commonRafterLm: number
  /** 2 for each hipped end, so 0, 2 or 4. */
  hipRafterCount: number
  /** One hip rafter's true, sloped length (its own, longer, diagonal run) — 0 if neither end is hipped. */
  hipRafterRunMm: number
  hipRafterLm: number
  /** Every jack rafter, across every hipped end's two faces. */
  jackRafterCount: number
  jackRafterLm: number
  /** Every rafter — common, hip and jack. */
  totalRafterCount: number
  /** The ridge's height above the wall plates (or the apex's, for a pyramid). Informational; not priced. */
  riseMm: number
  slopeAreaM2: number
  /** The two long eaves, plus a hipped or gabled end's own width — not an existing-wall end's. */
  wallPlateLm: number
  /** An existing-wall end's width, for the ledger-free restraint fixing — informational, priced as straps not a ledger. */
  existingWallLm: number
  strapCount: number
  ceilingJoistCount: number
  ceilingJoistLm: number
  warnings: string[]
}

const RESTRAINT_STRAP_CENTRES_MM = 2000

function studPositions(lengthMm: number, centresMm: number): number[] {
  const positions: number[] = []
  for (let x = 0; x <= lengthMm; x += centresMm) positions.push(x)
  if (positions[positions.length - 1] !== lengthMm) positions.push(lengthMm)
  return positions
}

export function calculateHipRoofGeometry(input: HipRoofInput): HipRoofGeometry {
  const { lengthMm: L, spanMm: S, pitchDeg, rafterCentresMm: C, eavesOverhangMm: overhang } = input
  const endA: HipEndTreatment = input.endA ?? 'hip'
  const endB: HipEndTreatment = input.endB ?? 'hip'
  if (!(L > 0)) throw new Error('The ridge-direction length must be greater than zero.')
  if (!(S > 0)) throw new Error('The span must be greater than zero.')
  if (!(C > 0)) throw new Error('The rafter centres must be greater than zero.')
  if (overhang < 0) throw new Error('The eaves overhang cannot be negative.')
  if (!(pitchDeg > 0) || pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')

  const pitchRad = (pitchDeg * Math.PI) / 180
  const halfSpanMm = S / 2
  const riseMm = halfSpanMm * Math.tan(pitchRad)

  // The ridge starts halfSpanMm in from end A only if that end is hipped (otherwise it runs right up to it),
  // and likewise ends halfSpanMm short of end B only if that end is hipped.
  const ridgeStartMm = endA === 'hip' ? halfSpanMm : 0
  const ridgeEndMm = L - (endB === 'hip' ? halfSpanMm : 0)
  const rawRidgeMm = ridgeEndMm - ridgeStartMm
  const ridgeMm = Math.max(0, rawRidgeMm)
  const bothHipped = endA === 'hip' && endB === 'hip'
  const isPyramid = bothHipped && ridgeMm <= 0
  const ridgeLm = ridgeMm / 1000
  const hippedEnds = (endA === 'hip' ? 1 : 0) + (endB === 'hip' ? 1 : 0)

  const warnings: string[] = []
  if (pitchDeg < 15) warnings.push(`A ${pitchDeg}° pitch is low for most tiles and slates — check the covering's minimum pitch before committing to it.`)
  if (pitchDeg > 45) warnings.push(`A ${pitchDeg}° pitch is steep — check the covering and fixings are rated for it.`)
  // A ridge that would need to go negative means the hip zone(s) at that end (or ends) overlap — the length
  // isn't enough for the hips as set. Exactly zero is fine (a pyramid, or a single hip end reaching exactly
  // as far as the other end) — only the overlap case is a genuine problem.
  if (hippedEnds > 0 && rawRidgeMm < 0) {
    warnings.push(
      bothHipped
        ? 'The span is wider than the ridge-direction length — check the length and span are the right way round (swap them if the roof was drawn the other way).'
        : 'The ridge-direction length is too short for the hip at this span — the hip zone runs past the other end. Check the length and span, or change that end to a gable or an existing wall.',
    )
  }

  // Common rafters: one pair at every position along the ridge zone, both long sides. None at all for a
  // pyramid — there's no ridge zone to put them in.
  const commonRafterRunMm = (halfSpanMm + overhang) / Math.cos(pitchRad)
  const commonPositions = isPyramid ? [] : studPositions(ridgeMm, C)
  const commonRafterPairCount = commonPositions.length
  const commonRafterCount = commonRafterPairCount * 2
  const commonRafterLm = (commonRafterCount * commonRafterRunMm) / 1000

  // Hip rafters: two at each hipped end's corners, running diagonally (45° in plan) up to a ridge end (or
  // the apex). Their own horizontal run is the half-span-plus-overhang stretched by the diagonal, reaching
  // the same rise as everything else. A gabled or existing-wall end has none — its common rafters run the
  // full way to it instead.
  const hipRunMm = (halfSpanMm + overhang) * Math.SQRT2
  const hipRafterRunMm = hippedEnds > 0 ? Math.sqrt(hipRunMm * hipRunMm + riseMm * riseMm) : 0
  const hipRafterCount = hippedEnds * 2
  const hipRafterLm = (hipRafterCount * hipRafterRunMm) / 1000

  // Jack rafters: on each hipped end's two faces, one at every interior position between the corner and the
  // ridge end (or apex) — the two ends of that run are the hip itself (zero length) and, if there's a ridge,
  // a full common rafter already counted there, so both are excluded. Each jack shares its roof plane's
  // pitch with the common rafters it's parallel to, so its true length follows the very same formula, using
  // its own distance in from the corner as the run.
  const jackPositions = studPositions(halfSpanMm, C).slice(1, -1)
  const jackRunsMm = jackPositions.map(d => (d + overhang) / Math.cos(pitchRad))
  const jackRafterCount = jackPositions.length * 2 * hippedEnds
  const jackRafterLm = (jackRunsMm.reduce((s, r) => s + r, 0) * 2 * hippedEnds) / 1000

  const totalRafterCount = commonRafterCount + hipRafterCount + jackRafterCount

  // The roof surface is one uniform pitch everywhere, so the slope area is simply the (overhung) plan area
  // over cos(pitch) — no need to sum every rafter's own strip.
  const slopeAreaM2 = (((S + 2 * overhang) / 1000) * ((L + 2 * overhang) / 1000)) / Math.cos(pitchRad)

  // The two long eaves always get a wall plate. Each end gets one too, unless it's built against an existing
  // wall — nothing new there. Straps go wherever there's an eaves wall, and at an existing-wall end too
  // (tying the end rafters back to it), just without a wall plate.
  const wallPlateMm = 2 * L + (endA !== 'existing-wall' ? S : 0) + (endB !== 'existing-wall' ? S : 0)
  const wallPlateLm = wallPlateMm / 1000
  const existingWallLm = ((endA === 'existing-wall' ? S : 0) + (endB === 'existing-wall' ? S : 0)) / 1000
  const strapsPerEnd = Math.ceil(S / RESTRAINT_STRAP_CENTRES_MM) + 1
  const strapCount = 2 * (Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1) + 2 * strapsPerEnd // every end, whatever it is

  // Ceiling joists tie the two long wall plates together across the full span, at every position along the
  // full length — including under the hipped ends, same as a real ceiling would.
  const ceilingPositions = studPositions(L, C)
  const ceilingJoistCount = ceilingPositions.length
  const ceilingJoistLm = (ceilingJoistCount * S) / 1000

  return {
    lengthM: +(L / 1000).toFixed(3), spanM: +(S / 1000).toFixed(3), pitchDeg,
    endA, endB,
    isPyramid, ridgeLm: +ridgeLm.toFixed(3),
    commonRafterPairCount, commonRafterCount, commonRafterRunMm: +commonRafterRunMm.toFixed(1), commonRafterLm: +commonRafterLm.toFixed(3),
    hipRafterCount, hipRafterRunMm: +hipRafterRunMm.toFixed(1), hipRafterLm: +hipRafterLm.toFixed(3),
    jackRafterCount, jackRafterLm: +jackRafterLm.toFixed(3),
    totalRafterCount,
    riseMm: +riseMm.toFixed(1), slopeAreaM2: +slopeAreaM2.toFixed(3),
    wallPlateLm: +wallPlateLm.toFixed(3), existingWallLm: +existingWallLm.toFixed(3), strapCount,
    ceilingJoistCount, ceilingJoistLm: +ceilingJoistLm.toFixed(3),
    warnings,
  }
}
