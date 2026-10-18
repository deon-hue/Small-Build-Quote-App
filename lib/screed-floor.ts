// A screeded floor (Floors & Screeds → Screeded Floor): a screed laid over the floor, by a screeding firm, with the insulation, the membrane and the edge strip fitted by us first.
//
// The screeding firm is paid per m² for the screed ONLY, and that price includes their materials, their pump and their machinery, so none of those are priced separately here. The firm works the
// price out from the thickness and the amount of screed, so the rate is a laying charge per m² plus a charge for the volume (per m³) that is laid: a thicker screed costs more per m². The firm
// usually has a minimum charge for a small floor, which tops the price up when the floor is small.
//
// Everything else is ours: the insulation under the screed, the damp-proof or separating membrane, the edge insulation strip and any mesh, with the labour to fit them.
// All rates are samples, to be checked against the firm's real prices, and every line can be edited in the calculator's breakdown. Pure, so the sums can be tested.

export type ScreedType = 'sand-cement' | 'liquid'

export interface ScreedTypeInfo {
  label: string
  /** thicknesses the firm usually lays, mm (any other can be typed) */
  thicknessesMm: number[]
  defaultMm: number
  /** the firm's laying charge, £ per m², whatever the thickness */
  layingPerM2: number
  /** the firm's charge for the screed itself, £ per m³ laid (their materials and pump included) */
  perM3: number
  /** thinner than this and it is not a sensible screed of this kind (a warning, not a refusal) */
  minMm: number
  /** the thinnest to lay as a floating screed over insulation or a membrane */
  floatingMinMm: number
}

export const SCREED_TYPES: Record<ScreedType, ScreedTypeInfo> = {
  'sand-cement': { label: 'Sand:cement screed (pumped)', thicknessesMm: [50, 65, 75], defaultMm: 65, layingPerM2: 5, perM3: 150, minMm: 25, floatingMinMm: 65 },
  liquid:        { label: 'Liquid screed (calcium sulphate)', thicknessesMm: [35, 40, 50, 75], defaultMm: 50, layingPerM2: 6, perM3: 190, minMm: 25, floatingMinMm: 35 },
}

/** The firm's minimum charge for a job, £ ex VAT (sample) */
export const SCREED_MINIMUM_CHARGE = 350

/** Insulation board under the screed: thickness (mm) → £ per m² (sample PIR prices), 0 meaning none. */
export const INSULATION_THICKNESSES_MM = [0, 25, 50, 75, 100, 120, 150]
export const INSULATION_PER_M2: Record<number, number> = { 25: 11, 50: 14, 75: 19, 100: 25, 120: 29, 150: 36 }

export const DPM_PER_M2 = 0.7        // 1200g polythene or a separating membrane
export const EDGE_STRIP_PER_LM = 0.9 // 10mm perimeter edge insulation strip
export const MESH_PER_M2 = 3.2       // A142 mesh or fibre-reinforcement allowance

export interface ScreedFloorInput {
  areaM2: number
  perimeterLm: number
  screedType: ScreedType
  thicknessMm: number
  insulationMm: number
  dpm: boolean
  edgeStrip: boolean
  mesh: boolean
}

export interface ScreedFloorGeometry {
  areaM2: number
  perimeterLm: number
  screedType: ScreedType
  thicknessMm: number
  /** the screed laid, m³ */
  screedVolumeM3: number
  /** the firm's rate for this thickness, £ per m² */
  screedRatePerM2: number
  insulationMm: number
  insulationAreaM2: number
  dpmAreaM2: number
  edgeStripLm: number
  meshAreaM2: number
  /** the screed sits on insulation or a membrane rather than bonded to the slab */
  floating: boolean
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The firm's rate per m² for a thickness: the laying charge plus the volume charge for the depth laid. */
export function screedRatePerM2(type: ScreedType, thicknessMm: number): number {
  const t = SCREED_TYPES[type]
  return round2(t.layingPerM2 + t.perM3 * (Math.max(0, thicknessMm) / 1000))
}

/** What the screeding firm charges: the area at their rate, topped up to their minimum charge when the floor is small. */
export function screedCharge(areaM2: number, ratePerM2: number, minimumCharge: number): { cost: number; topUp: number } {
  const cost = round2(Math.max(0, areaM2) * Math.max(0, ratePerM2))
  const topUp = cost > 0 ? round2(Math.max(0, minimumCharge - cost)) : 0
  return { cost, topUp }
}

export function calculateScreedFloor(i: ScreedFloorInput): ScreedFloorGeometry {
  if (!(i.areaM2 > 0)) throw new Error('The floor area must be greater than 0.')
  if (!(i.thicknessMm > 0)) throw new Error('The screed thickness must be greater than 0.')
  if (i.perimeterLm < 0) throw new Error('The perimeter cannot be negative.')
  const info = SCREED_TYPES[i.screedType]
  const floating = i.insulationMm > 0 || i.dpm
  const warnings: string[] = []
  if (i.thicknessMm < info.minMm) warnings.push(`A ${info.label.toLowerCase().split(' (')[0]} thinner than ${info.minMm}mm will not hold together: check the thickness with the screeding firm.`)
  else if (floating && i.thicknessMm < info.floatingMinMm) warnings.push(`A floating screed (over insulation or a membrane) is normally at least ${info.floatingMinMm}mm ${i.screedType === 'sand-cement' ? 'of sand:cement' : 'of liquid screed'}: ${i.thicknessMm}mm may crack or curl.`)
  if (i.thicknessMm > 100) warnings.push('A screed thicker than 100mm needs the firm to confirm they can lay and cure it in one go.')
  if (i.insulationMm > 0 && !i.dpm) warnings.push('Insulation under a screed normally has a membrane over it, so the wet screed does not run between the boards.')
  return {
    areaM2: i.areaM2, perimeterLm: i.perimeterLm, screedType: i.screedType, thicknessMm: i.thicknessMm,
    screedVolumeM3: round2(i.areaM2 * i.thicknessMm / 1000),
    screedRatePerM2: screedRatePerM2(i.screedType, i.thicknessMm),
    insulationMm: i.insulationMm, insulationAreaM2: i.insulationMm > 0 ? i.areaM2 : 0,
    dpmAreaM2: i.dpm ? i.areaM2 : 0, edgeStripLm: i.edgeStrip ? i.perimeterLm : 0, meshAreaM2: i.mesh ? i.areaM2 : 0,
    floating, warnings,
  }
}
