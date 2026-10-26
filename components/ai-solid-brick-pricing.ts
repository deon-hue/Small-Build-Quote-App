// Pricing the Solid Brick Wall (Victorian) calculator from what the AI quote heard in the scope (see lib/solid-brick-ai.ts for the checking). It uses the calculator's own engine and layers, its own
// labour guide (a bricklayer and a labourer, priced at the company's trades), standard settings and sample rates, with the 20% profit line, exactly as the screen does before anything is edited.
// It also returns the calculator's saved state (`calcState`), so opening the calculator from the quote shows the same wall, openings and labour, and a plain-English review note saying what was
// priced and what was assumed. Kept next to the screens (not in lib/) because it uses the same costing helpers they do.

import type { BOLabourTrade } from '@/lib/back-office-types'
import { toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { costFromBasics } from '@/components/assembly-basics-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'
import {
  calculateSolidBrickGeometry, buildSolidBrickLayers, suggestSolidBrickHours,
  BRICKS_PER_BRICKLAYER_HOUR,
} from '@/lib/solid-brick-wall'
import { describeSolidBrick, describeSolidBrickShort } from '@/lib/solid-brick-description'
import { solidBrickFromScope } from '@/lib/solid-brick-ai'

export const SOLID_BRICK_AI_IDS = new Set(['ew-solid-brick-victorian'])

/** Prices the solid brick wall calculator from the AI's "calc" object. Null when the scope described no wall length (or it did not check out). */
export function priceSolidBrickCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    if (o.canonicalId !== 'ew-solid-brick-victorian') return null
    const ai = solidBrickFromScope(o.spec)
    if (!ai) return null
    const g = calculateSolidBrickGeometry({ lengthMm: ai.lengthMm, heightMm: ai.heightMm, thickness: ai.thickness, backing: ai.backing, openings: ai.openings, movementJointSpacingMm: 0 })
    const layers = buildSolidBrickLayers(g, { wastePct: 10, facing: ai.facing, mortar: ai.mortar, lintel: ai.lintel, thickness: ai.thickness })
    const hours = suggestSolidBrickHours(g)
    const suggestions: LabourSuggestion[] = [
      { key: 'brick-wall', trade: 'bricklayer', task: 'Build solid brickwork', hours: hours.bricklayer, basis: `${Math.round(g.brickCount)} bricks at ${BRICKS_PER_BRICKLAYER_HOUR} an hour` },
      { key: 'brick-labourer', trade: 'labourer', task: 'Labourer serving the bricklayer', hours: hours.labourer, basis: 'half the bricklayer hours' },
    ]
    const lines = costFromBasics({ layers, suggestions, labourTrades: o.labourTrades })
    const d = {
      lengthMm: ai.lengthMm, heightMm: ai.heightMm, thickness: ai.thickness, bond: ai.bond, facing: ai.facing, backing: ai.backing, mortar: ai.mortar, lintel: ai.lintel,
      openingCount: ai.openings.length, outsideFinish: 'none', insideFinish: 'none', movementJointSpacingMm: 0,
    }
    const thickWords = { 'one': 'one brick', 'one-half': 'one and a half brick', 'two': 'two brick' }[ai.thickness]
    const labourLines = toLabourLines(suggestions, o.labourTrades, false).lines
    return {
      name: 'Solid brick wall', qty: 1, location: '', description: describeSolidBrickShort(d), detail: describeSolidBrick(d), lines,
      calcState: {
        id: 'ew-solid-brick-victorian',
        values: { AssemblySolidBrickWallDemo: { lengthMm: ai.lengthMm, heightMm: ai.heightMm, thickness: ai.thickness, bond: ai.bond, facing: ai.facing, backing: ai.backing, mortar: ai.mortar, lintel: ai.lintel, openings: ai.openings, labourLines } },
      },
      note: `Priced by the solid brick wall calculator as ${(ai.lengthMm / 1000).toFixed(2)}m of solid ${thickWords} wall, ${(ai.heightMm / 1000).toFixed(2)}m high (about ${Math.round(g.brickCount).toLocaleString('en-GB')} bricks, ${g.mortarM3.toFixed(1)}m³ of mortar${ai.openings.length > 0 ? `, ${ai.openings.length} opening${ai.openings.length === 1 ? '' : 's'}` : ''}), with the calculator's standard settings and sample rates.${ai.assumed.length > 0 ? ` The scope did not say ${ai.assumed.join('; ')}: the calculator's standard was used.` : ''} Foundations, scaffold and insulation are not in it: a new solid wall needs insulation inside or outside to meet Part L (price it under Plastering & Boarding, Wall Insulation). Open the calculator to check it.`,
    }
  } catch { return null }
}
