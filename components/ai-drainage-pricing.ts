// Pricing the four Drainage & Services calculators from what the AI quote heard in the scope (see lib/drainage-ai.ts for the checking). Each uses the calculator's own engine, its own labour
// suggestions (priced at the company's trades), standard settings and sample rates, with the 20% profit line and the digger priced in days on site, exactly as the screen does before anything
// is edited. It also returns the calculator's saved state (`calcState`), so opening the calculator from the quote shows the same runs, areas or services, and a plain-English review note saying
// what was priced and what was assumed. Kept next to the screens (not in lib/) because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { suggestUndergroundDrainageLabour, suggestSoakawayLabour, suggestServicesLabour, suggestDrainItemsLabour } from '@/lib/flat-roof-labour'
import { costFromBasics, type PricedFromBasics } from '@/components/assembly-basics-pricing'
import { calculateDrain, DRAIN_USE_LABEL, DRAIN_PIPE, SURFACE_LABEL as DRAIN_SURFACE_LABEL } from '@/lib/drain-units'
import { describeDrain, describeDrainShort } from '@/lib/drain-description'
import { calculateSoakaway } from '@/lib/soakaway-units'
import { describeSoakaway, describeSoakawayShort } from '@/lib/soakaway-description'
import { calculateServices, UTILITIES, WORK_LABEL, SURFACE_LABEL as SVC_SURFACE_LABEL } from '@/lib/services-units'
import { describeServices, describeServicesShort } from '@/lib/services-description'
import { calculateDrainItems, drainItemWords, DRAIN_ITEMS } from '@/lib/drain-items-units'
import { describeDrainItems, describeDrainItemsShort } from '@/lib/drain-items-description'
import { drainFromScope, drainItemsFromScope, soakawayFromScope, servicesFromScope } from '@/lib/drainage-ai'
import { plural } from '@/lib/ai-spec'
import { KIND_WORDS } from '@/components/AssemblySoakawayDemo'
import { UTILITY_WORDS } from '@/components/AssemblyServicesDemo'

export const DRAINAGE_AI_IDS = new Set(['drain-runs', 'drain-chambers-gullies', 'drain-soakaway', 'drain-services'])

export interface PricedCalc extends PricedFromBasics {
  calcState: CalcStateSnapshot
  /** a sentence for the review note: what was priced, and what the calculator assumed */
  note: string
}

type RawLine = { id: string; name: string; category: AssemblyLayerDef['category']; unit: string; unitCost: number; qty: number; wastePct?: number }
const asLayers = (lines: RawLine[], digger?: { days: number; why: string }): AssemblyLayerDef[] => [
  ...(digger && digger.days > 0 ? diggerLayers(planDigger(digger.days, null), digger.why, 'Mini excavator with operator') : []),
  ...lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: l.wastePct ?? 0 })),
]

/** Prices the drainage calculator `canonicalId` from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function priceDrainageCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    switch (o.canonicalId) {
      case 'drain-runs': {
        const ai = drainFromScope(o.spec)
        if (!ai) return null
        const r = calculateDrain({ runs: ai.runs, chambers: ai.chambers, connectExisting: ai.connectExisting, connectSewer: ai.connectSewer, cctv: ai.cctv, importBackfill: ai.importBackfill })
        const suggestions = suggestUndergroundDrainageLabour({
          layLm: r.totalLm, handDigM3: r.handM3, gravelM3: r.gravelM3, backfillM3: r.backfillM3, softM2: r.reinstateM2.soft, pavingM2: r.reinstateM2.paving, tarmacM2: r.reinstateM2.tarmac, concreteM2: r.reinstateM2.concrete,
        })
        const lines = costFromBasics({ layers: asLayers(r.lines, { days: r.excavatorDays, why: 'digging the drain trenches' }), suggestions, labourTrades: o.labourTrades })
        const priced = ai.runs.filter(x => x.lengthM > 0 && DRAIN_PIPE[x.size] && x.depthMm >= 300)
        const d = {
          runs: priced.map(x => ({ name: x.name.trim() || `${DRAIN_USE_LABEL[x.use]} drain`, what: `${x.size}mm ${DRAIN_USE_LABEL[x.use].toLowerCase()}`, lengthM: x.lengthM, depthMm: x.depthMm, dug: x.dig === 'machine' ? 'by machine' : 'by hand', crosses: DRAIN_SURFACE_LABEL[x.surface].split(' (')[0].toLowerCase() })),
          totalLm: r.totalLm, chambers: [] as string[],
          connectExisting: 0, connectSewer: 0, cctv: ai.cctv, importBackfill: ai.importBackfill,
        }
        return {
          name: 'Underground drainage', qty: 1, location: '', description: describeDrainShort(d), detail: describeDrain(d), lines,
          calcState: { id: 'drain-runs', values: { AssemblyDrainageDemo: { runs: ai.runs, chambers: ai.chambers, connectExisting: ai.connectExisting, connectSewer: ai.connectSewer, cctv: ai.cctv, importBackfill: ai.importBackfill } } },
          note: `Priced by the drainage calculator from what your scope states (${r.totalLm > 0 ? `${r.totalLm}m of drain in ${plural(ai.runs.length, 'run', 'runs')}` : 'no drain lengths'}${ai.cctv ? ', a CCTV survey' : ''}) with the calculator's standard settings and sample rates; the digger is priced in days on site.${ai.assumed.length > 0 ? ` The scope did not state: ${ai.assumed.join('; ')}.` : ''} The inspection chambers, manholes, gullies and connections are not in this line: they are priced by the Chambers, Gullies & Connections line.${ai.strayItems ? ' The AI named chambers or connections with the runs and none are priced here: check that line has them.' : ''} Open the calculator to check the runs and depths.`,
        }
      }
      case 'drain-chambers-gullies': {
        const ai = drainItemsFromScope(o.spec)
        if (!ai) return null
        const r = calculateDrainItems({ items: ai.items, diggerWithRuns: false })
        const suggestions = suggestDrainItemsLabour(r.labour)
        const lines = costFromBasics({ layers: asLayers(r.lines, { days: r.excavatorDays, why: 'digging the chamber and gully pits' }), suggestions, labourTrades: o.labourTrades })
        const words = { items: drainItemWords(ai.items) }
        const parts = Object.entries(r.counts).filter(([, n]) => n > 0).map(([k, n]) => plural(n, DRAIN_ITEMS[k as keyof typeof DRAIN_ITEMS].word[0], DRAIN_ITEMS[k as keyof typeof DRAIN_ITEMS].word[1]))
        return {
          name: 'Drainage chambers, gullies and connections', qty: 1, location: '', description: describeDrainItemsShort(words), detail: describeDrainItems(words), lines,
          calcState: { id: 'drain-chambers-gullies', values: { AssemblyDrainItemsDemo: { items: ai.items } } },
          note: `Priced by the chambers, gullies and connections calculator from what your scope states (${parts.join(', ')}) with the calculator's standard settings and sample rates; the digger is priced in days on site, and is also priced in the drain runs line, so check its days are not counted twice.${ai.assumed.length > 0 ? ` The scope did not state: ${ai.assumed.join('; ')}.` : ''} A sewer connection is a provisional sum: the water company's own charges are separate. The depths decide the extension sections and rings, so open the calculator to check them.`,
        }
      }
      case 'drain-soakaway': {
        const ai = soakawayFromScope(o.spec)
        if (!ai) return null
        const r = calculateSoakaway({ roofAreaM2: ai.roofAreaM2, pavedAreaM2: ai.pavedAreaM2, storageDepthMm: 20, storageOverrideM3: ai.storageOverrideM3, kind: ai.kind, count: ai.count, channelLightLm: ai.channelLightLm, channelHeavyLm: ai.channelHeavyLm, gullies: ai.gullies, downpipeConnections: ai.downpipeConnections, waterButts: ai.waterButts })
        const backfillM3 = Math.max(r.holeM3 - r.installedM3, 0)
        const suggestions = suggestSoakawayLabour({
          kind: ai.kind, installedM3: r.installedM3, rings: r.rings, wrapM2: r.wrapM2, silts: ai.count, backfillM3: Math.round(backfillM3 * 100) / 100,
          channelLm: ai.channelLightLm + ai.channelHeavyLm, gullies: ai.gullies, downpipeConnections: ai.downpipeConnections, waterButts: ai.waterButts,
        })
        const lines = costFromBasics({ layers: asLayers(r.lines, { days: r.excavatorDays, why: 'digging the soakaway' }), suggestions, labourTrades: o.labourTrades })
        const d = { count: r.storageM3 > 0 ? ai.count : 0, kindWords: KIND_WORDS[ai.kind], kind: ai.kind, roofAreaM2: ai.roofAreaM2, pavedAreaM2: ai.pavedAreaM2, storageM3: r.storageM3, channelLightLm: ai.channelLightLm, channelHeavyLm: ai.channelHeavyLm, gullies: ai.gullies, downpipeConnections: ai.downpipeConnections, waterButts: ai.waterButts }
        const parts: string[] = []
        if (r.storageM3 > 0) parts.push(`${plural(ai.count, 'soakaway', 'soakaways')} holding ${r.storageM3}m³, sized from ${ai.storageOverrideM3 !== null ? 'the storage volume in the scope' : `${ai.roofAreaM2 + ai.pavedAreaM2}m² of roof and paving`}`)
        if (ai.channelLightLm + ai.channelHeavyLm > 0) parts.push(`${ai.channelLightLm + ai.channelHeavyLm}m of channel drain`)
        if (ai.gullies > 0) parts.push(plural(ai.gullies, 'yard gully', 'yard gullies'))
        if (ai.downpipeConnections > 0) parts.push(plural(ai.downpipeConnections, 'downpipe connection', 'downpipe connections'))
        if (ai.waterButts > 0) parts.push(plural(ai.waterButts, 'water butt', 'water butts'))
        return {
          name: 'Soakaway and rainwater', qty: 1, location: '', description: describeSoakawayShort(d), detail: describeSoakaway(d), lines,
          calcState: { id: 'drain-soakaway', values: { AssemblySoakawayDemo: { roofAreaM2: ai.roofAreaM2, pavedAreaM2: ai.pavedAreaM2, storageOverrideM3: ai.storageOverrideM3, kind: ai.kind, count: ai.count, channelLightLm: ai.channelLightLm, channelHeavyLm: ai.channelHeavyLm, gullies: ai.gullies, downpipeConnections: ai.downpipeConnections, waterButts: ai.waterButts } } },
          note: `Priced by the soakaway calculator from what your scope states (${parts.join(', ')}) with the calculator's standard settings and sample rates (20mm of rain to hold).${ai.assumed.length > 0 ? ` The scope did not say ${ai.assumed.join('; ')}.` : ''}${ai.unsized ? ' A soakaway was mentioned but no roof or paved area (or storage volume) was stated to size it, so none is priced: open the calculator and enter the areas.' : ''} The pipes from the downpipes to the soakaway are surface water runs in the drainage calculator. Percolation tests decide whether a soakaway works at all: check the design.`,
        }
      }
      case 'drain-services': {
        const ai = servicesFromScope(o.spec)
        if (!ai) return null
        const r = calculateServices({ items: ai.items })
        const suggestions = suggestServicesLabour({
          layLm: r.totalLm, handDigM3: r.handM3, sandM3: r.sandM3, backfillM3: r.backfillM3, softM2: r.reinstateM2.soft, pavingM2: r.reinstateM2.paving, tarmacM2: r.reinstateM2.tarmac, concreteM2: r.reinstateM2.concrete, boxes: r.boxes,
        })
        const lines = costFromBasics({ layers: asLayers(r.lines, { days: r.excavatorDays, why: 'digging the service trenches' }), suggestions, labourTrades: o.labourTrades })
        const d = {
          items: ai.items.map(x => ({
            name: x.name.trim() || `${UTILITIES[x.utility].label} ${WORK_LABEL[x.work].toLowerCase()}`, utility: UTILITY_WORDS[x.utility], work: x.work, lengthM: x.lengthM,
            dug: x.dig === 'machine' ? 'by machine' : 'by hand', crosses: SVC_SURFACE_LABEL[x.surface].split(' (')[0].toLowerCase(), box: x.box && UTILITIES[x.utility].boxEach > 0, laid: UTILITIES[x.utility].laid,
          })), totalLm: r.totalLm,
        }
        return {
          name: 'Services connections', qty: 1, location: '', description: describeServicesShort(d), detail: describeServices(d), lines,
          calcState: { id: 'drain-services', values: { AssemblyServicesDemo: { items: ai.items } } },
          note: `Priced by the services calculator from the supplies in your scope (${ai.items.map(x => `${UTILITIES[x.utility].label.toLowerCase()} ${WORK_LABEL[x.work].toLowerCase()}`).join(', ')}) with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` ${ai.assumed.join('; ')}.` : ''} The utility company's own charge for each is a provisional sum (typed over per service in the calculator): ask them for a quote. Open the calculator to check the trench lengths.`,
        }
      }
      default: return null
    }
  } catch { return null }
}
