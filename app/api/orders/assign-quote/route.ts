// Assigns an emailed quote that the app could not match on its own to a supplier on one of your requests. It then becomes their reply, marked "please check".

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { assignIncomingQuote } from '@/lib/quote-inbox'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can do this.' }, { status: 403 })
  let body: { incomingId?: string; quoteId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!body.incomingId || !body.quoteId) return NextResponse.json({ error: 'Choose the request and the supplier.' }, { status: 400 })

  // both must be yours (row security) before the server, which can see everything, does anything
  const { data: inc } = await sb.from('incoming_quotes').select('id').eq('id', body.incomingId).maybeSingle()
  const { data: q } = await sb.from('job_order_quotes').select('id').eq('id', body.quoteId).maybeSingle()
  if (!inc || !q) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { data: owner } = await sb.rpc('get_effective_owner_id')
  const r = await assignIncomingQuote(createServiceRoleClient(), (owner as string) || user.id, body.incomingId, body.quoteId)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error || 'Could not assign it.' }, { status: 400 })
}
