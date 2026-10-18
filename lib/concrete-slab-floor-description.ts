// The words for a concrete slab floor on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface ConcreteSlabDescriptionInput {
  areaM2: number
  digDepthMm: number
  hardcoreMm: number
  blindingMm: number
  dpm: boolean
  insulationMm: number
  slabMm: number
  /** e.g. "C25" */
  mix: string
  meshLayers: number
  edgeStrip: boolean
  powerFloat: boolean
  placing: 'direct' | 'pump' | 'barrow'
  /** the Insulated Concrete Floor sub-phase: named as such, and its insulation said to be high-performance */
  insulated?: boolean
}

export function describeConcreteSlabFloorShort(i: ConcreteSlabDescriptionInput): string {
  const parts = [`${i.slabMm}mm ${i.mix} concrete slab`]
  if (i.hardcoreMm > 0) parts.push(`on ${i.hardcoreMm}mm of compacted hardcore`)
  if (i.insulationMm > 0) parts.push(`with ${i.insulationMm}mm insulation`)
  return `${i.insulated ? 'Insulated concrete floor' : 'Concrete floor slab'}, ${i.areaM2.toFixed(1)}m²: ${parts.join(', ')}.`
}

export function describeConcreteSlabFloor(i: ConcreteSlabDescriptionInput): string {
  const lines: string[] = []
  if (i.digDepthMm > 0) lines.push(`Excavate the ${i.areaM2.toFixed(1)}m² floor area by machine to formation level (about ${i.digDepthMm}mm down), taking the soil away from site.`)
  if (i.hardcoreMm > 0) lines.push(`Lay and compact ${i.hardcoreMm}mm of hardcore in layers.`)
  if (i.blindingMm > 0) lines.push(`Blind the hardcore with ${i.blindingMm}mm of sand.`)
  if (i.dpm) lines.push('Lay a damp-proof membrane over it, lapped and taped.')
  if (i.insulationMm > 0) lines.push(`Lay ${i.insulationMm}mm of ${i.insulated ? 'high-performance PIR' : 'rigid'} insulation board under the slab.`)
  if (i.edgeStrip) lines.push('Fit edge insulation strip round the edges of the slab, against the walls.')
  if (i.meshLayers > 0) lines.push(`Fix ${i.meshLayers === 1 ? 'one layer' : 'two layers'} of reinforcing mesh on spacers, lapped.`)
  const how = i.placing === 'pump' ? ', placed by pump' : i.placing === 'barrow' ? ', carried in by wheelbarrow' : ''
  lines.push(`Pour ${i.slabMm}mm of ${i.mix} ready-mixed concrete over ${i.areaM2.toFixed(1)}m²${how}, and level it${i.powerFloat ? ' and power-float the surface' : ''}.`)
  lines.push('Not included: any screed or floor covering on top of the slab (priced separately), services passing through the slab, or an engineer\'s design and any changes to the thickness or mesh they require.')
  return lines.join('\n')
}
