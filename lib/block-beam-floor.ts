// A block and beam floor (Floors & Screeds → Block and Beam Floor): a suspended ground floor of precast prestressed concrete beams spanning between the walls, with concrete blocks laid between them, grouted,
// then insulation and a membrane on top (the screed over it is the Screeded Floor calculator's job). Priced from the floor's area, with the span of the beams worked out from the drawn shape (editable).
//
//   dig out        (optional) the ground dug down, the machine and its days, the soil carted away
//   ground         hardcore and sand blinding under the void (optional, thickness set)
//   beams          precast beams at set centres, each as long as the span plus its bearing at each end; extra beams under walls (optional)
//   blocks         dense concrete blocks (440 × 215 × 100) laid between the beams, grouted
//   DPC            a strip under the beam ends where they bear on the walls
//   insulation     (optional) rigid board over the blocks, under the screed, with a membrane
//   lifting        the beams are lifted in by a lorry crane (or telehandler)
// NOT priced here: the walls the beams bear on, including sleeper walls and the vents through them (priced under External Walls: the sleeper wall calculator), and the screed.
//
// All rates are samples to be checked against real prices, and every line can be edited in the calculator's breakdown. Pure (no imports), so the sums can be tested.

export const BEAM_PER_LM = 10             // precast prestressed beam, supplied and delivered, per metre (sample)
export const BEAM_BEARING_MM = 100        // each beam end sits this far onto the wall
export const BLOCK_LENGTH_MM = 440
export const BLOCK_FACE_MM = 215       // the block face along the beam
export const BLOCK_EACH = 1.65            // dense concrete infill block (sample)
export const GROUT_PER_M2 = 1.8           // sand and cement grout brushed into the joints
export const DPC_PER_LM = 1.1             // DPC strip under the beam ends
export const CRANE_PER_DAY = 380          // lorry crane or telehandler with operator
export const BEAMS_LIFTED_PER_DAY = 70
export const MEMBRANE_PER_M2 = 0.7
export const SPOIL_BULKING = 1.3
export const DIG_M3_PER_DAY = 25
export const BEAM_CENTRES_MM = [440, 520, 600]
export const MAX_COMMON_SPAN_MM = 6000

export interface BlockBeamInput {
  areaM2: number
  perimeterLm: number
  /** the beam span between the walls they bear on, mm */
  spanMm: number
  /** beam centres, mm */
  centresMm: number
  /** extra beams under loadbearing walls (doubled beams), nr */
  extraBeams: number
  digDepthMm: number
  hardcoreMm: number
  blindingMm: number
  insulationMm: number
  dpm: boolean
  edgeStrip: boolean
  dpcAtBearings: boolean
  crane: boolean
}

export interface BlockBeamGeometry {
  areaM2: number
  perimeterLm: number
  spanM: number
  /** the floor's width across the beams, m */
  widthM: number
  beamCount: number
  extraBeams: number
  beamLengthM: number
  beamLm: number
  blockCount: number
  groutAreaM2: number
  dpcLm: number
  insulationMm: number
  insulationAreaM2: number
  dpmAreaM2: number
  edgeStripLm: number
  digVolumeM3: number
  spoilAwayM3: number
  excavatorDays: number
  hardcoreM3: number
  plateDays: number
  blindingM3: number
  craneDays: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const halfDays = (d: number) => (d <= 0 ? 0 : Math.max(0.5, Math.round(d * 2) / 2))

/** The two sides of a rectangle with this area and perimeter (longer, shorter), m. If the figures are not those of a rectangle (an L-shape's perimeter is longer), it falls back to a square of the same area. */
export function sidesFromAreaPerimeter(areaM2: number, perimeterLm: number): { long: number; short: number } {
  const A = Math.max(0, areaM2)
  const s = Math.max(0, perimeterLm) / 2
  const disc = s * s - 4 * A
  if (disc >= 0 && s > 0) { const r = Math.sqrt(disc); return { long: round2((s + r) / 2), short: round2((s - r) / 2) } }
  const side = Math.sqrt(A)
  return { long: round2(side), short: round2(side) }
}

export function calculateBlockBeamFloor(i: BlockBeamInput): BlockBeamGeometry {
  if (!(i.areaM2 > 0)) throw new Error('The floor area must be greater than 0.')
  if (!(i.spanMm > 0)) throw new Error('The beam span must be greater than 0.')
  if (!(i.centresMm >= 300 && i.centresMm <= 1000)) throw new Error('The beam centres must be between 300mm and 1000mm.')
  if (i.perimeterLm < 0 || i.digDepthMm < 0 || i.hardcoreMm < 0 || i.blindingMm < 0 || i.insulationMm < 0 || i.extraBeams < 0) throw new Error('Sizes cannot be negative.')
  const warnings: string[] = []
  const spanM = i.spanMm / 1000
  if (i.spanMm > MAX_COMMON_SPAN_MM) warnings.push(`A ${spanM.toFixed(1)}m span is long for standard beams: the beam supplier designs the beams for the span and loads, and may need deeper or doubled beams.`)
  if (i.centresMm > 600) warnings.push('Beam centres over 600mm need a thicker block or topping: check with the beam supplier.')
  warnings.push('The beam supplier designs and confirms the beams for your spans and loads (including any loadbearing walls on the floor).')
  const widthM = i.areaM2 / spanM
  const beamCount = Math.max(1, Math.ceil((widthM * 1000) / i.centresMm))
  const beamLengthM = spanM + (2 * BEAM_BEARING_MM) / 1000
  const extra = Math.round(i.extraBeams)
  const blocksPerRow = Math.ceil((spanM * 1000) / BLOCK_FACE_MM)
  const dig = i.areaM2 * i.digDepthMm / 1000
  const beamsLifted = beamCount + extra
  return {
    areaM2: i.areaM2, perimeterLm: i.perimeterLm, spanM: round2(spanM), widthM: round2(widthM),
    beamCount, extraBeams: extra, beamLengthM: round2(beamLengthM), beamLm: round2(beamsLifted * beamLengthM),
    blockCount: beamCount * blocksPerRow, groutAreaM2: round2(i.areaM2),
    dpcLm: i.dpcAtBearings ? round2(2 * widthM) : 0,
    insulationMm: i.insulationMm, insulationAreaM2: i.insulationMm > 0 ? i.areaM2 : 0, dpmAreaM2: i.dpm ? i.areaM2 : 0,
    edgeStripLm: i.edgeStrip ? i.perimeterLm : 0,
    digVolumeM3: round2(dig), spoilAwayM3: round2(dig * SPOIL_BULKING), excavatorDays: halfDays(dig / DIG_M3_PER_DAY),
    hardcoreM3: round2(i.areaM2 * i.hardcoreMm / 1000), plateDays: i.hardcoreMm > 0 ? halfDays(i.areaM2 / 150) : 0,
    blindingM3: round2(i.areaM2 * i.blindingMm / 1000),
    craneDays: i.crane ? halfDays(beamsLifted / BEAMS_LIFTED_PER_DAY) : 0,
    warnings,
  }
}
