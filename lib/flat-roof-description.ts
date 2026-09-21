// The customer-facing description of a flat roof — what's included, part by part — written from the flat
// roof calculator's choices. It's plain English for the quote, one short paragraph per part of the roof
// (structure, insulation, covering, edges and drainage, parapet, rooflight openings), followed by what is
// not included. Only the parts that are actually in the roof are described. Kept as its own pure function
// so its wording can be tested, and so the calculator's own screen stays about the calculator.

import type { FlatRoofBuildUp, FlatRoofEdges, RoofOpeningKind } from './assembly-calc'

export interface FlatRoofDescriptionInput {
  buildUp: FlatRoofBuildUp
  lengthMm: number
  widthMm: number
  fallRatio: number
  joistSystem: 'c24' | 'c16' | 'posi'
  joistDepth: number
  centresMm: number
  deckLabel: string            // e.g. '18mm WBP plywood'
  strutting: boolean           // herringbone strutting between solid timber joists
  insulationMm: number
  covering: 'epdm' | 'grp' | 'tpo'
  fascia: boolean
  downpipes: number
  edges: FlatRoofEdges
  /** The joists at an existing wall square-on to them: hung from a ledger, or bearing on a plate and strapped. */
  ledgerEnds: number           // 0, 1 or 2 ends hung from a ledger
  wallPlateEnds: number        // ends that bear on a wall plate
  endStraps: boolean           // a bearing end at an existing wall is strapped to it
  sideStrapped: boolean        // the first joist is strapped to an existing wall running alongside
  abutmentLm: number
  edgeTrimLm: number
  gutterLm: number
  parapet?: { lm: number; heightMm: number; type: 'cavity-brick-block' | 'solid-block'; rainwaterOutlets: number; overflowOutlets: number }
  openings: { kind: RoofOpeningKind; widthMm: number; depthMm: number; trimmers: 2 | 3 }[]
}

const metres = (mm: number) => (mm / 1000).toFixed(2)
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
// 'an 18mm', 'a 12mm' — spoken, so 8, 11 and 18 take 'an'.
const aOrAn = (label: string) => (/^(8|11|18)/.test(label) ? 'an' : 'a')
const KIND_PHRASE: Record<RoofOpeningKind, string> = {
  'lantern': 'a lantern',
  'roof-window': 'a roof window',
  'dome': 'a dome rooflight',
  'hatch': 'an access hatch',
}

export function describeFlatRoof(i: FlatRoofDescriptionInput): string {
  const lines: string[] = []
  const area = (i.lengthMm / 1000) * (i.widthMm / 1000)

  lines.push(`Supply and construct a ${i.buildUp} flat roof, ${metres(i.lengthMm)} × ${metres(i.widthMm)}m (${area.toFixed(1)} m²), falling 1 in ${i.fallRatio} towards its low edge.`)

  // Structure
  const joists = i.joistSystem === 'posi'
    ? `${i.joistDepth}mm deep Posi-joists supplied to length`
    : `47×${i.joistDepth} ${i.joistSystem.toUpperCase()} solid timber joists`
  let structure = `Roof structure: ${joists} at ${i.centresMm}mm centres spanning ${metres(i.widthMm)}m, with tapered timber firrings to form the falls${i.strutting ? ', herringbone strutting between the joists' : ''} and ${aOrAn(i.deckLabel)} ${i.deckLabel} deck.`
  if (i.ledgerEnds > 0) {
    structure += ` The joists are hung on joist hangers from a treated ledger plate bolted to the existing wall with M12 anchor bolts at 600mm centres${i.ledgerEnds === 2 ? ' at each end' : ''}${i.wallPlateEnds > 0 ? ', and bear on a treated wall plate at the other end' : ''}.`
  } else {
    structure += ` The joists bear on treated wall plates at each end${i.endStraps ? ', strapped to the existing wall with lateral restraint straps' : ''}.`
  }
  if (i.sideStrapped) structure += ' The first joist is strapped to the existing wall that runs alongside it.'
  lines.push(structure)

  // Insulation
  if (i.buildUp === 'warm') {
    lines.push(i.insulationMm > 0
      ? `Insulation: a vapour control layer over the deck, with ${i.insulationMm}mm rigid PIR insulation bonded above it — the insulation sits on top of the structure, keeping it warm and dry (a warm roof).`
      : 'Insulation: a vapour control layer over the deck.')
  } else {
    lines.push(i.insulationMm > 0
      ? `Insulation: ${i.insulationMm}mm mineral wool insulation between the joists, with a ventilated air gap above it, ventilation strips at the eaves and a vapour control layer on the underside (a cold roof).`
      : 'Insulation: a ventilated air gap above the joists, ventilation strips at the eaves and a vapour control layer on the underside (a cold roof).')
  }

  // Covering — and only what it is actually taken up: the upstand at an existing wall, the parapet, the rooflight kerbs.
  const takenUp = [
    i.abutmentLm > 0 ? 'the upstand at the existing wall' : '',
    i.parapet && i.parapet.lm > 0 ? 'the parapet' : '',
    i.openings.length ? (i.openings.length === 1 ? 'the rooflight kerb' : 'the rooflight kerbs') : '',
  ].filter(Boolean)
  const upTo = takenUp.length === 0 ? '' : `, taken up ${takenUp.length === 1 ? takenUp[0] : `${takenUp.slice(0, -1).join(', ')} and ${takenUp[takenUp.length - 1]}`}`
  if (i.covering === 'epdm') {
    lines.push(`Roof covering: a 1.2mm EPDM rubber membrane, fully bonded to the roof with adhesive, with the seams taped and the corners patched${upTo}, so the whole roof is one waterproof surface.`)
  } else if (i.covering === 'grp') {
    lines.push(`Roof covering: a fibreglass (GRP) roof — glass mat laminated in resin and finished with a topcoat to form a seamless waterproof surface${upTo}, with GRP edge trims.`)
  } else {
    lines.push(`Roof covering: a single-ply TPO membrane, bonded to the roof with the seams heat-welded${upTo}.`)
  }

  // Edges and drainage
  const edgeBits: string[] = []
  if (i.abutmentLm > 0) edgeBits.push('Where the roof meets the existing wall the covering is turned up as an upstand and protected with Code 4 lead flashing.')
  if (i.edgeTrimLm > 0) edgeBits.push(`The roof edges are finished with ${i.covering === 'grp' ? 'a GRP edge trim' : 'an aluminium drip trim'}${i.fascia ? ' and a uPVC fascia board' : ''}.`)
  if (i.gutterLm > 0) edgeBits.push(`A uPVC half-round gutter is fixed along the low edge${i.downpipes > 0 ? `, with ${i.downpipes} ${plural(i.downpipes, 'downpipe', 'downpipes')} to take the water away` : ''}.`)
  if (edgeBits.length) lines.push(`Edges and drainage: ${edgeBits.join(' ')}`)

  // Parapet
  if (i.parapet && i.parapet.lm > 0) {
    const p = i.parapet
    const build = p.type === 'cavity-brick-block' ? 'in brick and block cavity construction' : 'in solid blockwork, rendered'
    let text = `Parapet wall: ${p.lm.toFixed(1)}m of parapet wall built ${build}, ${p.heightMm}mm above the finished roof, with concrete coping over, a DPC and cavity tray at its base, and the roof covering dressed up its inner face.`
    if (p.rainwaterOutlets > 0) {
      text += ` The rainwater leaves through ${p.rainwaterOutlets} ${plural(p.rainwaterOutlets, 'outlet', 'outlets')} formed through the wall`
      text += p.overflowOutlets > 0
        ? `, with ${p.overflowOutlets} ${plural(p.overflowOutlets, 'overflow outlet', 'overflow outlets')} set as a safeguard in case ${p.rainwaterOutlets === 1 ? 'it' : 'one'} blocks`
        : ''
      text += i.downpipes > 0 && i.gutterLm === 0 ? `, connected to ${i.downpipes} ${plural(i.downpipes, 'downpipe', 'downpipes')}.` : '.'
    }
    lines.push(text)
  }

  // Rooflight openings
  if (i.openings.length) {
    const list = i.openings.map(o => `${KIND_PHRASE[o.kind]} (${o.widthMm} × ${o.depthMm}mm, ${o.trimmers === 3 ? 'tripled' : 'doubled'} trimmers)`)
    const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
    lines.push(`Rooflight openings: ${plural(i.openings.length, 'an opening is', 'openings are')} formed in the roof for ${joined}. ${plural(i.openings.length, 'It is', 'Each is')} framed with the extra joists and headers described, built up with a clad timber kerb, and the roof covering is dressed up the kerb, ready for the rooflight to be fitted. The rooflights themselves are supplied and fitted separately.`)
  }

  lines.push(`Not included: ${i.openings.length ? 'the rooflights themselves, ' : ''}ceiling and internal finishes below the roof.`)
  return lines.join('\n')
}
