// Our own account number with a supplier, looked up at the moment a price request or order is sent so it always follows what is in Contacts.
// By the supplier's contact when the request was made from one, otherwise by an exact (case-insensitive) match on the name when only one supplier or subcontractor has it.
// Quiet: an empty string when there is none, or when the database has no account_number column yet.

import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLike } from './email-match'

export async function accountNumberFor(sb: SupabaseClient, supplierId: string | undefined, supplierName: string, ownerId?: string): Promise<string> {
  try {
    if (supplierId) {
      let q = sb.from('clients').select('account_number').eq('id', supplierId)
      if (ownerId) q = q.eq('user_id', ownerId)
      const { data } = await q.maybeSingle()
      const a = String((data as { account_number?: string } | null)?.account_number ?? '').trim()
      if (a) return a
    }
    const name = (supplierName || '').trim()
    if (!name) return ''
    let q = sb.from('clients').select('account_number').ilike('name', escapeLike(name)).in('client_type', ['supplier', 'subcontractor'])
    if (ownerId) q = q.eq('user_id', ownerId)
    const { data } = await q.limit(2)
    return data && data.length === 1 ? String((data[0] as { account_number?: string }).account_number ?? '').trim() : ''
  } catch { return '' }
}
