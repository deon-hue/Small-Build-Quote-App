// Underpinning (traditional mass concrete) — deepening the foundation under an existing wall, a short section at a time. Each section ("pin" or bay), about a
// metre long and never next to another still being worked, is dug out by hand under the old footing, shuttered on its open face, filled with mass concrete up
// to a little below the underside of the old footing, and the gap packed tight with dry mortar; the next pin is dug once it has gone off. Sized from the
// drawn line (the length of wall underpinned) and the pin and depth sizes. Counts, areas and volumes only: the depth, width, pin sequence and any
// temporary support are the engineer's design to confirm — this only warns about the usual rules of thumb. Self-contained (no cross-file runtime imports),
// so it can be hand-tested with plain Node; the screen costs these quantities through the shared costLayer with each layer's fixedQty set from the geometry.

export interface UnderpinningInput {
  /** The length of wall underpinned, mm (the drawn line). */
  lengthMm: number
  /** Each pin's length, mm. Default 1000. */
  pinLengthMm: number
  /** Each pin's width (across the wall, wider than the old footing), mm. Default 600. */
  pinWidthMm: number
  /** How far down it goes below the underside of the existing footing, mm. Default 1200. */
  depthMm: number
  /** The gap packed with dry mortar between the top of the new concrete and the old footing, mm. Default 75. */
  dryPackMm: number
  /** Steel in the concrete as kg per m³; 0 = none. */
  rebarKgPerM3: number
  /** Props and needles holding the wall above while a pin is dug: how many props, and for how many weeks. null = not priced. */
  support: { props: number; weeks: number } | null
}

export interface UnderpinningGeometry {
  lengthM: number
  pinCount: number
  digM3: number
  /** The soil that has to leave: all of it, since the concrete replaces it, bulked 30%. */
  spoilAwayM3: number
  /** An 8-yard skip holds about 6 m³ of loose soil. */
  skipCount: number
  concreteM3: number
  dryPackM3: number
  /** Shuttering to the open face of each pin. */
  formworkM2: number
  rebarKg: number
  propWeeks: number
  /** One pin a day for one gang. */
  programmeDays: number
  warnings: string[]
}

export const UNDERPIN_SPOIL_BULKING = 1.3
export const SKIP_M3 = 6

const toM = (mm: number) => mm / 1000

export function calculateUnderpinningGeometry(input: UnderpinningInput): UnderpinningGeometry {
  const { lengthMm, pinLengthMm, pinWidthMm, depthMm, dryPackMm } = input
  if (!(lengthMm > 0)) throw new Error('The length of wall must be greater than zero.')
  if (!(pinLengthMm > 0)) throw new Error('The pin length must be greater than zero.')
  if (!(pinWidthMm > 0)) throw new Error('The pin width must be greater than zero.')
  if (!(depthMm > 0)) throw new Error('The depth must be greater than zero.')
  if (dryPackMm < 0) throw new Error('The dry pack cannot be negative.')
  if (dryPackMm >= depthMm) throw new Error('The depth must be more than the dry pack gap, so there is room for concrete.')
  if (input.rebarKgPerM3 < 0) throw new Error('The reinforcement cannot be negative.')
  if (input.support && (input.support.props < 0 || input.support.weeks < 0)) throw new Error('The props and weeks cannot be negative.')

  const L = toM(lengthMm), W = toM(pinWidthMm), D = toM(depthMm), P = toM(dryPackMm)
  const pinCount = Math.ceil(lengthMm / pinLengthMm - 1e-9)
  const digM3 = L * W * D
  const spoilAwayM3 = digM3 * UNDERPIN_SPOIL_BULKING
  const concreteM3 = L * W * (D - P)

  const warnings: string[] = []
  if (pinLengthMm > 1200) warnings.push(`Pins ${pinLengthMm}mm long are longer than the usual 1.0 to 1.2m — the wall above is unsupported over the whole pin. Check with the engineer.`)
  if (depthMm > 3000) warnings.push('Underpinning deeper than about 3m by hand needs the engineer\'s temporary works, and another method (such as piles) may suit better.')
  if (pinWidthMm < 450) warnings.push('A pin narrower than about 450mm is unlikely to be wider than the old footing — check with the engineer.')
  if (depthMm < 600) warnings.push('Underpinning less than 600mm deep is unusual — check the depth with the engineer.')

  return {
    lengthM: L,
    pinCount,
    digM3: +digM3.toFixed(4),
    spoilAwayM3: +spoilAwayM3.toFixed(4),
    skipCount: Math.ceil(spoilAwayM3 / SKIP_M3 - 1e-9),
    concreteM3: +concreteM3.toFixed(4),
    dryPackM3: +(L * W * P).toFixed(4),
    formworkM2: +(L * D).toFixed(4),
    rebarKg: +(concreteM3 * Math.max(0, input.rebarKgPerM3)).toFixed(2),
    propWeeks: input.support ? input.support.props * input.support.weeks : 0,
    programmeDays: pinCount,
    warnings,
  }
}
