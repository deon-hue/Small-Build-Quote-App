// Quote templates: a named set of sub-phases picked from Back Office > Phases & Tasks. A template stores only which sub-phases are in it (their ids);
// the prices, tasks and calculators always come from Phases & Tasks, and the order always follows Phases & Tasks. The pure helpers here are used by the
// Templates screen and by the new-quote screen; the fetch/save helpers talk to the quote_templates table (supabase/quote-templates.sql).

import type { SupabaseClient } from '@supabase/supabase-js'

export interface QuoteTemplate {
  id: string
  name: string
  baseJobType: string
  subPhaseIds: string[]
}

/** one sub-phase of Phases & Tasks, as the new-quote screen reads it (lib/back-office-queries.ts fetchAllQuoteDefaults) */
export interface DefaultsRow { phaseName: string; phaseId: string; subPhaseName: string; subPhaseId: string }

/** The sub-phases of a template, in Phases & Tasks order, plus the ids that no longer exist there (deleted or switched off). */
export function pickTemplateRows<T extends { subPhaseId: string }>(allRows: T[], subPhaseIds: string[]): { rows: T[]; missingIds: string[] } {
  const want = new Set(subPhaseIds)
  const rows = allRows.filter(r => want.has(r.subPhaseId))
  const have = new Set(rows.map(r => r.subPhaseId))
  return { rows, missingIds: Array.from(want).filter(id => !have.has(id)) }
}

/** The standard job types (all but "Other", which always starts blank) that do not have a template yet. */
export function missingStandardNames(templates: { name: string }[], jobTypes: readonly string[]): string[] {
  const have = new Set(templates.map(t => t.name.trim().toLowerCase()))
  return jobTypes.filter(j => j !== 'Other' && !have.has(j.toLowerCase()))
}

/** Ids with duplicates and blanks removed, original order kept. */
export function cleanIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const out: string[] = []
  for (const id of ids) if (typeof id === 'string' && id && !out.includes(id)) out.push(id)
  return out
}

/** Tick or untick a whole set of sub-phases (a main phase's "select all"): all on if any are off, otherwise all off. */
export function toggleGroup(current: string[], groupIds: string[]): string[] {
  const have = new Set(current)
  const allOn = groupIds.length > 0 && groupIds.every(id => have.has(id))
  if (allOn) return current.filter(id => !groupIds.includes(id))
  return cleanIds([...current, ...groupIds])
}

export function toggleOne(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter(x => x !== id) : [...current, id]
}

// ── database ─────────────────────────────────────────────────────────────────

interface Row { id: string; name: string; base_job_type: string | null; sub_phase_ids: unknown }
const fromRow = (r: Row): QuoteTemplate => ({ id: r.id, name: r.name, baseJobType: r.base_job_type || 'Other', subPhaseIds: cleanIds(r.sub_phase_ids) })

/** The company's templates. `missingTable` is true when the SQL file has not been run yet. */
export async function fetchQuoteTemplates(sb: SupabaseClient): Promise<{ templates: QuoteTemplate[]; missingTable: boolean }> {
  const { data, error } = await sb.from('quote_templates').select('id, name, base_job_type, sub_phase_ids').order('name')
  if (error) return { templates: [], missingTable: true }
  return { templates: ((data ?? []) as Row[]).map(fromRow), missingTable: false }
}

export async function createQuoteTemplate(sb: SupabaseClient, userId: string, t: { name: string; baseJobType: string; subPhaseIds: string[] }): Promise<{ template: QuoteTemplate | null; error: string | null }> {
  const { data, error } = await sb.from('quote_templates')
    .insert({ user_id: userId, name: t.name.trim() || 'New template', base_job_type: t.baseJobType, sub_phase_ids: cleanIds(t.subPhaseIds) })
    .select('id, name, base_job_type, sub_phase_ids').single()
  return error ? { template: null, error: error.message } : { template: fromRow(data as Row), error: null }
}

export async function saveQuoteTemplate(sb: SupabaseClient, t: QuoteTemplate): Promise<string | null> {
  const { error } = await sb.from('quote_templates')
    .update({ name: t.name.trim() || 'Untitled template', base_job_type: t.baseJobType, sub_phase_ids: cleanIds(t.subPhaseIds), updated_at: new Date().toISOString() })
    .eq('id', t.id)
  return error ? error.message : null
}

export async function deleteQuoteTemplate(sb: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await sb.from('quote_templates').delete().eq('id', id)
  return error ? error.message : null
}
