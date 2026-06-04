/**
 * Quote Intelligence — extracts phase patterns from a completed/accepted quote
 * and stores them in quote_intelligence so the AI reviewer gets smarter over time.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuotePhase, QuoteItem } from './types'

export interface QuoteIntelligenceRow {
  user_id:          string
  quote_ref?:       string
  job_type?:        string
  parent_phase?:    string
  phase_name:       string
  sub_phase_name?:  string
  task_name?:       string
  qty_value?:       number
  qty_unit?:        string
  labour_total:     number
  materials_total:  number
  plant_total:      number
  subcontract_total:number
  other_total:      number
  total_sell:       number
  markup_pct?:      number
  items_summary:    { category: string; desc: string }[]
  quote_outcome:    'won' | 'lost' | 'completed'
}

function phaseTotal(p: QuotePhase): { labour: number; materials: number; plant: number; sub: number; other: number } {
  let labour = 0, materials = 0, plant = 0, sub = 0, other = 0
  for (const i of p.items) {
    if (i.enabled === false) continue
    labour    += i.labour       ?? 0
    materials += i.materials    ?? 0
    plant     += i.plantHire    ?? 0
    sub       += i.subcontractors ?? 0
    other     += i.other        ?? 0
  }
  // add catalogue products
  for (const pr of p.products ?? []) {
    if (pr.enabled === false) continue
    materials += pr.costPrice ?? 0
  }
  // add plant catalogue
  for (const pl of p.plantItems ?? []) {
    if (pl.enabled === false) continue
    plant += pl.costPrice ?? 0
  }
  return { labour, materials, plant, sub, other }
}

function summariseItems(items: QuoteItem[]): { category: string; desc: string }[] {
  return items
    .filter(i => i.enabled !== false && i.desc?.trim())
    .map(i => ({ category: i.itemType ?? 'other', desc: i.desc.trim() }))
    .slice(0, 20)  // cap to keep DB rows lean
}

export async function extractQuoteIntelligence(
  sb:         SupabaseClient,
  userId:     string,
  phases:     QuotePhase[],
  jobType:    string,
  quoteRef:   string,
  markup:     number,
  outcome:    'won' | 'lost' | 'completed' = 'completed',
): Promise<void> {
  const rows: Omit<QuoteIntelligenceRow, never>[] = []

  for (const p of phases) {
    const totals = phaseTotal(p)
    const totalSell = (totals.labour + totals.materials + totals.plant + totals.sub + totals.other) * (1 + markup / 100)
    if (totalSell <= 0) continue  // skip empty phases

    // Derive qty from meta if available
    const qty  = p.meta?.measurements?.qty  ?? p.meta?.measurements?.area ?? undefined
    const unit = p.meta?.measurements?.unit ?? undefined

    rows.push({
      user_id:           userId,
      quote_ref:         quoteRef,
      job_type:          jobType || undefined,
      parent_phase:      p.parentPhase || undefined,
      phase_name:        p.phase,
      sub_phase_name:    p.taskName || undefined,
      task_name:         p.taskName || undefined,
      qty_value:         qty,
      qty_unit:          unit,
      labour_total:      +totals.labour.toFixed(2),
      materials_total:   +totals.materials.toFixed(2),
      plant_total:       +totals.plant.toFixed(2),
      subcontract_total: +totals.sub.toFixed(2),
      other_total:       +totals.other.toFixed(2),
      total_sell:        +totalSell.toFixed(2),
      markup_pct:        markup,
      items_summary:     summariseItems(p.items),
      quote_outcome:     outcome,
    })
  }

  if (!rows.length) return

  const { error } = await sb.from('quote_intelligence').insert(rows)
  if (error) console.error('[quote-intelligence] insert error:', error.message)
  else console.log(`[quote-intelligence] stored ${rows.length} phases from ${quoteRef}`)
}

export async function fetchSimilarPhases(
  sb:        SupabaseClient,
  userId:    string,
  phaseName: string,
  jobType?:  string,
  limit      = 5,
): Promise<QuoteIntelligenceRow[]> {
  let q = sb
    .from('quote_intelligence')
    .select('*')
    .eq('user_id', userId)
    .ilike('phase_name', `%${phaseName.split(' ').slice(0, 3).join('%')}%`)
    .order('created_at', { ascending: false })
    .limit(limit * 2)  // fetch extra, filter by job type below

  const { data } = await q
  if (!data) return []

  // Prefer same job type
  const sorted = [...data].sort((a, b) => {
    const aMatch = jobType && a.job_type === jobType ? -1 : 0
    const bMatch = jobType && b.job_type === jobType ? -1 : 0
    return aMatch - bMatch
  })

  return sorted.slice(0, limit) as QuoteIntelligenceRow[]
}
