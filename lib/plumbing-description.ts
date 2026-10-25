// The words for the plumbing installation on the quote: a short line (printed on the quote) and a full room-by-room description (the "What's included"
// text). Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in
// each room's fittings already worded ("1 bath, 1 wash basin").

export interface PlumbingDescriptionRoom {
  name: string
  /** fittings as words, e.g. "2 wash basins"; empty when the room is priced by the day */
  items: string[]
  /** special fittings as words, e.g. "1 freestanding bath (client-supplied)" */
  specials: string[]
  /** plumber days when the room is priced by the day, otherwise null */
  days: number | null
  /** true when we supply the sanitaryware and radiators in this room */
  weSupply: boolean
}

export interface PlumbingDescriptionInput {
  rooms: PlumbingDescriptionRoom[]
  /** the whole-house items included, as words, e.g. "new stop tap and isolation valves" */
  wholeHouse: string[]
  /** true when the pressure test and commissioning is included */
  tested: boolean
  totalFittings: number
  specialCount: number
  /** heating pipework drawn on the plan and priced, when there is some */
  pipework?: {
    /** 'copper' or 'plastic' */
    material: string
    /** the sizes in use, mm, smallest first */
    sizesMm: number[]
    /** metres of pipe laid (flow and return together) in each size, smallest first: the quote lists them */
    bySize?: { sizeMm: number; pipeM: number }[]
    /** metres of pipe laid, flow and return together */
    pipeM: number
    /** elbows, bends and tees counted (flow and return together) */
    fittings: number
    /** radiators and towel rails the pipes connect */
    radiators: number
    kW: number
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describePlumbingShort(i: PlumbingDescriptionInput): string {
  const rooms = i.rooms.filter(r => r.items.length > 0 || r.specials.length > 0 || r.days !== null)
  if (rooms.length === 0 && i.wholeHouse.length === 0 && !i.pipework) return 'Plumbing installation.'
  const parts: string[] = []
  if (rooms.length > 0) {
    parts.push(`${plural(rooms.length, 'room', 'rooms')}${i.totalFittings > 0 ? `, ${plural(i.totalFittings, 'fitting', 'fittings')}` : ''}`)
    if (i.specialCount > 0) parts.push(`${plural(i.specialCount, 'special fitting', 'special fittings')} installed`)
  }
  if (i.pipework) parts.push(`heating pipework to ${plural(i.pipework.radiators, 'radiator', 'radiators')} (${i.pipework.sizesMm.map(s => `${s}mm`).join(' and ')} ${i.pipework.material})`)
  if (i.wholeHouse.length > 0) parts.push(i.wholeHouse.join(', '))
  return `Plumbing installation: ${parts.join('; ')}${i.tested ? ', pressure tested' : ''}.`
}

export function describePlumbing(i: PlumbingDescriptionInput): string {
  const lines: string[] = []
  lines.push('Supply and install the plumbing to each room below: hot, cold and waste pipework to each fitting, with the fittings connected, tested and left working.')
  for (const r of i.rooms) {
    if (r.days !== null) {
      lines.push(`${r.name}: plumbing work by a plumber for ${plural(r.days, 'day', 'days')}.${r.specials.length > 0 ? ` Install ${r.specials.join(', ')}.` : ''}`)
      continue
    }
    if (r.items.length === 0 && r.specials.length === 0) continue
    let line = `${r.name}: ${r.items.length > 0 ? r.items.join(', ') : 'no standard fittings'}${r.weSupply && r.items.length > 0 ? ' (supplied and fitted)' : ''}.`
    if (r.specials.length > 0) line += ` Install ${r.specials.join(', ')}.`
    lines.push(line)
  }
  if (i.pipework) {
    const p = i.pipework
    const sizes = p.sizesMm.map(s => `${s}mm`).join(' and ')
    // the pipe by size: '27 m of 15mm and 8 m of 22mm' (or the total when the sizes are not given)
    const per = (p.bySize ?? []).filter(x => x.pipeM > 0).map(x => `${Math.max(1, Math.round(x.pipeM))} m of ${x.sizeMm}mm`)
    const list = per.length > 0 ? per.length > 1 ? `${per.slice(0, -1).join(', ')} and ${per[per.length - 1]}` : per[0] : `about ${Math.round(p.pipeM)} m of ${sizes}`
    const who = `connecting ${plural(p.radiators, 'radiator or towel rail', 'radiators or towel rails')}${p.kW > 0 ? ` (about ${p.kW.toFixed(1)} kW in all)` : ''}`
    // (with no kW there is no plan behind it, so the pipe is not claimed to be sized section by section)
    lines.push(`Heating pipework: supply and install ${p.material} heating pipe, flow and return${p.kW > 0 ? ', sized for the heat each section carries' : ''}: ${list}, with its elbows and tees, ${who}, clipped and tested.`)
  }
  if (i.wholeHouse.length > 0) lines.push(`Whole house: ${i.wholeHouse.join(', ')}.`)
  if (i.tested) lines.push('On completion the pipework is pressure tested and commissioned.')
  const anyClient = i.rooms.some(r => !r.weSupply && r.items.length > 0)
  lines.push(`Not included: ${anyClient ? 'sanitaryware, taps and radiators where the client supplies them, ' : ''}the boiler, hot water cylinder or heat pump and their gas, flue and electrical connections (priced separately), tiling, making good plaster and decoration after pipe runs, or any drainage outside the building.`)
  return lines.join('\n')
}
