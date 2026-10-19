// The words for outbuildings and external demolition on the quote: a short line (printed on the quote) and a full item-by-item description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each item already worded.

export interface ExtDescriptionItem {
  /** e.g. "a brick or block garage, 15m²" */
  words: string
  /** true when its concrete base is broken out too */
  base: boolean
  asbestos: boolean
}

export interface ExtDescriptionInput {
  items: ExtDescriptionItem[]
  machine: boolean
  skips: number
  grabLoads: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeExternalDemoShort(i: ExtDescriptionInput): string {
  if (i.items.length === 0) return 'External demolition.'
  return `Demolish and clear: ${i.items.map(x => x.words).join('; ')}.`
}

export function describeExternalDemo(i: ExtDescriptionInput): string {
  const lines: string[] = []
  lines.push('Demolish and clear the items below, taking the waste away from site.')
  for (const x of i.items) {
    let line = `Take down ${x.words}${x.base ? ' and break out its concrete base' : ''}.`
    if (x.asbestos) line += ' The asbestos cement roof is removed first by a licensed contractor (a provisional sum).'
    lines.push(line)
  }
  if (i.machine) lines.push('Concrete and bases are broken out with a mini excavator and breaker.')
  const away = [i.skips > 0 ? plural(i.skips, 'skip', 'skips') : '', i.grabLoads > 0 ? plural(i.grabLoads, 'grab lorry load', 'grab lorry loads') : ''].filter(Boolean).join(' and ')
  if (away) lines.push(`The waste is cleared to ${away}, kept separate, and taken away by a licensed carrier.`)
  lines.push('Not included: disconnecting electric or water to the buildings unless stated, new walls, fences or surfaces, or any hazardous material beyond the provisional sums.')
  return lines.join('\n')
}
