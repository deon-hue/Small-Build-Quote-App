// Gable roof structure — two rafter faces meeting at a ridge, a wall plate (and a rafter foot) at each of
// the two eaves walls, and ceiling joists tying the feet together across the full span. The most common
// pitched roof after a lean-to. Sized the same way every Roof-phase calculator is: from the drawn shape's
// bounding box, with the ridge length along one side and the overall span (eaves wall to eaves wall) along
// the other. Symmetric — both faces share the one pitch — which covers the ordinary case; an asymmetric
// (cut) roof is a design job, not a pricing one. The gable end walls themselves (the triangular infill above
// the eaves walls at each end) are a wall, priced under External Walls, not here — this calculator prices
// only the roof timber. Counts and lengths only, same as the flat and mono-pitch roofs: the rafter size for
// the span is checked separately (the screen reuses the flat roof's own span chart against this roof's true,
// sloped rafter length). Self-contained (no cross-file runtime imports — see the note in CLAUDE.md about why
// every lib/*.ts engine here can be hand-tested with plain Node).

export interface GableRoofInput {
  lengthMm: number          // ridge length — the rafter pairs are spaced along this
  spanMm: number             // overall span, eaves wall to eaves wall (both sides combined)
  pitchDeg: number           // pitch, both faces, degrees
  rafterCentresMm: number
  eavesOverhangMm: number    // horizontal overhang at each eaves wall, measured horizontally
}

export interface GableRoofGeometry {
  lengthM: number
  spanM: number
  pitchDeg: number
  /** Rafter positions along the ridge — one pair (both faces) at each. */
  rafterPairCount: number
  /** Every rafter, both faces. */
  rafterCount: number
  /** One rafter's true, sloped length — half the span plus the eaves overhang, along the slope. */
  rafterRunMm: number
  rafterLm: number
  ridgeLm: number
  ceilingJoistCount: number
  ceilingJoistLm: number
  /** The ridge's height above the wall plates. Informational; not priced. */
  riseMm: number
  /** Both roof faces combined. */
  slopeAreaM2: number
  /** Both eaves walls combined. */
  wallPlateLm: number
  /** Lateral restraint straps to both eaves walls. */
  strapCount: number
  warnings: string[]
}

const RESTRAINT_STRAP_CENTRES_MM = 2000

function studPositions(lengthMm: number, centresMm: number): number[] {
  const positions: number[] = []
  for (let x = 0; x <= lengthMm; x += centresMm) positions.push(x)
  if (positions[positions.length - 1] !== lengthMm) positions.push(lengthMm)
  return positions
}

export function calculateGableRoofGeometry(input: GableRoofInput): GableRoofGeometry {
  const { lengthMm: L, spanMm: S, pitchDeg, rafterCentresMm: C, eavesOverhangMm: overhang } = input
  if (!(L > 0)) throw new Error('The ridge length must be greater than zero.')
  if (!(S > 0)) throw new Error('The span must be greater than zero.')
  if (!(C > 0)) throw new Error('The rafter centres must be greater than zero.')
  if (overhang < 0) throw new Error('The eaves overhang cannot be negative.')
  if (!(pitchDeg > 0) || pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')

  const pitchRad = (pitchDeg * Math.PI) / 180
  const halfSpanMm = S / 2
  const rafterRunMm = (halfSpanMm + overhang) / Math.cos(pitchRad)
  const riseMm = halfSpanMm * Math.tan(pitchRad)
  const slopeAreaM2 = 2 * (L / 1000) * (rafterRunMm / 1000)

  const positions = studPositions(L, C)
  const rafterPairCount = positions.length
  const rafterCount = rafterPairCount * 2
  const rafterLm = (rafterCount * rafterRunMm) / 1000
  const ridgeLm = L / 1000
  const ceilingJoistCount = rafterPairCount
  const ceilingJoistLm = (ceilingJoistCount * S) / 1000
  const wallPlateLm = (2 * L) / 1000
  const strapCount = 2 * (Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1)

  const warnings: string[] = []
  if (pitchDeg < 15) warnings.push(`A ${pitchDeg}° pitch is low for most tiles and slates — check the covering's minimum pitch before committing to it.`)
  if (pitchDeg > 45) warnings.push(`A ${pitchDeg}° pitch is steep — check the covering and fixings are rated for it.`)

  return {
    lengthM: +(L / 1000).toFixed(3), spanM: +(S / 1000).toFixed(3), pitchDeg,
    rafterPairCount, rafterCount, rafterRunMm: +rafterRunMm.toFixed(1), rafterLm: +rafterLm.toFixed(3),
    ridgeLm: +ridgeLm.toFixed(3), ceilingJoistCount, ceilingJoistLm: +ceilingJoistLm.toFixed(3),
    riseMm: +riseMm.toFixed(1), slopeAreaM2: +slopeAreaM2.toFixed(3),
    wallPlateLm: +wallPlateLm.toFixed(3), strapCount,
    warnings,
  }
}
