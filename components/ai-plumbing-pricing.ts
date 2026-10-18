// Pricing the four plumbing calculators from what the AI quote heard in the scope (see lib/plumbing-ai.ts for the checking). Each uses the calculator's own engine, standard settings and sample rates, with
// the 20% profit line, exactly as the screen does before anything is edited. It also returns the calculator's saved state (`calcState`), so opening the calculator from the quote shows the same rooms,
// zones or runs, and a plain-English review note saying what was priced and what was assumed. Kept next to the screens (not in lib/) because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { costFromBasics, type PricedFromBasics } from '@/components/assembly-basics-pricing'
import { calculatePlumbing, DEFAULT_SITUATIONS as PLUMB_SITUATIONS } from '@/lib/plumbing-units'
import { describePlumbing, describePlumbingShort } from '@/lib/plumbing-description'
import { plumbingDescriptionInput } from '@/lib/plumbing-wording'
import { calculateHeating } from '@/lib/heating-units'
import { describeHeating, describeHeatingShort } from '@/lib/heating-description'
import { calculateUfh } from '@/lib/ufh-units'
import { describeUfh, describeUfhShort } from '@/lib/ufh-description'
import { LAID } from '@/components/AssemblyUfhDemo'
import { calculatePipework, RUN_TYPES, DEFAULT_SITUATIONS as PIPE_SITUATIONS } from '@/lib/pipework-units'
import { describePipework, describePipeworkShort } from '@/lib/pipework-description'
import { ROUTED_WORDS } from '@/components/AssemblyPipeworkDemo'
import { plumbingFromScope, heatingFromScope, ufhFromScope, pipeworkFromScope } from '@/lib/plumbing-ai'

export const PLUMBING_AI_IDS = new Set(['plumb-install', 'plumb-heating-plant', 'plumb-ufh', 'plumb-pipework'])

export interface PricedPlumbing extends PricedFromBasics {
  calcState: CalcStateSnapshot
  /** a sentence for the review note: what was priced, and what the calculator assumed */
  note: string
}

const asLayers = (lines: { id: string; name: string; category: 'subcontractors' | 'materials'; unit: string; unitCost: number; qty: number }[]): AssemblyLayerDef[] =>
  lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: 0 }))

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Prices the plumbing calculator `canonicalId` from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function pricePlumbingCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedPlumbing | null {
  try {
    switch (o.canonicalId) {
      case 'plumb-install': {
        const ai = plumbingFromScope(o.spec)
        if (!ai) return null
        const r = calculatePlumbing({ rooms: ai.rooms, wholeHouse: ai.wholeHouse, jobSituationId: ai.jobSituationId, situations: PLUMB_SITUATIONS, fittingRates: {}, specialRates: {}, wholeHouseRates: {}, pcRates: {} })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: [], labourTrades: o.labourTrades })
        const d = plumbingDescriptionInput(ai.rooms, ai.wholeHouse, r)
        return {
          name: 'Plumbing installation', qty: 1, location: '', description: describePlumbingShort(d), detail: describePlumbing(d), lines,
          calcState: { id: 'plumb-install', values: { AssemblyPlumbingDemo: { rooms: ai.rooms, wholeHouse: ai.wholeHouse, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the plumbing calculator from the rooms in your scope (${plural(r.roomCount, 'room', 'rooms')}, ${plural(r.totalFittings, 'fitting', 'fittings')}${r.specialCount > 0 ? `, ${plural(r.specialCount, 'special fitting', 'special fittings')}` : ''}) with the calculator's standard rates, an all-in price per fitting.${ai.usualRooms.length > 0 ? ` No fittings were stated for ${ai.usualRooms.join(', ')}, so those use the usual fittings for that kind of room.` : ''}${ai.rooms.some(x => x.supply === 'client') ? ' Sanitaryware, taps and radiators are left to the client unless the scope said we supply them.' : ''} Open the calculator to check the rooms and change anything.`,
        }
      }
      case 'plumb-heating-plant': {
        const ai = heatingFromScope(o.spec)
        if (!ai) return null
        const input = { source: 'combi' as const, boilerKw: ai.boilerKw, fit: ai.fit, flue: ai.flue, coreDrill: false, plumeKit: false, controls: ai.controls, magneticFilter: true, flush: true, radiators: ai.radiators, removeOld: true, commission: true, condensatePump: false, gasPipeLm: 0, heatingPipeLm: 0, condensateLm: 0 }
        const r = calculateHeating(input)
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: [], labourTrades: o.labourTrades })
        const d = { boilerLabel: r.boilerLabel, fit: ai.fit, flue: ai.flue, coreDrill: false, plumeKit: false, controls: ai.controls, magneticFilter: true, flush: true, removeOld: true, commission: true, condensatePump: false, gasPipeLm: 0, heatingPipeLm: 0, condensateLm: 0 }
        return {
          name: 'Heating system', qty: 1, location: '', description: describeHeatingShort(d), detail: describeHeating(d), lines,
          calcState: { id: 'plumb-heating-plant', values: { AssemblyHeatingDemo: { boilerKw: ai.boilerKw, fit: ai.fit, flue: ai.flue, controls: ai.controls, radiators: ai.radiators } } },
          note: `Priced by the heating calculator as a ${r.boilerLabel} gas boiler, ${ai.fit === 'replace' ? 'replacing the existing one' : 'in a new position'}, with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not say ${ai.assumed.join(', ')}: the calculator's standard was used.` : ''} Open the calculator to check it: the boiler size comes from a heat loss calculation, and radiators are priced in the plumbing rooms.`,
        }
      }
      case 'plumb-ufh': {
        const ai = ufhFromScope(o.spec)
        if (!ai) return null
        const r = calculateUfh({ zones: ai.zones, mixingGroup: true, manifoldsOverride: null, commission: true })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: [], labourTrades: o.labourTrades })
        const d = {
          zones: r.zoneSummaries.map(s => { const z = ai.zones.find(x => x.id === s.zoneId)!; return { name: s.name, areaM2: s.areaM2, laid: LAID[z.floor], spacingMm: z.spacingMm, loops: s.loops } }),
          totalAreaM2: r.totalAreaM2, manifolds: r.manifolds, mixingGroup: true, commission: true,
        }
        return {
          name: 'Underfloor heating', qty: 1, location: '', description: describeUfhShort(d), detail: describeUfh(d), lines,
          calcState: { id: 'plumb-ufh', values: { AssemblyUfhDemo: { zones: ai.zones } } },
          note: `Priced by the underfloor heating calculator from the areas in your scope (${r.totalAreaM2}m² in ${plural(r.zoneSummaries.length, 'zone', 'zones')}) with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` Distances to the manifold were not stated (${ai.assumed.join('; ')}).` : ''} The floor insulation and screed are priced separately, under Floors & Screeds. Open the calculator to check the zones.`,
        }
      }
      case 'plumb-pipework': {
        const ai = pipeworkFromScope(o.spec)
        if (!ai) return null
        const r = calculatePipework({ runs: ai.runs, valves: 0, boxingLm: 0, pressureTest: true, jobSituationId: ai.jobSituationId, situations: PIPE_SITUATIONS })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: [], labourTrades: o.labourTrades })
        const d = {
          runs: ai.runs.map(x => ({ name: x.name.trim() || RUN_TYPES[x.type].label, what: `${x.size}mm ${x.material} ${RUN_TYPES[x.type].short}`, lengthM: x.lengthM, routed: ROUTED_WORDS[x.route], lagged: x.lagged })),
          totalLm: r.totalLm, valves: 0, boxingLm: 0, pressureTest: true, hasGas: r.lmByType.gas > 0,
        }
        return {
          name: 'Pipework', qty: 1, location: '', description: describePipeworkShort(d), detail: describePipework(d), lines,
          calcState: { id: 'plumb-pipework', values: { AssemblyPipeworkDemo: { runs: ai.runs, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the pipework calculator from the lengths in your scope (${r.totalLm}m in ${plural(ai.runs.length, 'run', 'runs')}) at the calculator's standard rates. Sizes and materials the scope did not state use the usual first choice for that kind of pipe. Open the calculator to check the runs.`,
        }
      }
      default: return null
    }
  } catch { return null }
}
