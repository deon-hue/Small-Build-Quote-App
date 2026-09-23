// Hip roof structure — all four sides slope down to the eaves; no gable end walls. A ridge (set back by half
// the span at each end, since the hips are 45° in plan) with common rafters along its length on the two long
// sides, four hip rafters running diagonally from each corner up to a ridge end, and jack rafters filling
// each hip triangle — progressively shorter rafters landing on the hip instead of the ridge. If the ridge
// length would come out at zero or less (the span is at least as long as the building), it's a pyramid hip:
// no ridge, the four hips meet at a point instead. Sized the same way every Roof-phase calculator is: from
// the drawn shape's bounding box, ridge-direction length along one side and the overall span (eaves wall to
// eaves wall, the two long sides) along the other. Symmetric — one pitch, uniform hips — which covers the
// ordinary case; a roof with unequal-pitch hips is a design job, not a pricing one. Counts and lengths only,
// same as the flat, mono-pitch and gable roofs: the rafter size for the span is checked separately (the
// screen reuses the flat roof's own span chart against this roof's true, sloped rafter length). Every wall is
// an eaves wall here — there's no gable end wall to price separately. Self-contained (no cross-file runtime
// imports — see the note in CLAUDE.md about why every lib/*.ts engine here can be hand-tested with plain
// Node).
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

export interface HipRoofInput {
  lengthMm: number          // ridge-direction length — the building's longer run, ideally
  spanMm: number             // overall span, eaves wall to eaves wall (the two long sides)
  pitchDeg: number           // pitch, every face, degrees
  rafterCentresMm: number
  eavesOverhangMm: number    // horizontal overhang all round, measured horizontally
}

export interface HipRoofGeometry {
  lengthM: number
  spanM: number
  pitchDeg: number
  /** Whether the ridge length comes out at zero — a pyramid hip, no ridge, hips meeting at a point. */
  isPyramid: boolean
  ridgeLm: number
  commonRafterPairCount: number
  commonRafterCount: number
  /** One common rafter's true, sloped length — half the span plus the eaves overhang, along the slope. */
  commonRafterRunMm: number
  commonRafterLm: number
  /** Always 4 — one at each corner. */
  hipRafterCount: number
  /** One hip rafter's true, sloped length (its own, longer, diagonal run). */
  hipRafterRunMm: number
  hipRafterLm: number
  /** Every jack rafter, across all four hip faces. */
  jackRafterCount: number
  jackRafterLm: number
  /** Every rafter — common, hip and jack. */
  totalRafterCount: number
  /** The ridge's height above the wall plates (or the apex's, for a pyramid). Informational; not priced. */
  riseMm: number
  slopeAreaM2: number
  /** The full perimeter — every wall here is an eaves wall. */
  wallPlateLm: number
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
  if (!(L > 0)) throw new Error('The ridge-direction length must be greater than zero.')
  if (!(S > 0)) throw new Error('The span must be greater than zero.')
  if (!(C > 0)) throw new Error('The rafter centres must be greater than zero.')
  if (overhang < 0) throw new Error('The eaves overhang cannot be negative.')
  if (!(pitchDeg > 0) || pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')

  const pitchRad = (pitchDeg * Math.PI) / 180
  const halfSpanMm = S / 2
  const riseMm = halfSpanMm * Math.tan(pitchRad)
  const ridgeMm = Math.max(0, L - S)
  const isPyramid = ridgeMm <= 0
  const ridgeLm = ridgeMm / 1000

  const warnings: string[] = []
  if (pitchDeg < 15) warnings.push(`A ${pitchDeg}° pitch is low for most tiles and slates — check the covering's minimum pitch before committing to it.`)
  if (pitchDeg > 45) warnings.push(`A ${pitchDeg}° pitch is steep — check the covering and fixings are rated for it.`)
  if (S > L) warnings.push('The span is wider than the ridge-direction length — check the length and span are the right way round (swap them if the roof was drawn the other way).')

  // Common rafters: one pair at every position along the ridge zone, both long sides. None at all for a
  // pyramid — there's no ridge zone to put them in.
  const commonRafterRunMm = (halfSpanMm + overhang) / Math.cos(pitchRad)
  const commonPositions = isPyramid ? [] : studPositions(ridgeMm, C)
  const commonRafterPairCount = commonPositions.length
  const commonRafterCount = commonRafterPairCount * 2
  const commonRafterLm = (commonRafterCount * commonRafterRunMm) / 1000

  // Hip rafters: always four, one at each corner, running diagonally (45° in plan) up to a ridge end (or
  // the apex). Their own horizontal run is the half-span-plus-overhang stretched by the diagonal, reaching
  // the same rise as everything else.
  const hipRunMm = (halfSpanMm + overhang) * Math.SQRT2
  const hipRafterRunMm = Math.sqrt(hipRunMm * hipRunMm + riseMm * riseMm)
  const hipRafterCount = 4
  const hipRafterLm = (hipRafterCount * hipRafterRunMm) / 1000

  // Jack rafters: on each of the four hip faces, one at every interior position between the corner and the
  // ridge end (or apex) — the two ends of that run are the hip itself (zero length) and, if there's a ridge,
  // a full common rafter already counted there, so both are excluded. Each jack shares its roof plane's
  // pitch with the common rafters it's parallel to, so its true length follows the very same formula, using
  // its own distance in from the corner as the run.
  const jackPositions = studPositions(halfSpanMm, C).slice(1, -1)
  const jackRunsMm = jackPositions.map(d => (d + overhang) / Math.cos(pitchRad))
  const jackRafterCount = jackPositions.length * 4
  const jackRafterLm = (jackRunsMm.reduce((s, r) => s + r, 0) * 4) / 1000

  const totalRafterCount = commonRafterCount + hipRafterCount + jackRafterCount

  // The roof surface is one uniform pitch everywhere, so the slope area is simply the (overhung) plan area
  // over cos(pitch) — no need to sum every rafter's own strip.
  const slopeAreaM2 = (((S + 2 * overhang) / 1000) * ((L + 2 * overhang) / 1000)) / Math.cos(pitchRad)

  // Every wall is an eaves wall — the full perimeter gets a wall plate and restraint straps.
  const wallPlateLm = (2 * (L + S)) / 1000
  const strapCount = 2 * (Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1) + 2 * (Math.ceil(S / RESTRAINT_STRAP_CENTRES_MM) + 1)

  // Ceiling joists tie the two long wall plates together across the full span, at every position along the
  // full length — including under the hipped ends, same as a real ceiling would.
  const ceilingPositions = studPositions(L, C)
  const ceilingJoistCount = ceilingPositions.length
  const ceilingJoistLm = (ceilingJoistCount * S) / 1000

  return {
    lengthM: +(L / 1000).toFixed(3), spanM: +(S / 1000).toFixed(3), pitchDeg,
    isPyramid, ridgeLm: +ridgeLm.toFixed(3),
    commonRafterPairCount, commonRafterCount, commonRafterRunMm: +commonRafterRunMm.toFixed(1), commonRafterLm: +commonRafterLm.toFixed(3),
    hipRafterCount, hipRafterRunMm: +hipRafterRunMm.toFixed(1), hipRafterLm: +hipRafterLm.toFixed(3),
    jackRafterCount, jackRafterLm: +jackRafterLm.toFixed(3),
    totalRafterCount,
    riseMm: +riseMm.toFixed(1), slopeAreaM2: +slopeAreaM2.toFixed(3),
    wallPlateLm: +wallPlateLm.toFixed(3), strapCount,
    ceilingJoistCount, ceilingJoistLm: +ceilingJoistLm.toFixed(3),
    warnings,
  }
}
