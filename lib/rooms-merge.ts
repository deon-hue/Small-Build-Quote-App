// Handing the rooms found on the Take-off plan to a by-room calculator. A calculator room made from a plan room remembers which one (planRoomId) and what the plan said when it was last fed (planRoomSig); it follows the plan
// when the plan's room changes (its size, its doors and windows, its height), and is otherwise left as typed. A room whose plan room has gone (the walls were changed and it is no longer found, or it is not found for the moment)
// is left alone, never dropped or detached: a priced room must not disappear because the plan was redrawn. Pure, so it can be tested. Type-only imports (this is a plain module like the description files).

import type { PlanRoomInfo } from './rooms-from-walls'

/** What a calculator room made from the plan carries */
export interface PlanFollower { planRoomId?: string; planRoomSig?: string }

/** Everything about a plan room that a calculator uses: if it changes, a room following it is refitted. */
export const planRoomSig = (p: PlanRoomInfo): string => [p.areaM2, p.perimeterM, p.heightM, p.doors, p.windows, p.doorAreaM2, p.windowAreaM2].join('|')

/** The calculator rooms brought in step with the plan: each one made from a plan room that has changed is refitted by `refit` (which should leave what was typed, such as its name, alone). */
export function followPlanRooms<T extends PlanFollower>(existing: T[], plan: PlanRoomInfo[], refit: (room: T, p: PlanRoomInfo) => T): T[] {
  const byId = new Map(plan.map(p => [p.id, p]))
  let changed = false
  const out = existing.map(e => {
    if (!e.planRoomId) return e
    const p = byId.get(e.planRoomId)
    if (!p) return e
    const sig = planRoomSig(p)
    if (e.planRoomSig === sig) return e
    changed = true
    return { ...refit(e, p), planRoomId: p.id, planRoomSig: sig }
  })
  return changed ? out : existing
}

/** The plan rooms not yet in the calculator */
export const roomsNotAdded = (plan: PlanRoomInfo[], existing: PlanFollower[]): PlanRoomInfo[] => {
  const have = new Set(existing.map(e => e.planRoomId).filter(Boolean))
  return plan.filter(p => !have.has(p.id))
}

/** The kind of room the plastering calculator calls a plan room's kind */
export function plasterKindFor(kind?: string): string {
  switch (kind) {
    case 'kitchen': case 'living': case 'dining': case 'bedroom': case 'hall': case 'study': return kind
    case 'bathroom': case 'ensuite': case 'wc': return 'bathroom'
    default: return 'other'
  }
}

/** The kind of room the tiling calculators call a plan room's kind */
export function tilingKindFor(kind?: string): string {
  switch (kind) {
    case 'bathroom': return 'bathroom'
    case 'ensuite': return 'shower'
    case 'wc': return 'cloakroom'
    case 'kitchen': case 'utility': case 'hall': case 'living': return kind
    case 'dining': return 'living'
    default: return 'other'
  }
}

/** The kind of room the skirting and trim calculator calls a plan room's kind */
export function trimKindFor(kind?: string): string {
  switch (kind) {
    case 'kitchen': case 'living': case 'dining': case 'bedroom': case 'hall': case 'study': case 'utility': return kind
    case 'bathroom': case 'ensuite': case 'wc': return 'bathroom'
    default: return 'other'
  }
}

/** The kind of room the strip-out calculator calls a plan room's kind */
export function stripKindFor(kind?: string): string {
  switch (kind) {
    case 'kitchen': case 'bathroom': case 'ensuite': case 'utility': case 'living': case 'bedroom': case 'hall': return kind
    case 'wc': return 'cloakroom'
    case 'dining': return 'living'
    case 'study': return 'bedroom'
    default: return 'other'
  }
}

/** The kind of room the plumbing calculator calls a plan room's kind */
export function plumbingKindFor(kind?: string): string {
  switch (kind) {
    case 'kitchen': case 'bathroom': case 'ensuite': case 'utility': case 'living': case 'dining': case 'bedroom': case 'hall': case 'study': case 'garage': return kind
    case 'wc': return 'cloakroom'
    default: return 'other'
  }
}

/** The kind of room the electrics calculator calls a plan room's kind */
export function electricsKindFor(kind?: string): string {
  switch (kind) {
    case 'kitchen': case 'bathroom': case 'ensuite': case 'utility': case 'living': case 'dining': case 'bedroom': case 'hall': case 'study': case 'garage': return kind
    case 'wc': return 'cloakroom'
    default: return 'other'
  }
}

/** The wall area of a plan room: the length of wall round it by its height, less its doors and windows */
export const planWallAreaM2 = (p: PlanRoomInfo): number => +Math.max(0, p.perimeterM * p.heightM - p.doorAreaM2 - p.windowAreaM2).toFixed(2)
