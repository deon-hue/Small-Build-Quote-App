// External timber frame wall with a brick outer leaf (the usual wall of a timber frame extension or house): from the outside in, a half-brick facing leaf (102.5mm, stretcher bond), a clear cavity of at least 50mm,
// stainless steel frame ties back to the studs, a breather membrane over sheathing, the timber stud frame (a sole plate, a double top plate, studs at centres, a doubled header and trimmed studs round each opening,
// noggins) with insulation between the studs, optional extra insulation outside the sheathing, a vapour control layer and plasterboard inside. Over each opening a steel angle lintel carries the brickwork, with a cavity
// tray and weep vents; cavity barriers close the cavity at the openings and the ends. Pure: sizes in, priced lines out. It counts and prices what is drawn; it does not design the frame (bracing, the header sections, the
// ties' spacing and the fire and movement detailing are the designer's), and every rate is a sample typed over in the calculator. The foundation and the wall's start (the blockwork up to the DPC) are priced under
// Foundations; the floors, roof, door and window units, and skim plaster and painting inside are priced elsewhere.
//
// Bricks: one half-brick leaf takes 59.26 bricks per m2 of face (a 215 x 102.5 x 65 brick with a 10mm joint covers 225 x 75mm); mortar is the volume less the bricks' own, times 1.35. Timber is counted by the metre
// used: the studs at their centres (a stud is the wall height less the three plates), the plates, the noggins, the trimmed studs, the cripples above and below an opening and a doubled header over it.

import { costLayer, openingsAreaInWallM2, type AssemblyLayerDef, type AssemblyOpening, type CostedLine } from './assembly-calc'
import { BRICK_LENGTH_MM, BRICK_WIDTH_MM, BRICK_HEIGHT_MM, JOINT_MM, BRICKS_PER_SKIN_M2, MORTAR_ALLOWANCE, FACING_BRICK, COMMON_BRICK_COST, BRICK_MORTAR_LABEL, type FacingBrick, type BrickMortar } from './solid-brick-wall'

export const LEAF_MM = BRICK_WIDTH_MM                                   // 102.5: one half-brick leaf
const BRICK_COURSE_MM = BRICK_HEIGHT_MM + JOINT_MM                      // 75
const BRICK_VOLUME_M3 = (BRICK_LENGTH_MM * BRICK_WIDTH_MM * BRICK_HEIGHT_MM) / 1e9
const toM = (mm: number) => mm / 1000

export { FACING_BRICK, BRICK_MORTAR_LABEL }
export type { FacingBrick, BrickMortar }

export type LeafBrick = FacingBrick | 'common'
export const LEAF_BRICK_LABEL: Record<LeafBrick, string> = {
  'stock-new': FACING_BRICK['stock-new'].label, 'stock-reclaimed': FACING_BRICK['stock-reclaimed'].label,
  'machine': FACING_BRICK['machine'].label, 'engineering': FACING_BRICK['engineering'].label, 'common': 'Common bricks (to be rendered)',
}
export const leafBrickCost = (b: LeafBrick) => (b === 'common' ? COMMON_BRICK_COST : FACING_BRICK[b].unitCost)

/** The stud sections (sample £ per metre, planed and treated where the code needs it) */
export interface StudSection { label: string; depthMm: number; thicknessMm: number; perLm: number }
export const STUD_SECTIONS: Record<string, StudSection> = {
  '38x140': { label: '38 × 140 C16 (6 × 2)', depthMm: 140, thicknessMm: 38, perLm: 3.1 },
  '45x145': { label: '45 × 145 C24 (6 × 2)', depthMm: 145, thicknessMm: 45, perLm: 3.8 },
  '38x184': { label: '38 × 184 C16 (8 × 2)', depthMm: 184, thicknessMm: 38, perLm: 4.3 },
  '47x195': { label: '47 × 195 C24 (8 × 2)', depthMm: 195, thicknessMm: 47, perLm: 5.9 },
}
export const DEFAULT_STUD = '38x140'

export type FrameSheathing = 'osb' | 'ply'
export const SHEATHING_LABEL: Record<FrameSheathing, string> = { osb: 'OSB3 11mm', ply: 'WBP plywood 9mm' }
export const SHEATHING_THICKNESS: Record<FrameSheathing, number> = { osb: 11, ply: 9 }
const SHEATHING_PER_SHEET: Record<FrameSheathing, number> = { osb: 18.5, ply: 26 }
const SHEET_M2 = 2.4 * 1.2

export type FrameInsulation = 'mineral' | 'pir' | 'none'
export const FRAME_INSULATION_LABEL: Record<FrameInsulation, string> = { mineral: 'Mineral wool between the studs', pir: 'PIR board between the studs', none: 'None between the studs' }
/** sample £ per m2 for each mm of thickness */
const INSULATION_PER_M2_PER_MM: Record<Exclude<FrameInsulation, 'none'>, number> = { mineral: 0.052, pir: 0.11 }
const OUTER_PIR_PER_M2_PER_MM = 0.2

export type FrameLining = 'none' | 'one' | 'two'
export const FRAME_LINING_LABEL: Record<FrameLining, string> = { none: 'None (the lining is priced elsewhere)', one: 'One layer of 12.5mm plasterboard, taped (skim is Plastering)', two: 'Two layers of 12.5mm plasterboard (fire or sound), taped' }

/** the minimum clear cavity between the brick and the frame's outer face */
export const MIN_CAVITY_MM = 50
/** stainless frame ties per m2 of leaf (about 450 up and 600 across, with extra at the edges) and a rate for each */
export const TIES_PER_M2 = 4.5
const TIE_EACH = 0.42
const PLATE_MM = 38

export interface TimberFrameBrickInput {
  lengthMm: number
  heightMm: number
  openings: AssemblyOpening[]
  studKey: string
  studCentresMm: number
  cavityMm: number
  /** extra PIR over the sheathing, mm (0 = none) */
  outerInsulationMm: number
  lintelBearingMm?: number
  movementJointSpacingMm?: number
}

export interface FrameHeader { openingId: string; spanMm: number; depthMm: number; perMemberLm: number; steelLintelSpanMm: number; wide: boolean }

export interface TimberFrameBrickGeometry {
  lengthM: number
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  courseCount: number
  bricks: number
  mortarM3: number
  tieCount: number
  studCount: number
  /** the studs of the wall (regular and trimmed), with the cripples above and below each opening */
  studLm: number
  plateLm: number
  noggingLm: number
  /** studs, plates and noggins together: priced by the stud section */
  frameLm: number
  headers: FrameHeader[]
  headerLm: number
  steelLintelLm: number
  trayLm: number
  stopEnds: number
  weepCount: number
  cavityBarrierLm: number
  movementJointCount: number
  movementJointLm: number
  studDepthMm: number
  /** the wall's finished thickness, outside to inside, mm (without a lining or a membrane) */
  thicknessMm: number
  warnings: string[]
  notes: string[]
}

/** the header's depth by span (the designer sizes the real one): a doubled timber header for a small opening, laminated veneer lumber beyond about 2.4m */
export function headerFor(spanMm: number): { depthMm: number; perMemberLm: number; wide: boolean } {
  if (spanMm <= 1200) return { depthMm: 140, perMemberLm: 7.5, wide: false }
  if (spanMm <= 1800) return { depthMm: 184, perMemberLm: 10, wide: false }
  if (spanMm <= 2400) return { depthMm: 220, perMemberLm: 12, wide: false }
  return { depthMm: 245, perMemberLm: 20, wide: true }
}

export function calculateTimberFrameBrickGeometry(input: TimberFrameBrickInput): TimberFrameBrickGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const bearing = input.lintelBearingMm ?? 150
  const warnings: string[] = []
  const notes: string[] = []
  if (!(L > 0) || !(H > 0)) throw new Error('Wall length and height must be greater than zero.')
  const stud = STUD_SECTIONS[input.studKey]
  if (!stud) throw new Error('Pick the stud size.')
  if (!(input.studCentresMm > 0)) throw new Error('The stud centres must be above zero.')
  if (!(input.cavityMm > 0)) throw new Error('The cavity must be above zero.')
  if (!(input.outerInsulationMm >= 0)) throw new Error('The outer insulation cannot be negative.')
  if (H <= 3 * PLATE_MM) throw new Error('The wall is too low for its plates.')

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openingsAreaInWallM2(openings, L, H)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)
  const courseCount = Math.ceil(H / BRICK_COURSE_MM)

  // the brick leaf: one skin of stretchers
  const bricks = netAreaM2 * BRICKS_PER_SKIN_M2
  const mortarM3 = netAreaM2 * ((toM(LEAF_MM) - BRICKS_PER_SKIN_M2 * BRICK_VOLUME_M3) * MORTAR_ALLOWANCE)

  // the openings: the headers, the lintels over the brick, the trays and the weeps
  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const studLenMm = H - 3 * PLATE_MM            // a stud: the wall less the sole plate and the double top plate
  const headers: FrameHeader[] = []
  let regular = 0
  const positions: number[] = []
  const n = Math.ceil(L / input.studCentresMm)
  for (let i = 0; i <= n; i++) positions.push(Math.min(L, i * input.studCentresMm))
  regular = new Set(positions.map(p => Math.round(p))).size
  let trimmedStuds = 0
  let crippleLm = 0
  let headerLm = 0
  let steelLintelLm = 0
  let trayLm = 0
  let stopEnds = 0
  let weepCount = Math.ceil(L / 900)                           // the weep vents along the foot of the cavity
  let openingPerimM = 0
  let openingWidths = 0
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L) warnings.push(`Opening "${o.id}" falls outside the wall — check its offset and width.`)
    if (o.sillHeightMm + o.heightMm > H) warnings.push(`Opening "${o.id}" is taller than the wall above its sill — check sill height.`)
    const next = sorted[i + 1]
    if (next && o.offsetMm + o.widthMm > next.offsetMm) warnings.push(`Openings "${o.id}" and "${next.id}" overlap — check offsets and widths.`)
    // the regular studs that fall inside the opening are left out
    const inside = positions.filter(p => p > o.offsetMm && p < o.offsetMm + o.widthMm).length
    regular = Math.max(0, regular - inside)
    trimmedStuds += 4                                           // a king and a jack stud each side
    const hdr = headerFor(o.widthMm)
    const headerTop = o.sillHeightMm + o.heightMm
    headers.push({ openingId: o.id, spanMm: o.widthMm, depthMm: hdr.depthMm, perMemberLm: hdr.perMemberLm, steelLintelSpanMm: o.widthMm + bearing * 2, wide: hdr.wide })
    headerLm += 2 * toM(o.widthMm + 2 * stud.thicknessMm)         // two members, bearing on the jack studs
    const cripples = Math.floor(o.widthMm / input.studCentresMm) + 1
    const aboveMm = studLenMm + PLATE_MM - (headerTop + hdr.depthMm)   // from the top of the header up to the top plate
    if (aboveMm > 0) crippleLm += cripples * toM(aboveMm)
    if (o.sillHeightMm > 2 * PLATE_MM) crippleLm += cripples * toM(o.sillHeightMm - 2 * PLATE_MM)   // below a window: from the sole plate to the sill trimmer
    steelLintelLm += toM(o.widthMm + bearing * 2)
    trayLm += toM(o.widthMm + 2 * bearing)
    stopEnds += 2
    weepCount += Math.ceil(o.widthMm / 900) + 1
    openingPerimM += 2 * toM(o.widthMm + o.heightMm)
    openingWidths += o.widthMm
  }
  const jackLenMm = (o: AssemblyOpening) => Math.max(0, o.sillHeightMm + o.heightMm - PLATE_MM)
  const studCount = regular + trimmedStuds
  const studLm = regular * toM(studLenMm) + sorted.reduce((s, o) => s + 2 * toM(studLenMm) + 2 * toM(jackLenMm(o)), 0) + crippleLm
  const plateLm = 3 * toM(L)                                    // a sole plate and a double top plate
  const rows = Math.max(1, Math.ceil(H / 1200) - 1)
  const noggingLm = rows * toM(Math.max(0, L - openingWidths))
  const frameLm = studLm + plateLm + noggingLm

  const tieCount = netAreaM2 * TIES_PER_M2 + openingPerimM / 0.3
  const cavityBarrierLm = toM(L) + openingPerimM + 2 * toM(H)    // along the head of the wall, round each opening and up each end
  const mj = input.movementJointSpacingMm ?? 0
  const movementJointCount = mj > 0 ? Math.max(0, Math.floor((L - 1) / mj)) : 0

  // what to look at
  if (input.cavityMm < MIN_CAVITY_MM) warnings.push(`A cavity under ${MIN_CAVITY_MM}mm is too tight behind brick on a timber frame: the frame and the brick move by different amounts and the cavity must stay clear and ventilated. Use ${MIN_CAVITY_MM}mm or more.`)
  if (headers.some(h => h.wide)) warnings.push('An opening wider than 2.4m needs a laminated or steel beam in the frame, and the steel lintel over the brick is a beam rather than an angle: both are the designer\'s, the calculator only prices them.')
  if (H > 3000) warnings.push('A frame this tall for one storey needs the designer to confirm the studs, the bracing and the brick ties, and the brick leaf may need to be supported at a floor.')
  notes.push('The brick leaf is supported on the foundation (the blockwork up to the DPC) and is tied back to the frame: it carries no load. The frame carries the building, and the designer sizes the studs, the headers and the bracing.')
  notes.push('The cavity is kept clear and ventilated, with cavity barriers at the openings and the ends, a tray and weep vents over each opening and weeps at the foot of the wall.')
  notes.push('Not in this line: the foundation and blockwork up to the DPC (Foundations), the floors, roof, door and window units (their own lines), skim plaster and painting inside, and the scaffold.')

  const thicknessMm = LEAF_MM + input.cavityMm + input.outerInsulationMm + SHEATHING_THICKNESS.osb + stud.depthMm
  return {
    lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2, courseCount, bricks, mortarM3, tieCount, studCount, studLm, plateLm, noggingLm, frameLm,
    headers, headerLm, steelLintelLm: +steelLintelLm.toFixed(3), trayLm: +trayLm.toFixed(3), stopEnds, weepCount, cavityBarrierLm: +cavityBarrierLm.toFixed(2),
    movementJointCount, movementJointLm: +(movementJointCount * toM(H)).toFixed(2), studDepthMm: stud.depthMm, thicknessMm, warnings, notes,
  }
}

export interface TimberFrameBrickLayerOpts {
  wastePct: number
  brick: LeafBrick
  mortar: BrickMortar
  studKey: string
  sheathing: FrameSheathing
  insulation: FrameInsulation
  outerInsulationMm: number
  vcl: boolean
  lining: FrameLining
}

const MORTAR_MIX: Record<BrickMortar, { binderBags: number; sandT: number; binderName: string; binderCost: number }> = {
  lime: { binderBags: 11, sandT: 1.6, binderName: 'NHL 3.5 natural hydraulic lime (25kg bag)', binderCost: 11.5 },
  cement: { binderBags: 13, sandT: 1.5, binderName: 'Cement (25kg bag)', binderCost: 6.5 },
}
const STEEL_ANGLE_LINTEL_PER_M = 48
const STEEL_BEAM_LINTEL_PER_M = 78
const CAVITY_TRAY_PER_M = 6.2
const STOP_END_EACH = 2.5
const WEEP_EACH = 0.7
const CAVITY_BARRIER_PER_M = 6.5
const DPC_SOLE_PER_M = 1.9
const MEMBRANE_PER_M2 = 1.2
const VCL_PER_M2 = 0.9
const PLASTERBOARD_PER_M2 = 5
const BOARD_JOINTING_PER_M2 = 0.9
const FIXINGS_PER_M2 = 1.5
const MOVEMENT_JOINT_PER_M = 4.5

/** The priced lines, every quantity fixed from the geometry. The estimator's typed rates replace the sample unit costs by layer id. */
export function buildTimberFrameBrickLayers(g: TimberFrameBrickGeometry, o: TimberFrameBrickLayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const mix = MORTAR_MIX[o.mortar]
  const stud = STUD_SECTIONS[o.studKey] ?? STUD_SECTIONS[DEFAULT_STUD]
  const what = o.brick === 'common' ? 'Common bricks' : `Facing bricks: ${FACING_BRICK[o.brick].label}`
  const area = g.netAreaM2
  const layers: AssemblyLayerDef[] = [
    // the brick leaf
    { id: 'leaf_bricks', name: `${what} (the outer leaf, one skin)`, category: 'materials', source: 'fixed', fixedQty: g.bricks, unit: 'nr', unitCost: leafBrickCost(o.brick), roundToWhole: true, wastePct: w },
    // (the mortar allowance already covers waste, so the mortar lines carry none of their own)
    { id: 'mortar_binder', name: mix.binderName + ' (mortar)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'bag', unitCost: mix.binderCost, coveragePerUnit: +(1 / mix.binderBags).toFixed(4), roundToWhole: true },
    { id: 'mortar_sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'tonne', unitCost: 32, coveragePerUnit: +(1 / mix.sandT).toFixed(4) },
    { id: 'frame_ties', name: 'Stainless steel frame ties (brick leaf to the studs)', category: 'materials', source: 'fixed', fixedQty: g.tieCount, unit: 'nr', unitCost: TIE_EACH, roundToWhole: true, wastePct: w },
    // the frame
    { id: 'frame_timber', name: `${stud.label} studs, plates and noggins`, category: 'materials', source: 'fixed', fixedQty: g.frameLm, unit: 'm', unitCost: stud.perLm, wastePct: w },
  ]
  if (g.headerLm > 0) {
    // the headers are priced by span: the most common rate here is per metre of member, and each opening has two members
    for (const h of g.headers) layers.push({ id: `header_${h.openingId}`, name: `Doubled header ${h.depthMm}mm deep over "${h.openingId}" (${h.wide ? 'laminated, the designer sizes it' : 'timber'})`, category: 'materials', source: 'fixed', fixedQty: 2 * toM(h.spanMm + 2 * stud.thicknessMm), unit: 'm', unitCost: h.perMemberLm, wastePct: w })
  }
  layers.push(
    { id: 'sheathing', name: `${SHEATHING_LABEL[o.sheathing]} sheathing (2.4 × 1.2m sheets)`, category: 'materials', source: 'fixed', fixedQty: area / SHEET_M2, unit: 'sheet', unitCost: SHEATHING_PER_SHEET[o.sheathing], roundToWhole: true, wastePct: w },
    { id: 'membrane', name: 'Breather membrane (over the sheathing, lapped and taped)', category: 'materials', source: 'fixed', fixedQty: area * 1.1, unit: 'm²', unitCost: MEMBRANE_PER_M2 },
  )
  if (o.insulation !== 'none') layers.push({ id: 'stud_insulation', name: `${o.insulation === 'mineral' ? 'Mineral wool' : 'PIR board'} ${g.studDepthMm}mm between the studs`, category: 'materials', source: 'fixed', fixedQty: area, unit: 'm²', unitCost: +(INSULATION_PER_M2_PER_MM[o.insulation] * g.studDepthMm).toFixed(2), wastePct: w })
  if (o.outerInsulationMm > 0) layers.push({ id: 'outer_insulation', name: `PIR board ${o.outerInsulationMm}mm over the sheathing (in the cavity)`, category: 'materials', source: 'fixed', fixedQty: area, unit: 'm²', unitCost: +(OUTER_PIR_PER_M2_PER_MM * o.outerInsulationMm).toFixed(2), wastePct: w })
  if (o.vcl) layers.push({ id: 'vcl', name: 'Vapour control layer (inside the studs, lapped and taped)', category: 'materials', source: 'fixed', fixedQty: area * 1.1, unit: 'm²', unitCost: VCL_PER_M2 })
  if (o.lining !== 'none') {
    const layersN = o.lining === 'two' ? 2 : 1
    layers.push(
      { id: 'plasterboard', name: `12.5mm plasterboard${layersN === 2 ? ', two layers' : ''} (inside)`, category: 'materials', source: 'fixed', fixedQty: area * layersN, unit: 'm²', unitCost: PLASTERBOARD_PER_M2, wastePct: w },
      { id: 'board_jointing', name: 'Tape, jointing compound and screws (plasterboard)', category: 'materials', source: 'fixed', fixedQty: area, unit: 'm²', unitCost: BOARD_JOINTING_PER_M2 },
    )
  }
  layers.push({ id: 'frame_fixings', name: 'Nails, screws, hold-down straps and anchors (frame)', category: 'materials', source: 'fixed', fixedQty: g.grossAreaM2, unit: 'm²', unitCost: FIXINGS_PER_M2 })
  // over the openings
  if (g.steelLintelLm > 0) {
    const wideLm = g.headers.filter(h => h.wide).reduce((s, h) => s + toM(h.steelLintelSpanMm), 0)
    const angleLm = Math.max(0, g.steelLintelLm - wideLm)
    if (angleLm > 0) layers.push({ id: 'lintel_angle', name: 'Steel angle lintels carrying the brick (fixed to the frame)', category: 'materials', source: 'fixed', fixedQty: angleLm, unit: 'm', unitCost: STEEL_ANGLE_LINTEL_PER_M })
    if (wideLm > 0) layers.push({ id: 'lintel_beam', name: 'Steel lintel / beam carrying the brick over a wide opening (designer to size)', category: 'materials', source: 'fixed', fixedQty: wideLm, unit: 'm', unitCost: STEEL_BEAM_LINTEL_PER_M })
    layers.push(
      { id: 'cavity_tray', name: 'Cavity tray over each opening', category: 'materials', source: 'fixed', fixedQty: g.trayLm, unit: 'm', unitCost: CAVITY_TRAY_PER_M },
      { id: 'tray_stops', name: 'Tray stop ends', category: 'materials', source: 'fixed', fixedQty: g.stopEnds, unit: 'nr', unitCost: STOP_END_EACH, roundToWhole: true },
    )
  }
  layers.push(
    { id: 'weeps', name: 'Weep vents (over the openings and at the foot of the wall)', category: 'materials', source: 'fixed', fixedQty: g.weepCount, unit: 'nr', unitCost: WEEP_EACH, roundToWhole: true },
    { id: 'cavity_barriers', name: 'Cavity barriers (head of the wall, round each opening, up each end)', category: 'materials', source: 'fixed', fixedQty: g.cavityBarrierLm, unit: 'm', unitCost: CAVITY_BARRIER_PER_M, wastePct: w },
    { id: 'dpc_sole', name: 'DPC under the sole plate', category: 'materials', source: 'fixed', fixedQty: g.lengthM, unit: 'm', unitCost: DPC_SOLE_PER_M, wastePct: w },
  )
  if (g.movementJointLm > 0) layers.push({ id: 'movement_joints', name: 'Movement joint in the brick (filler + sealant)', category: 'materials', source: 'fixed', fixedQty: g.movementJointLm, unit: 'm', unitCost: MOVEMENT_JOINT_PER_M, wastePct: w })
  return layers
}

export function costTimberFrameBrickLayers(layers: AssemblyLayerDef[]): { lines: CostedLine[]; totalCost: number } {
  const lines = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  return { lines, totalCost: +lines.reduce((s, l) => s + l.cost, 0).toFixed(2) }
}

/** Hours to start the labour lines from, a guide typed over in the calculator: a carpenter makes and erects the frame in about 0.45 hours a m2 and fits the sheathing and membrane (0.2), the insulation and vapour control layer (0.15) and the lining (0.2 a layer);
 * a bricklayer lays about 55 bricks an hour in a half-brick leaf, sets each steel lintel and its tray (1.25 hours), and fixes the ties and barriers as they go; a labourer serves the bricklayer (half his hours) and helps the carpenter (a quarter of his). */
export const LEAF_BRICKS_PER_HOUR = 55
export interface TimberFrameBrickHoursOpts { insulation: FrameInsulation; vcl: boolean; lining: FrameLining; outerInsulationMm: number }
export function suggestTimberFrameBrickHours(g: TimberFrameBrickGeometry, o: TimberFrameBrickHoursOpts): { carpenter: number; bricklayer: number; labourer: number } {
  const gross = g.grossAreaM2
  const net = g.netAreaM2
  const carp = gross * 0.45 + net * 0.2 + (o.insulation !== 'none' || o.vcl ? net * 0.15 : 0) + (o.outerInsulationMm > 0 ? net * 0.1 : 0) + (o.lining === 'none' ? 0 : net * 0.2 * (o.lining === 'two' ? 2 : 1)) + g.headers.length * 1.5
  const brick = g.bricks / LEAF_BRICKS_PER_HOUR + g.headers.length * 1.25 + g.tieCount / 60
  const carpenter = Math.max(1, Math.round(carp))
  const bricklayer = Math.max(1, Math.round(brick))
  return { carpenter, bricklayer, labourer: Math.max(1, Math.round(bricklayer / 2 + carpenter / 4)) }
}
