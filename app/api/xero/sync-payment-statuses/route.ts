import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'

function xeroStatusToPayment(status: string): string {
  if (status === 'PAID') return 'paid'
  if (status === 'AUTHORISED' || status === 'DRAFT') return 'unpaid'
  return 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected — go to Settings → Integrations to connect.' }, { status: 400 })

    const { jobId } = await req.json() as { jobId: string }
    if (!jobId) return NextResponse.json({ error: 'No jobId provided' }, { status: 400 })

    // All job_costs for this job that have a linked Xero bill
    const { data: rows } = await sb
      .from('job_costs')
      .select('id, xero_invoice_id')
      .eq('job_id', jobId)
      .eq('user_id', user.id)
      .not('xero_invoice_id', 'is', null)

    if (!rows || rows.length === 0) return NextResponse.json({ updated: 0 })

    // Group cost IDs by their Xero bill ID (one bill → many cost lines)
    const byBill = new Map<string, string[]>()
    for (const r of rows) {
      if (!r.xero_invoice_id) continue
      const ids = byBill.get(r.xero_invoice_id) ?? []
      ids.push(r.id as string)
      byBill.set(r.xero_invoice_id as string, ids)
    }

    let updated = 0
    for (const [xeroBillId, costIds] of byBill.entries()) {
      const res = await xeroFetch(conn, `/Invoices/${xeroBillId}`)
      if (!res.ok) continue
      const data = await res.json() as { Invoices?: { Status?: string }[] }
      const xeroStatus = data.Invoices?.[0]?.Status ?? ''
      const paymentStatus = xeroStatusToPayment(xeroStatus)
      await sb.from('job_costs').update({ payment_status: paymentStatus }).in('id', costIds)
      updated += costIds.length
    }

    return NextResponse.json({ updated })
  } catch (e) {
    console.error('sync-payment-statuses error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
