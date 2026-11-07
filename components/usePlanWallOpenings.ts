// The doors and windows drawn on a wall in Take-off, handed to a wall calculator's own opening list (stud and metal partitions, block walls, timber frame, solid block, solid brick, single skin brick):
// each drawn opening is added (a window with a 900 sill, a door with none), follows the drawing (position, size, kind) until it is typed over, goes when it is deleted on the plan, and an opening typed in
// the calculator with no drawing behind it is never touched. The cavity wall has its own copy of this because its openings carry a lintel choice. A calculator's own untouched sample opening (put there by a
// calculator opened before this) is taken off when the wall has drawn openings, because a window the drawing does not have contradicts the plan.

import { useEffect } from 'react'
import { mergePlanWallOpenings, planWallSig, type PlanWallOpening } from '@/lib/wall-openings'
import type { AssemblyOpening } from '@/lib/assembly-calc'
import { newOpeningId } from '@/components/assembly-ui'

/** the samples the wall calculators start with when nothing is known: a 1.2 x 1.2 window at 2.0m (900 sill), and the block partition's 826 x 2040 door at 2.0m */
function isUntouchedSample(o: AssemblyOpening): boolean {
  if (o.planId) return false
  if (o.kind === 'window') return o.widthMm === 1200 && o.heightMm === 1200 && o.offsetMm === 2000 && o.sillHeightMm === 900
  if (o.kind === 'door') return o.widthMm === 826 && o.heightMm === 2040 && o.offsetMm === 2000 && o.sillHeightMm === 0
  return false
}

export function usePlanWallOpenings(planOpenings: PlanWallOpening[] | undefined, setOpenings: (fn: (prev: AssemblyOpening[]) => AssemblyOpening[]) => void) {
  // a bi-fold is a door as far as these calculators know (they have no bi-fold of their own); a garage door stays a custom opening
  const plan = planOpenings?.map(p => (p.kind === 'bifold' ? { ...p, kind: 'door' as const } : p))
  const planKey = plan ? plan.map(planWallSig).join(';') + '#' + plan.map(p => p.id).join(',') : null
  useEffect(() => {
    if (!plan) return
    const make = (p: PlanWallOpening): AssemblyOpening => ({ id: newOpeningId(), kind: p.kind, widthMm: p.widthMm, heightMm: p.heightMm, offsetMm: p.offsetMm, sillHeightMm: p.kind === 'window' ? 900 : 0 })
    setOpenings(prev => mergePlanWallOpenings(prev.filter(o => !isUntouchedSample(o)), plan, make))
  }, [planKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
