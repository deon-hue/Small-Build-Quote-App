/**
 * POST /api/portal/invite
 *
 * Sends a client their portal invite from our own branded email (and a WhatsApp if they have a
 * phone number and Twilio is set up) instead of Supabase's generic magic-link email, so the
 * message can explain what the portal is for and how to add it to a home screen.
 *
 * The one-click sign-in button is a real Supabase magic link made with the admin generateLink
 * API. generateLink never sends anything itself (Resend does, below), so unlike signInWithOtp
 * it can't hit Supabase's own outbound-email rate limit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { usageGuard } from '@/lib/usage'
import { createPortalSignInLink } from '@/lib/portal-magic-link'
import { portalExplainerHtml, portalWhatsAppLines } from '@/lib/portal-welcome'
import { emailShell, emailPara, emailButton, emailContact, emailLink } from '@/lib/email-layout'

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toE164(raw: string): string | null {
  let n = raw.trim().replace(/[\s\-().]/g, '')
  if (n.startsWith('+')) return n.replace(/[^\d+]/g, '').length >= 8 ? n : null
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('07') || n.startsWith('01') || n.startsWith('02')) n = '+44' + n.slice(1)
  else if (n.startsWith('44') && n.length >= 11) n = '+' + n
  else return null
  return n.length >= 9 ? n : null
}

async function sendWhatsApp(to: string, body: string, sid: string, token: string, from: string): Promise<{ ok: boolean; error?: string }> {
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Cannot normalise phone number: "${to}"` }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: `whatsapp:${e164}`, Body: body }).toString(),
  })
  const data = await res.json().catch(() => ({}))
  return res.ok ? { ok: true } : { ok: false, error: data?.message || `Twilio error ${res.status}` }
}

function buildEmail(o: { firstName: string; company: string; signInUrl: string; loginUrl: string; companyPhone?: string; companyEmail?: string }): string {
  const company = esc(o.company)
  return emailShell({
    company, kicker: 'Client portal', title: 'Your client portal',
    body: [
      emailPara(`Dear ${esc(o.firstName)},`),
      emailPara(`${company} has set up a secure client portal for you. Press the button below to sign in. There is no password to remember.`, 22),
      emailButton(o.signInUrl, 'Open your portal →',
        `This button signs you in once and then expires. If it has stopped working, go to ${emailLink(o.loginUrl, 'the portal sign-in page')} and choose &ldquo;Send sign-in link&rdquo; for a fresh one.`),
      portalExplainerHtml(),
      emailContact('If anything is unclear, just get in touch.', o.companyPhone ? esc(o.companyPhone) : undefined, o.companyEmail ? esc(o.companyEmail) : undefined),
    ].join('\n      '),
  })
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send portal invites.' }, { status: 403 })
    const limited = await usageGuard(sb, 'send', 'portal-invite')
    if (limited) return limited

    let body: { clientName?: string; clientEmail?: string; clientPhone?: string; companyName?: string; companyPhone?: string; companyEmail?: string }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

    const { clientEmail, clientPhone, companyPhone, companyEmail } = body
    if (!clientEmail) return NextResponse.json({ error: 'This client has no email address saved.' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY is not set in this environment, so the invite email cannot be sent.' }, { status: 500 })
    const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''
    const company = body.companyName || 'Your builder'
    const firstName = (body.clientName || '').split(' ')[0] || body.clientName || 'there'
    const loginUrl = `${appUrl}/portal/login?email=${encodeURIComponent(clientEmail)}`

    const link = await createPortalSignInLink(clientEmail, appUrl, '/portal')
    if ('error' in link) return NextResponse.json({ error: `Could not create the sign-in link: ${link.error}` }, { status: 500 })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(fromEmail, body.companyName),
        to: clientEmail,
        subject: `${company}: Your client portal`,
        html: withPoweredBy(buildEmail({ firstName, company, signInUrl: link.url, loginUrl, companyPhone, companyEmail })),
        ...(companyEmail ? { reply_to: companyEmail } : {}),
      }),
    })
    if (!emailRes.ok) {
      const d = await emailRes.json().catch(() => ({}))
      return NextResponse.json({ error: `Email not sent: ${d?.message || `Resend error ${emailRes.status}`}` }, { status: 500 })
    }

    // WhatsApp is a bonus: never fails the invite, just reports why it didn't go.
    const results: { email: boolean; whatsapp: boolean; errors: string[] } = { email: true, whatsapp: false, errors: [] }
    const twilioSid = process.env.TWILIO_ACCOUNT_SID, twilioToken = process.env.TWILIO_AUTH_TOKEN, twilioFrom = process.env.TWILIO_WHATSAPP_FROM
    if (clientPhone && twilioSid && twilioToken && twilioFrom) {
      const message = [
        `Hi ${firstName} 👋`,
        ``,
        `${company} has set up a client portal for you. We've emailed you a sign-in button — if you can't see it, please check your spam/junk folder.`,
        ``,
        ...portalWhatsAppLines(loginUrl),
      ].join('\n')
      const r = await sendWhatsApp(clientPhone, message, twilioSid, twilioToken, twilioFrom)
      results.whatsapp = r.ok
      if (!r.ok) results.errors.push(`WhatsApp: ${r.error}`)
    }
    return NextResponse.json({ sent: results })
  } catch (err) {
    console.error('[portal/invite] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the invite.' }, { status: 500 })
  }
}
