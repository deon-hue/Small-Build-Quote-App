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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotifyClientPayload {
  type: 'variation_sent' | 'schedule_updated' | 'quote_sent'

  // Recipient
  clientName:   string
  clientPhone?: string   // any UK format; normalised server-side
  clientEmail?: string

  // Job context
  jobType:    string
  jobAddress: string

  // variation_sent fields
  variationRef?:   string
  variationTitle?: string
  variationTotal?: number
  vatIncluded?:    boolean

  // quote_sent fields
  quoteRef?:   string
  quoteTotal?: number
  message?:    string   // optional personal message from the builder

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

function buildEmailHtml(payload: NotifyClientPayload, portalUrl: string): string {
  const company = payload.companyName || 'Your Builder'
  const firstName = payload.clientName.split(' ')[0] || payload.clientName

  if (payload.type === 'quote_sent') {
    const total = payload.quoteTotal != null
      ? `£${payload.quoteTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payload.vatIncluded ? ' inc. VAT' : ''}`
      : ''
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#2b3a2b;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="color:#c8d8a8;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${company}</div>
        <div style="color:#fff;font-size:22px;font-weight:700">Your Quotation</div>
      </div>
      ${payload.quoteRef ? `<div style="color:#c8d8a8;font-size:14px;font-weight:600">${payload.quoteRef}</div>` : ''}
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#2b2f33">Dear ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#2b2f33;line-height:1.6">
        Thank you for the opportunity to quote for the works${payload.jobAddress ? ` at <strong>${payload.jobAddress}</strong>` : ''}.
        Please find attached our detailed quotation for the <strong>${payload.jobType}</strong> works.
      </p>
      ${payload.message ? `<div style="background:#f8faf2;border-left:3px solid #7ab533;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0"><p style="margin:0;font-size:14px;color:#2b2f33;line-height:1.6">${payload.message.replace(/\n/g, '<br>')}</p></div>` : ''}
      <div style="background:#f8fafc;border:1px solid #dde1e5;border-radius:8px;padding:18px 20px;margin-bottom:24px">
        ${payload.quoteRef ? `<div style="font-size:11px;color:#6b7580;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${payload.quoteRef}</div>` : ''}
        <div style="font-weight:700;font-size:16px;color:#1e2022;margin-bottom:6px">${payload.jobType}</div>
        <div style="font-size:13px;color:#6b7580">${payload.jobAddress || ''}</div>
        ${total ? `<div style="font-size:22px;font-weight:700;color:#2b3a2b;margin-top:12px;font-family:'DM Mono',monospace">${total}</div>` : ''}
      </div>
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#5d4037;">
          📎 <strong>Your quotation PDF is attached</strong> to this email. Please open the attachment to view the full breakdown.
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#6b7580;line-height:1.6">
        This quotation is valid for 30 days. Please do not hesitate to contact us if you have any questions or would like to discuss anything.
        ${payload.companyPhone ? `<br><br>📞 <strong>${payload.companyPhone}</strong>` : ''}
        ${payload.companyEmail ? `<br>✉ <strong>${payload.companyEmail}</strong>` : ''}
      </p>
    </div>
    <div style="background:#f4f4f0;padding:16px 32px;border-top:1px solid #dde1e5">
      <div style="font-size:11px;color:#9aa3ad">Kind regards · ${company}</div>
    </div>
  </div>
</body>
</html>`
  }

  if (payload.type === 'variation_sent') {
    const total = payload.variationTotal != null
      ? `£${payload.variationTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payload.vatIncluded ? ' inc. VAT' : ''}`
      : ''
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#2b3a2b;padding:28px 32px">
      <div style="color:#c8d8a8;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${company}</div>
      <div style="color:#fff;font-size:22px;font-weight:700">Change Order for Approval</div>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#2b2f33">Hi ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#2b2f33;line-height:1.6">
        ${company} has submitted a change order on your project that requires your approval.
      </p>
      <div style="background:#f8fafc;border:1px solid #dde1e5;border-radius:8px;padding:18px 20px;margin-bottom:24px">
        ${payload.variationRef ? `<div style="font-size:11px;color:#6b7580;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${payload.variationRef}</div>` : ''}
        <div style="font-weight:700;font-size:16px;color:#1e2022;margin-bottom:6px">${payload.variationTitle || 'Change Order'}</div>
        <div style="font-size:13px;color:#6b7580">${payload.jobType} · ${payload.jobAddress}</div>
        ${total ? `<div style="font-size:22px;font-weight:700;color:#2b3a2b;margin-top:12px;font-family:'DM Mono',monospace">${total}</div>` : ''}
      </div>
      <a href="${portalUrl}" style="display:inline-block;background:#2b3a2b;color:#fff;text-decoration:none;padding:13px 28px;border-radius:6px;font-size:14px;font-weight:700;margin-bottom:24px">
        Review &amp; Approve →
      </a>
      <p style="margin:0;font-size:13px;color:#6b7580;line-height:1.6">
        Log in to your client portal to view the full details, ask questions, approve or reject this change.
        ${payload.companyPhone ? `<br>Questions? Call us on <strong>${payload.companyPhone}</strong>` : ''}
      </p>
    </div>
    <div style="background:#f4f4f0;padding:16px 32px;border-top:1px solid #dde1e5">
      <div style="font-size:11px;color:#9aa3ad">This notification was sent by ${company}. Log in at <a href="${portalUrl}" style="color:#4a7c1f">${portalUrl}</a></div>
    </div>
  </div>
</body>
</html>`
  }

  // schedule_updated
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#2b3a2b;padding:28px 32px">
      <div style="color:#c8d8a8;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${company}</div>
      <div style="color:#fff;font-size:22px;font-weight:700">Your Project Schedule Has Been Updated</div>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#2b2f33">Hi ${firstName},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#2b2f33;line-height:1.6">
        ${company} has updated the programme for your project.
      </p>
      <div style="background:#f8fafc;border:1px solid #dde1e5;border-radius:8px;padding:18px 20px;margin-bottom:24px">
        <div style="font-weight:700;font-size:16px;color:#1e2022;margin-bottom:4px">${payload.jobType}</div>
        <div style="font-size:13px;color:#6b7580">${payload.jobAddress}</div>
      </div>
      <a href="${portalUrl}" style="display:inline-block;background:#2b3a2b;color:#fff;text-decoration:none;padding:13px 28px;border-radius:6px;font-size:14px;font-weight:700;margin-bottom:24px">
        View Updated Schedule →
      </a>
      <p style="margin:0;font-size:13px;color:#6b7580;line-height:1.6">
        Log in to your portal to see the latest programme and progress update.
        ${payload.companyPhone ? `<br>Questions? Call us on <strong>${payload.companyPhone}</strong>` : ''}
      </p>
    </div>
    <div style="background:#f4f4f0;padding:16px 32px;border-top:1px solid #dde1e5">
      <div style="font-size:11px;color:#9aa3ad">This notification was sent by ${company}. Log in at <a href="${portalUrl}" style="color:#4a7c1f">${portalUrl}</a></div>
    </div>
  </div>
</body>
</html>`
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  apiKey: string,
  from: string,
  attachment?: { filename: string; content: string } | null,
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = { from, to, subject, html }
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
      `We've also sent a PDF copy to your email.`,
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
  return `${company}: Your project schedule has been updated`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: NotifyClientPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { clientPhone, clientEmail } = payload

  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom  = process.env.TWILIO_WHATSAPP_FROM
  const resendKey   = process.env.RESEND_API_KEY
  const fromEmail   = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''

  const portalUrl = payload.portalUrl || (appUrl ? `${appUrl}/portal` : '')

  const results: { whatsapp: boolean; email: boolean; errors: string[] } = {
    whatsapp: false, email: false, errors: [],
  }

  // ── 1. WhatsApp ──────────────────────────────────────────────
  if (clientPhone && twilioSid && twilioToken && twilioFrom) {
    try {
      const body   = buildWhatsAppBody(payload, portalUrl)
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

      const result = await sendEmail(clientEmail, subject, html, resendKey, fromEmail, attachment)
      results.email = result.ok
      if (!result.ok) {
        results.errors.push(`Email: ${result.error}`)
        console.error('[notify-client] Email failed:', result.error)
      }
    } catch (err) {
      results.errors.push(`Email exception: ${err}`)
      console.error('[notify-client] Email exception:', err)
    }
  }

  // Always 200 — notifications are non-fatal
  return NextResponse.json({ sent: results })
}
