// The words for an existing floor overlay on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface FloorOverlayDescriptionInput {
  areaM2: number
  kind: 'self-levelling' | 'plywood'
  thicknessMm: number
  primer: boolean
  edgeStrip: boolean
}

export function describeFloorOverlayShort(i: FloorOverlayDescriptionInput): string {
  return i.kind === 'plywood'
    ? `${i.thicknessMm}mm plywood overlay to the existing floor, ${i.areaM2.toFixed(1)}m².`
    : `${i.thicknessMm}mm self-levelling compound over the existing floor, ${i.areaM2.toFixed(1)}m².`
}

export function describeFloorOverlay(i: FloorOverlayDescriptionInput): string {
  const lines: string[] = []
  if (i.kind === 'plywood') {
    lines.push('Check the existing timber floor, secure any loose boards and remove anything standing proud, so it is sound and flat.')
    lines.push(`Fix ${i.thicknessMm}mm plywood sheets over the whole floor (${i.areaM2.toFixed(1)}m²), screwed down, the joints staggered and the edges kept clear of the walls.`)
  } else {
    lines.push('Clean and prepare the existing floor: sweep, remove loose material and fill any holes, so it is sound and dry.')
    if (i.primer) lines.push('Prime the floor so the compound bonds and does not dry out too fast.')
    if (i.edgeStrip) lines.push('Fit edge foam strip round the edge of the floor.')
    lines.push(`Pour and spread ${i.thicknessMm}mm of self-levelling compound over ${i.areaM2.toFixed(1)}m², leaving a flat, level surface ready for the floor covering.`)
  }
  lines.push(`The floor level rises by about ${i.thicknessMm}mm. Not included: the floor covering, or any repair to the floor beneath beyond filling small holes${i.kind === 'self-levelling' ? ' and drying time before a floor covering is laid' : ''}.`)
  return lines.join('\n')
}
