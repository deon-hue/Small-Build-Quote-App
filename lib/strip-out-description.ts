// The words for a strip-out on the quote: a short line (printed on the quote) and a full room-by-room description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each room's items already worded ("12m² of floor tiles").

export interface StripDescriptionRoom {
  name: string
  /** what comes out, as words, e.g. "12m² of floor tiles", "1 bath" */
  items: string[]
  dust: boolean
  disconnects: string[]
}

export interface StripDescriptionInput {
  rooms: StripDescriptionRoom[]
  skips: number
  asbestosSurveys: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeStripOutShort(i: StripDescriptionInput): string {
  const rooms = i.rooms.filter(r => r.items.length > 0)
  if (rooms.length === 0) return 'Strip-out.'
  return `Strip out ${rooms.map(r => r.name.toLowerCase()).join(', ')}, with the waste cleared to ${plural(i.skips, 'skip', 'skips')}.`
}

export function describeStripOut(i: StripDescriptionInput): string {
  const lines: string[] = []
  lines.push('Strip out the rooms below, taking out what is listed and loading the waste to skips.')
  for (const r of i.rooms) {
    if (r.items.length === 0) continue
    let line = `${r.name}: take out ${r.items.join(', ')}.`
    if (r.disconnects.length > 0) line += ` ${r.disconnects.join(' and ').replace(/^./, c => c.toUpperCase())} first.`
    if (r.dust) line += ' Floors and doorways protected.'
    lines.push(line)
  }
  if (i.asbestosSurveys > 0) lines.push(`${plural(i.asbestosSurveys, 'asbestos survey', 'asbestos surveys')} of the areas to be stripped before the work starts.`)
  lines.push(`The waste is cleared to ${plural(i.skips, 'skip', 'skips')} and taken away by a licensed carrier.`)
  lines.push('Not included: rebuilding or making good after the strip-out (priced under the trades that follow), asbestos removal if any is found, or taking out structural walls (priced as wall removal).')
  return lines.join('\n')
}
