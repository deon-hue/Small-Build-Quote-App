// The words for the Staircase & Balustrade calculator on the quote: a short line (printed on the quote) and the full staircase-by-staircase description (the "What's included" text). Pure, so they follow the
// staircases until edited by hand. No imports needed from the engine: the screen passes in each staircase already worded (its `parts`).

export interface StairsDescriptionStair {
  ref: string
  location: string
  /** plain phrases from the engine: "a softwood straight flight, 13 risers ... supplied and fitted", "timber spindle balustrade along one side of the stair" */
  parts: string[]
}
export interface StairsDescriptionInput {
  stairs: StairsDescriptionStair[]
  anyClientSupplied: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: StairsDescriptionInput) => i.stairs.filter(s => s.parts.length > 0)
const nameOf = (s: StairsDescriptionStair) => `${s.ref.trim() || 'Staircase'}${s.location.trim() ? ` (${s.location.trim()})` : ''}`

export function describeStairsShort(i: StairsDescriptionInput): string {
  const stairs = withParts(i)
  if (stairs.length === 0) return 'Staircase and balustrade.'
  return `Staircase and balustrade: ${list(stairs.map(nameOf))}.`
}

export function describeStairs(i: StairsDescriptionInput): string {
  const stairs = withParts(i)
  if (stairs.length === 0) return 'Staircase and balustrade.'
  const lines: string[] = ['Supply and fit the staircase and balustrade below, set to the floor-to-floor height on site and fixed to the structure.']
  for (const s of stairs) lines.push(`${nameOf(s)}: ${s.parts.join('; ')}.`)
  if (i.anyClientSupplied) lines.push('Where the client supplies the staircase or balustrade, we fit it only: the size, the rise and the delivery are to be confirmed before work starts.')
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the work is cleared up each day.')
  lines.push('The rise, going, pitch, headroom and handrails are set out to Part K of the Building Regulations; the Building Control officer inspects the staircase.')
  lines.push('Not included: the stairwell opening and the trimming of the floor, taking out the old staircase, plastering the underside, floor finishes, painting and decorating, or making good.')
  return lines.join('\n')
}
