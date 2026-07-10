import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { contactId, weekStart, logIds } = await req.json() as { contactId: string; weekStart: string; logIds?: string[] }
    if (!contactId || !weekStart) return NextResponse.json({ error: 'contactId and weekStart required' }, { status: 400 })

    // Fetch time log entries — by explicit IDs (handles legacy rows without week_start)
    let logs: Record<string, unknown>[] = []
    if (logIds && logIds.length > 0) {
      const { data } = await sb.from('sub_admin_time_logs').select('*').in('id', logIds).eq('user_id', user.id)
      logs = (data ?? []) as Record<string, unknown>[]
    } else {
      const { data } = await sb.from('sub_admin_time_logs').select('*').eq('contact_id', contactId).eq('week_start', weekStart).eq('user_id', user.id)
      logs = (data ?? []) as Record<string, unknown>[]
    }
    if (logs.length === 0) return NextResponse.json({ error: 'No time log entries found for this week' }, { status: 404 })

    // Load account codes
    const { data: settingsRow } = await sb.from('settings').select('xero_account_codes').eq('user_id', user.id).maybeSingle()
    const ac = (settingsRow?.xero_account_codes as Record<string, string> | null) ?? {}
    const labourCode = ac.billLabour ?? '400'

    // Look up subcontractor's Xero contact
    const { data: sub } = await sb.from('clients').select('xero_contact_id, name').eq('id', contactId).single()
    const xeroContact = sub?.xero_contact_id
      ? { ContactID: sub.xero_contact_id }
      : { Name: sub?.name ?? 'Unknown Subcontractor' }

    // Week end date (Sunday)
    const weekEnd = new Date(weekStart + 'T12:00:00')
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().slice(0, 10)

    const startFmt = new Date(weekStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const endFmt = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    const lineItems = logs.map(log => {
      const entryDate = log.entry_date as string
      const dow = new Date(entryDate + 'T12:00:00').getDay()
      const dayLabel = DAY_LABELS[dow === 0 ? 6 : dow - 1]
      const rateType = log.rate_type as string
      const rateAmount = Number(log.rate_amount ?? 0)
      const totalHours = Number(log.total_hours ?? 0)
      const rateDesc = rateType === 'hourly'
        ? `${totalHours}h @ £${rateAmount}/hr`
        : rateType === 'half_day'
          ? `Half day @ £${rateAmount}`
          : `Day rate @ £${rateAmount}`
      const notes = (log.notes as string) || ''
      const dateLabel = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return {
        Description: `${dayLabel} ${dateLabel}${notes ? ` — ${notes}` : ''} (${rateDesc})`,
        Quantity: 1,
        UnitAmount: Number(log.amount ?? 0),
        AccountCode: labourCode,
        TaxType: 'NONE',
      }
    })

    const xeroPayload = {
      Type: 'ACCPAY',
      Contact: xeroContact,
      Date: weekEndStr,
      DueDate: weekEndStr,
      Status: 'DRAFT',
      LineAmountTypes: 'Exclusive',
      Reference: `Week of ${startFmt} – ${endFmt}`,
      LineItems: lineItems,
    }

    const res = await xeroFetch(conn, '/Invoices', {
      method: 'POST',
      body: JSON.stringify({ Invoices: [xeroPayload] }),
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Xero error: ${res.status} — ${txt.slice(0, 200)}` }, { status: 500 })
    }

    interface XeroInvResponse { Invoices?: { InvoiceID?: string }[] }
    const data = await res.json() as XeroInvResponse
    const xeroBillId = data.Invoices?.[0]?.InvoiceID
    if (!xeroBillId) return NextResponse.json({ error: 'Xero did not return an invoice ID' }, { status: 500 })

    // Update all entries with the Xero bill ID
    await sb.from('sub_admin_time_logs').update({ xero_bill_id: xeroBillId }).in('id', logs.map(l => l.id as string))

    return NextResponse.json({ xeroBillId })
  } catch (e) {
    console.error('push-time-log-week error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
