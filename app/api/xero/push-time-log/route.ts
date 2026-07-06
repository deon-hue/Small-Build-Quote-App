import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { XeroAccountCodes } from '@/lib/types'
import { DEFAULT_XERO_ACCOUNT_CODES } from '@/lib/types'

interface XeroInvoiceResponse { InvoiceID?: string }
interface XeroResponse { Invoices?: XeroInvoiceResponse[] }

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected — go to Settings → Integrations to connect.' }, { status: 400 })

    const { logId } = await req.json() as { logId: string }
    if (!logId) return NextResponse.json({ error: 'No logId provided' }, { status: 400 })

    const { data: log } = await sb.from('sub_admin_time_logs').select('*').eq('id', logId).single()
    if (!log) return NextResponse.json({ error: 'Time log not found' }, { status: 404 })

    // Load account codes
    const { data: settingsRow } = await sb.from('settings').select('xero_account_codes').eq('user_id', user.id).maybeSingle()
    const ac: XeroAccountCodes = { ...DEFAULT_XERO_ACCOUNT_CODES, ...((settingsRow?.xero_account_codes as XeroAccountCodes | null) ?? {}) }

    // Look up subcontractor's Xero contact
    let contact: Record<string, unknown> = { Name: 'Unknown Subcontractor' }
    if (log.contact_id) {
      const { data: sub } = await sb.from('clients').select('xero_contact_id, name').eq('id', log.contact_id).single()
      if (sub?.xero_contact_id) contact = { ContactID: sub.xero_contact_id }
      else if (sub?.name) contact = { Name: sub.name }
    }

    const rateLabel: Record<string, string> = { day: 'day', half_day: 'half day', hourly: 'hr', custom: '' }
    const lineDesc = [
      log.notes || 'Sub time',
      `— ${log.entry_date}`,
      `(${log.rate_type === 'hourly' && log.total_hours ? `${log.total_hours}h @ £${log.rate_amount}/${rateLabel.hourly}` : `£${log.rate_amount}/${rateLabel[log.rate_type] || log.rate_type}`})`,
    ].join(' ')

    const xeroPayload = {
      Type: 'ACCPAY',
      Contact: contact,
      Date: log.entry_date,
      DueDate: log.entry_date,
      Status: 'DRAFT',
      LineAmountTypes: 'Exclusive',
      Reference: log.notes || `Sub time log ${log.entry_date}`,
      LineItems: [{
        Description: lineDesc,
        Quantity: 1,
        UnitAmount: Number(log.amount),
        AccountCode: ac.billLabour || DEFAULT_XERO_ACCOUNT_CODES.billLabour,
        TaxType: 'NONE',
      }],
    }

    const res = await xeroFetch(conn, '/Invoices', { method: 'POST', body: JSON.stringify({ Invoices: [xeroPayload] }) })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Xero error: ${res.status} ${txt}` }, { status: 500 })
    }
    const data = await res.json() as XeroResponse
    const xeroBillId = data.Invoices?.[0]?.InvoiceID
    if (!xeroBillId) return NextResponse.json({ error: 'Xero did not return an invoice ID' }, { status: 500 })

    await sb.from('sub_admin_time_logs').update({ xero_bill_id: xeroBillId }).eq('id', logId)

    return NextResponse.json({ xeroBillId })
  } catch (e) {
    console.error('push-time-log error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
