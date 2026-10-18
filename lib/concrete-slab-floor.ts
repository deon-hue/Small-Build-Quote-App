// A concrete slab floor (Floors & Screeds → Concrete Slab Floor): a ground-bearing slab built up from the ground in layers, priced from the floor's area.
//
//   dig out        (optional) the ground dug down to formation level: the machine and its days, and the soil carted away
//   hardcore       compacted MOT Type 1 in layers, with a compaction plate
//   sand blinding  a thin layer to protect the membrane
//   membrane       damp-proof membrane (1200g polythene), lapped and taped
//   insulation     (optional) rigid insulation board under the slab, on the membrane
//   slab           the concrete, a set thickness, with mesh on spacers (optional) and edge insulation strip
//   finish         (optional) power-floated
// The screed over a slab is priced with the Screeded Floor calculator, not here.
//
// All rates are samples to be checked against real prices, and every line can be edited in the calculator's breakdown. Pure (no imports), so the sums can be tested.

export type SlabMix = 'C20' | 'C25' | 'C30'
export const SLAB_MIXES: Record<SlabMix, { label: string; perM3: number }> = {
  C20: { label: 'C20 (light duty)', perM3: 98 },
  C25: { label: 'C25 (usual floor slab)', perM3: 105 },
  C30: { label: 'C30 (stronger)', perM3: 112 },
}

export const HARDCORE_PER_M3 = 44       // MOT Type 1 supplied and delivered, per m³ compacted (the loose volume to buy is more: the waste line allows for it)
export const HARDCORE_COMPACTION_WASTE_PCT = 25
export const BLINDING_PER_M3 = 38
export const DPM_PER_M2 = 0.7
export const MESH_PER_M2 = 3.2           // A142 mesh, per layer
export const SPACERS_PER_M2 = 0.4        // mesh spacers and chairs
export const EDGE_STRIP_PER_LM = 0.9
export const PLATE_PER_DAY = 40          // compaction plate hire
export const POWER_FLOAT_PER_DAY = 65    // power float hire
export const MUCKAWAY_PER_M3 = 28        // soil carted away, per m³ bulked
export const SPOIL_BULKING = 1.3
export const INSULATION_THICKNESSES_MM = [0, 50, 75, 100, 120, 150]
export const INSULATION_PER_M2: Record<number, number> = { 50: 14, 75: 19, 100: 25, 120: 29, 150: 36 }
/** how much one machine day digs under a floor, m³ (a mini excavator, spreading and removing) */
export const DIG_M3_PER_DAY = 25

export interface ConcreteSlabInput {
  areaM2: number
  perimeterLm: number
  /** the ground dug down to formation, mm (0 = no digging priced here) */
  digDepthMm: number
  hardcoreMm: number
  blindingMm: number
  dpm: boolean
  /** insulation board under the slab, on the membrane, mm (0 = none) */
  insulationMm: number
  slabMm: number
  mix: SlabMix
  /** layers of mesh in the slab (0, 1 or 2) */
  meshLayers: number
  edgeStrip: boolean
  powerFloat: boolean
}

export interface ConcreteSlabGeometry {
  areaM2: number
  perimeterLm: number
  digVolumeM3: number
  spoilAwayM3: number
  /** days the digging itself takes (the digger section turns this into days on site) */
  excavatorDays: number
  hardcoreM3: number
  plateDays: number
  blindingM3: number
  dpmAreaM2: number
  insulationMm: number
  insulationAreaM2: number
  slabMm: number
  concreteM3: number
  meshAreaM2: number
  meshLayers: number
  edgeStripLm: number
  powerFloatDays: number
  powerFloatAreaM2: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const halfDays = (d: number) => (d <= 0 ? 0 : Math.max(0.5, Math.round(d * 2) / 2))

export function calculateConcreteSlabFloor(i: ConcreteSlabInput): ConcreteSlabGeometry {
  if (!(i.areaM2 > 0)) throw new Error('The floor area must be greater than 0.')
  if (!(i.slabMm > 0)) throw new Error('The slab thickness must be greater than 0.')
  if (i.perimeterLm < 0 || i.digDepthMm < 0 || i.hardcoreMm < 0 || i.blindingMm < 0 || i.insulationMm < 0) throw new Error('Sizes cannot be negative.')
  const warnings: string[] = []
  if (i.slabMm < 100) warnings.push(`A ${i.slabMm}mm slab is thin for a ground floor: 100mm is the usual minimum.`)
  if (i.hardcoreMm > 600) warnings.push('More than about 600mm of hardcore is deep fill: check with building control and the engineer, who may want it laid in layers and tested.')
  if (i.hardcoreMm > 0 && i.hardcoreMm < 100) warnings.push('Hardcore thinner than about 100mm does not give the slab a firm base.')
  if (i.blindingMm > 0 && !i.dpm) warnings.push('A membrane is normally laid over the blinding, so the damp does not rise through the slab.')
  if (i.insulationMm > 0 && !i.dpm) warnings.push('Insulation on a slab normally has a membrane under it.')
  const dig = i.areaM2 * i.digDepthMm / 1000
  return {
    areaM2: i.areaM2, perimeterLm: i.perimeterLm,
    digVolumeM3: round2(dig), spoilAwayM3: round2(dig * SPOIL_BULKING), excavatorDays: halfDays(dig / DIG_M3_PER_DAY),
    hardcoreM3: round2(i.areaM2 * i.hardcoreMm / 1000), plateDays: i.hardcoreMm > 0 ? halfDays(i.areaM2 / 150) : 0,
    blindingM3: round2(i.areaM2 * i.blindingMm / 1000), dpmAreaM2: i.dpm ? i.areaM2 : 0,
    insulationMm: i.insulationMm, insulationAreaM2: i.insulationMm > 0 ? i.areaM2 : 0,
    slabMm: i.slabMm, concreteM3: round2(i.areaM2 * i.slabMm / 1000),
    meshAreaM2: round2(i.areaM2 * Math.max(0, i.meshLayers)), meshLayers: Math.max(0, i.meshLayers),
    edgeStripLm: i.edgeStrip ? i.perimeterLm : 0,
    powerFloatDays: i.powerFloat ? halfDays(i.areaM2 / 250) : 0, powerFloatAreaM2: i.powerFloat ? i.areaM2 : 0,
    warnings,
  }
}
