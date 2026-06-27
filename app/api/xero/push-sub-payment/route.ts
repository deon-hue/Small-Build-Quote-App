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

    const { stageId } = await req.json() as { stageId: string }
    if (!stageId) return NextResponse.json({ error: 'No stageId provided' }, { status: 400 })

    // Load stage + contract + contact in one go
    const { data: stage } = await sb.from('sub_payment_stages').select('*').eq('id', stageId).single()
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

    const { data: contract } = await sb.from('sub_contracts').select('*').eq('id', stage.sub_contract_id).single()
    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

    // Load account codes
    const { data: settingsRow } = await sb.from('settings').select('xero_account_codes').eq('user_id', user.id).maybeSingle()
    const ac: XeroAccountCodes = { ...DEFAULT_XERO_ACCOUNT_CODES, ...((settingsRow?.xero_account_codes as XeroAccountCodes | null) ?? {}) }

    // Look up subcontractor's Xero contact
    let contact: Record<string, unknown> = { Name: 'Unknown Subcontractor' }
    if (contract.contact_id) {
      const { data: sub } = await sb.from('clients').select('xero_contact_id, name').eq('id', contract.contact_id).single()
      if (sub?.xero_contact_id) contact = { ContactID: sub.xero_contact_id }
      else if (sub?.name) contact = { Name: sub.name }
    }

    const xeroPayload = {
      Type: 'ACCPAY',
      Contact: contact,
      Date: stage.paid_date || new Date().toISOString().slice(0, 10),
      DueDate: stage.due_date || new Date().toISOString().slice(0, 10),
      Status: stage.paid_date ? 'AUTHORISED' : 'DRAFT',
      LineAmountTypes: 'Exclusive',
      Reference: contract.description || 'Subcontractor payment',
      LineItems: [{
        Description: `${contract.description ? contract.description + ' — ' : ''}${stage.description}`,
        Quantity: 1,
        UnitAmount: Number(stage.amount),
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

    // Store Xero bill ID on the stage
    await sb.from('sub_payment_stages').update({ xero_bill_id: xeroBillId }).eq('id', stageId)

    return NextResponse.json({ xeroBillId })
  } catch (e) {
    console.error('push-sub-payment error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
