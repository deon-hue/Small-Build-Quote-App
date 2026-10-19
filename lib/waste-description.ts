// The words for waste and skips on the quote: a short line (printed on the quote) and a full description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each kind already worded.

export interface WasteDescriptionInput {
  /** each kind of waste, as words, e.g. "mixed building waste, 8.5m³" */
  kinds: string[]
  skips: number
  grabLoads: number
  hazardous: number
  roadPermits: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeWasteShort(i: WasteDescriptionInput): string {
  const parts: string[] = []
  if (i.skips > 0) parts.push(plural(i.skips, 'skip', 'skips'))
  if (i.grabLoads > 0) parts.push(plural(i.grabLoads, 'grab lorry load', 'grab lorry loads'))
  if (i.hazardous > 0) parts.push(`${plural(i.hazardous, 'hazardous item', 'hazardous items')} removed by a licensed contractor`)
  return parts.length === 0 ? 'Waste disposal.' : `Waste disposal: ${parts.join(', ')}.`
}

export function describeWaste(i: WasteDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Supply ${i.skips > 0 ? plural(i.skips, 'skip', 'skips') : ''}${i.skips > 0 && i.grabLoads > 0 ? ' and ' : ''}${i.grabLoads > 0 ? plural(i.grabLoads, 'grab lorry load', 'grab lorry loads') : ''}${i.skips + i.grabLoads === 0 ? 'waste collection' : ''}, and take the waste away to a licensed site, kept separate by kind: ${i.kinds.join('; ')}.`)
  if (i.hazardous > 0) lines.push(`${plural(i.hazardous, 'item', 'items')} of hazardous waste are removed and disposed of by a licensed contractor (a provisional sum for each).`)
  if (i.roadPermits) lines.push('Highway permits are obtained for the skips on the road.')
  lines.push('A licensed waste carrier is used and the waste transfer notes are kept.')
  lines.push('Not included: loading the skips (priced with the work that makes the waste) unless stated, or the cost of removing any asbestos found beyond the provisional sums.')
  return lines.join('\n')
}
