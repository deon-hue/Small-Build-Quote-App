// Turns the electrics calculator's rooms into the words-ready input for lib/electrics-description.ts ("8 double sockets", "1 chandelier (client-supplied)").
// Shared by the calculator screen and by the AI quote, so both word a job the same way. Pure.

import { POINT_TYPES, FITTING_BY_ID, WHOLE_HOUSE_ITEMS, type ElectricsRoom, type ElectricsResult } from './electrics-units'
import type { ElectricsDescriptionInput } from './electrics-description'

/** "Double socket" -> "double socket", but "USB socket" and "TV / satellite point" keep their capitals. */
export const lcFirst = (s: string) => (s.length > 1 && /[A-Z]/.test(s[1]) ? s : s.charAt(0).toLowerCase() + s.slice(1))

export function electricsDescriptionInput(rooms: ElectricsRoom[], wholeHouse: Record<string, number>, r: ElectricsResult): ElectricsDescriptionInput {
  return {
    rooms: rooms.map(rm => ({
      name: rm.name.trim() || 'Room',
      days: rm.mode === 'days' ? rm.days : null,
      items: rm.mode === 'days' ? [] : POINT_TYPES.filter(p => (rm.points[p.id] ?? 0) > 0).map(p => {
        const n = rm.points[p.id]
        const word = n === 1 ? lcFirst(p.name) : p.plural
        return p.unit === 'm²' ? `${n} ${p.plural}` : /^\d/.test(word) ? `${n} × ${word}` : `${n} ${word}`
      }),
      fittings: rm.fittings.filter(f => f.count > 0).map(f => {
        const ft = FITTING_BY_ID[f.typeId]
        const label = f.name.trim() || (f.count === 1 ? lcFirst(ft?.name ?? 'special fitting') : (ft?.plural ?? 'special fittings'))
        return `${f.count} ${label}${f.supply === 'client' ? ' (client-supplied)' : ''}`
      }),
    })),
    wholeHouse: WHOLE_HOUSE_ITEMS.filter(w => w.id !== 'certificate' && (wholeHouse[w.id] ?? 0) > 0).map(w => (wholeHouse[w.id] === 1 ? lcFirst(w.name) : `${wholeHouse[w.id]} × ${lcFirst(w.name)}`)),
    certificate: (wholeHouse['certificate'] ?? 0) > 0,
    totalPoints: r.totalPoints,
    fittingCount: r.fittingCount,
  }
}
