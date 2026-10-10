// The words for the electrical installation on the quote: a short line (printed on the quote) and a full room-by-room description (the "What's included"
// text). Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in
// each room's points already worded ("8 double sockets").

export interface ElectricsDescriptionRoom {
  name: string
  /** points as words, e.g. "8 double sockets"; empty when the room is priced by the day */
  items: string[]
  /** special fittings as words, e.g. "1 chandelier (client-supplied)" */
  fittings: string[]
  /** electrician days when the room is priced by the day, otherwise null */
  days: number | null
}

export interface ElectricsDescriptionInput {
  rooms: ElectricsDescriptionRoom[]
  /** the whole-house items included, as words, e.g. "new consumer unit" */
  wholeHouse: string[]
  /** true when the testing and electrical certificate is included */
  certificate: boolean
  totalPoints: number
  fittingCount: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeElectricsShort(i: ElectricsDescriptionInput): string {
  const rooms = i.rooms.filter(r => r.items.length > 0 || r.fittings.length > 0 || r.days !== null)
  if (rooms.length === 0 && i.wholeHouse.length === 0) return 'Electrical installation.'
  const parts: string[] = []
  if (rooms.length > 0) {
    parts.push(`${plural(rooms.length, 'room', 'rooms')}${i.totalPoints > 0 ? `, ${plural(i.totalPoints, 'point', 'points')}` : ''}`)
    if (i.fittingCount > 0) parts.push(`${plural(i.fittingCount, 'special fitting', 'special fittings')} installed`)
  }
  if (i.wholeHouse.length > 0) parts.push(i.wholeHouse.join(', '))
  return `Electrical installation: ${parts.join('; ')}${i.certificate ? ', with testing and certificate' : ''}.`
}

export function describeElectrics(i: ElectricsDescriptionInput): string {
  const lines: string[] = []
  lines.push('Supply and install the electrical work to each room below, to BS 7671 (the IET Wiring Regulations), with every point complete with its cable, back box and accessory, connected and tested.')
  for (const r of i.rooms) {
    if (r.days !== null) {
      lines.push(`${r.name}: electrical work by an electrician for ${plural(r.days, 'day', 'days')}.${r.fittings.length > 0 ? ` Install ${r.fittings.join(', ')}.` : ''}`)
      continue
    }
    const parts = [...r.items]
    if (parts.length === 0 && r.fittings.length === 0) continue
    let line = `${r.name}: ${parts.length > 0 ? parts.join(', ') : 'no standard points'}.`
    if (r.fittings.length > 0) line += ` Install ${r.fittings.join(', ')}.`
    lines.push(line)
  }
  if (i.wholeHouse.length > 0) lines.push(`Whole house: ${i.wholeHouse.join(', ')}.`)
  if (i.certificate) lines.push('On completion the installation is tested and the electrical certificate issued, with Part P notification.')
  lines.push('Not included: light fittings, appliances and their supply unless stated, making good decorations and plaster after chasing, or any work to the supply cable or meter by the network operator.')
  return lines.join('\n')
}
