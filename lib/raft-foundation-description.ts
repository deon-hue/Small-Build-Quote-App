// The words for a raft foundation on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. Type-only imports from the engine (see CLAUDE.md): none needed.

export interface RaftDescriptionInput {
  lengthM: number
  widthM: number
  slabThicknessMm: number
  hardcoreMm: number
  blindingMm: number
  /** e.g. "C30" */
  concreteMix: string
  meshLayers: number
  edgeBeam: { widthMm: number; depthMm: number } | null
  underSlabInsulationMm: number
  edgeInsulation: boolean
  pumped: boolean
}

export function describeRaftFoundationShort(i: RaftDescriptionInput): string {
  const parts = [`${i.slabThicknessMm}mm ${i.concreteMix} reinforced slab`, `on ${i.hardcoreMm}mm of compacted hardcore`]
  if (i.edgeBeam) parts.push(`with a thickened edge beam`)
  return `Raft foundation, ${i.lengthM.toFixed(1)}m × ${i.widthM.toFixed(1)}m (${(i.lengthM * i.widthM).toFixed(0)} m²): ${parts.join(', ')}.`
}

export function describeRaftFoundation(i: RaftDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Strip the topsoil and excavate the ${i.lengthM.toFixed(1)}m × ${i.widthM.toFixed(1)}m area by machine to formation level, taking the soil away from site.`)
  lines.push(`Lay and compact ${i.hardcoreMm}mm of hardcore, then ${i.blindingMm}mm of sand blinding, and lay a damp-proof membrane over it, lapped and taped.`)
  if (i.underSlabInsulationMm > 0) lines.push(`Lay ${i.underSlabInsulationMm}mm of insulation board over the membrane, under the whole slab.`)
  if (i.edgeInsulation) lines.push('Fix edge insulation board round the perimeter.')
  lines.push(`Form the edges and fix ${i.meshLayers === 0 ? 'no reinforcement mesh' : i.meshLayers === 1 ? 'one layer of A393 mesh' : 'two layers of A393 mesh (top and bottom)'} on chairs${i.meshLayers === 0 ? '' : ', lapped'}.`)
  if (i.edgeBeam) lines.push(`Form a thickened edge beam round the perimeter, ${i.edgeBeam.widthMm}mm wide and ${i.edgeBeam.depthMm}mm deep.`)
  lines.push(`Pour the ${i.slabThicknessMm}mm ${i.concreteMix} ready-mixed concrete slab${i.pumped ? ' by pump' : ''}, level it and power-float the surface.`)
  lines.push('Not included: the engineer\'s design, any changes to the mesh or thickness they require, services passing through the slab, or the walls and floor finishes on top of it.')
  return lines.join('\n')
}
