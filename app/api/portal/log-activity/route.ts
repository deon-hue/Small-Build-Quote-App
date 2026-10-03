import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logPortalActivity, PORTAL_EVENT_TYPES } from '@/lib/portal-activity'

// Called from the portal login / reset pages, including before anyone is signed in, so it can't require a
// session. It is deliberately dull: only known event types are accepted, details are capped, and the reply
// is the same whether or not the email belongs to a client (so it can't be used to find out who is a client).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const eventType = typeof body.eventType === 'string' ? body.eventType : ''
    if (!PORTAL_EVENT_TYPES.has(eventType)) return NextResponse.json({ ok: false }, { status: 400 })

    // The reset-password page has a session but doesn't send an email — take it from the session.
    let email = typeof body.email === 'string' ? body.email : ''
    if (!email) {
      const sb = await createClient()
      const { data: { user } } = await sb.auth.getUser()
      email = user?.email ?? ''
    }
    if (!email) return NextResponse.json({ ok: false }, { status: 400 })

    await logPortalActivity(email, eventType, typeof body.details === 'string' ? body.details : null)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
