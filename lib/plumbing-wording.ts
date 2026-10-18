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

export function plumbingDescriptionInput(rooms: PlumbingRoom[], wholeHouse: Record<string, number>, r: PlumbingResult): PlumbingDescriptionInput {
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
  }
}

