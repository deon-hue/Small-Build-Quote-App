// Downloads a subcontractor's invoice as a PDF (?id=<invoice id>), or their record of cash payments between two dates (?kind=cash&from=yyyy-mm-dd&to=yyyy-mm-dd), which is NOT an invoice.
// Only a signed-in subcontractor, and only their own.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { identifySub, renderInvoicePdf, renderCashRecordPdf } from '@/lib/sub-invoice-server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createServiceRoleClient()
  const sub = await identifySub(admin, user)
  if (!sub) return NextResponse.json({ error: 'No subcontractor record was found for this login.' }, { status: 403 })

  const q = req.nextUrl.searchParams
  let pdf: { bytes: Uint8Array; fileName: string } | null = null
  if (q.get('kind') === 'cash') {
    pdf = await renderCashRecordPdf(admin, sub.ownerId, sub.contact.id, q.get('from') || '', q.get('to') || '')
    if (!pdf) return NextResponse.json({ error: 'Nothing was paid to you in cash between those dates.' }, { status: 404 })
  } else {
    const id = q.get('id') || ''
    if (!UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    pdf = await renderInvoicePdf(admin, sub.ownerId, sub.contact.id, id)
    if (!pdf) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
  }
  return new NextResponse(pdf.bytes as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdf.fileName.replace(/[^\w .-]/g, '_')}"`, 'Cache-Control': 'private, no-store' },
  })
}
