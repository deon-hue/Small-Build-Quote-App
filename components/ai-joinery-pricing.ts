// Pricing the Joinery & Fixtures calculators and the Windows and Doors calculators from what the AI quote heard in the scope (see lib/joinery-ai.ts for the checking). Each is opened out of sight on the rooms,
// staircases, kitchens, runs, items or openings the scope stated, with the calculator's standard for everything else, and priced by the calculator itself (components/ai-headless-pricing.ts), so the quote line,
// the wording, the saved state and the profit are exactly what the calculator gives when opened. The review note says what was priced and what was assumed. Called from components/ai-floor-roof-pricing.ts, which
// the quote page already asks for all of a scope's calculator lines together.

import type { BOLabourTrade } from '@/lib/back-office-types'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import { joineryFromScope, JOINERY_AI_SET } from '@/lib/joinery-ai'
import { priceCalculatorHeadless } from '@/components/ai-headless-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'

export { JOINERY_AI_SET }

const WORDS: Record<string, string> = {
  'join-skirting-rooms': 'skirtings and trim', 'join-stairs-calc': 'staircase and balustrade', 'join-kitchen-fit': 'kitchen installation', 'join-furniture-calc': 'fitted furniture',
  'join-secondfix-calc': 'boxing-in, shelving and second fix', 'wd-windows': 'windows', 'wd-doors': 'doors',
}

export async function priceJoineryOne(canonicalId: string, spec: unknown, labourTrades: BOLabourTrade[]): Promise<PricedCalc | null> {
  const j = joineryFromScope(canonicalId, spec)
  if (!j) return null
  const calcState: CalcStateSnapshot = { id: canonicalId, values: j.values }
  const r = await priceCalculatorHeadless({ canonicalId, calcState, labourTrades })
  if (!r) return null
  const note = `Priced by its calculator as ${WORDS[canonicalId]} for ${j.what}, with the calculator's standard settings and sample rates.${j.assumed.length > 0 ? ` The scope did not say ${j.assumed.join('; ')}: the calculator's standard was used.` : ''} Open the calculator to check every line and change anything.`
  return { name: r.name, qty: r.qty, location: r.location ?? '', description: r.description, detail: r.detail, lines: r.lines, calcState: r.calcState ?? calcState, note }
}
