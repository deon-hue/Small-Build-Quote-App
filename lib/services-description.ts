// The words for services connections on the quote: a short line (printed on the quote) and a full service-by-service description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface ServicesDescriptionItem {
  name: string
  /** "water", "gas", "electricity", "telecoms and broadband" */
  utility: string
  work: 'new' | 'divert' | 'cap-off'
  lengthM: number
  /** how it is dug, in words: "by machine" or "by hand" */
  dug: string
  /** what it crosses, in words, e.g. "block paving" */
  crosses: string
  box: boolean
  /** what is laid, e.g. "25mm MDPE blue water pipe" */
  laid: string
}

export interface ServicesDescriptionInput { items: ServicesDescriptionItem[]; totalLm: number }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeServicesShort(i: ServicesDescriptionInput): string {
  if (i.items.length === 0) return 'Services connections.'
  const kinds = Array.from(new Set(i.items.map(x => x.utility)))
  return `Services connections: ${kinds.join(', ')}${i.totalLm > 0 ? `, ${i.totalLm}m of trench` : ''}.`
}

export function describeServices(i: ServicesDescriptionInput): string {
  const lines: string[] = []
  lines.push('Services work, as set out below. The utility company (or its approved contractor) carries out the work on its own network and its own side of the meter, and its charge is included as a provisional sum.')
  for (const s of i.items) {
    if (s.work === 'cap-off') { lines.push(`${s.name} (${s.utility}): cap off the existing supply.`); continue }
    lines.push(`${s.name} (${s.utility}): ${s.work === 'new' ? 'new connection' : 'diversion of the existing supply'}, ${s.lengthM}m of trench dug ${s.dug}, ${s.laid} laid on a sand bed with warning tape, backfilled, and the surface reinstated in ${s.crosses}${s.box ? '; the meter box or chamber supplied and set' : ''}.`)
  }
  lines.push('Not included: the utility companies\' own charges beyond the provisional sums, their waiting times, the electrical and gas work on the building side of the meter, or making good inside the building.')
  return lines.join('\n')
}
