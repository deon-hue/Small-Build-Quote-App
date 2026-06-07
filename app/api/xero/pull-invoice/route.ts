import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'

interface XeroInvoice { Status?: string; AmountDue?: number; AmountPaid?: number }
interface XeroResponse { Invoices?: XeroInvoice[] }

/** Map Xero's invoice status to our app's status */
function mapXeroStatus(s: string): 'draft' | 'sent' | 'paid' | 'overdue' {
  switch (s) {
    case 'PAID':       return 'paid'
    case 'AUTHORISED': return 'sent'
    case 'SUBMITTED':  return 'sent'
    case 'DRAFT':      return 'draft'
    case 'VOIDED':     return 'draft'
    default:           return 'sent'
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const body = await req.json() as { xeroInvoiceId?: string; invoiceId?: string }
    const { xeroInvoiceId, invoiceId } = body
    if (!xeroInvoiceId || !invoiceId) {
      return NextResponse.json({ error: 'xeroInvoiceId and invoiceId are required' }, { status: 400 })
    }

    const res = await xeroFetch(conn, `/Invoices/${xeroInvoiceId}`)
    if (!res.ok) {
      return NextResponse.json({ error: `Xero error (${res.status})` }, { status: res.status })
    }

    const data = await res.json() as XeroResponse
    const xeroInv = data?.Invoices?.[0]
    if (!xeroInv) return NextResponse.json({ error: 'Invoice not found in Xero' }, { status: 404 })

    const newStatus = mapXeroStatus(xeroInv.Status || '')

    // Update local record
    await sb.from('invoices')
      .update({ status: newStatus })
      .eq('id', invoiceId)
      .eq('user_id', user.id)

    return NextResponse.json({ status: newStatus, xeroStatus: xeroInv.Status })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
