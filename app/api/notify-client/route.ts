/**
 * POST /api/notify-client
 *
 * Sends a notification to a client via WhatsApp (Twilio) and/or Email (Resend).
 * WhatsApp is attempted first; email is used as a fallback or in parallel.
 * All failures are non-fatal — the response always returns 200 with a results object.
 *
 * ── Required Netlify environment variables ────────────────────────────────────
 *
 * WhatsApp (Twilio):
 *   TWILIO_ACCOUNT_SID        Your Twilio Account SID
 *   TWILIO_AUTH_TOKEN         Your Twilio Auth Token
 *   TWILIO_WHATSAPP_FROM      Sender number incl. prefix, e.g.:
 *                               Sandbox : whatsapp:+14155238886
 *                               Live    : whatsapp:+447700000000  (your approved number)
 *
 * Email (Resend):
 *   RESEND_API_KEY            Your Resend API key (resend.com — free tier: 3,000/month)
 *   NOTIFY_FROM_EMAIL         Verified sender address, e.g. noreply@yourcompany.co.uk
 *                             (During testing you can use onboarding@resend.dev)
 *
 * Portal link:
 *   NEXT_PUBLIC_APP_URL       Your live URL, e.g. https://yoursite.netlify.app
 *                             Used in messages when the client doesn't send their origin.
 *
 * ── Twilio WhatsApp sandbox note ─────────────────────────────────────────────
 * For the sandbox, each recipient must first opt in by texting
 * "join <word> <word>" to +14155238886.
 * For production, use an approved WhatsApp Business number and Twilio
 * Content Templates (required for business-initiated messages outside a
 * 24-hour session window).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy, escapeStrings } from '@/lib/email-brand'
import { usageGuard } from '@/lib/usage'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { createPortalSignInLink } from '@/lib/portal-magic-link'
import { portalExplainerHtml, portalWhatsAppLines } from '@/lib/portal-welcome'
import { BRAND, emailShell, emailPara, emailButton, emailCard, emailCallout, emailNotice, emailContact } from '@/lib/email-layout'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotifyClientPayload {
  type: 'variation_sent' | 'schedule_updated' | 'quote_sent' | 'job_report' | 'contract_sent'

  // Recipient
  clientName:   string
  clientPhone?: string   // any UK format; normalised server-side
  clientEmail?: string
  clientId?:    string   // clients.id — set when the recipient matches a saved client,
                          // used to mark their portal-invite status (quote_sent only)

  // Job context
  jobType:    string
  jobAddress: string

  // variation_sent fields
  variationRef?:   string
  variationTitle?: string
  variationTotal?: number
  vatIncluded?:    boolean

  // contract_sent fields (jobType / jobAddress / message are shared with the others)
  secondClientName?: string   // a joint client who also has to sign

  // quote_sent fields
  quoteRef?:   string
  quoteTotal?: number
  message?:    string   // optional personal message from the builder

  // job_report fields — top-line figures only, for the email's at-a-glance summary card.
  // Line-item detail (variations/invoices/payments) lives in the attached report, not here.
  reportContractTotal?: number
  reportInvoicedTotal?: number
  reportPaidTotal?:     number
  reportOutstanding?:   number

  // Company branding (passed from settings)
  companyName?:  string
  companyPhone?: string
  companyEmail?: string

  // Where to send the client
  portalUrl?: string

  // Optional PDF attachment — base64-encoded bytes
  pdfBase64?:   string
  pdfFilename?: string
}

// ── Phone normalisation ───────────────────────────────────────────────────────

/**
 * Normalise a free-text UK (or international) phone number to E.164 format.
 * Returns null if the result doesn't look like a plausible number.
 */
function toE164(raw: string): string | null {
  // Strip everything except digits and leading +
  let n = raw.trim().replace(/[\s\-().]/g, '')

  // Already E.164?
  if (n.startsWith('+')) {
    return n.replace(/[^\d+]/g, '').length >= 8 ? n : null
  }

  // Leading 00 international prefix
  if (n.startsWith('00')) n = '+' + n.slice(2)

  // UK mobile / landline without country code
  else if (n.startsWith('07') || n.startsWith('01') || n.startsWith('02')) {
    n = '+44' + n.slice(1)
  }

  // Bare 44... (already without the +)
  else if (n.startsWith('44') && n.length >= 11) {
    n = '+' + n
  }

  // Anything else we don't understand
  else {
    return null
  }

  return n.length >= 9 ? n : null
}

// ── WhatsApp (Twilio) ─────────────────────────────────────────────────────────

async function sendWhatsApp(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  from: string,
): Promise<{ ok: boolean; error?: string }> {
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Cannot normalise phone number: "${to}"` }

  const toWa = `whatsapp:${e164}`

  const params = new URLSearchParams({
    From: from,
    To:   toWa,
    Body: body,
  })

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    return { ok: false, error: data?.message || `Twilio error ${res.status}` }
  }
  return { ok: true }
}

// ── Email (Resend) ────────────────────────────────────────────────────────────

function buildEmailHtml(rawPayload: NotifyClientPayload, portalUrl: string): string {
  // Everything the sender typed is HTML-escaped before it goes into an email body
  const payload = escapeStrings(rawPayload)
  const company = payload.companyName || 'Your Builder'
  const firstName = payload.clientName.split(' ')[0] || payload.clientName
  const money = (n?: number, vat = false) => n != null
    ? `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${vat ? ' inc. VAT' : ''}`
    : ''
  // the builder's own optional note, set off with the lime bar
  const message = payload.message
    ? emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">${payload.message.replace(/\n/g, '<br>')}</p>`)
    : ''
  const small = (t: string) => `<div style="font-size:11px;color:${BRAND.muted};letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${t}</div>`
  const amount = (t: string) => `<div style="font-size:22px;font-weight:700;color:${BRAND.ink};margin-top:12px;font-family:'DM Mono',monospace">${t}</div>`
  const footerLink = (href: string, label: string) => `<a href="${href}" style="color:#a3d65c;text-decoration:none">${label}</a>`

  if (payload.type === 'quote_sent') {
    const total = payload.quoteTotal != null ? money(payload.quoteTotal, !!payload.vatIncluded) : ''
    return emailShell({
      company, kicker: 'Quotation', title: 'Your Quotation', ref: payload.quoteRef,
      body: [
        emailPara(`Dear ${firstName},`),
        emailPara(`Thank you for the opportunity to quote for the works${payload.jobAddress ? ` at <strong>${payload.jobAddress}</strong>` : ''}.
        Please find attached our detailed quotation for the <strong>${payload.jobType}</strong> works.`),
        message,
        emailCard(`${payload.quoteRef ? small(payload.quoteRef) : ''}
        <div style="font-weight:700;font-size:16px;color:${BRAND.ink};margin-bottom:6px">${payload.jobType}</div>
        <div style="font-size:13px;color:${BRAND.muted}">${payload.jobAddress || ''}</div>
        ${total ? amount(total) : ''}`),
        emailNotice(`📎 <strong>Your quotation PDF is attached</strong> to this email. Please open the attachment to view the full breakdown.`),
        portalUrl ? emailButton(portalUrl, 'View your quote online →', 'View, track and communicate with us through your secure client portal.') : '',
        portalUrl ? portalExplainerHtml() : '',
        emailContact('This quotation is valid for 30 days. Please do not hesitate to contact us if you have any questions or would like to discuss anything.', payload.companyPhone, payload.companyEmail),
      ].join('\n      '),
      footerHtml: `Kind regards · ${company}${portalUrl ? ` · ${footerLink(portalUrl, 'Client portal')}` : ''}`,
    })
  }

  if (payload.type === 'job_report') {
    const fmtGbp = (n?: number) => (n != null ? money(n) : '—')
    const row = (label: string, value: string, extra = '') =>
      `<tr><td style="padding:3px 0;color:${BRAND.muted};font-size:13px;${extra}">${label}</td><td style="padding:3px 0;text-align:right;font-family:'DM Mono',monospace;font-size:13px;${extra}">${value}</td></tr>`
    const outstandingColour = (payload.reportOutstanding ?? 0) > 0 ? '#b45309' : BRAND.limeDark
    return emailShell({
      company, kicker: 'Financial summary', title: 'Job Financial Summary',
      body: [
        emailPara(`Hi ${firstName},`),
        emailPara(`Please find attached a financial summary for your <strong>${payload.jobType}</strong> project${payload.jobAddress ? ` at <strong>${payload.jobAddress}</strong>` : ''} —
        covering the contract value, any variations, invoices raised, and payments received to date.
        We'd really appreciate it if you could check these figures against your own records to confirm everything matches up on our side.`),
        message,
        emailCard(`<div style="font-weight:700;font-size:16px;color:${BRAND.ink};margin-bottom:10px">${payload.jobType}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Contract total', fmtGbp(payload.reportContractTotal), `font-weight:700;color:${BRAND.ink};`)}
          ${row('Invoiced to date', fmtGbp(payload.reportInvoicedTotal))}
          ${row('Payments received', fmtGbp(payload.reportPaidTotal), `color:${BRAND.limeDark};`)}
          <tr><td colspan="2" style="border-top:1px solid ${BRAND.line};padding-top:6px"></td></tr>
          ${row('Balance outstanding', fmtGbp(payload.reportOutstanding), `font-weight:700;color:${outstandingColour};`)}
        </table>`),
        emailNotice(`📎 <strong>The full breakdown is attached</strong> — including invoice-by-invoice and payment-by-payment detail. Please open the attachment to review it.`),
        emailContact(`If anything doesn't look right, just get in touch and we'll go through it together.`, payload.companyPhone, payload.companyEmail),
      ].join('\n      '),
    })
  }

  if (payload.type === 'variation_sent') {
    const total = payload.variationTotal != null ? money(payload.variationTotal, !!payload.vatIncluded) : ''
    return emailShell({
      company, kicker: 'Change order', title: 'Change Order for Approval',
      body: [
        emailPara(`Hi ${firstName},`),
        emailPara(`${company} has submitted a change order on your project that requires your approval.`),
        emailCard(`${payload.variationRef ? small(payload.variationRef) : ''}
        <div style="font-weight:700;font-size:16px;color:${BRAND.ink};margin-bottom:6px">${payload.variationTitle || 'Change Order'}</div>
        <div style="font-size:13px;color:${BRAND.muted}">${payload.jobType} · ${payload.jobAddress}</div>
        ${total ? amount(total) : ''}`),
        emailButton(portalUrl, 'Review &amp; Approve →'),
        emailContact('Log in to your client portal to view the full details, ask questions, approve or reject this change.', payload.companyPhone ? `${payload.companyPhone}` : undefined, undefined),
      ].join('\n      '),
      footerHtml: `This notification was sent by ${company}. Log in at ${footerLink(portalUrl, portalUrl)}`,
    })
  }

  if (payload.type === 'contract_sent') {
    return emailShell({
      company, kicker: 'Building contract', title: 'Your Building Contract Is Ready to Sign',
      body: [
        emailPara(`Dear ${firstName},`),
        emailPara(`${company} has sent you the building contract for the works${payload.jobAddress ? ` at <strong>${payload.jobAddress}</strong>` : ''}.
        Please read it carefully. You can view it and sign it online in your portal.${payload.secondClientName ? ` Both you and <strong>${payload.secondClientName}</strong> need to sign.` : ''}`),
        message,
        emailCard(`<div style="font-weight:700;font-size:16px;color:${BRAND.ink};margin-bottom:6px">${payload.jobType}</div>
        <div style="font-size:13px;color:${BRAND.muted}">${payload.jobAddress || ''}</div>`),
        portalUrl ? emailButton(portalUrl, 'Review &amp; Sign Contract →') : '',
        portalUrl ? portalExplainerHtml() : '',
        emailContact('If you have any questions before signing, please get in touch.', payload.companyPhone, payload.companyEmail),
      ].join('\n      '),
    })
  }

  // schedule_updated
  return emailShell({
    company, kicker: 'Programme update', title: 'Your Project Schedule Has Been Updated',
    body: [
      emailPara(`Hi ${firstName},`),
      emailPara(`${company} has updated the programme for your project.`),
      emailCard(`<div style="font-weight:700;font-size:16px;color:${BRAND.ink};margin-bottom:4px">${payload.jobType}</div>
        <div style="font-size:13px;color:${BRAND.muted}">${payload.jobAddress}</div>`),
      emailButton(portalUrl, 'View Updated Schedule →'),
      emailContact('Log in to your portal to see the latest programme and progress update.', payload.companyPhone, undefined),
    ].join('\n      '),
    footerHtml: `This notification was sent by ${company}. Log in at ${footerLink(portalUrl, portalUrl)}`,
  })
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  apiKey: string,
  from: string,
  attachment?: { filename: string; content: string } | null,
  replyTo?: string,
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = { from, to, subject, html: withPoweredBy(html) }
  if (replyTo) payload.reply_to = replyTo
  if (attachment) {
    payload.attachments = [{
      filename: attachment.filename,
      content:  attachment.content,  // base64
    }]
  }
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) {
    return { ok: false, error: data?.message || `Resend error ${res.status}` }
  }
  return { ok: true }
}

// ── Message copy ──────────────────────────────────────────────────────────────

function buildWhatsAppBody(payload: NotifyClientPayload, portalUrl: string): string {
  const company = payload.companyName || 'Your Builder'
  const firstName = payload.clientName.split(' ')[0] || payload.clientName

  if (payload.type === 'quote_sent') {
    const total = payload.quoteTotal != null
      ? `£${payload.quoteTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payload.vatIncluded ? ' inc. VAT' : ''}`
      : ''
    return [
      `Hi ${firstName} 👋`,
      ``,
      `${company} has sent you a quotation for the ${payload.jobType} works${payload.jobAddress ? ` at ${payload.jobAddress}` : ''}.`,
      ``,
      `📋 *${payload.quoteRef || 'Quotation'}*${total ? `\n💷 ${total}` : ''}`,
      ``,
      payload.message ? `${payload.message}\n` : '',
      `We've also sent a PDF copy to your email — if you don't see it in your inbox, please check your spam/junk folder.`,
      ``,
      ...portalWhatsAppLines(portalUrl),
      ``,
      payload.companyPhone ? `Any questions? Call us on ${payload.companyPhone}` : '',
    ].filter(l => l !== undefined).join('\n').trim()
  }

  if (payload.type === 'job_report') {
    const total = payload.reportContractTotal != null
      ? `£${payload.reportContractTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''
    return [
      `Hi ${firstName} 👋`,
      ``,
      `${company} has sent you a financial summary for your ${payload.jobType} project${payload.jobAddress ? ` at ${payload.jobAddress}` : ''}.`,
      ``,
      total ? `💷 Contract total: ${total}` : '',
      ``,
      `We've emailed the full breakdown — please check it against your own records.`,
      ``,
      payload.companyPhone ? `Any questions? Call us on ${payload.companyPhone}` : '',
    ].filter(l => l !== undefined).join('\n').trim()
  }

  if (payload.type === 'variation_sent') {
    const total = payload.variationTotal != null
      ? `£${payload.variationTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payload.vatIncluded ? ' inc. VAT' : ''}`
      : ''
    const ref = payload.variationRef ? `${payload.variationRef} — ` : ''
    return [
      `Hi ${firstName} 👋`,
      ``,
      `${company} has sent you a change order that needs your approval.`,
      ``,
      `📋 *${ref}${payload.variationTitle || 'Change Order'}*${total ? `\n💷 ${total}` : ''}`,
      ``,
      `Log in to your portal to review and approve or reject:`,
      portalUrl,
      ``,
      payload.companyPhone ? `Any questions? Call us on ${payload.companyPhone}` : '',
    ].filter(l => l !== undefined).join('\n').trim()
  }

  if (payload.type === 'contract_sent') {
    return [
      `Hi ${firstName} 👋`,
      ``,
      `${company} has sent you the building contract for the ${payload.jobType} works${payload.jobAddress ? ` at ${payload.jobAddress}` : ''}.`,
      payload.secondClientName ? `Both you and ${payload.secondClientName} need to sign it.` : '',
      ``,
      `📝 Please read it and sign it online in your portal:`,
      ...portalWhatsAppLines(portalUrl),
      ``,
      payload.companyPhone ? `Any questions? Call us on ${payload.companyPhone}` : '',
    ].filter(l => l !== undefined).join('\n').trim()
  }

  // schedule_updated
  return [
    `Hi ${firstName} 👋`,
    ``,
    `${company} has updated the programme for your project.`,
    ``,
    `🏗 *${payload.jobType}*\n📍 ${payload.jobAddress}`,
    ``,
    `Log in to view the latest schedule:`,
    portalUrl,
    ``,
    payload.companyPhone ? `Any questions? Call us on ${payload.companyPhone}` : '',
  ].filter(l => l !== undefined).join('\n').trim()
}

function buildEmailSubject(payload: NotifyClientPayload): string {
  // Strip newlines/tabs from any value used in the subject — addresses are multi-line
  const clean = (s?: string) => (s ?? '').replace(/[\r\n\t]+/g, ' ').trim()
  const company = clean(payload.companyName) || 'Your Builder'
  if (payload.type === 'quote_sent') {
    const ref  = payload.quoteRef  ? ` (${clean(payload.quoteRef)})`  : ''
    const addr = payload.jobAddress ? ` for ${clean(payload.jobAddress).split(',')[0]}` : ''
    return `${company}: Your quotation${ref}${addr}`
  }
  if (payload.type === 'variation_sent') {
    const ref = payload.variationRef ? ` (${clean(payload.variationRef)})` : ''
    return `${company}: Change order for your approval${ref}`
  }
  if (payload.type === 'job_report') {
    const addr = payload.jobAddress ? ` for ${clean(payload.jobAddress).split(',')[0]}` : ''
    return `${company}: Job Financial Summary${addr}`
  }
  if (payload.type === 'contract_sent') {
    const addr = payload.jobAddress ? ` for ${clean(payload.jobAddress).split(',')[0]}` : ''
    return `${company}: Your building contract is ready to sign${addr}`
  }
  return `${company}: Your project schedule has been updated`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send client messages.' }, { status: 403 })
  const limited = await usageGuard(sb, 'send', 'notify-client')
  if (limited) {
    // the Gantt "Notify client" button reads `sent.errors`, so put the reason there too
    const body = await limited.json()
    return NextResponse.json({ ...body, sent: { email: false, whatsapp: false, errors: [body.error] } }, { status: limited.status })
  }

  let payload: NotifyClientPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Everything below is wrapped in one top-level try/catch: an uncaught exception anywhere
  // here used to fall through to Next.js's own generic error page (not JSON), which made
  // the client's notifyRes.json().catch(() => ({})) silently produce an empty object and
  // show "No error detail returned" — hiding whatever actually broke. Catching here instead
  // keeps the response shape the client already expects, with the real error inside it.
  try {

  const { clientPhone, clientEmail } = payload

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom  = process.env.TWILIO_WHATSAPP_FROM
  const resendKey   = process.env.RESEND_API_KEY
  const fromEmail   = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''

  // Quote emails get a real one-click magic link instead of a plain login-page link, so
  // "View your quote online" actually signs the client in — reuses the same mark_portal_invite
  // RPC the Clients page's "Invite to Portal" button calls, so portal status stays accurate.
  // generateLink() never sends an email itself (Resend does, below), so unlike signInWithOtp
  // this never risks Supabase's own outbound-email rate limit, and never sends a second,
  // separately-branded email alongside the one built here.
  let magicPortalUrl: string | null = null
  if ((payload.type === 'quote_sent' || payload.type === 'contract_sent') && clientEmail) {
    try {
      const link = await createPortalSignInLink(clientEmail, appUrl, payload.type === 'contract_sent' ? '/portal/contracts' : '/portal/quotes')
      if ('error' in link) {
        console.error('[notify-client] sign-in link failed:', link.error)
      } else {
        magicPortalUrl = link.url
        if (payload.clientId) {
          await sb.rpc('mark_portal_invite', { p_client_id: payload.clientId })
        }
      }
    } catch (err) {
      console.error('[notify-client] generateLink exception:', err)
    }
  }

  const portalUrl = magicPortalUrl || payload.portalUrl || (appUrl ? `${appUrl}/portal` : '')

  const results: { whatsapp: boolean; email: boolean; errors: string[] } = {
    whatsapp: false, email: false, errors: [],
  }

  // ── 1. WhatsApp ──────────────────────────────────────────────
  if (clientPhone && twilioSid && twilioToken && twilioFrom) {
    try {
      // A quote's email carries a one-time magic link, so WhatsApp gets the reusable login-page
      // link instead — if both used the one-time link, whichever was opened second would fail.
      const waPortalUrl = (payload.type === 'quote_sent' || payload.type === 'contract_sent') ? (payload.portalUrl || (appUrl ? `${appUrl}/portal/login` : '')) : portalUrl
      const body   = buildWhatsAppBody(payload, waPortalUrl)
      const result = await sendWhatsApp(clientPhone, body, twilioSid, twilioToken, twilioFrom)
      results.whatsapp = result.ok
      if (!result.ok) {
        results.errors.push(`WhatsApp: ${result.error}`)
        console.error('[notify-client] WhatsApp failed:', result.error)
      }
    } catch (err) {
      results.errors.push(`WhatsApp exception: ${err}`)
      console.error('[notify-client] WhatsApp exception:', err)
    }
  }

  // ── 2. Email ─────────────────────────────────────────────────
  // Send email if: no phone number, OR WhatsApp failed, OR email is also configured
  const shouldEmail = clientEmail && resendKey && (!results.whatsapp || clientEmail)
  if (shouldEmail && clientEmail && resendKey) {
    try {
      const html    = buildEmailHtml(payload, portalUrl)
      const subject = buildEmailSubject(payload)

      // PDF attachment (quote_sent type only)
      const attachment = payload.pdfBase64
        ? { filename: payload.pdfFilename || 'Quotation.pdf', content: payload.pdfBase64 }
        : null

      // Route any client reply straight to the real business inbox rather
      // than the no-reply sending address, so nothing gets lost.
      const result = await sendEmail(clientEmail, subject, html, resendKey, senderFrom(fromEmail, payload.companyName), attachment, payload.companyEmail || undefined)
      results.email = result.ok
      if (!result.ok) {
        results.errors.push(`Email: ${result.error}`)
        console.error('[notify-client] Email failed:', result.error)
      }
    } catch (err) {
      results.errors.push(`Email exception: ${err}`)
      console.error('[notify-client] Email exception:', err)
    }
  } else if (clientEmail && !resendKey) {
    // Previously a silent no-op: shouldEmail false with no error ever recorded, which is
    // exactly what produced the unhelpful "No error detail returned" fallback client-side —
    // make the actual reason explicit instead of leaving results.errors empty.
    results.errors.push('Email: RESEND_API_KEY is not set in this environment')
    console.error('[notify-client] RESEND_API_KEY missing — email not attempted')
  }

  // Always 200 — notifications are non-fatal
  return NextResponse.json({ sent: results })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[notify-client] Uncaught exception:', err)
    return NextResponse.json({
      sent: { whatsapp: false, email: false, errors: [`Server exception: ${msg}`] },
    })
  }
}
