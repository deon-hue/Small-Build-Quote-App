// The words for a piled foundation on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface PiledDescriptionInput {
  lengthM: number
  pileCount: number
  pileDiameterMm: number
  pileDepthMm: number
  beamWidthMm: number
  beamDepthMm: number
  /** e.g. "C30" */
  concreteMix: string
  voidFormer: boolean
  blindingMm: number
}

export function describePiledFoundationShort(i: PiledDescriptionInput): string {
  return `Piled foundation, ${i.lengthM.toFixed(1)}m: ${i.pileCount} piles (${i.pileDiameterMm}mm × ${(i.pileDepthMm / 1000).toFixed(1)}m) with a ${i.beamWidthMm} × ${i.beamDepthMm}mm reinforced ${i.concreteMix} ground beam.`
}

export function describePiledFoundation(i: PiledDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Install ${i.pileCount} piles, ${i.pileDiameterMm}mm in diameter and ${(i.pileDepthMm / 1000).toFixed(1)}m deep, along the line of the wall by a specialist piling contractor, including bringing the rig to site and removing it, and taking the soil from the piling away.`)
  lines.push(`Excavate a shallow trench along the piles for the beam and cut the piles down to level.`)
  if (i.blindingMm > 0) lines.push(`Lay ${i.blindingMm}mm of blinding concrete in the bottom of the trench.`)
  if (i.voidFormer) lines.push('Lay a void former under the beam, to take up any swelling of the ground.')
  lines.push(`Fix the shuttering to both faces of a ${i.beamWidthMm} × ${i.beamDepthMm}mm ground beam and fit the reinforcement cage, tied to the pile heads.`)
  lines.push(`Pour the ${i.concreteMix} ready-mixed concrete ground beam over the piles, level it, strike the shuttering and backfill round the beam.`)
  lines.push('Not included: the engineer\'s design of the piles and beam, pile testing, any change to their size or number the engineer requires, or the walls built on the beam.')
  return lines.join('\n')
}
