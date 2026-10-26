// Pricing the floor and roof calculators from what the AI quote heard in the scope (see lib/floor-roof-ai.ts for the checking). Each is opened out of sight on the sizes and settings the scope stated, with the
// calculator's own standard for everything else, and priced by the calculator itself (components/ai-headless-pricing.ts), so the quote line, the wording, the saved state and the profit are exactly what the
// calculator gives when opened. The review note says what was priced and what was assumed. Async (a calculator is mounted for a moment each), so the quote page asks for all of a scope's floor and roof lines
// together before it builds the phases.

import type { BOLabourTrade, BOSubPhase } from '@/lib/back-office-types'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import { BUILT_ASSEMBLY_CANONICAL_IDS } from '@/lib/built-assembly-ids'
import { floorFromScope, roofFromScope, FLOOR_ROOF_AI_IDS as FLOOR_ROOF_ONLY_IDS, type AiFloor, type AiRoof } from '@/lib/floor-roof-ai'
import { JOINERY_AI_SET } from '@/lib/joinery-ai'
import { priceJoineryOne } from '@/components/ai-joinery-pricing'
import { priceCalculatorHeadless } from '@/components/ai-headless-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'

/** every calculator line priced by mounting the calculator itself: the floors and roofs, and (the same way) the Joinery & Fixtures and the Windows and Doors calculators */
export const FLOOR_ROOF_AI_IDS: ReadonlySet<string> = new Set<string>([...FLOOR_ROOF_ONLY_IDS, ...JOINERY_AI_SET])

const FLOOR_NS: Record<string, string> = {
  'fs-screeded-floor': 'AssemblyScreedFloorDemo',
  'fs-floor-overlay': 'AssemblyFloorOverlayDemo',
  'fs-concrete-slab': 'AssemblyConcreteSlabFloorDemo',
  'fs-insulated-concrete': 'AssemblyInsulatedConcreteFloorDemo',
  'fs-block-beam': 'AssemblyBlockBeamFloorDemo',
  'fs-suspended-timber': 'AssemblySuspendedTimberFloorDemo',
}
const FLOOR_WORDS: Record<string, string> = {
  'fs-screeded-floor': 'screeded floor', 'fs-floor-overlay': 'floor overlay', 'fs-concrete-slab': 'concrete slab floor',
  'fs-insulated-concrete': 'insulated concrete floor', 'fs-block-beam': 'block and beam floor', 'fs-suspended-timber': 'suspended timber floor',
}
const ROOF_WORDS: Record<string, string> = {
  'roof-structure': 'roof structure', 'roof-covering': 'roof covering', 'roof-rainwater': 'gutters and downpipes', 'roof-fascia-soffit': 'fascias and soffits', 'roof-flat': 'flat roof',
}
const TYPE_WORDS = { flat: 'a flat roof', mono: 'a mono-pitch roof', gable: 'a pitched roof with gable ends', hip: 'a hipped roof' } as const

const m = (mm: number) => (mm / 1000).toFixed(2).replace(/\.?0+$/, '')

/** The values to open a floor calculator on, as its own saved state. */
function floorState(canonicalId: string, f: AiFloor): CalcStateSnapshot {
  return { id: canonicalId, values: { [FLOOR_NS[canonicalId]]: f.values } }
}

/** The values to open a roof calculator on, as its own saved state (what each calculator names its own values). */
function roofState(canonicalId: string, r: AiRoof): CalcStateSnapshot {
  const values: Record<string, Record<string, unknown>> = {}
  const flat: Record<string, unknown> = { lengthMm: r.lengthMm, widthMm: r.widthMm }
  const pitched = (extra: Record<string, unknown> = {}) => ({ lengthMm: r.lengthMm, spanMm: r.widthMm, ...(r.pitchDeg !== null ? { pitchDeg: r.pitchDeg } : {}), ...extra })
  if (r.buildUp) { flat.buildUp = r.buildUp; flat.insulationMm = r.buildUp === 'cold' ? 125 : 120 }
  switch (canonicalId) {
    case 'roof-flat':
      if (r.flatCovering) flat.covering = r.flatCovering
      values.AssemblyFlatRoofDemo = flat
      break
    case 'roof-structure':
      values.AssemblyRoofStructureDemo = { type: r.type }
      if (r.type === 'flat') values.AssemblyFlatRoofDemo = flat
      else if (r.type === 'mono') values.AssemblyMonoPitchRoofDemo = pitched()
      else if (r.type === 'gable') values.AssemblyGableRoofDemo = pitched()
      else values.AssemblyHipRoofDemo = pitched()
      break
    case 'roof-covering':
      if (r.type === 'flat') {
        values.AssemblyRoofCoveringDemo = { family: 'flat' }
        if (r.flatCovering) flat.covering = r.flatCovering
        values.AssemblyFlatRoofDemo = flat
      } else {
        values.AssemblyRoofCoveringDemo = { family: 'pitched' }
        values.AssemblyPitchedRoofCoveringDemo = pitched({ roofType: r.type, ...(r.pitchedCovering ? { material: r.pitchedCovering } : {}) })
      }
      break
    case 'roof-rainwater': {
      // a pitched roof is guttered along its eaves: both long sides of a gable roof, all four sides of a hipped one (the flat roof's own start is one low edge against a wall)
      if (r.type === 'gable') flat.edges = { high: 'gutter', low: 'gutter', left: 'free', right: 'free' }
      else if (r.type === 'hip') flat.edges = { high: 'gutter', low: 'gutter', left: 'gutter', right: 'gutter' }
      if (r.downpipes !== null) flat.downpipes = r.downpipes
      if (r.drainSystem) flat.drainSystem = r.drainSystem
      values.AssemblyFlatRoofDemo = flat
      break
    }
    case 'roof-fascia-soffit': {
      const f: Record<string, unknown> = { lengthMm: r.lengthMm, widthMm: r.widthMm }
      if (r.type === 'gable') f.edges = { high: 'eaves', low: 'eaves', left: 'verge', right: 'verge' }
      else if (r.type === 'hip') f.edges = { high: 'eaves', low: 'eaves', left: 'eaves', right: 'eaves' }
      if (r.fasciaMaterial) { f.fasciaMaterial = r.fasciaMaterial; f.soffitMaterial = r.fasciaMaterial; f.bargeMaterial = r.fasciaMaterial }
      values.AssemblyFasciaSoffitDemo = f
      break
    }
  }
  return { id: canonicalId, values }
}

async function priceOne(canonicalId: string, spec: unknown, labourTrades: BOLabourTrade[]): Promise<PricedCalc | null> {
  const floor = floorFromScope(canonicalId, spec)
  const roof = floor ? null : roofFromScope(canonicalId, spec)
  if (!floor && !roof) return null
  const calcState = floor ? floorState(canonicalId, floor) : roofState(canonicalId, roof!)
  const r = await priceCalculatorHeadless({ canonicalId, calcState, labourTrades })
  if (!r) return null
  const assumed = floor ? floor.assumed : roof!.assumed
  const what = floor
    ? `${floor.areaM2.toFixed(1)}m² ${FLOOR_WORDS[canonicalId]}${floor.stated.length > 0 ? ` (${floor.stated.join(', ')})` : ''}`
    : `${ROOF_WORDS[canonicalId]} for ${TYPE_WORDS[roof!.type]}, ${m(roof!.lengthMm)} × ${m(roof!.widthMm)}m`
  const note = `Priced by its calculator as a ${what}, with the calculator's standard settings and sample rates.${assumed.length > 0 ? ` The scope did not say ${assumed.join('; ')}: the calculator's standard was used.` : ''} Open the calculator to check it and change anything.`
  return { name: r.name, qty: r.qty, location: r.location ?? '', description: r.description, detail: r.detail, lines: r.lines, calcState: r.calcState ?? calcState, note }
}

/**
 * Prices every floor and roof calculator line in a scope, one at a time. `key` is the scope's own phase object, so the quote page can find each result again. A line the scope gave no size for,
 * or a calculator that did not come up, is null (the quote then shows "Priced by its calculator. Open the calculator ...").
 */
export async function priceFloorRoofPhases(
  scopePhases: { phase: string; calc?: unknown }[], boSubPhases: BOSubPhase[], labourTrades: BOLabourTrade[],
): Promise<Map<object, PricedCalc | null>> {
  const out = new Map<object, PricedCalc | null>()
  for (const sp of scopePhases) {
    if (sp.calc === undefined || sp.calc === null) continue
    const calcSub = boSubPhases.filter(s => s.name === sp.phase).find(s => s.canonical_id && BUILT_ASSEMBLY_CANONICAL_IDS.has(s.canonical_id))
    const id = calcSub?.canonical_id
    if (!id || !FLOOR_ROOF_AI_IDS.has(id)) continue
    out.set(sp, await (JOINERY_AI_SET.has(id) ? priceJoineryOne(id, sp.calc, labourTrades) : priceOne(id, sp.calc, labourTrades)).catch(() => null))
  }
  return out
}
