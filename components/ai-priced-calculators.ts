// Which calculators the AI quote can price on its own, and how: each takes only the few sizes the scope states (lib/assembly-basics.ts says which are
// needed) and prices with the calculator's own standard settings and sample rates. Add a calculator here, and to BASICS_NEEDS, to teach the AI quote
// to price it.

import { priceCavityWallFromBasics } from '@/components/AssemblyCavityWallDemo'
import { priceStripFoundationFromBasics } from '@/components/AssemblyStripFoundationDemo'
import { priceRaftFoundationFromBasics } from '@/components/AssemblyRaftFoundationDemo'
import { pricePadFoundationFromBasics } from '@/components/AssemblyPadFoundationDemo'
import { pricePiledFoundationFromBasics } from '@/components/AssemblyPiledFoundationDemo'
import { priceUnderpinningFromBasics } from '@/components/AssemblyUnderpinningDemo'
import type { PricedFromBasics } from '@/components/assembly-basics-pricing'
import type { AssemblyBasics } from '@/lib/assembly-basics'
import type { BOLabourTrade } from '@/lib/back-office-types'

/** The priced calculator for a sub-phase (by canonical id), or null when it can't be priced from these sizes. */
export function priceFromBasics(canonicalId: string, basics: AssemblyBasics, labourTrades: BOLabourTrade[]): PricedFromBasics | null {
  switch (canonicalId) {
    case 'ew-cav-partial':
    case 'ew-cav-full':
      return basics.lengthMm && basics.heightMm
        ? priceCavityWallFromBasics({ lengthMm: basics.lengthMm, heightMm: basics.heightMm, insulation: canonicalId === 'ew-cav-full' ? 'wool' : 'pir', labourTrades })
        : null
    case 'fnd-strip': return priceStripFoundationFromBasics({ variant: 'strip', basics, labourTrades })
    case 'fnd-trench-fill': return priceStripFoundationFromBasics({ variant: 'trench-fill', basics, labourTrades })
    case 'fnd-raft': return priceRaftFoundationFromBasics({ basics, labourTrades })
    case 'fnd-pad': return pricePadFoundationFromBasics({ basics, labourTrades })
    case 'fnd-piled': return pricePiledFoundationFromBasics({ basics, labourTrades })
    case 'fnd-underpin': return priceUnderpinningFromBasics({ basics, labourTrades })
    default: return null
  }
}
