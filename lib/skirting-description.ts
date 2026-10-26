// The words for the Skirtings, Architraves & Trim calculator on the quote: a short line (printed on the quote) and the full room-by-room description (the "What's included" text). Pure, so they follow the rooms until
// edited by hand. No imports needed from the engine: the screen passes in each room already worded (its `parts`).

export interface TrimDescriptionRoom {
  name: string
  /** plain phrases from the engine: "14.1m of 120mm primed MDF chamfered skirting", "70mm primed MDF chamfered architrave to 1 door" */
  parts: string[]
}
export interface TrimDescriptionInput {
  rooms: TrimDescriptionRoom[]
  anyClientSupplied: boolean
  anyUnprimed: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: TrimDescriptionInput) => i.rooms.filter(r => r.parts.length > 0)

export function describeTrimShort(i: TrimDescriptionInput): string {
  const names = withParts(i).map(r => r.name)
  return names.length === 0 ? 'Skirtings, architraves and trim.' : `Supply and fit skirtings, architraves and trim: ${list(names)}.`
}

export function describeTrim(i: TrimDescriptionInput): string {
  const rooms = withParts(i)
  if (rooms.length === 0) return 'Skirtings, architraves and trim.'
  const lines: string[] = ['Supply and fit the skirting, architrave and other trim in the rooms below, scribed to the floor and walls, mitred at the external corners and fixed with adhesive and pins.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  if (i.anyClientSupplied) lines.push('Where the client supplies the timber, we fit it only: the profile and the quantity are to be confirmed before work starts.')
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the work is cleared up each day.')
  lines.push(i.anyUnprimed
    ? 'Raw timber is left ready for priming and finishing.'
    : 'Primed trim is fitted ready for painting.')
  lines.push('Not included: taking off the old skirting or doors, the door and window units themselves (priced with the windows and doors), painting and decorating, or making good the plaster or the floor.')
  return lines.join('\n')
}
