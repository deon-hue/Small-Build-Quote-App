// The builder's side: make (or find) the subcontractor's invoice for days that have just been put on a BILL in the app (Send to Bills), and remember which bill it belongs to so that the invoice goes
// onto the Xero bill when the bill is sent there (app/api/xero/push-bill). Time paid in cash gets no invoice. Signed-in builder only, and only their own subcontractor's days.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureSubInvoice, subContactOf } from '@/lib/sub-invoice-server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { contactId?: string; logIds?: string[]; billId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const contactId = typeof body.contactId === 'string' ? body.contactId : ''
  const logIds = Array.isArray(body.logIds) ? body.logIds.filter(x => typeof x === 'string').slice(0, 200) : []
  if (!contactId || logIds.length === 0) return NextResponse.json({ error: 'contactId and logIds are needed' }, { status: 400 })
  const admin = createServiceRoleClient()
  // the builder may be a team member: the owner of the data is their effective owner
  const { data: owner } = await sb.rpc('get_effective_owner_id')
  const ownerId = (typeof owner === 'string' && owner) || user.id
  if (!(await subContactOf(admin, ownerId, contactId))) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 })
  const made = await ensureSubInvoice(admin, { ownerId, contactId, logIds, billId: typeof body.billId === 'string' ? body.billId : null })
  if ('error' in made) return NextResponse.json({ error: made.error }, { status: 400 })
  return NextResponse.json({ invoiceId: made.id, invoiceNumber: made.invoiceNumber, created: made.created })
}
