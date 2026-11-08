// The words for the Steel Beams, Columns & Posts calculator on the quote: a short line (printed on the quote) and the full member-by-member description (the "What's included" text). Pure, so they follow the members
// until edited by hand. No imports needed from the engine: the screen passes in each member already worded (its `parts`).

export interface SteelDescriptionMember {
  ref: string
  location: string
  /** plain phrases from the engine: "203 × 133 UB 25 steel beam, 4.20m long, bearing on padstones, shop primed" */
  parts: string[]
  name: string
}
export interface SteelDescriptionInput {
  members: SteelDescriptionMember[]
  anySteelContractor: boolean
  engineer: boolean
  buildingControl: boolean
  hiabVisits: number
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: SteelDescriptionInput) => i.members.filter(x => x.parts.length > 0)
const nameOf = (x: SteelDescriptionMember) => `${x.ref.trim() || x.name}${x.location.trim() ? ` (${x.location.trim()})` : ''}`

export function describeSteelworkShort(i: SteelDescriptionInput): string {
  const m = withParts(i)
  if (m.length === 0) return 'Structural steelwork: beams, columns and posts.'
  return `Structural steelwork: ${list(m.map(nameOf))}.`
}

export function describeSteelwork(i: SteelDescriptionInput): string {
  const m = withParts(i)
  if (m.length === 0) return 'Structural steelwork: beams, columns and posts.'
  const lines: string[] = ['Supply and fix the structural members below.']
  for (const x of m) lines.push(`${nameOf(x)}: ${x.parts.join('; ')}.`)
  if (i.anySteelContractor) lines.push('Where a steelwork contractor supplies and fixes the steel, their price covers the supply, delivery and fixing of the steel.')
  if (i.hiabVisits > 0) lines.push(`${i.hiabVisits === 1 ? 'A Hiab or lorry crane lifts' : `${i.hiabVisits} Hiab or lorry crane visits lift`} the steel into place.`)
  if (i.engineer) lines.push(`The steel is to the structural engineer's design and calculations${i.buildingControl ? ', with the Building Control notice and inspections' : ''}; the sections priced are indicative until the design is issued.`)
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the dust is kept down.')
  lines.push('Not included: the foundations beyond any pads listed, floor or roof timbers carried by the members, making good, plastering or decorating.')
  return lines.join('\n')
}
