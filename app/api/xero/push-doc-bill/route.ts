import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { XeroAccountCodes } from '@/lib/types'
import { DEFAULT_XERO_ACCOUNT_CODES } from '@/lib/types'
import type { ExtractedCostLine } from '@/lib/doc-extract/types'

interface XeroValidationError { Message: string }
interface XeroElement { ValidationErrors?: XeroValidationError[] }
interface XeroErrorResponse { Detail?: string; Elements?: XeroElement[] }
interface XeroInvoiceResponse { InvoiceID?: string }
interface XeroResponse { Invoices?: XeroInvoiceResponse[] }

interface PushDocBillBody {
  documentId: string
  supplier: string
  supplierId?: string
  docDate: string
  docNumber: string
  lines: ExtractedCostLine[]
  fileName: string
  storagePath: string
  mimeType: string
  xeroAccountCode?: string  // override all lines to a specific account (e.g. Motor Expenses)
  forceNew?: boolean        // skip existing InvoiceID and create a fresh bill (for locked/paid bills)
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected — go to Settings → Integrations to connect.' }, { status: 400 })

    const { data: settingsRow } = await sb.from('settings').select('xero_account_codes').eq('user_id', user.id).maybeSingle()
    const ac: XeroAccountCodes = { ...DEFAULT_XERO_ACCOUNT_CODES, ...((settingsRow?.xero_account_codes as XeroAccountCodes | null) ?? {}) }

    const body = await req.json() as PushDocBillBody
    const { documentId, supplier, supplierId, docDate, docNumber, lines, fileName, storagePath, mimeType, xeroAccountCode, forceNew } = body

    if (!documentId || !lines?.length) {
      return NextResponse.json({ error: 'documentId and lines are required' }, { status: 400 })
    }

    function codeFor(category: string): string {
      if (category === 'labour')    return ac.billLabour    || DEFAULT_XERO_ACCOUNT_CODES.billLabour
      if (category === 'materials') return ac.billMaterials || DEFAULT_XERO_ACCOUNT_CODES.billMaterials
      if (category === 'plant')     return ac.billPlant     || DEFAULT_XERO_ACCOUNT_CODES.billPlant
      return ac.billOther || DEFAULT_XERO_ACCOUNT_CODES.billOther
    }

    const lineItems = lines
      .filter(l => (Number(l.grossAmount) || 0) > 0)
      .map(l => {
        const gross = Number(l.grossAmount)
        const net   = Number(l.netAmount) || +(gross - Number(l.vatAmount || 0)).toFixed(2)
        const hasVat = (Number(l.vatAmount) || 0) > 0
        return {
          Description: l.description || 'Works',
          Quantity: 1,
          // INPUT2 = UK 20% VAT on purchases; Xero calculates TaxAmount from net automatically.
          // NONE   = no VAT; use gross so the Xero bill total matches the actual invoice.
          UnitAmount: hasVat ? net : gross,
          TaxType: hasVat ? 'INPUT2' : 'NONE',
          AccountCode: xeroAccountCode || codeFor(l.costCategory),
        }
      })

    if (!lineItems.length) {
      return NextResponse.json({ error: 'No line items with amounts to push to Xero' }, { status: 400 })
    }

    // Resolve contact's Xero ContactID (contacts are now in the clients table)
    let contact: Record<string, unknown> = { Name: supplier || 'Unknown Supplier' }
    if (supplierId) {
      const { data: sup } = await sb.from('clients').select('xero_contact_id, name').eq('id', supplierId).single()
      if (sup?.xero_contact_id) contact = { ContactID: sup.xero_contact_id }
      else if (sup?.name) contact = { Name: sup.name }
    }

    // Check for existing Xero bill (to update rather than duplicate)
    const { data: docRow } = await sb.from('job_documents')
      .select('xero_bill_id')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()
    const existingXeroBillId = (docRow?.xero_bill_id as string) || null

    const xeroPayload: Record<string, unknown> = {
      Type: 'ACCPAY',
      Contact: contact,
      Date: docDate || new Date().toISOString().split('T')[0],
      DueDate: docDate || new Date().toISOString().split('T')[0],
      InvoiceNumber: docNumber || undefined,
      Reference: supplier || '',
      LineItems: lineItems,
      Status: 'AUTHORISED',
    }
    if (existingXeroBillId && !forceNew) xeroPayload.InvoiceID = existingXeroBillId

    const invoiceRes = await xeroFetch(conn, '/Invoices', {
      method: 'POST',
      body: JSON.stringify({ Invoices: [xeroPayload] }),
    })

    if (!invoiceRes.ok) {
      const errText = await invoiceRes.text()
      let friendlyMsg = `Xero error (${invoiceRes.status})`
      try {
        const errJson = JSON.parse(errText) as XeroErrorResponse
        const valErrors = errJson?.Elements?.[0]?.ValidationErrors?.map(e => e.Message).join('; ')
        if (valErrors) friendlyMsg += `: ${valErrors}`
        else if (errJson?.Detail) friendlyMsg += `: ${errJson.Detail}`
        else friendlyMsg += `: ${errText.slice(0, 200)}`
      } catch { friendlyMsg += `: ${errText.slice(0, 200)}` }
      if (invoiceRes.status === 401 || invoiceRes.status === 403) {
        friendlyMsg = 'Xero connection needs updating — go to Settings → Integrations, disconnect then reconnect.'
      } else if (friendlyMsg.toLowerCase().includes('not of valid status')) {
        friendlyMsg = existingXeroBillId
          ? 'This bill has been paid or reconciled in Xero and can\'t be modified. Use "Push as new bill" to create a fresh copy, or unreconcile the payment in Xero first.'
          : 'Xero rejected the bill — the invoice may be voided or deleted in Xero.'
      }
      return NextResponse.json({ error: friendlyMsg, statusLocked: friendlyMsg.includes('paid or reconciled') }, { status: invoiceRes.status })
    }

    const invoiceData = await invoiceRes.json() as XeroResponse
    const xeroBillId = invoiceData?.Invoices?.[0]?.InvoiceID
    if (!xeroBillId) return NextResponse.json({ error: 'Xero did not return a bill ID' }, { status: 500 })

    // Attach the original document file to the Xero bill (best-effort — don't fail if this errors)
    if (storagePath && fileName) {
      try {
        const { data: fileBlob } = await sb.storage.from('job-documents').download(storagePath)
        if (fileBlob) {
          const fileBuffer = await fileBlob.arrayBuffer()
          const safeFileName = fileName.replace(/[^\w\s.-]/g, '_')
          const attachRes = await xeroFetch(conn, `/Invoices/${xeroBillId}/Attachments/${encodeURIComponent(safeFileName)}`, {
            method: 'PUT',
            body: fileBuffer,
            headers: { 'Content-Type': mimeType || 'application/octet-stream' },
          })
          if (!attachRes.ok) {
            console.warn('push-doc-bill: attachment upload failed', attachRes.status)
          }
        }
      } catch (attachErr) {
        console.warn('push-doc-bill: attachment error (non-fatal)', attachErr)
      }
    }

    // Persist Xero bill ID and mark document as completed
    await sb.from('job_documents')
      .update({ xero_bill_id: xeroBillId, status: 'allocated' })
      .eq('id', documentId)
      .eq('user_id', user.id)

    // Stamp all job_costs rows linked to this document
    const now = new Date().toISOString()
    await sb.from('job_costs')
      .update({ xero_invoice_id: xeroBillId, xero_status: 'synced', synced_at: now })
      .eq('document_id', documentId)
      .eq('user_id', user.id)

    return NextResponse.json({ xeroBillId })
  } catch (err) {
    console.error('push-doc-bill error:', err)
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
