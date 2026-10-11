/**
 * Quote Intelligence — extracts phase patterns from a completed/accepted quote
 * and stores them in quote_intelligence so the AI reviewer gets smarter over time.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuotePhase, QuoteItem } from './types'
import { phaseFigures } from './quote-breakdown'

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
    // Real cost (quantities counted, catalogue lines and misc items included) and the sub-phase's own margin: a calculator sub-phase
    // carries its own, so the quote-wide markup would record the wrong margin for it
    const f = phaseFigures(p, markup)
    const totals = { labour: f.cost.labour, materials: f.cost.materials, plant: f.cost.plant, sub: f.cost.subcontractors, other: f.cost.other }
    const totalSell = f.sellTotal
    if (f.costTotal <= 0) continue  // skip empty phases

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
      markup_pct:        +f.marginPct.toFixed(2),
      items_summary:     summariseItems(p.items),
      quote_outcome:     outcome,
    })
  }

  if (!rows.length) return

  // Accepting a quote twice (or accepting after a decline) must not count it twice: replace what this quote recorded before
  if (quoteRef) await sb.from('quote_intelligence').delete().eq('user_id', userId).eq('quote_ref', quoteRef)

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
    .in('quote_outcome', ['won', 'completed'])
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
