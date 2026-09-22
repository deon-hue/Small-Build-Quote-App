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

export type MonoPitchWallConnection = 'ledger' | 'bearing'

export interface MonoPitchRoofInput {
  lengthMm: number          // eaves length — the rafters are spaced along this
  spanMm: number            // horizontal plan span, low (eaves) wall to high wall, excluding the overhang
  pitchDeg: number          // roof pitch, degrees
  rafterCentresMm: number
  eavesOverhangMm: number   // how far the rafter extends past the low wall's face, measured horizontally
  highWallConnection: MonoPitchWallConnection
}

export interface MonoPitchRoofGeometry {
  lengthM: number
  spanM: number
  pitchDeg: number
  rafterCount: number
  /** One rafter's true, sloped length — the span plus the eaves overhang, along the slope. */
  rafterRunMm: number
  rafterLm: number
  /** The rise from the low wall to the high wall, over the span (not the overhang) — how much taller the
   * high wall needs to be than the low one. Informational; not priced. */
  riseMm: number
  slopeAreaM2: number
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

function studPositions(lengthMm: number, centresMm: number): number[] {
  const positions: number[] = []
  for (let x = 0; x <= lengthMm; x += centresMm) positions.push(x)
  if (positions[positions.length - 1] !== lengthMm) positions.push(lengthMm)
  return positions
}

export function calculateMonoPitchRoofGeometry(input: MonoPitchRoofInput): MonoPitchRoofGeometry {
  const { lengthMm: L, spanMm: S, pitchDeg, rafterCentresMm: C, eavesOverhangMm: overhang, highWallConnection } = input
  if (!(L > 0)) throw new Error('The eaves length must be greater than zero.')
  if (!(S > 0)) throw new Error('The span must be greater than zero.')
  if (!(C > 0)) throw new Error('The rafter centres must be greater than zero.')
  if (overhang < 0) throw new Error('The eaves overhang cannot be negative.')
  if (!(pitchDeg > 0) || pitchDeg >= 90) throw new Error('The pitch must be greater than 0° and less than 90°.')

  const pitchRad = (pitchDeg * Math.PI) / 180
  const positions = studPositions(L, C)
  const rafterCount = positions.length
  const rafterRunMm = (S + overhang) / Math.cos(pitchRad)
  const riseMm = S * Math.tan(pitchRad)
  const slopeAreaM2 = (L / 1000) * (rafterRunMm / 1000)

  let ledgerMm = 0, ledgerBolts = 0, hangers = 0, wallPlateMm = L, straps = Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1
  if (highWallConnection === 'ledger') {
    ledgerMm = L
    ledgerBolts = Math.ceil(L / LEDGER_BOLT_CENTRES_MM) + 1
    hangers = rafterCount
  } else {
    wallPlateMm += L
    straps += Math.ceil(L / RESTRAINT_STRAP_CENTRES_MM) + 1
  }

  const warnings: string[] = []
  if (pitchDeg < 15) warnings.push(`A ${pitchDeg}° pitch is low for most tiles and slates — check the covering's minimum pitch before committing to it.`)
  if (pitchDeg > 45) warnings.push(`A ${pitchDeg}° pitch is steep — check the covering and fixings are rated for it.`)

  return {
    lengthM: +(L / 1000).toFixed(3), spanM: +(S / 1000).toFixed(3), pitchDeg,
    rafterCount, rafterRunMm: +rafterRunMm.toFixed(1), rafterLm: +(rafterCount * rafterRunMm / 1000).toFixed(3),
    riseMm: +riseMm.toFixed(1), slopeAreaM2: +slopeAreaM2.toFixed(3),
    ledgerLm: +(ledgerMm / 1000).toFixed(3), ledgerBoltCount: ledgerBolts,
    wallPlateLm: +(wallPlateMm / 1000).toFixed(3), hangerCount: hangers, strapCount: straps,
    warnings,
  }
}
