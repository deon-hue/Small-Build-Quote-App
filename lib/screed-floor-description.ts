// The words for a screeded floor on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface ScreedFloorDescriptionInput {
  areaM2: number
  /** 'sand-cement' or 'liquid' */
  screedType: 'sand-cement' | 'liquid'
  thicknessMm: number
  insulationMm: number
  dpm: boolean
  edgeStrip: boolean
  mesh: boolean
}

const kind = (t: ScreedFloorDescriptionInput['screedType']) => (t === 'liquid' ? 'liquid (calcium sulphate) screed' : 'sand:cement screed')

export function describeScreedFloorShort(i: ScreedFloorDescriptionInput): string {
  const under = [i.insulationMm > 0 ? `${i.insulationMm}mm insulation` : '', i.dpm ? 'a membrane' : ''].filter(Boolean).join(' and ')
  return `${i.thicknessMm}mm ${kind(i.screedType)}, ${i.areaM2.toFixed(1)}m², laid by a specialist screeding firm${under ? ` over ${under}` : ''}.`
}

export function describeScreedFloor(i: ScreedFloorDescriptionInput): string {
  const lines: string[] = []
  lines.push('Clear and prepare the floor so it is clean, dry and ready for the screed.')
  if (i.dpm) lines.push('Lay a damp-proof or separating membrane over the whole floor, lapped and taped at the joints.')
  if (i.insulationMm > 0) lines.push(`Lay ${i.insulationMm}mm rigid insulation boards over the floor, tightly butted.`)
  if (i.edgeStrip) lines.push('Fit 10mm edge insulation strip round the edge of the floor, so the screed can move without cracking against the walls.')
  if (i.mesh) lines.push('Lay reinforcing mesh in the screed.')
  lines.push(`A specialist screeding firm supplies and lays ${i.thicknessMm}mm of ${kind(i.screedType)} over ${i.areaM2.toFixed(1)}m², by pump, with all their materials and equipment, levelled and finished ready for the floor covering.`)
  lines.push('Not included: the floor covering, any levelling compound needed after the screed has dried, or drying time before a floor covering is laid (a screed needs time to dry out: about a day for each mm up to 40mm and longer for each mm above that).')
  return lines.join('\n')
}
