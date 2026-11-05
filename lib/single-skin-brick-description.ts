// The words for the single skin brick wall calculator: a short one-line description (the quote line) and the full part-by-part text ("What's included"). Pure, so both follow the calculator's settings until they are
// edited by hand. Type imports only (no runtime import of the engine), as every description module here.

import type { SkinBrick, BrickMortar, SkinLintel, SkinCoping, PierWidth, PierDepth, PierSide } from './single-skin-brick-wall'

const BRICK_PHRASE: Record<SkinBrick, string> = {
  'stock-new': 'new London stock style facing bricks',
  'stock-reclaimed': 'cleaned reclaimed stock bricks',
  'machine': 'machine-made facing bricks',
  'engineering': 'engineering bricks',
  'common': 'common bricks',
}
const MORTAR_PHRASE: Record<BrickMortar, string> = { lime: 'lime mortar (NHL 3.5)', cement: 'cement and sand mortar' }
const PIER_WIDTH_PHRASE: Record<PierWidth, string> = { 'one': '215mm', 'one-half': '327mm', 'two': '440mm' }
const PIER_DEPTH_PHRASE: Record<PierDepth, string> = { 'one': '215mm', 'one-half': '327mm' }

export interface SingleSkinDescriptionInput {
  lengthMm: number
  heightMm: number
  brick: SkinBrick
  mortar: BrickMortar
  pierCount: number
  pierWidth: PierWidth
  pierDepth: PierDepth
  pierSide: PierSide
  pierSpacingMm: number
  openingCount: number
  /** how many of the openings are wider than 2.4m, so have a steel lintel or beam whatever lintel was chosen */
  wideOpenings: number
  lintel: SkinLintel
  coping: SkinCoping
  movementJointSpacingMm: number
  outsideFinish: string   // 'none' or the finish's name
  insideFinish: string
}

const m = (mm: number) => `${(mm / 1000).toFixed(2)}m`
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export function describeSingleSkinShort(i: SingleSkinDescriptionInput): string {
  const piers = i.pierCount > 0 ? `, with ${plural(i.pierCount, 'brick pier')}` : ''
  const open = i.openingCount > 0 ? ` and ${plural(i.openingCount, 'opening')} with lintels` : ''
  return `Single skin brick wall ${m(i.lengthMm)} long x ${m(i.heightMm)} high in ${BRICK_PHRASE[i.brick]}${piers}${open}.`
}

export function describeSingleSkin(i: SingleSkinDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Build a single skin (half-brick, 102mm) wall ${m(i.lengthMm)} long and ${m(i.heightMm)} high in ${BRICK_PHRASE[i.brick]}, laid in stretcher bond in ${MORTAR_PHRASE[i.mortar]}.`)
  if (i.pierCount > 0) {
    const place = i.pierSpacingMm > 0 ? `, at about ${m(i.pierSpacingMm)} centres and at the ends and beside the wide openings` : ''
    lines.push(`${plural(i.pierCount, 'brick pier')} ${PIER_WIDTH_PHRASE[i.pierWidth]} wide and ${PIER_DEPTH_PHRASE[i.pierDepth]} overall on the ${i.pierSide} face, built up with the wall${place}, on a DPC.`)
  } else {
    lines.push('No piers are included in this wall.')
  }
  if (i.openingCount > 0) {
    const what = i.wideOpenings > 0
      ? `${plural(i.wideOpenings, 'wide opening')} with a steel lintel or beam on padstones${i.openingCount > i.wideOpenings ? ` and ${i.openingCount - i.wideOpenings} with ${i.lintel === 'steel' ? 'steel' : 'precast concrete'} lintels` : ''}`
      : `${plural(i.openingCount, 'opening')} with ${i.lintel === 'steel' ? 'steel lintels on padstones' : 'precast concrete lintels'}`
    lines.push(`${what.charAt(0).toUpperCase() + what.slice(1)}, with the brickwork formed round each opening.`)
  }
  lines.push('DPC under the wall and the piers.')
  if (i.coping === 'concrete') lines.push('Precast concrete coping to the top of the wall.')
  if (i.movementJointSpacingMm > 0) lines.push(`Movement joints about every ${m(i.movementJointSpacingMm)}.`)
  if (i.outsideFinish !== 'none') lines.push(`Outside finish: ${i.outsideFinish}.`)
  if (i.insideFinish !== 'none') lines.push(`Inside finish: ${i.insideFinish}.`)
  lines.push('A single skin wall is not insulated or weathertight enough for a heated or lived-in room: it is for a garage, store or outbuilding.')
  lines.push('Not included: the foundation, the wall plate, the roof, the door or window units, and plastering or painting inside, unless priced separately. The pier size and spacing, the lintels over wide openings and the ties to the roof are to be confirmed by the designer.')
  return lines.join('\n')
}
