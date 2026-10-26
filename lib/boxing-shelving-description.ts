// The words for the Boxing-in, Shelving & Second Fix calculator on the quote: a short line (printed on the quote) and the full item-by-item description (the "What's included" text). Pure, so they follow the items until
// edited by hand. No imports needed from the engine: the screen passes in each item already worded (its `parts`).

export interface SecondFixDescriptionItem {
  ref: string
  location: string
  /** plain phrases from the engine: "3m of boxing in moisture-resistant MDF on a timber frame, 450mm girth with 1 access panel" */
  parts: string[]
  name: string
}
export interface SecondFixDescriptionInput {
  items: SecondFixDescriptionItem[]
  anyClientSupplied: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: SecondFixDescriptionInput) => i.items.filter(x => x.parts.length > 0)
const nameOf = (x: SecondFixDescriptionItem) => `${x.ref.trim() || x.name}${x.location.trim() ? ` (${x.location.trim()})` : ''}`

export function describeSecondFixShort(i: SecondFixDescriptionInput): string {
  const items = withParts(i)
  if (items.length === 0) return 'Boxing-in, shelving and second-fix carpentry.'
  return `Boxing-in, shelving and second-fix carpentry: ${list(items.map(nameOf))}.`
}

export function describeSecondFix(i: SecondFixDescriptionInput): string {
  const items = withParts(i)
  if (items.length === 0) return 'Boxing-in, shelving and second-fix carpentry.'
  const lines: string[] = ['Supply and fit the carpentry below, scribed to the walls and fixed to the structure.']
  for (const x of items) lines.push(`${nameOf(x)}: ${x.parts.join('; ')}.`)
  if (i.anyClientSupplied) lines.push('Where the client supplies the materials, we fit them only: the sizes and the quantity are to be checked before work starts.')
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the work is cleared up each day.')
  lines.push('Not included: the plumbing or wiring behind any boxing, painting or decorating, or making good the plaster or the floor.')
  return lines.join('\n')
}
