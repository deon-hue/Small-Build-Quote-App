// The builder's side: download the subcontractor's invoice PDF for the days of a timesheet week (any week, old or new). The invoice is made now if those days have none yet, or the existing one
// (same number) is found again; days paid in cash are left off and a week that is all cash gets no invoice. Signed-in builder only, and only their own subcontractor's days.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureSubInvoice, renderInvoicePdf, subContactOf } from '@/lib/sub-invoice-server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { contactId?: string; logIds?: string[]; billId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const contactId = typeof body.contactId === 'string' ? body.contactId : ''
  const logIds = Array.isArray(body.logIds) ? body.logIds.filter(x => typeof x === 'string').slice(0, 200) : []
  const billId = typeof body.billId === 'string' ? body.billId : ''
  if (!contactId || (logIds.length === 0 && !billId)) return NextResponse.json({ error: 'contactId and logIds (or billId) are needed' }, { status: 400 })
  const admin = createServiceRoleClient()
  const { data: owner } = await sb.rpc('get_effective_owner_id')
  const ownerId = (typeof owner === 'string' && owner) || user.id
  if (!(await subContactOf(admin, ownerId, contactId))) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 })

  // Just a bill id: find the invoice that was made for that bill (made when the days were sent to Bills). Bills from before invoices started have none.
  if (logIds.length === 0) {
    const { data: inv } = await admin.from('sub_invoices').select('id').eq('owner_id', ownerId).eq('contact_id', contactId).eq('bill_id', billId).limit(1).maybeSingle()
    const found = inv ? await renderInvoicePdf(admin, ownerId, contactId, inv.id as string) : null
    if (!found) return NextResponse.json({ error: 'No invoice was made for this bill (it was made before invoices started). Use the Invoice button on that week in Subcontractors to make one.' }, { status: 404 })
    return new NextResponse(found.bytes as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${found.fileName.replace(/[^\w .-]/g, '_')}"`, 'Cache-Control': 'private, no-store' },
    })
  }

  const made = await ensureSubInvoice(admin, { ownerId, contactId, logIds, billId: typeof body.billId === 'string' ? body.billId : null })
  if ('error' in made) return NextResponse.json({ error: made.error }, { status: 400 })
  const pdf = await renderInvoicePdf(admin, ownerId, contactId, made.id)
  if (!pdf) return NextResponse.json({ error: 'Could not make the PDF. Try again.' }, { status: 500 })
  return new NextResponse(pdf.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.fileName.replace(/[^\w .-]/g, '_')}"`,
      'X-Invoice-Number': made.invoiceNumber,
      'Cache-Control': 'private, no-store',
    },
  })
}
