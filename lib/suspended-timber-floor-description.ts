// The words for a suspended timber floor on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface SuspendedTimberDescriptionInput {
  kind: 'ground' | 'upper' | 'loft' | 'loft-storage'
  areaM2: number
  spanM: number
  centresMm: number
  joistDepthMm: number
  /** "C16" or "C24" */
  grade: string
  carry: 'plates' | 'hangers'
  extraJoists: number
  sleeperRows: number
  strutting: boolean
  insulationMm: number
  vcl: boolean
  deck: 'chipboard-22' | 'ply-18'
  groundCover: 'none' | 'gravel' | 'concrete'
}

const KIND_NAME: Record<SuspendedTimberDescriptionInput['kind'], string> = {
  ground: 'ground floor', upper: 'upper floor', loft: 'loft floor', 'loft-storage': 'loft storage floor',
}
const DECK_NAME = { 'chipboard-22': '22mm T&G P5 chipboard', 'ply-18': '18mm T&G plywood' }

export function describeSuspendedTimberFloorShort(i: SuspendedTimberDescriptionInput): string {
  return `Suspended timber ${KIND_NAME[i.kind]}, ${i.areaM2.toFixed(1)}m²: 47 × ${i.joistDepthMm}mm ${i.grade} joists at ${i.centresMm}mm centres spanning ${i.spanM.toFixed(1)}m, with ${DECK_NAME[i.deck]} decking${i.insulationMm > 0 ? ` and ${i.insulationMm}mm insulation` : ''}.`
}

export function describeSuspendedTimberFloor(i: SuspendedTimberDescriptionInput): string {
  const lines: string[] = []
  if (i.kind === 'ground') {
    if (i.groundCover === 'gravel') lines.push('Cover the ground under the floor with a membrane and 50mm of gravel.')
    if (i.groundCover === 'concrete') lines.push('Cover the ground under the floor with a membrane and a 100mm concrete oversite.')
    if (i.carry === 'plates') lines.push(`Lay treated wall plates on a DPC along the bearing walls${i.sleeperRows > 0 ? ` and along the ${i.sleeperRows} row${i.sleeperRows === 1 ? '' : 's'} of sleeper wall in the void` : ''}.`)
  } else if (i.carry === 'plates') {
    lines.push('Fix treated wall plates along the bearing walls.')
  }
  lines.push(`Fit 47 × ${i.joistDepthMm}mm ${i.grade} joists at ${i.centresMm}mm centres spanning ${i.spanM.toFixed(1)}m${i.carry === 'hangers' ? ', hung in joist hangers' : ', bearing on the wall plates'}${i.extraJoists > 0 ? `, with ${i.extraJoists} extra doubled or trimming joist${i.extraJoists === 1 ? '' : 's'}` : ''}${i.strutting ? ', and strutting between them' : ''}.`)
  if (i.insulationMm > 0) lines.push(`Fit ${i.insulationMm}mm mineral wool insulation between the joists${i.kind === 'ground' ? ', held up on netting' : ' for sound and warmth'}.`)
  if (i.vcl) lines.push('Lay a vapour control layer over the joists.')
  lines.push(`Fix ${DECK_NAME[i.deck]} over the whole floor (${i.areaM2.toFixed(1)}m²), glued and screwed with the joints staggered, leaving it ready for the floor covering.`)
  lines.push(`Not included: ${i.kind === 'ground' ? 'the sleeper walls and the air bricks and vents through the walls (priced separately), ' : 'the ceiling under the floor (priced under Plastering & Boarding), any steel beams the joists bear on, '}or the floor finish on top.`)
  return lines.join('\n')
}
