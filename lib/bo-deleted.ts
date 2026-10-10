// Standard Back Office items (phases, sub-phases, tasks that come from the app's built-in list) that the company has deleted on purpose.
// The Back Office sync runs every time Back Office opens and used to put any missing standard item back; it now checks this list first, so a deleted
// standard item stays deleted. Items the company created itself have no canonical id and are never recorded here. See supabase/bo-deleted-items.sql.

export type BoDeletedKind = 'phase' | 'sub_phase' | 'task'

export interface BoDeletedRow { kind: string; canonical_id: string }

export interface BoDeletedIndex { has: (kind: BoDeletedKind, canonicalId: string | null | undefined) => boolean }

export function buildDeletedIndex(rows: BoDeletedRow[] | null | undefined): BoDeletedIndex {
  const set = new Set((rows ?? []).filter(r => r && r.kind && r.canonical_id).map(r => r.kind + '|' + r.canonical_id))
  return { has: (kind, canon) => !!canon && set.has(kind + '|' + canon) }
}

/** Which kind of item each Back Office table holds. */
export const BO_TABLE_KIND: Record<string, BoDeletedKind> = { bo_phases: 'phase', bo_sub_phases: 'sub_phase', bo_tasks: 'task' }
