// Pad foundations — separate blocks of concrete, each in its own pit, usually under a column or a steel. Priced from how many there are and their size
// (all the same to start with; further groups of a different size can be added), with the pit, the blinding under each, optional formwork to the sides,
// optional reinforcement, the concrete and the soil. Counts, areas and volumes only: the size, depth and reinforcement of a pad are the engineer's
// design to confirm — this only warns about the usual rules of thumb. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain
// Node; the screen costs these quantities through the shared costLayer with each layer's fixedQty set from the geometry below.

export interface PadGroup {
  id: string
  /** How many pads of this size. */
  count: number
  lengthMm: number
  widthMm: number
  /** The thickness of the concrete pad, mm. */
  depthMm: number
}

export interface PadFoundationInput {
  pads: PadGroup[]
  /** Blinding concrete under each pad, mm. Default 75. */
  blindingMm: number
  /** Formwork to the sides of each pad. When off the concrete is poured against the sides of the pit. */
  formwork: boolean
  /** How much bigger the pit is than the pad each side when it is formed, mm (room to fix the formwork). Used only with formwork. Default 200. */
  workingSpaceMm: number
  /** Reinforcement as steel per m³ of concrete, kg; 0 = none. */
  rebarKgPerM3: number
  /** A holding-down set or column starter bars in each pad. */
  starters: boolean
}

export interface PadFoundationGeometry {
  padCount: number
  pitDigM3: number
  blindingM3: number
  concreteM3: number
  /** Soil carted away: what the blinding and the pads displace, bulked up 30% (the rest goes back round the pads). */
  spoilAwayM3: number
  backfillM3: number
  /** Machine days: small pits dig slowly, so about 15 m³ a day, in half days (never under half a day). */
  excavatorDays: number
  /** A compaction plate for the backfill, half a day when there is any. */
  plateDays: number
  formworkM2: number
  rebarKg: number
  starterCount: number
  /** Deepest pit, mm, for the trench-support warning. */
  deepestPitMm: number
  warnings: string[]
}

export const PAD_SPOIL_BULKING = 1.3
export const PAD_DIG_M3_PER_DAY = 15

const toM = (mm: number) => mm / 1000
const halfDays = (d: number) => Math.max(0.5, Math.round(d * 2) / 2)

export function calculatePadFoundationGeometry(input: PadFoundationInput): PadFoundationGeometry {
  const groups = input.pads.filter(g => g.count > 0)
  if (groups.length === 0) throw new Error('There must be at least one pad.')
  for (const g of groups) {
    if (!(g.lengthMm > 0) || !(g.widthMm > 0) || !(g.depthMm > 0)) throw new Error('Each pad needs a length, a width and a depth greater than zero.')
    if (!Number.isInteger(g.count)) throw new Error('The number of pads must be a whole number.')
  }
  if (input.blindingMm < 0) throw new Error('The blinding cannot be negative.')
  if (input.rebarKgPerM3 < 0) throw new Error('The reinforcement cannot be negative.')
  const space = input.formwork ? Math.max(0, input.workingSpaceMm) : 0

  let padCount = 0, concrete = 0, blinding = 0, dig = 0, formwork = 0, deepest = 0
  const warnings: string[] = []
  for (const g of groups) {
    const L = toM(g.lengthMm), W = toM(g.widthMm), D = toM(g.depthMm), B = toM(input.blindingMm), s = toM(space)
    padCount += g.count
    concrete += g.count * L * W * D
    blinding += g.count * L * W * B
    dig += g.count * (L + 2 * s) * (W + 2 * s) * (D + B)
    if (input.formwork) formwork += g.count * 2 * (L + W) * D
    deepest = Math.max(deepest, g.depthMm + input.blindingMm)
    if (g.depthMm < 300) warnings.push(`A pad ${g.depthMm}mm thick is thin — pads are normally at least 300mm. Check with the engineer.`)
    if (g.lengthMm < 600 || g.widthMm < 600) warnings.push(`A ${g.lengthMm} × ${g.widthMm}mm pad is small — pads are normally at least 600mm each way.`)
  }
  if (deepest > 1200) warnings.push('A pit deeper than 1.2m normally needs its sides supported while people work in it. Support is not priced here.')
  const displaced = concrete + blinding
  const backfill = Math.max(0, dig - displaced)

  return {
    padCount,
    pitDigM3: +dig.toFixed(4),
    blindingM3: +blinding.toFixed(4),
    concreteM3: +concrete.toFixed(4),
    spoilAwayM3: +(Math.min(dig, displaced) * PAD_SPOIL_BULKING).toFixed(4),
    backfillM3: +backfill.toFixed(4),
    excavatorDays: halfDays(dig / PAD_DIG_M3_PER_DAY),
    plateDays: backfill > 0 ? 0.5 : 0,
    formworkM2: +formwork.toFixed(4),
    rebarKg: +(concrete * Math.max(0, input.rebarKgPerM3)).toFixed(2),
    starterCount: input.starters ? padCount : 0,
    deepestPitMm: deepest,
    warnings: Array.from(new Set(warnings)),
  }
}
