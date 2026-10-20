// The words for internal plastering and boarding on the quote: a short line (printed on the quote) and a full room-by-room description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each room already worded (its `parts`).

export interface PlasterDescriptionRoom {
  name: string
  /** plain phrases from the engine: "plasterboard dot-and-dabbed and skimmed to 34.2m² of walls", "a skim coat to 14m² of ceiling", "4.8m of beads" */
  parts: string[]
}

export interface PlasterDescriptionInput {
  rooms: PlasterDescriptionRoom[]
  /** the job runs in occupied rooms: furniture to move and protect */
  occupied: boolean
  /** weeks of access tower hire */
  towerWeeks: number
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export function describePlasterShort(i: PlasterDescriptionInput): string {
  const names = i.rooms.filter(r => r.parts.length > 0).map(r => r.name)
  if (names.length === 0) return 'Internal plastering and boarding.'
  return `Plaster and board: ${list(names)}.`
}

export function describePlaster(i: PlasterDescriptionInput): string {
  const rooms = i.rooms.filter(r => r.parts.length > 0)
  if (rooms.length === 0) return 'Internal plastering and boarding.'
  const lines: string[] = ['Plaster and board the rooms below, to a finish ready for decoration.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  if (i.occupied) lines.push('The rooms are occupied: furniture is moved and protected, and floors and fittings are covered.')
  else lines.push('Floors and fittings are protected with dust sheets while we work.')
  if (i.towerWeeks > 0) lines.push(`An access tower is hired for ${i.towerWeeks} week${i.towerWeeks === 1 ? '' : 's'} for the high work.`)
  lines.push('New plaster needs time to dry before it is painted: allow for this in the programme.')
  lines.push('Not included: painting or decorating, skirting boards and architraves, making good after other trades, vaulted ceilings, or structural work.')
  return lines.join('\n')
}
