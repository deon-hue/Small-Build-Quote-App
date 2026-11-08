// The words for the Structural Openings calculator on the quote: a short line (printed on the quote) and the full opening-by-opening description (the "What's included" text). Pure, so they follow the openings until
// edited by hand. No imports needed from the engine: the screen passes in each opening already worded (its `parts`).

export interface StructuralDescriptionOpening {
  ref: string
  location: string
  /** plain phrases from the engine: "a new opening 2.40 x 2.10m cut in the existing solid brick wall (load-bearing), with a 203 × 133 UB 25 steel beam, two padstones, ..." */
  parts: string[]
  name: string
}
export interface StructuralDescriptionInput {
  openings: StructuralDescriptionOpening[]
  anyCut: boolean
  anyLoadBearing: boolean
  anySteelContractor: boolean
  buildingControl: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: StructuralDescriptionInput) => i.openings.filter(x => x.parts.length > 0)
const nameOf = (x: StructuralDescriptionOpening) => `${x.ref.trim() || x.name}${x.location.trim() ? ` (${x.location.trim()})` : ''}`

export function describeStructuralOpeningsShort(i: StructuralDescriptionInput): string {
  const o = withParts(i)
  if (o.length === 0) return 'Structural openings in walls, with the steelwork to carry the load above.'
  return `Structural ${o.length === 1 ? 'opening' : 'openings'} in walls with steelwork: ${list(o.map(nameOf))}.`
}

export function describeStructuralOpenings(i: StructuralDescriptionInput): string {
  const o = withParts(i)
  if (o.length === 0) return 'Structural openings in walls, with the steelwork to carry the load above.'
  const lines: string[] = [i.anyCut ? 'Form the structural openings below, with temporary support while the wall is cut and the steelwork to carry the load above.' : 'Form the structural openings below, with the steelwork to carry the load above.']
  for (const x of o) lines.push(`${nameOf(x)}: ${x.parts.join('; ')}.`)
  if (i.anySteelContractor) lines.push('Where a steelwork contractor supplies and fixes the steel, their price covers the supply, delivery and fixing of the steel.')
  if (i.anyLoadBearing) lines.push(`The steel is to the structural engineer's design and calculations${i.buildingControl ? ', with the Building Control notice and inspections' : ''}; the sections priced are indicative until the design is issued.`)
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the dust is kept down.')
  lines.push('Not included: the door or window and its frame, plastering the reveals, decorating, or making good the floor and ceiling.')
  return lines.join('\n')
}
