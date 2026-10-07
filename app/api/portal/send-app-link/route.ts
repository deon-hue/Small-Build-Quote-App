import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'
import { BRAND, emailShell, emailPara, emailButton, emailCallout, emailContact } from '@/lib/email-layout'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { escapeLike } from '@/lib/email-match'
import { usageGuard } from '@/lib/usage'

function toE164(raw: string): string | null {
  let n = raw.trim().replace(/[\s\-().]/g, '')
  if (n.startsWith('+')) return n.replace(/[^\d+]/g, '').length >= 8 ? n : null
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('07') || n.startsWith('01') || n.startsWith('02')) n = '+44' + n.slice(1)
  else if (n.startsWith('44') && n.length >= 11) n = '+' + n
  else return null
  return n.length >= 9 ? n : null
}

async function sendWhatsApp(
  to: string, body: string,
  accountSid: string, authToken: string, from: string,
): Promise<{ ok: boolean; error?: string }> {
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Cannot normalise phone number: "${to}"` }
  const params = new URLSearchParams({ From: from, To: `whatsapp:${e164}`, Body: body })
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  return res.ok ? { ok: true } : { ok: false, error: data?.message || `Twilio error ${res.status}` }
}

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send portal links.' }, { status: 403 })
  const limited = await usageGuard(sb, 'send', 'send-app-link')
  if (limited) return limited

  let body: { clientName: string; clientEmail?: string; clientPhone?: string; companyName?: string; companyEmail?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { clientName, clientEmail, clientPhone, companyName } = body
  if (!clientEmail && !clientPhone) return NextResponse.json({ error: 'No email or phone' }, { status: 400 })
  if (clientEmail) {
    // the client-portal app link must not go to someone who is only a subcontractor contact
    const { data: same } = await sb.from('clients').select('client_type').ilike('email', escapeLike(clientEmail.trim()))
    const types = (same || []).map((c: { client_type: string | null }) => c.client_type || 'client')
    if (types.length > 0 && types.every((t: string) => t === 'subcontractor')) {
      return NextResponse.json({ error: 'This contact is a subcontractor, so the client portal app link is not for them.' }, { status: 400 })
    }
  }

  const resendKey    = process.env.RESEND_API_KEY
  const fromEmail    = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
  const twilioSid    = process.env.TWILIO_ACCOUNT_SID
  const twilioToken  = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom   = process.env.TWILIO_WHATSAPP_FROM
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''

  const portalUrl  = `${appUrl}/portal`
  const firstName  = clientName.split(' ')[0] || clientName
  const company    = companyName || 'Your contractor'

  const results: { email: boolean; whatsapp: boolean; errors: string[] } = {
    email: false, whatsapp: false, errors: [],
  }

  // ── Email ────────────────────────────────────────────────────
  if (clientEmail && resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(fromEmail, companyName),
        to: clientEmail,
        subject: `${company}: Access your client portal on your phone`,
        html: withPoweredBy(buildEmail({ firstName: escapeHtml(firstName), company: escapeHtml(company), portalUrl })),
        ...(body.companyEmail ? { reply_to: body.companyEmail } : {}),
      }),
    })
    results.email = res.ok
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      results.errors.push(d?.message || `Email error ${res.status}`)
    }
  }

  // ── WhatsApp ─────────────────────────────────────────────────
  if (clientPhone && twilioSid && twilioToken && twilioFrom) {
    const message = buildWhatsAppMessage({ firstName, company, portalUrl })
    const r = await sendWhatsApp(clientPhone, message, twilioSid, twilioToken, twilioFrom)
    results.whatsapp = r.ok
    if (!r.ok) results.errors.push(`WhatsApp: ${r.error}`)
  }

  const anySent = results.email || results.whatsapp
  if (!anySent && results.errors.length) {
    return NextResponse.json({ error: results.errors.join(' | ') }, { status: 500 })
  }

  return NextResponse.json({ sent: results })
}

function buildWhatsAppMessage({ firstName, company, portalUrl }: { firstName: string; company: string; portalUrl: string }): string {
  return [
    `Hi ${firstName} 👋`,
    ``,
    `${company} has set up a project portal for you — you can add it to your home screen like a downloaded app. No App Store needed.`,
    ``,
    `Open this link on your phone:`,
    portalUrl,
    ``,
    `*iPhone:* Tap Share ↑ → "Add to Home Screen"`,
    `*Android:* Tap ⋮ menu → "Add to Home Screen"`,
    ``,
    `Once installed it'll sit on your home screen for quick access to your quotes, invoices and updates.`,
  ].join('\n')
}

function buildEmail({ firstName, company, portalUrl }: { firstName: string; company: string; portalUrl: string }): string {
  const tag = (t: string) => `<div style="display:inline-block;background:${BRAND.lime};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:6px">${t}</div>`
  const steps = (items: string[]) => `<ol style="margin:0;padding-left:20px;font-size:13px;color:#4a5568;line-height:2">${items.map(i => `<li>${i}</li>`).join('')}</ol>`
  return emailShell({
    company, kicker: 'Client portal', title: 'Access your portal on your phone',
    body: [
      emailPara(`Hi ${firstName},`),
      emailPara(`You can now add your project portal to your phone's home screen — it works just like a downloaded app, with no App Store required. One tap and you're straight in.`, 24),
      emailButton(portalUrl, 'Open your portal →'),
      emailCallout(
        `<div style="margin-bottom:16px">${tag('iPhone')}${steps(['Open the link above in <strong>Safari</strong>', 'Tap the <strong>Share</strong> button (square with arrow at the bottom)', 'Tap <strong>"Add to Home Screen"</strong>', 'Tap <strong>Add</strong>'])}</div>
        <div>${tag('Android')}${steps(['Open the link above in <strong>Chrome</strong>', 'Tap the <strong>⋮ menu</strong> (top right corner)', 'Tap <strong>"Add to Home Screen"</strong>', 'Tap <strong>Add</strong>'])}</div>`,
        '📱 How to install — takes 10 seconds'),
      emailContact('Once installed, the portal icon will appear on your home screen. Use it any time to check your quotes, variations, and invoices — or to approve change orders on site.'),
    ].join('\n      '),
    footerHtml: `${company} · <a href="${portalUrl}" style="color:#a3d65c;text-decoration:none">Open portal</a>`,
  })
}
