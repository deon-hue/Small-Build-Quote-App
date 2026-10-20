// Pricing the three Plastering & Boarding calculators from what the AI quote heard in the scope (see lib/plaster-ai.ts for the checking). Each uses the calculator's own engine, its own labour suggestions
// (priced at the company's trades), standard settings and sample rates, with the 20% profit line, exactly as the screen does before anything is edited. It also returns the calculator's saved state
// (`calcState`), so opening the calculator from the quote shows the same rooms or walls, and a plain-English review note saying what was priced and what was assumed. Kept next to the screens (not in lib/)
// because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { suggestPlasterLabour, suggestRenderLabour, suggestInsulationLabour } from '@/lib/flat-roof-labour'
import { costFromBasics } from '@/components/assembly-basics-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'
import { calculatePlaster, DEFAULT_PLASTER_SITUATIONS } from '@/lib/plaster-units'
import { describePlaster, describePlasterShort } from '@/lib/plaster-description'
import { calculateRender, DEFAULT_RENDER_SITUATIONS, SYSTEM_LABEL as RENDER_SYSTEM_LABEL } from '@/lib/render-units'
import { describeRender, describeRenderShort } from '@/lib/render-description'
import { calculateInsulation, DEFAULT_INSULATION_SITUATIONS } from '@/lib/wall-insulation-units'
import { describeInsulation, describeInsulationShort } from '@/lib/wall-insulation-description'
import { plasterRoomsFromScope, renderFromScope, insulationFromScope } from '@/lib/plaster-ai'
import { plural } from '@/lib/ai-spec'

export const PLASTER_AI_IDS = new Set(['plaster-rooms', 'plaster-render', 'plaster-insul-wall'])

type RawLine = { id: string; name: string; category: AssemblyLayerDef['category']; unit: string; unitCost: number; qty: number }
const asLayers = (lines: RawLine[]): AssemblyLayerDef[] =>
  lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: 0 }))

/** Prices the plastering calculator `canonicalId` from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function pricePlasterCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    switch (o.canonicalId) {
      case 'plaster-rooms': {
        const ai = plasterRoomsFromScope(o.spec)
        if (!ai) return null
        const r = calculatePlaster({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_PLASTER_SITUATIONS, rates: {}, towerWeeks: 0 })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestPlasterLabour(r.labour), labourTrades: o.labourTrades })
        const d = { rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })), occupied: ai.jobSituationId === 'occupied', towerWeeks: 0 }
        return {
          name: 'Internal plastering and boarding', qty: 1, location: '', description: describePlasterShort(d), detail: describePlaster(d), lines,
          calcState: { id: 'plaster-rooms', values: { AssemblyPlasterRoomsDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the plastering calculator from the rooms in your scope (${ai.rooms.map(x => x.name).join(', ')}: ${r.totalWallM2}m² of walls and ${r.totalCeilingM2}m² of ceiling, about ${Math.round(r.totalPlasterHours)} plasterer hours) with the calculator's standard settings and sample rates.${ai.typicalRooms.length > 0 ? ` No size was given for ${ai.typicalRooms.join(', ')}.` : ''}${ai.usualFinish.length > 0 ? ` The scope did not say what the walls or ceiling get in ${ai.usualFinish.join(', ')}, so dot-and-dab and skim to the walls and board and skim to the ceiling were used.` : ''} Vaulted ceilings are priced with their own tasks, not here. Open the calculator to check the rooms and finishes.`,
        }
      }
      case 'plaster-render': {
        const ai = renderFromScope(o.spec)
        if (!ai) return null
        const r = calculateRender({ walls: ai.walls, jobSituationId: ai.jobSituationId, situations: DEFAULT_RENDER_SITUATIONS, rates: {}, scaffold: ai.scaffold })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestRenderLabour(r.labour), labourTrades: o.labourTrades })
        const d = { walls: r.walls.map(x => ({ name: x.name, parts: x.parts })), scaffold: ai.scaffold, totalAreaM2: r.totalAreaM2 }
        return {
          name: 'External render', qty: 1, location: '', description: describeRenderShort(d), detail: describeRender(d), lines,
          calcState: { id: 'plaster-render', values: { AssemblyRenderDemo: { walls: ai.walls, jobSituationId: ai.jobSituationId, scaffold: ai.scaffold } } },
          note: `Priced by the render calculator from the walls in your scope (${plural(ai.walls.length, 'wall', 'walls')}, ${r.totalAreaM2}m² to render, ${ai.walls.map(w => RENDER_SYSTEM_LABEL[w.system].split(':')[0].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}) with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not state: ${ai.assumed.join('; ')}.` : ''} ${ai.scaffold ? 'Scaffold is included because the scope asked for it.' : 'Scaffold is not included: price it under Site Setup.'} Windows and doors not mentioned are not taken out of the area. Open the calculator to check the walls.`,
        }
      }
      case 'plaster-insul-wall': {
        const ai = insulationFromScope(o.spec)
        if (!ai) return null
        const r = calculateInsulation({ walls: ai.walls, jobSituationId: ai.jobSituationId, situations: DEFAULT_INSULATION_SITUATIONS, rates: {} })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestInsulationLabour(r.labour), labourTrades: o.labourTrades })
        const d = { walls: r.walls.map(x => ({ name: x.name, parts: x.parts, depthMm: x.depthMm })) }
        return {
          name: 'Wall insulation and backing', qty: 1, location: '', description: describeInsulationShort(d), detail: describeInsulation(d), lines,
          calcState: { id: 'plaster-insul-wall', values: { AssemblyWallInsulationDemo: { walls: ai.walls, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the wall insulation calculator from the walls in your scope (${plural(ai.walls.length, 'wall', 'walls')}, ${r.totalAreaM2}m² insulated and lined) with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not state: ${ai.assumed.join('; ')}.` : ''} The skim over the board is part of the plastering line. Have the condensation risk assessed and the walls checked for damp. Open the calculator to check the walls and thicknesses.`,
        }
      }
      default: return null
    }
  } catch { return null }
}
