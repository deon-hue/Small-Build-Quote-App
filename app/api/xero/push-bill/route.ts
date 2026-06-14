import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { Bill } from '@/lib/types'

interface XeroValidationError { Message: string }
interface XeroElement { ValidationErrors?: XeroValidationError[] }
interface XeroErrorResponse { Detail?: string; Elements?: XeroElement[] }
interface XeroInvoiceResponse { InvoiceID?: string }
interface XeroResponse { Invoices?: XeroInvoiceResponse[] }

// Map bill cost category to a sensible Xero account code (UK defaults)
function accountCode(category: string): string {
  switch (category) {
    case 'labour':    return '400'  // Direct Costs / Labour
    case 'materials': return '300'  // Purchases / Materials
    case 'plant':     return '300'  // Plant Hire (treat as purchases)
    default:          return '400'  // Other expenses
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected — go to Settings → Integrations to connect.' }, { status: 400 })

    const body = await req.json() as { bill?: Bill }
    const bill = body.bill
    if (!bill) return NextResponse.json({ error: 'No bill provided' }, { status: 400 })

    // DRAFT → draft, approved → AUTHORISED, paid → AUTHORISED
    // Xero does not accept PAID directly via API — payment must be reconciled in Xero
    const xeroStatus = bill.status === 'draft' ? 'DRAFT' : 'AUTHORISED'

    // Build line items from bill line items
    const lineItems: Record<string, unknown>[] = bill.lineItems
      .filter(l => (Number(l.amount) || 0) > 0)
      .map(l => ({
        Description: l.desc || bill.description || 'Works',
        Quantity: 1,
        UnitAmount: Number(l.amount),
        AccountCode: accountCode(l.category),
        TaxType: 'NONE',  // bills are recorded net; VAT reclaim handled separately
      }))

    // If CIS deduction applies, add a negative line so Xero reflects the actual payment
    if (bill.cisDeduction > 0) {
      lineItems.push({
        Description: `CIS deduction (${bill.cisRate}% on labour)`,
        Quantity: 1,
        UnitAmount: -bill.cisDeduction,
        AccountCode: '820',  // CIS liability account (common UK code)
        TaxType: 'NONE',
      })
    }

    // Look up supplier's Xero ContactID if available
    let contact: Record<string, unknown> = { Name: bill.supplierName || 'Unknown Supplier' }
    if (bill.supplierId) {
      const { data: sup } = await sb.from('suppliers')
        .select('xero_contact_id, name')
        .eq('id', bill.supplierId)
        .single()
      if (sup?.xero_contact_id) {
        contact = { ContactID: sup.xero_contact_id }
      } else if (sup?.name) {
        contact = { Name: sup.name }
      }
    }

    const xeroPayload: Record<string, unknown> = {
      Type: 'ACCPAY',
      Contact: contact,
      Date: bill.billDate || new Date().toISOString().split('T')[0],
      DueDate: bill.dueDate || bill.billDate || new Date().toISOString().split('T')[0],
      InvoiceNumber: bill.ref,
      Reference: bill.description || '',
      LineItems: lineItems,
      Status: xeroStatus,
    }

    // Include InvoiceID to update an existing Xero bill rather than create a duplicate
    if (bill.xeroBillId) {
      xeroPayload.InvoiceID = bill.xeroBillId
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
      if (res.status === 401 || res.status === 403) {
        friendlyMsg = 'Xero connection needs updating — go to Settings → Integrations, disconnect then reconnect to grant invoice permissions.'
      }
      return NextResponse.json({ error: friendlyMsg }, { status: res.status })
    }

    const data = await res.json() as XeroResponse
    const xeroBill = data?.Invoices?.[0]
    if (!xeroBill?.InvoiceID) {
      return NextResponse.json({ error: 'Xero did not return a bill ID' }, { status: 500 })
    }

    // Persist the Xero InvoiceID on our bills record
    await sb.from('bills')
      .update({ xero_bill_id: xeroBill.InvoiceID })
      .eq('id', bill.id)
      .eq('user_id', user.id)

    return NextResponse.json({ xeroBillId: xeroBill.InvoiceID })
  } catch (err) {
    console.error('push-bill error:', err)
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
