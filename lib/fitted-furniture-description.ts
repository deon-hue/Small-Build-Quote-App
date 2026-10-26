// The words for the Fitted Furniture & Wardrobes calculator on the quote: a short line (printed on the quote) and the full run-by-run description (the "What's included" text). Pure, so they follow the runs until edited by
// hand. No imports needed from the engine: the screen passes in each run already worded (its `parts`).

export interface FurnDescriptionRun {
  ref: string
  location: string
  /** plain phrases from the engine: "fitted wardrobe with hinged doors, 2.40m wide ... built on site in melamine-faced board", "a plinth and a scribed filler to the ceiling" */
  parts: string[]
  name: string
}
export interface FurnDescriptionInput {
  runs: FurnDescriptionRun[]
  anyClientSupplied: boolean
  anySite: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: FurnDescriptionInput) => i.runs.filter(r => r.parts.length > 0)
const nameOf = (r: FurnDescriptionRun) => `${r.ref.trim() || r.name}${r.location.trim() ? ` (${r.location.trim()})` : ''}`

export function describeFurnShort(i: FurnDescriptionInput): string {
  const runs = withParts(i)
  if (runs.length === 0) return 'Fitted furniture and wardrobes.'
  return `Fitted furniture: ${list(runs.map(r => `${nameOf(r)}`))}.`
}

export function describeFurn(i: FurnDescriptionInput): string {
  const runs = withParts(i)
  if (runs.length === 0) return 'Fitted furniture and wardrobes.'
  const lines: string[] = ['Supply and fit the fitted furniture below, scribed to the walls, floor and ceiling and fixed to the structure.']
  for (const r of runs) lines.push(`${nameOf(r)}: ${r.parts.join('; ')}.`)
  if (i.anyClientSupplied) lines.push('Where the client or the supplier delivers the furniture, we fit it as delivered: every part and the size of the space are to be checked before work starts.')
  if (i.anySite) lines.push('Furniture built on site is made from the sizes of the space as measured: the doors and the finish are supplied ready for painting unless stated.')
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the work is cleared up each day.')
  lines.push('Not included: painting or spraying, lights or sockets inside, taking out any old furniture, or making good the walls and floor.')
  return lines.join('\n')
}
