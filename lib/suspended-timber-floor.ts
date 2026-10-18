// A suspended timber floor (Floors & Screeds → Suspended Timber Floor): timber joists spanning between the walls (or beams) with insulation between them, a vapour control layer and a decking of sheets over them.
// It is used for three different floors, and says which in the calculator:
//   ground floor   over a ventilated void: wall plates on a DPC along the bearing walls and along each sleeper wall in the void, and (optionally) gravel or a concrete oversite on the ground under it
//   upper floor    a first (or higher) floor: joists on wall plates or hung from the walls in joist hangers; no void, no sleeper walls, no DPC
//   loft floor     the floor of a loft room (a conversion), or a lighter floor in a loft used only for storage: joists carried like an upper floor, headroom usually limiting how deep they are
// Priced from the floor's area, with the span of the joists worked out from the drawn shape (editable).
//
//   joists         47mm joists at set centres, each as long as the span plus its bearing; extra (doubled or trimming) joists if wanted; strutting between them on longer spans
//   carried by     wall plates (ground floor: on a DPC), or joist hangers
//   insulation     (optional) mineral wool quilt between the joists (thermal on a ground floor, acoustic on an upper or loft floor), held up by netting
//   vapour layer   polythene over the joists (ground floor)
//   decking        T&G chipboard or plywood sheets, screwed and glued
// NOT priced here: the sleeper walls in a ground floor's void and the vents through the walls (priced under External Walls with the sleeper wall calculator: this calculator says how many rows and how long); steel
// beams a loft or upper floor may need; the ceiling under an upper or loft floor (Plastering & Boarding); the floor finish on top.
//
// All rates are samples to be checked against real prices, and every line can be edited in the calculator's breakdown. Pure (no imports), so the sums can be tested.

export type FloorKind = 'ground' | 'upper' | 'loft' | 'loft-storage'
export interface FloorKindInfo {
  label: string
  /** loads for the joist check (kN/m²): permanent (decking, insulation, ceiling) and imposed */
  loads: { deadKnM2: number; imposedKnM2: number }
  /** what the calculator starts with when this kind is picked */
  defaultDepthMm: number
  defaultInsulationMm: number
  defaultCarry: JoistCarry
  defaultVcl: boolean
}
export type JoistCarry = 'plates' | 'hangers'
export const FLOOR_KINDS: Record<FloorKind, FloorKindInfo> = {
  ground: { label: 'Ground floor (over a ventilated void)', loads: { deadKnM2: 0.75, imposedKnM2: 1.5 }, defaultDepthMm: 200, defaultInsulationMm: 200, defaultCarry: 'plates', defaultVcl: true },
  upper: { label: 'Upper floor (first floor or above)', loads: { deadKnM2: 0.9, imposedKnM2: 1.5 }, defaultDepthMm: 200, defaultInsulationMm: 100, defaultCarry: 'hangers', defaultVcl: false },
  loft: { label: 'Loft floor (a loft room / conversion)', loads: { deadKnM2: 0.8, imposedKnM2: 1.5 }, defaultDepthMm: 175, defaultInsulationMm: 100, defaultCarry: 'hangers', defaultVcl: false },
  'loft-storage': { label: 'Loft floor (storage only, light use)', loads: { deadKnM2: 0.5, imposedKnM2: 0.75 }, defaultDepthMm: 150, defaultInsulationMm: 100, defaultCarry: 'plates', defaultVcl: false },
}
export const CARRY_LABEL: Record<JoistCarry, string> = { plates: 'Joists bear on wall plates', hangers: 'Joists hung in joist hangers' }

export type JoistGrade = 'c16' | 'c24'
export const JOIST_DEPTHS_MM = [100, 125, 150, 175, 200, 225, 250]
/** £ per metre of 47mm sawn C16 joist by depth (sample); C24 is a little dearer */
export const JOIST_PER_LM: Record<number, number> = { 100: 2.1, 125: 2.7, 150: 3.2, 175: 3.9, 200: 4.5, 225: 5.3, 250: 6.1 }
export const C24_EXTRA = 1.12
export const JOIST_BEARING_MM = 50           // each joist end sits this far onto its plate or into its hanger
export const WALL_PLATE_PER_LM = 2.2         // 100 × 50 treated wall plate
export const DPC_PER_LM = 1.1
export const HANGER_EACH = 1.8               // galvanised joist hanger with its nails
export const STRUTTING_PER_LM = 1.8
export const JOIST_CENTRES_MM = [400, 450, 600]

export const QUILT_THICKNESSES_MM = [0, 100, 150, 200]
export const QUILT_PER_M2: Record<number, number> = { 100: 4.2, 150: 6.2, 200: 8.4 }
export const NETTING_PER_M2 = 0.9
export const VCL_PER_M2 = 0.5

export type DeckKind = 'chipboard-22' | 'ply-18'
export const DECK_KINDS: Record<DeckKind, { label: string; sheetM2: number; perSheet: number }> = {
  'chipboard-22': { label: '22mm T&G P5 chipboard (2400 × 600)', sheetM2: 1.44, perSheet: 16 },
  'ply-18': { label: '18mm T&G plywood (2400 × 1200)', sheetM2: 2.88, perSheet: 42 },
}
export const DECK_FIXINGS_PER_M2 = 0.75      // screws and adhesive

export type GroundCover = 'none' | 'gravel' | 'concrete'
export const GROUND_COVER_LABEL: Record<GroundCover, string> = { none: 'None (the ground is left as it is)', gravel: 'Gravel, 50mm on a membrane', concrete: 'Concrete oversite, 100mm' }
export const GRAVEL_PER_M3 = 48
export const OVERSITE_PER_M3 = 98            // C20 ready-mix
export const COVER_MEMBRANE_PER_M2 = 0.7

export interface SuspendedTimberInput {
  kind: FloorKind
  areaM2: number
  perimeterLm: number
  /** the joist span between the walls (or beams) they bear on, the full span across any sleeper walls, mm */
  spanMm: number
  centresMm: number
  joistDepthMm: number
  grade: JoistGrade
  carry: JoistCarry
  /** doubled and trimming joists (under walls, round a stairwell or loft hatch), nr */
  extraJoists: number
  /** ground floor only: rows of sleeper wall in the void, running along the bearing lines */
  sleeperRows: number
  insulationMm: number
  vcl: boolean
  deck: DeckKind
  /** ground floor only */
  groundCover: GroundCover
}

export interface SuspendedTimberGeometry {
  kind: FloorKind
  areaM2: number
  perimeterLm: number
  spanM: number
  /** the floor's width along the bearing walls, m */
  widthM: number
  joistCount: number
  extraJoists: number
  joistLengthM: number
  joistLm: number
  carry: JoistCarry
  plateLm: number
  dpcLm: number
  hangerCount: number
  struttingRows: number
  struttingLm: number
  insulationMm: number
  insulationAreaM2: number
  vclAreaM2: number
  deckAreaM2: number
  deckSheets: number
  groundCover: GroundCover
  coverAreaM2: number
  coverVolumeM3: number
  sleeperRows: number
  /** the sleeper walls to price under External Walls: the length of one row and all of them, m */
  sleeperWallLm: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateSuspendedTimberFloor(i: SuspendedTimberInput): SuspendedTimberGeometry {
  if (!(i.areaM2 > 0)) throw new Error('The floor area must be greater than 0.')
  if (!(i.spanMm > 0)) throw new Error('The joist span must be greater than 0.')
  if (!(i.centresMm >= 200 && i.centresMm <= 800)) throw new Error('The joist centres must be between 200mm and 800mm.')
  if (!(i.joistDepthMm > 0)) throw new Error('The joist depth must be greater than 0.')
  if (i.perimeterLm < 0 || i.insulationMm < 0 || i.sleeperRows < 0 || i.extraJoists < 0) throw new Error('Sizes cannot be negative.')
  const warnings: string[] = []
  const ground = i.kind === 'ground'
  const spanM = i.spanMm / 1000
  const widthM = i.areaM2 / spanM
  const rows = ground ? Math.round(i.sleeperRows) : 0
  const extra = Math.round(i.extraJoists)
  const joistCount = Math.ceil((widthM * 1000) / i.centresMm) + 1
  const joistLengthM = spanM + (2 * JOIST_BEARING_MM) / 1000
  const strutRows = spanM / (rows + 1) > 4.5 ? 2 : spanM / (rows + 1) > 2.5 ? 1 : 0
  const hangers = i.carry === 'hangers'
  if (i.insulationMm > i.joistDepthMm) warnings.push(`${i.insulationMm}mm of insulation is deeper than the ${i.joistDepthMm}mm joists: it will not fit between them.`)
  if (ground && rows > 0) warnings.push(`${rows} row${rows === 1 ? '' : 's'} of sleeper wall, ${widthM.toFixed(1)}m long${rows === 1 ? '' : ' each'} (${round2(rows * widthM)}m in all), to be priced under External Walls with the sleeper wall calculator: they are not in this price.`)
  if (ground) warnings.push('Check the void is ventilated (air bricks or ducts through the walls, with openings in the sleeper walls): this is priced with the walls, not here.')
  if (!ground) warnings.push('The ceiling under this floor, and any steel beams the joists bear on, are not in this price: the ceiling is priced under Plastering & Boarding.')
  if (i.kind === 'loft' && spanM > 4.5) warnings.push('A loft room floor over a long span usually needs a steel beam or a structural engineer\'s design: check before relying on these joists.')
  const cover = ground ? i.groundCover : 'none'
  const coverThicknessM = cover === 'gravel' ? 0.05 : cover === 'concrete' ? 0.1 : 0
  const totalJoists = joistCount + extra
  const bearingLines = 2 + rows
  return {
    kind: i.kind, areaM2: i.areaM2, perimeterLm: i.perimeterLm, spanM: round2(spanM), widthM: round2(widthM),
    joistCount, extraJoists: extra, joistLengthM: round2(joistLengthM), joistLm: round2(totalJoists * joistLengthM),
    carry: i.carry,
    plateLm: hangers ? 0 : round2(bearingLines * widthM), dpcLm: ground && !hangers ? round2(bearingLines * widthM) : 0,
    hangerCount: hangers ? totalJoists * 2 : 0,
    struttingRows: strutRows, struttingLm: round2(strutRows * widthM * (rows + 1)),
    insulationMm: i.insulationMm, insulationAreaM2: i.insulationMm > 0 ? i.areaM2 : 0, vclAreaM2: i.vcl ? i.areaM2 : 0,
    deckAreaM2: i.areaM2, deckSheets: round2(i.areaM2 / DECK_KINDS[i.deck].sheetM2),
    groundCover: cover, coverAreaM2: cover === 'none' ? 0 : i.areaM2, coverVolumeM3: round2(i.areaM2 * coverThicknessM),
    sleeperRows: rows, sleeperWallLm: round2(rows * widthM),
    warnings,
  }
}

/** The fewest sleeper-wall rows so each sub-span fits the longest span the chosen joist manages. */
export function sleeperRowsFor(spanMm: number, maxJoistSpanMm: number): number {
  if (!(maxJoistSpanMm > 0) || spanMm <= maxJoistSpanMm) return 0
  return Math.max(1, Math.ceil(spanMm / maxJoistSpanMm) - 1)
}
