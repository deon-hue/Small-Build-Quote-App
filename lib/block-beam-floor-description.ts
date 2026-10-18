// The words for a block and beam floor on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface BlockBeamDescriptionInput {
  areaM2: number
  spanM: number
  beamCount: number
  extraBeams: number
  centresMm: number
  digDepthMm: number
  hardcoreMm: number
  blindingMm: number
  insulationMm: number
  dpm: boolean
  edgeStrip: boolean
  dpcAtBearings: boolean
  crane: boolean
}

export function describeBlockBeamFloorShort(i: BlockBeamDescriptionInput): string {
  return `Block and beam floor, ${i.areaM2.toFixed(1)}m²: precast concrete beams at ${i.centresMm}mm centres spanning ${i.spanM.toFixed(1)}m with concrete block infill${i.insulationMm > 0 ? `, and ${i.insulationMm}mm insulation` : ''}.`
}

export function describeBlockBeamFloor(i: BlockBeamDescriptionInput): string {
  const lines: string[] = []
  if (i.digDepthMm > 0) lines.push(`Excavate the ${i.areaM2.toFixed(1)}m² floor area by machine (about ${i.digDepthMm}mm down), taking the soil away from site.`)
  if (i.hardcoreMm > 0) lines.push(`Lay and compact ${i.hardcoreMm}mm of hardcore${i.blindingMm > 0 ? ` and blind it with ${i.blindingMm}mm of sand` : ''} to the ground under the floor.`)
  if (i.dpcAtBearings) lines.push('Lay DPC under the ends of the beams where they bear on the walls.')
  lines.push(`Supply and lay ${i.beamCount + i.extraBeams} precast prestressed concrete beams at ${i.centresMm}mm centres spanning ${i.spanM.toFixed(1)}m${i.extraBeams > 0 ? ` (including ${i.extraBeams} extra beam${i.extraBeams === 1 ? '' : 's'} under walls)` : ''}${i.crane ? ', lifted into place by crane' : ''}.`)
  lines.push('Lay dense concrete infill blocks between the beams and grout the joints, leaving the floor flat and ready to take insulation and screed.')
  if (i.insulationMm > 0) lines.push(`Lay ${i.insulationMm}mm of rigid insulation board over the blocks.`)
  if (i.dpm) lines.push('Lay a damp-proof membrane over the floor, lapped and taped.')
  if (i.edgeStrip) lines.push('Fit edge insulation strip round the edges of the floor, against the walls.')
  lines.push('Not included: the walls and sleeper walls the beams bear on and the vents through them (priced separately), the screed or floor covering on top (priced separately), or the beam supplier\'s design if the floor needs more than standard beams.')
  return lines.join('\n')
}
