// The words for the Windows and Doors calculator on the quote: a short line (printed on the quote) and the full schedule description (the "What's included" text). Pure, so they follow the calculator until edited by hand.
// No imports needed from the engine: the screen passes in each opening already worded (its `parts`) and the counts.

export interface WdDescriptionOpening {
  ref: string
  location: string
  /** plain phrases from the engine: "2 x 1200 x 1200 uPVC casement window, double glazed, white", "window board inside" */
  parts: string[]
}
export interface WdDescriptionInput {
  openings: WdDescriptionOpening[]
  windows: number
  externalDoors: number
  internalDoors: number
  anyProvisional: boolean
  anyClientSupplied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeWdShort(i: WdDescriptionInput): string {
  const bits = [i.windows > 0 && count(i.windows, 'window', 'windows'), i.externalDoors > 0 && count(i.externalDoors, 'external door', 'external doors'), i.internalDoors > 0 && count(i.internalDoors, 'internal door', 'internal doors')].filter(Boolean) as string[]
  return bits.length === 0 ? 'Windows and doors.' : `Windows and doors: ${list(bits)}.`
}

export function describeWd(i: WdDescriptionInput): string {
  if (i.openings.length === 0) return 'Windows and doors.'
  const lines: string[] = ['Supply and fit the windows and doors on the schedule below, set and sealed in their openings.']
  for (const o of i.openings) lines.push(`${o.ref.trim() || 'Opening'}${o.location.trim() ? ` (${o.location.trim()})` : ''}: ${o.parts[0] ?? ''}${o.parts.length > 1 ? `, with ${list(o.parts.slice(1))}` : ''}.`)
  if (i.anyProvisional) lines.push('Where a unit is a provisional sum, the price is an allowance: the final price follows the unit chosen.')
  if (i.anyClientSupplied) lines.push('Where the client supplies the unit, we fit it only: the size and delivery are to be confirmed before the opening is closed up.')
  if (i.windows > 0 || i.externalDoors > 0) lines.push('Replacement windows and external doors need FENSA or Building Control approval: the certificate is issued after fitting.')
  lines.push('Not included: the lintels, cavity closers and reveals of the openings (priced with the walls), painting and decorating, making good plaster, or any structural work.')
  return lines.join('\n')
}
