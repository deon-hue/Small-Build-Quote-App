// Turns the plumbing calculator's rooms into the words the quote description wants (see lib/plumbing-description.ts): each room's fittings as "2 wash basins", special fittings as
// "1 freestanding bath (client-supplied)", and the whole-house items that are included. Used by the screen.

import { FITTING_TYPES, SPECIAL_BY_ID, WHOLE_HOUSE_ITEMS, type PlumbingRoom, type PlumbingResult } from './plumbing-units'
import type { PlumbingDescriptionInput } from './plumbing-description'

const WHOLE_WORDS: Record<string, string> = {
  'stop-tap': 'new stop tap and isolation valves',
  'mains-supply': 'new water main to the house',
  manifold: 'plumbing manifold with isolation valves',
  'booster-pump': 'pressure booster pump',
}

/** lower-case a name for the middle of a sentence, but keep an acronym such as WC as it is */
const lower = (s: string) => (/^[A-Z]{2,4}( |$)/.test(s) ? s : s.toLowerCase())
const phrase = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `pipes` is given when heating pipework drawn on the plan is priced: its material and radiators, and the pipe and fittings are read from the priced lines */
export function plumbingDescriptionInput(rooms: PlumbingRoom[], wholeHouse: Record<string, number>, r: PlumbingResult, pipes?: { material: 'copper' | 'plastic'; radiators: number; loadW: number }): PlumbingDescriptionInput {
  const pipeLines = r.lines.filter(l => l.id.startsWith('pipe|'))
  const pipework = pipes && pipeLines.length > 0 ? {
    material: pipes.material,
    sizesMm: pipeLines.map(l => +l.id.split('|')[1]).sort((a, b) => a - b),
    bySize: pipeLines.map(l => ({ sizeMm: +l.id.split('|')[1], pipeM: l.qty })).sort((a, b) => a.sizeMm - b.sizeMm),
    pipeM: pipeLines.reduce((s, l) => s + l.qty, 0),
    fittings: r.lines.filter(l => l.id.startsWith('pipefit|')).reduce((s, l) => s + l.qty, 0),
    radiators: pipes.radiators,
    kW: pipes.loadW / 1000,
  } : undefined
  return {
    rooms: rooms.map(rm => {
      const byDays = rm.mode === 'days'
      const items = byDays ? [] : FITTING_TYPES.filter(f => (rm.fittings[f.id] ?? 0) > 0).map(f => phrase(rm.fittings[f.id], lower(f.name.replace(/ \(.*\)$/, '')), f.plural))
      const specials = rm.specials.filter(s => s.count > 0).map(s => {
        const st = SPECIAL_BY_ID[s.typeId]
        const label = s.name.trim() || lower((s.count === 1 ? st?.name.replace(/ \(.*\)$/, '') : st?.plural) || 'special fitting')
        return `${s.name.trim() ? `${s.count} × ${label}` : phrase(s.count, label, label)}${s.supply === 'client' ? ' (client-supplied)' : ''}`
      })
      return { name: rm.name.trim() || 'Room', items, specials, days: byDays ? rm.days : null, weSupply: rm.supply === 'us' }
    }),
    wholeHouse: WHOLE_HOUSE_ITEMS.filter(w => w.id !== 'pressure-test' && (wholeHouse[w.id] ?? 0) > 0).map(w => (wholeHouse[w.id] > 1 ? `${wholeHouse[w.id]} × ` : '') + (WHOLE_WORDS[w.id] ?? w.name.toLowerCase())),
    tested: (wholeHouse['pressure-test'] ?? 0) > 0,
    totalFittings: r.totalFittings,
    specialCount: r.specialCount,
    ...(pipework ? { pipework } : {}),
  }
}

