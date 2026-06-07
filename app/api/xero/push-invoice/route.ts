import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { Invoice } from '@/lib/types'

interface XeroValidationError { Message: string }
interface XeroElement { ValidationErrors?: XeroValidationError[] }
interface XeroErrorResponse { Detail?: string; Elements?: XeroElement[] }
interface XeroInvoiceResponse { InvoiceID?: string }
interface XeroResponse { Invoices?: XeroInvoiceResponse[] }

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected — go to Settings → Integrations to connect.' }, { status: 400 })

    const body = await req.json() as { invoice?: Invoice }
    const invoice = body.invoice
    if (!invoice) return NextResponse.json({ error: 'No invoice provided' }, { status: 400 })

    const xeroStatus = invoice.status === 'draft' ? 'DRAFT' : 'AUTHORISED'

    const lineItems = invoice.lineItems.map(l => ({
      Description: l.desc || 'Works',
      Quantity: l.qty,
      UnitAmount: l.unitPrice,
      AccountCode: '200',
      TaxType: invoice.vatIncluded ? 'OUTPUT2' : 'NONE',
    }))

    const xeroPayload: Record<string, unknown> = {
      Type: 'ACCREC',
      Contact: { Name: invoice.clientName || 'Unknown Client' },
      Date: invoice.issueDate,
      DueDate: invoice.dueDate || invoice.issueDate,
      InvoiceNumber: invoice.ref,
      LineItems: lineItems,
      Status: xeroStatus,
    }

    // Include InvoiceID to update an existing Xero invoice rather than create a duplicate
    if (invoice.xeroInvoiceId) {
      xeroPayload.InvoiceID = invoice.xeroInvoiceId
    }

    const res = await xeroFetch(conn, '/Invoices', {
      method: 'POST',
      body: JSON.stringify({ Invoices: [xeroPayload] }),
    })

    if (!res.ok) {
      const errText = await res.text()
      let friendlyMsg = `Xero error (${res.status})`
      try {
        const errJson = JSON.parse(errText) as XeroErrorResponse
        const valErrors = errJson?.Elements?.[0]?.ValidationErrors?.map(e => e.Message).join('; ')
        if (valErrors) friendlyMsg += `: ${valErrors}`
        else if (errJson?.Detail) friendlyMsg += `: ${errJson.Detail}`
        else friendlyMsg += `: ${errText.slice(0, 200)}`
      } catch { friendlyMsg += `: ${errText.slice(0, 200)}` }
      // 401 = token expired or missing scope, 403 = scope not granted
      if (res.status === 401 || res.status === 403) {
        friendlyMsg = 'Xero connection needs updating — go to Settings → Integrations, disconnect Xero, then reconnect to grant invoice permissions.'
      }
      return NextResponse.json({ error: friendlyMsg }, { status: res.status })
    }

    const data = await res.json() as XeroResponse
    const xeroInvoice = data?.Invoices?.[0]
    if (!xeroInvoice?.InvoiceID) {
      return NextResponse.json({ error: 'Xero did not return an invoice ID' }, { status: 500 })
    }

    // Persist the Xero InvoiceID on our record
    await sb.from('invoices')
      .update({ xero_invoice_id: xeroInvoice.InvoiceID })
      .eq('id', invoice.id)
      .eq('user_id', user.id)

    return NextResponse.json({ xeroInvoiceId: xeroInvoice.InvoiceID })
  } catch (err) {
    console.error('push-invoice error:', err)
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
