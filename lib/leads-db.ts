// The one place a quote touches a lead: when a quote that was started from a lead (New Quote opened with ?lead=<id>) is first saved, the lead is linked to it and moves to Quoting.
// It must never get in the way of saving the quote, so it swallows every error. Rules for the stages are in lib/leads.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leadStatusOf } from './leads'

/** Links lead `leadId` to quote `quoteId` and, if the lead was New, Contacted or at the Site visit stage, moves it to Quoting (a Won or Lost lead keeps its stage). A lead that already has a quote keeps its first one. */
export async function linkLeadToQuote(sb: SupabaseClient, leadId: string | null | undefined, quoteId: string): Promise<void> {
  if (!leadId || !quoteId) return
  try {
    const { data } = await sb.from('quote_requests').select('status, quote_id').eq('id', leadId).maybeSingle()
    if (!data || data.quote_id) return
    const s = leadStatusOf(data.status as string)
    await sb.from('quote_requests').update({ quote_id: quoteId, ...(s === 'pending' || s === 'contacted' || s === 'visit' ? { status: 'quoting' } : {}) }).eq('id', leadId)
  } catch { /* a lead that cannot be linked must never stop a quote being saved */ }
}
