// The words for underpinning on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface UnderpinningDescriptionInput {
  lengthM: number
  pinCount: number
  pinLengthMm: number
  pinWidthMm: number
  depthMm: number
  dryPackMm: number
  /** e.g. "C25" */
  concreteMix: string
  rebar: boolean
  support: boolean
}

export function describeUnderpinningShort(i: UnderpinningDescriptionInput): string {
  return `Underpinning, ${i.lengthM.toFixed(1)}m of wall in ${i.pinCount} pin${i.pinCount === 1 ? '' : 's'}: ${(i.depthMm / 1000).toFixed(1)}m deeper, ${i.concreteMix} mass concrete${i.rebar ? ', reinforced' : ''}.`
}

export function describeUnderpinning(i: UnderpinningDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Underpin ${i.lengthM.toFixed(1)}m of existing wall in ${i.pinCount} section${i.pinCount === 1 ? '' : 's'} (pins) about ${(i.pinLengthMm / 1000).toFixed(1)}m long, worked in a set sequence so that no two neighbouring sections are open at once.`)
  if (i.support) lines.push('Support the wall above with needles and props while each pin is dug.')
  lines.push(`Hand-dig each pin ${i.pinWidthMm}mm wide to ${(i.depthMm / 1000).toFixed(1)}m below the underside of the existing footing, and cart the soil away from site.`)
  lines.push(`Shutter the open face of each pin${i.rebar ? ', fix the reinforcement' : ''} and fill with ${i.concreteMix} mass concrete to ${i.dryPackMm}mm below the old footing.`)
  lines.push(`Pack the ${i.dryPackMm}mm gap tight with dry sand and cement mortar, leave the pin to go off, then move to the next.`)
  lines.push('Not included: the engineer\'s design and sequence, building control and party wall costs, or making good the floors, walls and finishes disturbed by the work.')
  return lines.join('\n')
}
