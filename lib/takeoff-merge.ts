// Sending a take-off INTO a quote that already has phases: the take-off's sub-phases are added to the quote and everything already in it is kept. Pure (no imports), so it can be tested with plain Node.
//
// Three things can happen to a sub-phase coming from the take-off:
//   refresh   it was sent from this same take-off item before (the quote's sub-phase carries the same `takeoffItemId` and name): it is brought up to date IN PLACE, no question asked
//   conflict  the quote already has a sub-phase of that name (or the same Back Office sub-phase) that did not come from the take-off, e.g. one priced by hand: the estimator is asked, per existing sub-phase,
//             to KEEP BOTH (the take-off one goes in beside it, marked "(from take-off)") or REPLACE the quote's one
//   fresh     the quote has nothing like it: it is added at the end

export interface MergePhase {
  id: number
  phase: string
  parentPhase?: string
  /** set on a sub-phase made from a take-off item: the item's id, so a second send can refresh it */
  takeoffItemId?: string
  boSubPhaseId?: string
}
export type MergeChoice = 'both' | 'replace'
export interface MergePlan {
  /** incoming[i] refreshes existing[j] */
  refresh: { incoming: number; existing: number }[]
  /** an existing sub-phase and the incoming ones that clash with it */
  conflicts: { existing: number; incoming: number[] }[]
  /** incoming sub-phases with nothing like them in the quote */
  fresh: number[]
}

export const FROM_TAKEOFF_SUFFIX = ' (from take-off)'
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** a sub-phase's name without the "(from take-off)" mark a keep-both put on it */
export const baseName = (s: string) => norm(s.endsWith(FROM_TAKEOFF_SUFFIX) ? s.slice(0, -FROM_TAKEOFF_SUFFIX.length) : s)

/** Works out what sending `incoming` into `existing` would do, without changing anything. */
export function planTakeoffMerge(existing: MergePhase[], incoming: MergePhase[]): MergePlan {
  const usedExisting = new Set<number>()
  const refresh: MergePlan['refresh'] = []
  const claimed = new Set<number>()
  // 1. refresh: the same take-off item and the same sub-phase name, sent before
  incoming.forEach((inc, i) => {
    if (!inc.takeoffItemId) return
    const j = existing.findIndex((ex, k) => !usedExisting.has(k) && ex.takeoffItemId === inc.takeoffItemId && baseName(ex.phase) === baseName(inc.phase))
    if (j >= 0) { usedExisting.add(j); claimed.add(i); refresh.push({ incoming: i, existing: j }) }
  })
  // 2. conflicts: a sub-phase of the quote that did not come from the take-off and is the same sub-phase
  const byExisting = new Map<number, number[]>()
  const fresh: number[] = []
  incoming.forEach((inc, i) => {
    if (claimed.has(i)) return
    const j = existing.findIndex(ex => !ex.takeoffItemId && ((!!inc.boSubPhaseId && ex.boSubPhaseId === inc.boSubPhaseId) || baseName(ex.phase) === baseName(inc.phase)))
    if (j >= 0) byExisting.set(j, [...(byExisting.get(j) ?? []), i])
    else fresh.push(i)
  })
  const conflicts = [...byExisting.entries()].sort((a, b) => a[0] - b[0]).map(([existingIdx, inc]) => ({ existing: existingIdx, incoming: inc }))
  return { refresh, conflicts, fresh }
}

/**
 * Builds the quote's new list of sub-phases. `choices` says, for each conflict (by the existing sub-phase's index), keep both or replace; anything not given is KEEP BOTH. Everything in `existing` that is not
 * refreshed or replaced is kept, in its place; the order of the quote is never changed, and nothing is dropped except a sub-phase the estimator chose to replace.
 */
export function applyTakeoffMerge<P extends MergePhase>(existing: P[], incoming: P[], plan: MergePlan, choices: Record<number, MergeChoice>): P[] {
  const refreshedBy = new Map(plan.refresh.map(r => [r.existing, r.incoming]))
  const conflictAt = new Map(plan.conflicts.map(c => [c.existing, c.incoming]))
  const out: P[] = []
  existing.forEach((ex, j) => {
    const r = refreshedBy.get(j)
    if (r !== undefined) {
      // brought up to date where it stands: it keeps the name and group it has in the quote
      out.push({ ...incoming[r], phase: ex.phase, parentPhase: ex.parentPhase })
      return
    }
    const group = conflictAt.get(j)
    if (!group) { out.push(ex); return }
    if (choices[j] === 'replace') {
      for (const i of group) out.push({ ...incoming[i], parentPhase: ex.parentPhase })
      return
    }
    out.push(ex)
    for (const i of group) out.push({ ...incoming[i], phase: incoming[i].phase + FROM_TAKEOFF_SUFFIX, parentPhase: ex.parentPhase })
  })
  for (const i of plan.fresh) out.push(incoming[i])
  return out
}
