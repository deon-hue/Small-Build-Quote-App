// The words for the timber frame with brick outer leaf calculator: a short one-line description (the quote line) and the full part-by-part text ("What's included"). Pure, so both follow the calculator's settings
// until they are edited by hand. Type imports only (no runtime import of the engine), as every description module here.

import type { LeafBrick, BrickMortar, FrameSheathing, FrameInsulation, FrameLining } from './timber-frame-brick-wall'

const BRICK_PHRASE: Record<LeafBrick, string> = {
  'stock-new': 'new London stock style facing bricks',
  'stock-reclaimed': 'cleaned reclaimed stock bricks',
  'machine': 'machine-made facing bricks',
  'engineering': 'engineering bricks',
  'common': 'common bricks',
}
const MORTAR_PHRASE: Record<BrickMortar, string> = { lime: 'lime mortar (NHL 3.5)', cement: 'cement and sand mortar' }
const SHEATHING_PHRASE: Record<FrameSheathing, string> = { osb: '11mm OSB3', ply: '9mm WBP plywood' }

export interface TimberFrameBrickDescriptionInput {
  lengthMm: number
  heightMm: number
  brick: LeafBrick
  mortar: BrickMortar
  studLabel: string        // "38 × 140 C16 (6 × 2)"
  studDepthMm: number
  studCentresMm: number
  cavityMm: number
  sheathing: FrameSheathing
  insulation: FrameInsulation
  outerInsulationMm: number
  vcl: boolean
  lining: FrameLining
  openingCount: number
  wideOpenings: number
  movementJointSpacingMm: number
}

const m = (mm: number) => `${(mm / 1000).toFixed(2)}m`
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export function describeTimberFrameBrickShort(i: TimberFrameBrickDescriptionInput): string {
  const open = i.openingCount > 0 ? ` with ${plural(i.openingCount, 'opening')} formed and lintelled` : ''
  return `Timber frame wall ${m(i.lengthMm)} long x ${m(i.heightMm)} high, ${i.studDepthMm}mm studs, with a brick outer leaf in ${BRICK_PHRASE[i.brick]}${open}.`
}

export function describeTimberFrameBrick(i: TimberFrameBrickDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Build an external timber frame wall ${m(i.lengthMm)} long and ${m(i.heightMm)} high: ${i.studLabel} studs at ${i.studCentresMm}mm centres on a sole plate over a DPC, with a double top plate and noggins, and a doubled timber header and trimmed studs round each opening.`)
  lines.push(`${SHEATHING_PHRASE[i.sheathing]} sheathing to the outside, covered with a breather membrane.`)
  const ins = i.insulation === 'none' ? '' : `${i.insulation === 'mineral' ? 'Mineral wool' : 'PIR board'} ${i.studDepthMm}mm thick between the studs`
  const outer = i.outerInsulationMm > 0 ? `${i.outerInsulationMm}mm of PIR board over the sheathing` : ''
  const inside = [i.vcl ? 'a vapour control layer' : '', i.lining === 'none' ? '' : i.lining === 'two' ? 'two layers of 12.5mm plasterboard, taped and jointed' : '12.5mm plasterboard, taped and jointed'].filter(Boolean).join(' and ')
  const fill = [ins, outer].filter(Boolean).join(', with ')
  if (fill) lines.push(`${fill.charAt(0).toUpperCase() + fill.slice(1)}.`)
  if (inside) lines.push(`Inside: ${inside}.`)
  lines.push(`A half-brick (102mm) outer leaf in ${BRICK_PHRASE[i.brick]}, laid in stretcher bond in ${MORTAR_PHRASE[i.mortar]}, with a ${i.cavityMm}mm clear cavity, stainless steel ties back to the frame, cavity barriers and weep vents.`)
  if (i.openingCount > 0) {
    lines.push(`${plural(i.openingCount, 'opening')} with ${i.wideOpenings > 0 ? `a steel lintel or beam (${plural(i.wideOpenings, 'wide opening')} to the designer's size) or a steel angle lintel` : 'a steel angle lintel'} carrying the brick, and a cavity tray over each.`)
  }
  if (i.movementJointSpacingMm > 0) lines.push(`Movement joints in the brickwork about every ${m(i.movementJointSpacingMm)}.`)
  lines.push('Not included: the foundation and the blockwork up to the DPC, the floors, the roof, the door and window units, skim plaster and painting inside, or scaffold, unless priced separately. The studs, headers, bracing and brick ties are to be confirmed by the designer.')
  return lines.join('\n')
}
