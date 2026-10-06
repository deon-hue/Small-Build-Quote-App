/**
 * POST /api/portal/invite-sub
 *
 * Sends a subcontractor their portal invite from our own branded email (lib/sub-portal-invite-email.ts) instead of Supabase's generic
 * magic-link email — so it carries the builder's name, explains what the portal is for, and never hits Supabase's own outbound-email
 * rate limit (the sign-in button is made with the admin generateLink API, which sends nothing itself; Resend sends the email).
 * WhatsApp is left for later (Twilio is not switched on yet): when it is, it is sent here exactly as the client invite does.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { usageGuard } from '@/lib/usage'
import { createPortalSignInLink } from '@/lib/portal-magic-link'
import { buildSubInviteEmail, subInviteSubject } from '@/lib/sub-portal-invite-email'

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send portal invites.' }, { status: 403 })
    const limited = await usageGuard(sb, 'send', 'sub-portal-invite')
    if (limited) return limited

    let body: { name?: string; email?: string; companyName?: string; companyPhone?: string; companyEmail?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

    const email = (body.email || '').trim()
    if (!email) return NextResponse.json({ error: 'This subcontractor has no email address saved.' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY is not set in this environment, so the invite email cannot be sent.' }, { status: 500 })
    const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''
    const company = (body.companyName || '').trim() || 'Your builder'
    const firstName = (body.name || '').trim().split(' ')[0] || 'there'
    const loginUrl = `${appUrl}/sub-portal/login?email=${encodeURIComponent(email)}`

    const link = await createPortalSignInLink(email, appUrl, '/sub-portal')
    if ('error' in link) return NextResponse.json({ error: `Could not create the sign-in link: ${link.error}` }, { status: 500 })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(fromEmail, body.companyName),
        to: email,
        subject: subInviteSubject(company),
        html: withPoweredBy(buildSubInviteEmail({ firstName, company, signInUrl: link.url, loginUrl, companyPhone: body.companyPhone, companyEmail: body.companyEmail })),
        ...(body.companyEmail ? { reply_to: body.companyEmail } : {}),
      }),
    })
    if (!emailRes.ok) {
      const d = await emailRes.json().catch(() => ({}))
      return NextResponse.json({ error: `Email not sent: ${d?.message || `Resend error ${emailRes.status}`}` }, { status: 500 })
    }
    return NextResponse.json({ sent: { email: true } })
  } catch (err) {
    console.error('[portal/invite-sub] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the invite.' }, { status: 500 })
  }
}
