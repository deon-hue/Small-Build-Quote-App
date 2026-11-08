// Pricing the Timber Frame with Brick Outer Leaf and Structural Openings calculators from what the AI quote heard in the scope (see lib/structural-ai.ts for the checking). Each is opened out of sight on what the
// scope stated, with the calculator's standard for everything else, and priced by the calculator itself (components/ai-headless-pricing.ts), so the quote line, the wording, the saved state and the profit are
// exactly what the calculator gives when opened. The timber frame wall's labour is worked out from its own engine's guide (a carpenter, a bricklayer and a labourer) and put in the values it opens on; the
// structural openings calculator works its own labour out. The review note says what was priced and what was assumed. Called from components/ai-floor-roof-pricing.ts, which the quote page already asks for
// all of a scope's calculator lines together.

import type { BOLabourTrade } from '@/lib/back-office-types'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import { structuralFromScope, STRUCTURAL_AI_SET } from '@/lib/structural-ai'
import { calculateTimberFrameBrickGeometry, suggestTimberFrameBrickHours } from '@/lib/timber-frame-brick-wall'
import { newLabourLineId } from '@/components/assembly-ui'
import { priceCalculatorHeadless } from '@/components/ai-headless-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'

export { STRUCTURAL_AI_SET }

export async function priceStructuralOne(canonicalId: string, spec: unknown, labourTrades: BOLabourTrade[]): Promise<PricedCalc | null> {
  const s = structuralFromScope(canonicalId, spec)
  if (!s) return null
  // the wall's labour: the engine's own guide, on the trades Back Office has (a trade it does not have is left blank for the estimator to pick)
  if (s.wall) {
    try {
      const g = calculateTimberFrameBrickGeometry(s.wall.input)
      const h = suggestTimberFrameBrickHours(g, { insulation: s.wall.insulation, vcl: s.wall.vcl, lining: s.wall.lining, outerInsulationMm: s.wall.input.outerInsulationMm })
      const carp = labourTrades.find(t => /carpenter|joiner/i.test(t.name))
      const brickie = labourTrades.find(t => /bricklayer|brick layer|brickie/i.test(t.name))
      const labourer = labourTrades.find(t => /labourer|laborer/i.test(t.name))
      s.values.AssemblyTimberFrameBrickWallDemo.labourLines = [
        { id: newLabourLineId(), tradeId: carp?.id ?? '', task: 'Make and erect the timber frame, sheathing and membrane', hours: h.carpenter },
        { id: newLabourLineId(), tradeId: brickie?.id ?? '', task: 'Build the brick outer leaf, ties, trays and barriers', hours: h.bricklayer },
        { id: newLabourLineId(), tradeId: labourer?.id ?? '', task: 'Labourer serving the carpenter and bricklayer', hours: h.labourer },
      ]
    } catch { /* the calculator's own starting labour is used */ }
  }
  const calcState: CalcStateSnapshot = { id: canonicalId, values: s.values }
  const r = await priceCalculatorHeadless({ canonicalId, calcState, labourTrades })
  if (!r) return null
  const note = `Priced by its calculator for ${s.what}, with the calculator's standard settings and sample rates.${s.assumed.length > 0 ? ` The scope did not say ${s.assumed.join('; ')}: the calculator's standard was used.` : ''}${canonicalId === 'sf-openings-calc' ? ' The steel sections are indicative: the structural engineer designs the real ones.' : ' The frame, headers and brick ties are for the designer to confirm.'} Check it, and open the calculator to adjust.`
  return { name: r.name, qty: r.qty, location: r.location ?? '', description: r.description, detail: r.detail, lines: r.lines, calcState: r.calcState ?? calcState, note }
}
