// The invoices made for a signed-in subcontractor (time that went on a bill), newest first, for their Invoices page. Only their own.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { identifySub } from '@/lib/sub-invoice-server'

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createServiceRoleClient()
  const sub = await identifySub(admin, user)
  if (!sub) return NextResponse.json({ invoices: [] })
  const { data } = await admin.from('sub_invoices').select('id, invoice_number, period_start, period_end, total, created_at')
    .eq('owner_id', sub.ownerId).eq('contact_id', sub.contact.id).order('created_at', { ascending: false }).limit(100)
  return NextResponse.json({ invoices: (data ?? []).map(r => ({ id: r.id, number: r.invoice_number, periodStart: r.period_start, periodEnd: r.period_end, total: Number(r.total), createdAt: r.created_at })) })
}
