// The words for the solid brick wall calculator: a short one-line description (the quote line) and the full part-by-part text ("What's included"). Pure, so both follow the calculator's settings until they are edited by hand.
// Type imports only (no runtime import of the engine), as every description module here.

import type { BrickThickness, BrickBond, FacingBrick, BrickMortar, BrickLintel } from './solid-brick-wall'

const THICKNESS_PHRASE: Record<BrickThickness, string> = {
  'one': 'one brick (215mm, 9 inch)',
  'one-half': 'one and a half bricks (about 330mm, 13 inch)',
  'two': 'two bricks (440mm, 18 inch)',
}
const BOND_PHRASE: Record<BrickBond, string> = { 'english': 'English bond', 'flemish': 'Flemish bond', 'english-garden': 'English garden wall bond', 'unstated': '' }
const FACING_PHRASE: Record<FacingBrick, string> = {
  'stock-new': 'new London stock style facing bricks',
  'stock-reclaimed': 'cleaned reclaimed stock bricks',
  'machine': 'machine-made facing bricks',
  'engineering': 'engineering bricks',
}
const MORTAR_PHRASE: Record<BrickMortar, string> = { 'lime': 'lime mortar (NHL 3.5)', 'cement': 'cement and sand mortar' }
const LINTEL_PHRASE: Record<BrickLintel, string> = {
  'concrete': 'precast concrete lintels',
  'steel': 'steel lintels / beams (sized by the designer)',
  'arch': 'gauged brick arches over concrete lintels',
}

export interface SolidBrickDescriptionInput {
  lengthMm: number
  heightMm: number
  thickness: BrickThickness
  bond: BrickBond
  facing: FacingBrick
  backing: 'commons' | 'all-facing'
  mortar: BrickMortar
  lintel: BrickLintel
  openingCount: number
  /** the outside / inside finish put over the brick: names, or 'none' */
  outsideFinish: string
  insideFinish: string
  movementJointSpacingMm: number
}

const m = (mm: number) => (mm / 1000).toFixed(2)

/** One line for the quote. */
export function describeSolidBrickShort(i: SolidBrickDescriptionInput): string {
  const bricks = i.backing === 'all-facing' ? FACING_PHRASE[i.facing] : `${FACING_PHRASE[i.facing]} with common bricks behind`
  return `${m(i.lengthMm)}m long × ${m(i.heightMm)}m high solid brick wall, ${THICKNESS_PHRASE[i.thickness]} thick, ${i.bond === 'unstated' ? '' : BOND_PHRASE[i.bond] + ', '}${bricks}, in ${MORTAR_PHRASE[i.mortar]}.`
}

/** The full text, a paragraph a part, for the "What's included" toggle. */
export function describeSolidBrick(i: SolidBrickDescriptionInput): string {
  const parts: string[] = []
  parts.push(`Solid brick wall, ${m(i.lengthMm)}m long × ${m(i.heightMm)}m high, ${THICKNESS_PHRASE[i.thickness]} thick with no cavity${i.bond === 'unstated' ? '' : ', built in ' + BOND_PHRASE[i.bond]}.`)
  parts.push(i.backing === 'all-facing'
    ? `Bricks: ${FACING_PHRASE[i.facing]} throughout the thickness of the wall.`
    : `Bricks: ${FACING_PHRASE[i.facing]} to the outer face with common bricks built into the thickness behind.`)
  parts.push(i.mortar === 'lime'
    ? 'Mortar: lime mortar (natural hydraulic lime NHL 3.5 and sharp sand), as suits an old-fashioned solid wall, which needs to breathe.'
    : 'Mortar: cement and sand mortar.')
  parts.push('Damp-proof course the full thickness of the wall at its base.')
  if (i.openingCount > 0) parts.push(`${i.openingCount} opening${i.openingCount === 1 ? '' : 's'} formed with ${LINTEL_PHRASE[i.lintel]}, bearing each side.`)
  if (i.movementJointSpacingMm > 0) parts.push(`Movement joints at about ${m(i.movementJointSpacingMm)}m centres.`)
  if (i.outsideFinish !== 'none') parts.push(`Outside finish: ${i.outsideFinish}.`)
  if (i.insideFinish !== 'none') parts.push(`Inside finish: ${i.insideFinish}.`)
  parts.push('Not included: foundations, scaffolding, insulation (a solid brick wall needs insulation inside or outside to meet the Building Regulations), internal plastering unless listed above.')
  return parts.join('\n\n')
}
