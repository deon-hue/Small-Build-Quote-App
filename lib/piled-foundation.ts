// Piled foundation — piles driven or bored into the ground along the line of the wall, with a reinforced concrete ground beam cast on top of them to tie
// them together and carry the wall. Sized from the drawn line (the beam's run) and the beam and pile sizes. The piles are a specialist subcontract
// (priced per metre of pile, with a charge for bringing the rig); the beam is shuttered, reinforced with a wire cage, and cast in a shallow trench on
// a little blinding. Counts, lengths and volumes only: the pile size, depth and spacing, and the beam size and cage, are the engineer's design to confirm
// — this only warns about the usual rules of thumb. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen
// costs these quantities through the shared costLayer with each layer's fixedQty set from the geometry below.

export interface PiledFoundationInput {
  /** The beam's run, mm (the drawn line). */
  lengthMm: number
  /** Piles every this far along the beam, mm. Default 3000. */
  pileSpacingMm: number
  /** A pile count typed by the estimator, replacing the one worked out from the spacing. null = use the spacing. */
  pileCountOverride: number | null
  pileDiameterMm: number
  pileDepthMm: number
  beamWidthMm: number
  beamDepthMm: number
  /** Blinding under the beam, mm; 0 = none. Default 50. */
  blindingMm: number
  /** How much wider the trench is than the beam each side, for the shuttering, mm. Default 150. */
  workingSpaceMm: number
  /** A void former under the beam, where the ground may swell (clay). */
  voidFormer: boolean
}

export interface PiledFoundationGeometry {
  lengthM: number
  pileCount: number
  pileLm: number
  /** The soil brought up by the piling, bulked 30%. */
  pileArisingsM3: number
  trenchDigM3: number
  beamConcreteM3: number
  blindingM3: number
  /** Shuttering to both faces of the beam. */
  formworkM2: number
  cageLm: number
  voidFormerM2: number
  /** Soil carted away: the piling arisings plus what the beam and blinding displace from the trench, bulked up 30%. */
  spoilAwayM3: number
  backfillM3: number
  /** Machine days for the beam trench: about 20 m³ a day in a narrow trench, in half days (never under half a day). */
  excavatorDays: number
  plateDays: number
  warnings: string[]
}

export const PILE_SPOIL_BULKING = 1.3
export const BEAM_TRENCH_M3_PER_DAY = 20

const toM = (mm: number) => mm / 1000
const halfDays = (d: number) => Math.max(0.5, Math.round(d * 2) / 2)

export function calculatePiledFoundationGeometry(input: PiledFoundationInput): PiledFoundationGeometry {
  const { lengthMm, pileSpacingMm, pileDiameterMm, pileDepthMm, beamWidthMm, beamDepthMm, blindingMm, workingSpaceMm } = input
  if (!(lengthMm > 0)) throw new Error('The beam length must be greater than zero.')
  if (input.pileCountOverride == null && !(pileSpacingMm > 0)) throw new Error('The pile spacing must be greater than zero.')
  if (input.pileCountOverride != null && (!Number.isInteger(input.pileCountOverride) || input.pileCountOverride < 0)) throw new Error('The number of piles must be a whole number.')
  if (!(pileDiameterMm > 0) || !(pileDepthMm > 0)) throw new Error('The pile diameter and depth must be greater than zero.')
  if (!(beamWidthMm > 0) || !(beamDepthMm > 0)) throw new Error('The beam width and depth must be greater than zero.')
  if (blindingMm < 0 || workingSpaceMm < 0) throw new Error('The blinding and working space cannot be negative.')

  const L = toM(lengthMm)
  const pileCount = input.pileCountOverride ?? (Math.ceil(lengthMm / pileSpacingMm - 1e-9) + 1)
  const pileLm = pileCount * toM(pileDepthMm)
  const pileVolume = Math.PI * Math.pow(toM(pileDiameterMm) / 2, 2) * toM(pileDepthMm) * pileCount
  const W = toM(beamWidthMm), D = toM(beamDepthMm), s = toM(workingSpaceMm), B = toM(blindingMm)

  const beamConcreteM3 = L * W * D
  const blindingM3 = L * W * B
  const trenchDigM3 = L * (W + 2 * s) * (D + B)
  const displaced = beamConcreteM3 + blindingM3
  const backfillM3 = Math.max(0, trenchDigM3 - displaced)

  const warnings: string[] = []
  if (pileCount < 2) warnings.push('A ground beam is normally carried on at least two piles. Check the pile count with the engineer.')
  if (input.pileCountOverride == null && pileSpacingMm > 4000) warnings.push(`Piles ${pileSpacingMm}mm apart is wide for a ground beam — the engineer sets the spacing from the loads.`)
  if (beamWidthMm < 300 || beamDepthMm < 300) warnings.push('A ground beam smaller than about 300mm either way is unusual — check the size with the engineer.')
  if (beamDepthMm + blindingMm > 1200) warnings.push('A beam trench deeper than 1.2m normally needs its sides supported. Support is not priced here.')
  if (pileDiameterMm > beamWidthMm) warnings.push(`The piles (${pileDiameterMm}mm) are wider than the beam (${beamWidthMm}mm) that sits on them.`)

  return {
    lengthM: L,
    pileCount,
    pileLm: +pileLm.toFixed(3),
    pileArisingsM3: +(pileVolume * PILE_SPOIL_BULKING).toFixed(4),
    trenchDigM3: +trenchDigM3.toFixed(4),
    beamConcreteM3: +beamConcreteM3.toFixed(4),
    blindingM3: +blindingM3.toFixed(4),
    formworkM2: +(2 * D * L).toFixed(4),
    cageLm: L,
    voidFormerM2: input.voidFormer ? +(L * W).toFixed(4) : 0,
    spoilAwayM3: +(pileVolume * PILE_SPOIL_BULKING + Math.min(trenchDigM3, displaced) * PILE_SPOIL_BULKING).toFixed(4),
    backfillM3: +backfillM3.toFixed(4),
    excavatorDays: halfDays(trenchDigM3 / BEAM_TRENCH_M3_PER_DAY),
    plateDays: backfillM3 > 0 ? 0.5 : 0,
    warnings,
  }
}
