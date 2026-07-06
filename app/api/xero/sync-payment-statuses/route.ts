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
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { jobId } = await req.json() as { jobId: string }
    if (!jobId) return NextResponse.json({ error: 'No jobId provided' }, { status: 400 })

    // Fetch all job_costs for this job (including document_id as fallback link)
    const { data: rows } = await sb
      .from('job_costs')
      .select('id, xero_invoice_id, document_id')
      .eq('job_id', jobId)
      .eq('user_id', user.id)

    if (!rows || rows.length === 0) return NextResponse.json({ updated: 0 })

    // For costs that have no xero_invoice_id, look up via job_documents.xero_bill_id
    const missingDocIds = [
      ...new Set(
        rows
          .filter(r => !r.xero_invoice_id && r.document_id)
          .map(r => r.document_id as string)
      ),
    ]
    const docXeroMap: Record<string, string> = {}
    if (missingDocIds.length > 0) {
      const { data: docs } = await sb
        .from('job_documents')
        .select('id, xero_bill_id')
        .in('id', missingDocIds)
      for (const doc of docs ?? []) {
        if (doc.xero_bill_id) docXeroMap[doc.id as string] = doc.xero_bill_id as string
      }
    }

    // Build map: xero bill UUID → list of job_cost IDs to update
    const byBill = new Map<string, string[]>()
    for (const r of rows) {
      const xeroBillId = (r.xero_invoice_id as string | null) ?? docXeroMap[r.document_id as string]
      if (!xeroBillId) continue
      const ids = byBill.get(xeroBillId) ?? []
      ids.push(r.id as string)
      byBill.set(xeroBillId, ids)
    }

    if (byBill.size === 0) return NextResponse.json({ updated: 0 })

    // Fetch all Xero bill statuses in parallel
    const results = await Promise.all(
      Array.from(byBill.entries()).map(async ([xeroBillId, costIds]) => {
        const res = await xeroFetch(conn, `/Invoices/${xeroBillId}`)
        if (!res.ok) return null
        const data = await res.json() as { Invoices?: { Status?: string }[] }
        const xeroStatus = data.Invoices?.[0]?.Status ?? ''
        return { paymentStatus: xeroStatusToPayment(xeroStatus), costIds }
      })
    )

    // Write updates to DB
    let updated = 0
    for (const result of results) {
      if (!result) continue
      await sb.from('job_costs').update({ payment_status: result.paymentStatus }).in('id', result.costIds)
      updated += result.costIds.length
    }

    return NextResponse.json({ updated })
  } catch (e) {
    console.error('sync-payment-statuses error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
