// An existing floor overlay (Floors & Screeds → Existing Floor Overlay): a new surface laid over the floor that is already there, to level it or to give it a sound face to take the final floor covering.
// Two ways, each priced from the floor's area:
//   self-levelling compound  poured over the primed floor (a thickness in mm: the bags come from the area and the thickness, at about 1.7kg per m² for each mm)
//   plywood overlay          sheets of ply screwed over an old timber floor
// Everything is ours here (the materials and the labour to lay them): there is no subcontract line, unlike a screed laid by a screeding firm. All rates are samples to check against real prices, and every
// line can be edited in the calculator's breakdown. Pure, so the sums can be tested.

export type OverlayKind = 'self-levelling' | 'plywood'

export interface OverlayKindInfo { label: string; defaultMm: number; thicknessesMm: number[]; minMm: number; maxMm: number }

export const OVERLAY_KINDS: Record<OverlayKind, OverlayKindInfo> = {
  'self-levelling': { label: 'Self-levelling compound', defaultMm: 5, thicknessesMm: [3, 5, 10, 15], minMm: 2, maxMm: 25 },
  plywood: { label: 'Plywood overlay (over an old timber floor)', defaultMm: 18, thicknessesMm: [9, 12, 18], minMm: 6, maxMm: 25 },
}

/** how much self-levelling compound covers: kg for each m² and each mm of depth */
export const SLC_KG_PER_M2_PER_MM = 1.7
export const SLC_BAG_KG = 25
export const SLC_PER_BAG = 24          // £ a 25kg bag (sample)
export const PRIMER_L_PER_M2 = 0.15
export const PRIMER_PER_L = 5.6
export const PLY_SHEET_M2 = 2.98       // 2440 × 1220mm
export const PLY_PER_SHEET: Record<number, number> = { 9: 24, 12: 29, 18: 38 }
export const PLY_FIXINGS_PER_M2 = 0.35
export const EDGE_STRIP_PER_LM = 0.9

export interface FloorOverlayInput { areaM2: number; perimeterLm: number; kind: OverlayKind; thicknessMm: number; primer: boolean; edgeStrip: boolean }

export interface FloorOverlayGeometry {
  areaM2: number
  perimeterLm: number
  kind: OverlayKind
  thicknessMm: number
  /** self-levelling compound: kg, and 25kg bags (before waste) */
  compoundKg: number
  compoundBags: number
  primerLitres: number
  /** plywood: sheets (before waste) */
  plySheets: number
  plyFixingsM2: number
  edgeStripLm: number
  /** how far the new surface raises the floor, mm: doors and thresholds need checking */
  raisesFloorMm: number
  warnings: string[]
}

export function calculateFloorOverlay(i: FloorOverlayInput): FloorOverlayGeometry {
  if (!(i.areaM2 > 0)) throw new Error('The floor area must be greater than 0.')
  if (!(i.thicknessMm > 0)) throw new Error('The thickness must be greater than 0.')
  if (i.perimeterLm < 0) throw new Error('The perimeter cannot be negative.')
  const info = OVERLAY_KINDS[i.kind]
  const slc = i.kind === 'self-levelling'
  const warnings: string[] = []
  if (i.thicknessMm < info.minMm) warnings.push(slc ? `A self-levelling layer thinner than ${info.minMm}mm will not flow out: check the manufacturer's minimum depth.` : `${i.thicknessMm}mm ply is too thin to bridge old floorboards: use at least ${info.minMm}mm.`)
  if (slc && i.thicknessMm > 10) warnings.push(`Over about 10mm, self-levelling compound usually has aggregate added or goes down in two pours: check the data sheet for ${i.thicknessMm}mm.`)
  if (i.thicknessMm > info.maxMm) warnings.push(`${i.thicknessMm}mm is more than an overlay normally is: a screed may be the better way to level this floor.`)
  if (i.thicknessMm >= 12) warnings.push(`The floor rises by ${i.thicknessMm}mm: check the door thresholds, the doors and any step down.`)
  const kg = slc ? i.areaM2 * i.thicknessMm * SLC_KG_PER_M2_PER_MM : 0
  return {
    areaM2: i.areaM2, perimeterLm: i.perimeterLm, kind: i.kind, thicknessMm: i.thicknessMm,
    compoundKg: Math.round(kg * 10) / 10, compoundBags: Math.round((kg / SLC_BAG_KG) * 100) / 100,
    primerLitres: i.primer && slc ? Math.round(i.areaM2 * PRIMER_L_PER_M2 * 100) / 100 : 0,
    plySheets: slc ? 0 : Math.round((i.areaM2 / PLY_SHEET_M2) * 100) / 100,
    plyFixingsM2: slc ? 0 : i.areaM2,
    edgeStripLm: i.edgeStrip && slc ? i.perimeterLm : 0,
    raisesFloorMm: i.thicknessMm,
    warnings,
  }
}
