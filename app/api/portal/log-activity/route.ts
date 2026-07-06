import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function POST(request: NextRequest) {
  try {
    const { email, eventType, details } = await request.json()
    if (!email || !eventType) return NextResponse.json({ ok: false }, { status: 400 })

    const sb = createServiceRoleClient()

    // Look up the client and their admin owner by email
    const { data: client } = await sb
      .from('clients')
      .select('id, user_id')
      .ilike('email', email.trim())
      .limit(1)
      .single()

    if (!client) {
      // Unknown email — still insert with no client_id so we can surface mystery attempts
      return NextResponse.json({ ok: false, reason: 'client not found' })
    }

    await sb.from('portal_activity_logs').insert({
      owner_user_id: client.user_id,
      client_id: client.id,
      client_email: email.trim().toLowerCase(),
      event_type: eventType,
      details: details || null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
