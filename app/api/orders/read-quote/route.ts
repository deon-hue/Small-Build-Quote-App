// "Add a quote from their PDF": you drop a supplier's own quote (a PDF or photo) onto one of their lines on a request. The app reads it and records it as their reply, marked "please check".
// Only a signed-in contractor can use it, on their own requests: the request and supplier are looked up with the person's own login before anything is read or saved.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { usageGuard } from '@/lib/usage'
import { processQuoteAttachment } from '@/lib/quote-inbox'

export const maxDuration = 60

const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 4.5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can do this.' }, { status: 403 })
  const limited = await usageGuard(sb, 'ai', 'orders-read-quote')
  if (limited) return limited

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const file = form.get('file')
  const orderId = String(form.get('orderId') || '')
  const quoteId = String(form.get('quoteId') || '')
  if (!(file instanceof File) || !orderId || !quoteId) return NextResponse.json({ error: 'Choose the file and the supplier first.' }, { status: 400 })
  if (!TYPES[file.type]) return NextResponse.json({ error: 'Please use a PDF or a photo (JPEG, PNG or WebP).' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is too big. Try a PDF under about 4 MB.' }, { status: 413 })

  // both must be yours (row security): the request, and the supplier on it
  const { data: o } = await sb.from('job_orders').select('*').eq('id', orderId).maybeSingle()
  const { data: q } = await sb.from('job_order_quotes').select('id, order_id').eq('id', quoteId).maybeSingle()
  if (!o || o.deleted_at || !q || q.order_id !== orderId) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (o.kind !== 'quote_request' || o.status === 'cancelled') return NextResponse.json({ error: 'That request is closed.' }, { status: 409 })

  const { data: owner } = await sb.rpc('get_effective_owner_id')
  const ownerId = (owner as string) || user.id
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const r = await processQuoteAttachment(createServiceRoleClient(), ownerId, { name: file.name || 'quote.pdf', mime: file.type, base64 }, { from: '', subject: '', body: '' }, { orderId, quoteId })
    if (r.result !== 'attached') return NextResponse.json({ error: 'Could not read that quote.' }, { status: 422 })
    return NextResponse.json({ ok: true, mode: r.mode })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that quote.' }, { status: 500 })
  }
}
