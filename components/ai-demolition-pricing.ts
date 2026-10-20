// Pricing the four Demolition calculators from what the AI quote heard in the scope (see lib/demolition-ai.ts for the checking). Each uses the calculator's own engine, its own labour
// suggestions (priced at the company's trades), standard settings and sample rates, with the 20% profit line, exactly as the screen does before anything is edited. It also returns the
// calculator's saved state (`calcState`), so opening the calculator from the quote shows the same wall, rooms, waste or buildings, and a plain-English review note saying what was priced and
// what was assumed. Kept next to the screens (not in lib/) because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { suggestWallRemovalLabour, suggestStripOutLabour, suggestWasteLabour, suggestExternalDemoLabour } from '@/lib/flat-roof-labour'
import { costFromBasics } from '@/components/assembly-basics-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'
import { calculateWallRemoval, WALL_KINDS } from '@/lib/wall-removal-units'
import { describeWallRemoval, describeWallRemovalShort } from '@/lib/wall-removal-description'
import { calculateStripOut, STRIP_ITEMS } from '@/lib/strip-out-units'
import { describeStripOut, describeStripOutShort } from '@/lib/strip-out-description'
import { calculateWaste, WASTE_KINDS, type WasteKind } from '@/lib/waste-units'
import { describeWaste, describeWasteShort } from '@/lib/waste-description'
import { calculateExternalDemo, OUT_KINDS, type ExtItem, type OutKind, type HardKind } from '@/lib/external-demo-units'
import { describeExternalDemo, describeExternalDemoShort } from '@/lib/external-demo-description'
import { wallRemovalFromScope, stripOutFromScope, wasteFromScope, externalDemoFromScope } from '@/lib/demolition-ai'
import { plural } from '@/lib/ai-spec'
import { WALL_WORDS } from '@/components/AssemblyWallRemovalDemo'
import { unitWord } from '@/components/AssemblyStripOutDemo'

export const DEMOLITION_AI_IDS = new Set(['demo-wall-removal-calc', 'demo-strip-out-calc', 'demo-waste-skips-calc', 'demo-external-calc'])

type RawLine = { id: string; name: string; category: AssemblyLayerDef['category']; unit: string; unitCost: number; qty: number }
const asLayers = (lines: RawLine[]): AssemblyLayerDef[] =>
  lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: 0 }))

const WASTE_KIND_LIST = Object.keys(WASTE_KINDS) as WasteKind[]
const OUT_WORDS: Record<OutKind, string> = { shed: 'a timber shed', 'garage-brick': 'a brick or block garage', 'garage-prefab': 'a prefab concrete garage', conservatory: 'a conservatory', 'lean-to': 'a lean-to or carport' }
const HARD_WORDS: Record<HardKind, string> = { concrete: 'concrete', slabs: 'paving slabs', blocks: 'block paving', tarmac: 'tarmac' }
// the same words the Outbuildings & External screen uses for its quote description
const extWords = (x: ExtItem): string => {
  if (x.type === 'outbuilding') return `${OUT_WORDS[x.outKind]}, ${x.areaM2}m²`
  if (x.type === 'hard') return `${x.areaM2}m² of ${HARD_WORDS[x.hardKind]}`
  if (x.type === 'wall') return `${x.lengthM}m of ${x.name.trim() || 'garden wall'}`
  return `${x.lengthM}m of fencing`
}

/** Prices the demolition calculator `canonicalId` from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function priceDemolitionCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    switch (o.canonicalId) {
      case 'demo-wall-removal-calc': {
        const ai = wallRemovalFromScope(o.spec)
        if (!ai) return null
        const input = { kind: ai.kind, lengthM: ai.lengthM, heightM: ai.heightM, thicknessMm: ai.thicknessMm, structural: ai.structural, propWeeks: 1, engineer: true, buildingControl: true, makeGoodPlaster: true, makeGoodFloor: true, boxInSteel: true, dustProtection: true, services: ai.services }
        const r = calculateWallRemoval(input)
        const isStructural = ai.structural && ai.kind !== 'stud'
        const suggestions = suggestWallRemovalLabour({
          wallVolumeM3: r.wallVolumeM3, hoursPerM3: WALL_KINDS[ai.kind].hoursPerM3, structural: isStructural, lengthM: ai.lengthM, propWeeks: 1, plasterM2: r.plasterM2, floorM2: r.floorM2, boxInLm: isStructural ? ai.lengthM : 0, dustProtection: true,
        })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions, labourTrades: o.labourTrades })
        const d = { wallWords: WALL_WORDS[ai.kind], lengthM: ai.lengthM, heightM: ai.heightM, thicknessMm: ai.thicknessMm, structural: isStructural, propWeeks: 1, engineer: true, buildingControl: true, boxInSteel: true, makeGoodPlaster: true, makeGoodFloor: true, dustProtection: true, skips: r.skips, services: ai.services, beamLabel: r.beamLabel }
        return {
          name: 'Wall removal', qty: 1, location: '', description: describeWallRemovalShort(d), detail: describeWallRemoval(d), lines,
          calcState: { id: 'demo-wall-removal-calc', values: { AssemblyWallRemovalDemo: { kind: ai.kind, lengthM: ai.lengthM, heightM: ai.heightM, thicknessMm: ai.thicknessMm, structural: ai.structural, services: ai.services } } },
          note: `Priced by the wall removal calculator as ${ai.lengthM}m of ${WALL_WORDS[ai.kind]}${isStructural ? `, load-bearing, with props for a week, an indicative ${r.beamLabel} steel beam, padstones, boxing in, an engineer's fee and a Building Control sum` : ''}, with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not say ${ai.assumed.join('; ')}: the calculator's standard was used.` : ''} The structural engineer designs the real beam, so check it. One wall is priced: if the scope has more than one opening, open the calculator and set its Qty or price the others separately.`,
        }
      }
      case 'demo-strip-out-calc': {
        const ai = stripOutFromScope(o.spec)
        if (!ai) return null
        const r = calculateStripOut({ rooms: ai.rooms, asbestosSurveys: ai.asbestosSurveys })
        const suggestions = suggestStripOutLabour(ai.rooms.map(rm => ({
          id: rm.id, name: rm.name.trim() || 'the room',
          parts: STRIP_ITEMS.filter(it => (rm.items[it.id] ?? 0) > 0).map(it => ({ qty: rm.items[it.id], unit: it.unit, what: it.name.toLowerCase(), rate: it.hours })),
        })))
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions, labourTrades: o.labourTrades })
        const d = {
          rooms: ai.rooms.map(rm => ({
            name: rm.name.trim() || 'Room',
            items: STRIP_ITEMS.filter(it => (rm.items[it.id] ?? 0) > 0).map(it => it.unit === 'nr' ? `${rm.items[it.id]} ${it.name.toLowerCase().replace(/ \(.*\)$/, '')}` : `${rm.items[it.id]}${unitWord(it, rm.items[it.id])} of ${it.name.toLowerCase().replace(/ \(.*\)$/, '')}`),
            dust: rm.dust,
            disconnects: [...(rm.disconnectPlumber ? ['a plumber disconnects and caps off the water and waste'] : []), ...(rm.disconnectElectrician ? ['an electrician disconnects and makes safe'] : [])],
          })),
          skips: r.skips, asbestosSurveys: ai.asbestosSurveys,
        }
        return {
          name: 'Strip-out', qty: 1, location: '', description: describeStripOutShort(d), detail: describeStripOut(d), lines,
          calcState: { id: 'demo-strip-out-calc', values: { AssemblyStripOutDemo: { rooms: ai.rooms, asbestosSurveys: ai.asbestosSurveys } } },
          note: `Priced by the strip-out calculator from the rooms in your scope (${ai.rooms.map(x => x.name).join(', ')}: ${plural(r.skips, 'skip', 'skips')}, about ${Math.round(r.totalHours)} labour hours) with the calculator's standard settings and sample rates.${ai.usualRooms.length > 0 ? ` The scope did not say what comes out of ${ai.usualRooms.join(', ')}, so the usual items for that kind of room were used.` : ''} Plumbers and electricians disconnect the wet rooms and kitchens, and the skips for these rooms are included. Open the calculator to check the items.`,
        }
      }
      case 'demo-waste-skips-calc': {
        const ai = wasteFromScope(o.spec)
        if (!ai) return null
        const r = calculateWaste({ items: ai.items, useGrab: ai.useGrab, hazardous: ai.hazardous, roadSkips: ai.roadSkips, roadWeeks: ai.roadWeeks })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: [], labourTrades: o.labourTrades })
        const d = { kinds: WASTE_KIND_LIST.filter(k => r.byKind[k] > 0).map(k => `${WASTE_KINDS[k].label.split(' (')[0].toLowerCase()}, ${r.byKind[k].toFixed(1)}m³`), skips: r.skips, grabLoads: r.grabLoads, hazardous: ai.hazardous, roadPermits: ai.roadSkips > 0 && ai.roadWeeks > 0 }
        return {
          name: 'Waste and skips', qty: 1, location: '', description: describeWasteShort(d), detail: describeWaste(d), lines,
          calcState: { id: 'demo-waste-skips-calc', values: { AssemblyWasteDemo: { items: ai.items, useGrab: ai.useGrab, hazardous: ai.hazardous, roadSkips: ai.roadSkips, roadWeeks: ai.roadWeeks } } },
          note: `Priced by the waste calculator from the volumes in your scope (${r.totalM3.toFixed(1)}m³ of waste: ${r.grabLoads > 0 ? `${plural(r.grabLoads, 'grab lorry load', 'grab lorry loads')}${r.skips > 0 ? ' and ' : ''}` : ''}${r.skips > 0 ? plural(r.skips, 'skip', 'skips') : ''}) with the calculator's standard settings and sample rates. Heavy waste only part fills a skip, so rubble needs more skips than mixed waste. If the same waste is already in the strip-out or outbuilding lines, check it is not counted twice.`,
        }
      }
      case 'demo-external-calc': {
        const ai = externalDemoFromScope(o.spec)
        if (!ai) return null
        const r = calculateExternalDemo({ items: ai.items, machine: ai.machine, useGrab: ai.useGrab })
        const layers: AssemblyLayerDef[] = [...(r.excavatorDays > 0 ? diggerLayers(planDigger(r.excavatorDays, null), 'breaking out the concrete', 'Mini excavator with operator') : []), ...asLayers(r.lines)]
        const suggestions = suggestExternalDemoLabour(r.items.map(x => ({ id: x.id, name: x.name.toLowerCase(), hours: x.hours })))
        const lines = costFromBasics({ layers, suggestions, labourTrades: o.labourTrades })
        const d = {
          items: ai.items.map(x => ({ words: extWords(x), base: x.type === 'outbuilding' && x.breakBase && x.areaM2 > 0, asbestos: x.type === 'outbuilding' && !!OUT_KINDS[x.outKind].asbestosRoof })),
          machine: ai.machine && r.machineM3 > 0, skips: r.skipsGeneral + r.skipsInert, grabLoads: r.grabLoads,
        }
        return {
          name: 'Outbuildings and external demolition', qty: 1, location: '', description: describeExternalDemoShort(d), detail: describeExternalDemo(d), lines,
          calcState: { id: 'demo-external-calc', values: { AssemblyExternalDemoDemo: { items: ai.items, machine: ai.machine, useGrab: ai.useGrab } } },
          note: `Priced by the outbuildings and external calculator from the sizes in your scope (${ai.items.map(extWords).join('; ')}) with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not say: ${ai.assumed.join('; ')}.` : ''}${r.warnings.length > 0 ? ` ${r.warnings[0]}` : ''} Open the calculator to check the items and the bases.`,
        }
      }
      default: return null
    }
  } catch { return null }
}
