import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { BillStatus } from '@/lib/types'

function mapXeroStatus(s: string): BillStatus {
  switch (s) {
    case 'PAID':       return 'paid'
    case 'AUTHORISED': return 'approved'
    case 'SUBMITTED':  return 'approved'
    case 'DRAFT':      return 'draft'
    case 'VOIDED':     return 'draft'
    default:           return 'approved'
  }
}

interface XeroInvoice { InvoiceID: string; Status?: string }
interface XeroResponse { Invoices?: XeroInvoice[] }

// POST /api/xero/sync-bills
// Batch-fetches all unpaid Xero-linked bills and updates any whose status changed.
// Called automatically on bills page load — silently no-ops if Xero not connected.
export async function POST() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ synced: [] })

    // Only check bills that are unpaid and have a Xero ID
    const { data: billRows } = await sb
      .from('bills')
      .select('id, xero_bill_id, status')
      .eq('user_id', user.id)
      .not('xero_bill_id', 'is', null)
      .neq('status', 'paid')

    if (!billRows?.length) return NextResponse.json({ synced: [] })

    // Batch fetch from Xero — comma-separated IDs, up to 100
    const ids = billRows.map(b => b.xero_bill_id as string).join(',')
    const res = await xeroFetch(conn, `/Invoices?IDs=${ids}`)
    if (!res.ok) return NextResponse.json({ synced: [] })

    const data = await res.json() as XeroResponse
    const xeroMap = new Map<string, string>()
    for (const inv of (data.Invoices ?? [])) {
      if (inv.InvoiceID && inv.Status) xeroMap.set(inv.InvoiceID, inv.Status)
    }

    // Update rows whose status changed
    const synced: Array<{ id: string; status: BillStatus }> = []
    for (const bill of billRows) {
      const xeroStatus = xeroMap.get(bill.xero_bill_id as string)
      if (!xeroStatus) continue
      const newStatus = mapXeroStatus(xeroStatus)
      if (newStatus !== bill.status) {
        await sb.from('bills').update({ status: newStatus }).eq('id', bill.id).eq('user_id', user.id)
        synced.push({ id: bill.id, status: newStatus })
      }
    }

    return NextResponse.json({ synced })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
