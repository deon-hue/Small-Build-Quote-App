// Pricing the Internal Decoration calculator (deco-internal-walls) from what the AI quote heard in the scope (see lib/decoration-ai.ts for the checking). It uses the calculator's own engine, its own
// labour (the painter, priced at the company's rate), standard settings (10% waste on paint, 10% drying allowance) and sample rates, with the 20% profit line, exactly as the screen does before anything is
// edited. It also returns the calculator's saved state (`calcState`), so opening the calculator from the quote shows the same rooms, and a plain-English review note saying what was priced and what was
// assumed. Kept next to the screens (not in lib/) because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import type { LabourSuggestion } from '@/lib/flat-roof-labour'
import { costFromBasics } from '@/components/assembly-basics-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'
import { calculateDecoration, DEFAULT_DECO_SITUATIONS } from '@/lib/decoration-units'
import { describeDecoration, describeDecorationShort } from '@/lib/decoration-description'
import { decorationFromScope } from '@/lib/decoration-ai'
import { plural } from '@/lib/ai-spec'

export const DECORATION_AI_IDS = new Set(['deco-internal-walls'])

const WASTE_PCT = 10     // the calculator's own start: waste on the paint and filler
const DRYING_PCT = 10    // the calculator's own start: drying time and return visits

/** Prices the decoration calculator from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function priceDecorationCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    if (o.canonicalId !== 'deco-internal-walls') return null
    const ai = decorationFromScope(o.spec)
    if (!ai) return null
    const r = calculateDecoration({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_DECO_SITUATIONS, rates: {}, towerWeeks: 0, dryingPct: DRYING_PCT })
    const layers: AssemblyLayerDef[] = r.lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: l.wasteApplies ? WASTE_PCT : 0 }))
    const suggestions: LabourSuggestion[] = r.labour.map(t => ({ key: t.key, trade: 'painter' as const, task: t.task, hours: t.hours, basis: t.basis }))
    const lines = costFromBasics({ layers, suggestions, labourTrades: o.labourTrades })
    const d = {
      rooms: r.rooms,
      walls: ai.rooms.some(x => x.walls.paint), ceilings: ai.rooms.some(x => x.ceiling.paint), woodwork: ai.rooms.some(x => x.woodwork.paint),
      doors: ai.rooms.some(x => x.doorWork.paint), frames: ai.rooms.some(x => x.frames.paint), stripping: r.totalStripM2 > 0,
    }
    const names = ai.rooms.map(x => x.name)
    const wallM2 = Math.round(r.rooms.reduce((s, x) => s + x.wallM2, 0)), ceilM2 = Math.round(r.rooms.reduce((s, x) => s + x.ceilingM2, 0))
    const wood = ai.woodworkRooms === 0 && ai.doorRooms === 0 && ai.frameRooms === 0
      ? ' The skirting, architraves, doors and window frames are not included because the scope did not say they are painted: tick them in the calculator if they are.'
      : ` Painted woodwork is in ${plural(ai.woodworkRooms, 'room', 'rooms')}, doors in ${plural(ai.doorRooms, 'room', 'rooms')} and window frames in ${plural(ai.frameRooms, 'room', 'rooms')}.`
    return {
      name: 'Internal decoration', qty: 1, location: '', description: describeDecorationShort(d), detail: describeDecoration(d), lines,
      calcState: { id: 'deco-internal-walls', values: { AssemblyDecorationDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId } } },
      note: `Priced by the decoration calculator from the rooms in your scope (${names.slice(0, 12).join(', ')}${names.length > 12 ? ` and ${names.length - 12} more` : ''}: ${plural(ai.rooms.length, 'room', 'rooms')}, about ${wallM2}m² of walls and ${ceilM2}m² of ceiling) with the calculator's standard settings and sample rates.${ai.typicalRooms.length > 0 ? ` No full size was given for ${ai.typicalRooms.join(', ')}, so the typical size for that kind of room was used: check these against the plans.` : ' The room sizes are the ones stated in the scope.'}${ai.usualCondition.length > 0 ? ` The scope did not say what condition the walls or ceilings are in for ${ai.usualCondition.length === ai.rooms.length ? 'the rooms' : ai.usualCondition.join(', ')}, so painted before and in good order (normal filling and sanding, 2 coats, a mist coat only on new plaster) was used.` : ''}${wood} Wallpapering, feature finishes and external painting are not included. Open the calculator to check the rooms and change anything.`,
    }
  } catch { return null }
}
