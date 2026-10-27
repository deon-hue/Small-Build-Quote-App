// The words for the drainage chambers, gullies and connections on the quote: a short line (printed on the quote) and a full item-by-item description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen (and the AI quote) hand in each item already put into words.

export interface DrainItemsDescriptionItem {
  ref: string
  /** where it is, in words ("rear garden"), or '' */
  where: string
  /** "inspection chamber" or "inspection chambers", to suit the number */
  word: string
  /** the same words for one and for several, so like items can be added up */
  singular: string
  plural: string
  qty: number
  group: 'chamber' | 'gully' | 'connection'
  /** how deep, in metres to a tenth, or null for a connection */
  depthM: number | null
  /** the cover, in words ("light-duty"), or null when it has none to choose */
  cover: string | null
  /** how the pit is dug ("by machine"), or null when none is dug */
  dug: string | null
}

export interface DrainItemsDescriptionInput {
  items: DrainItemsDescriptionItem[]
}

export function describeDrainItemsShort(i: DrainItemsDescriptionInput): string {
  if (i.items.length === 0) return 'Drainage chambers, gullies and connections.'
  // the same kind of thing is added up: "3 inspection chambers", not three entries
  const order: string[] = []
  const totals = new Map<string, { n: number; plural: string }>()
  for (const x of i.items) {
    const t = totals.get(x.singular)
    if (t) t.n += x.qty
    else { totals.set(x.singular, { n: x.qty, plural: x.plural }); order.push(x.singular) }
  }
  const words = order.map(k => { const t = totals.get(k)!; return `${t.n} ${t.n === 1 ? k : t.plural}` })
  return `Drainage chambers, gullies and connections: ${words.join(', ')}.`
}

export function describeDrainItems(i: DrainItemsDescriptionInput): string {
  const lines: string[] = []
  lines.push('Excavate for, supply and build in the drainage chambers, manholes, gullies and connections below, each on its own bed, surrounded and backfilled, with covers to suit where they sit.')
  for (const x of i.items) {
    const label = [x.ref, x.where].filter(Boolean).join(' (') + (x.ref && x.where ? ')' : '')
    const head = label ? `${label}: ` : ''
    const a = /^[aeiou]/i.test(x.word) ? 'an ' : 'a '
    const what = x.qty === 1 ? `${a}${x.word}` : `${x.qty} ${x.word}`
    const bits: string[] = []
    if (x.group !== 'connection' && x.depthM !== null) bits.push(`about ${x.depthM.toFixed(1)}m deep`)
    if (x.cover) bits.push(`with a ${x.cover} cover`)
    if (x.dug) bits.push(`pit dug ${x.dug}`)
    if (x.group === 'connection') {
      const sewer = /sewer/.test(x.word)
      lines.push(`${head}${what}${sewer ? ' (a provisional sum: the water company\'s approval and charges are separate)' : ''}.`)
    } else {
      lines.push(`${head}${what}${bits.length ? ', ' + bits.join(', ') : ''}.`)
    }
  }
  lines.push('Surplus soil is taken away; the rest is used to backfill round each one.')
  lines.push('Not included: the drain pipework between them (priced with Underground Drainage by run), soakaways and channel drains (priced separately), trench support for the deeper pits, the water company\'s fees and approvals, or diverting any services found in the ground.')
  return lines.join('\n')
}
