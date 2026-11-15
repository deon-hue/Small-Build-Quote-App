// How a quote's phases are laid out for the CLIENT: the main phase (Foundations, Structural Shell ...) as a heading, then the room or area (Kitchen, Bedroom 1 ...) when a sub-phase has one, then the
// sub-phases under it, exactly the way the builder builds it. Before this the client's views (the portal quote, the printed and emailed PDF, the online quote) listed every sub-phase in one flat list: the
// portal showed neither the main phase nor the room, the PDF only put the main phase in front of each sub-phase name and the online quote only the room. Pure, so it can be tested.

import type { QuotePhase } from './types'

export interface ClientPhaseRow {
  phase: QuotePhase
  /** '2.3' (third sub-phase of the second main phase) when the quote has main phases, else a plain count '5' */
  number: string
  /** the number of the main phase this row belongs to (set on EVERY row when the quote has main phases), so a screen can fold a whole main phase away */
  mainNumber?: number
  /** set on the FIRST row of each main phase when the quote has main phases: the heading to draw above it, and every sub-phase in the group (for the heading's total) */
  mainHeading?: { name: string; number: number; phases: QuotePhase[] }
  /** set on the first row of each room or area group inside a main phase */
  roomHeading?: string
}

/** What a sub-phase with no main phase is listed under, when the quote's other sub-phases have one */
export const NO_MAIN_PHASE_LABEL = 'Other work'

/**
 * The phases in the order the builder shows them: main phases in the order they first appear, and inside each the rooms in the order they first appear (sub-phases with no room first if they come first),
 * every sub-phase keeping its own order. A quote with no main phase names at all gets no main headings (only rooms, if any).
 */
export function clientPhaseRows(phases: QuotePhase[]): ClientPhaseRow[] {
  const named = phases.some(p => (p.parentPhase ?? '').trim() !== '')
  const mainOrder: string[] = []
  const byMain = new Map<string, QuotePhase[]>()
  for (const p of phases) {
    const k = (p.parentPhase ?? '').trim()
    if (!byMain.has(k)) { byMain.set(k, []); mainOrder.push(k) }
    byMain.get(k)!.push(p)
  }
  const rows: ClientPhaseRow[] = []
  mainOrder.forEach((k, mi) => {
    const group = byMain.get(k)!
    const roomOrder: string[] = []
    const byRoom = new Map<string, QuotePhase[]>()
    for (const p of group) {
      const r = (p.roomLabel ?? '').trim()
      if (!byRoom.has(r)) { byRoom.set(r, []); roomOrder.push(r) }
      byRoom.get(r)!.push(p)
    }
    let n = 0
    let first = true
    for (const r of roomOrder) {
      byRoom.get(r)!.forEach((p, i) => {
        n++
        rows.push({
          phase: p,
          number: named ? `${mi + 1}.${n}` : String(rows.length + 1),
          mainNumber: named ? mi + 1 : undefined,
          mainHeading: named && first ? { name: k || NO_MAIN_PHASE_LABEL, number: mi + 1, phases: group } : undefined,
          roomHeading: r && i === 0 ? r : undefined,
        })
        first = false
      })
    }
  })
  return rows
}
