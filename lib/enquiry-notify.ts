// Tells the company (by email) when a new enquiry arrives from its public enquiry form. Replying to the email goes straight to the enquirer.
// It never throws: a failed email must never lose an enquiry, which is already saved in the Leads list by the time this runs.

import { senderFrom, withPoweredBy, escapeHtml } from './email-brand'
import { BRAND, emailShell, emailPara, emailButton } from './email-layout'
import { sourceFromSrc, type EnquiryInput } from './enquiry'

export interface EnquiryEmail { subject: string; html: string; replyTo?: string }

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()

/** The email's words. Everything the visitor typed is escaped, so nothing they type can put markup or a link of their own in the builder's inbox. */
export function buildEnquiryEmail(companyName: string, e: EnquiryInput, leadsUrl: string, logoUrl?: string): EnquiryEmail {
  const row = (label: string, value: string) => value
    ? `<tr><td style="padding:6px 14px 6px 0;font-size:12px;color:${BRAND.muted};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top">${value}</td></tr>`
    : ''
  const email = e.email ? `<a href="mailto:${escapeHtml(e.email)}" style="color:${BRAND.limeDark}">${escapeHtml(e.email)}</a>` : ''
  const phone = e.phone ? `<a href="tel:${escapeHtml(e.phone.replace(/[^0-9+]/g, ''))}" style="color:${BRAND.limeDark}">${escapeHtml(e.phone)}</a>` : ''
  const where = [e.address, e.postcode].filter(Boolean).join(', ')
  const what = escapeHtml(e.description).replace(/\n/g, '<br>')
  const files = e.files.length ? `${e.files.length} ${e.files.length === 1 ? 'file' : 'files'} attached (open the lead to see ${e.files.length === 1 ? 'it' : 'them'})` : ''

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;width:100%">${[
    row('Name', escapeHtml(e.name)), row('Email', email), row('Phone', phone), row('Address', escapeHtml(where)),
    row('Kind of job', escapeHtml(e.jobType)), row('Hopes to start', escapeHtml(e.timing)), row('Came from', escapeHtml(sourceFromSrc(e.src))), row('Files', escapeHtml(files)),
  ].join('')}</table>`

  const html = emailShell({
    company: escapeHtml(companyName), kicker: 'Enquiry', title: '📬 New enquiry', logoUrl,
    body: [
      emailPara(`<strong>${escapeHtml(e.name)}</strong> has sent an enquiry through your enquiry form.`, 14),
      table,
      `<div style="margin:0 0 22px;padding:14px 16px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:6px;font-size:14px;line-height:1.6;color:${BRAND.ink}">${what}</div>`,
      leadsUrl ? emailButton(escapeHtml(leadsUrl), 'Open your Leads →') : '',
      `<p style="margin:18px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.6">Reply to this email to answer them directly. It is already in your Leads list as a New lead.</p>`,
    ].join('\n      '),
    footerHtml: `Sent by your enquiry form · ${escapeHtml(companyName)}`,
  })
  return { subject: oneLine(`📬 New enquiry — ${e.name}${e.jobType ? ' · ' + e.jobType : ''}`).slice(0, 200), html, replyTo: e.email || undefined }
}

export async function notifyBuilderOfEnquiry(opts: { to: string; companyName: string; input: EnquiryInput; origin: string; ownerId: string; hasLogo: boolean }): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY
    if (!key || !opts.to) return
    const origin = opts.origin.replace(/\/+$/, '')
    const mail = buildEnquiryEmail(opts.companyName, opts.input, origin ? `${origin}/quote-requests` : '', opts.hasLogo && origin ? `${origin}/api/public/company-logo/${opts.ownerId}` : undefined)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', opts.companyName),
        to: opts.to,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        subject: mail.subject,
        html: withPoweredBy(mail.html),
      }),
    })
    if (!res.ok) console.error('[enquiry] notification email refused:', res.status)
  } catch (err) {
    console.error('[enquiry] notification email failed (the enquiry is saved):', err)
  }
}

// ── The thank-you to the person who sent the enquiry (a company switches it on; it is off to start) ────────────────

/** The email's words. The enquirer typed their own name and address, so everything is escaped; the company's name is escaped too. Nothing in it is a link, and it says what to do if the enquiry was not theirs. */
export function buildEnquiryThanksEmail(companyName: string, e: EnquiryInput, logoUrl?: string): EnquiryEmail {
  const first = (e.name || '').trim().split(/\s+/)[0] || ''
  const sent = [e.jobType ? `Kind of job: ${e.jobType}` : '', [e.address, e.postcode].filter(Boolean).join(', ') ? `Address: ${[e.address, e.postcode].filter(Boolean).join(', ')}` : '', e.files.length ? `${e.files.length} ${e.files.length === 1 ? 'file' : 'files'} attached` : '']
    .filter(Boolean).map(l => `<div style="font-size:14px;color:${BRAND.ink};padding:2px 0">${escapeHtml(l)}</div>`).join('')
  const html = emailShell({
    company: escapeHtml(companyName), kicker: 'Enquiry received', title: first ? `Thank you, ${escapeHtml(first)}` : 'Thank you', logoUrl,
    body: [
      emailPara(`${escapeHtml(companyName)} has received your enquiry and will be in touch.`, 14),
      sent ? `<div style="margin:0 0 18px;padding:12px 16px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:6px"><div style="font-size:12px;color:${BRAND.muted};margin-bottom:4px">What you sent</div>${sent}</div>` : '',
      `<p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.6">You can reply to this email to add anything you forgot. If you did not send an enquiry, you can ignore this message.</p>`,
    ].join('\n      '),
    footerHtml: `Kind regards · ${escapeHtml(companyName)}`,
  })
  return { subject: oneLine(`We have received your enquiry — ${companyName}`).slice(0, 200), html }
}

/** Sends the thank-you. Only to an address that passed the enquiry checks; replies go to the company. Never throws. */
export async function sendEnquiryThanks(opts: { companyName: string; companyEmail: string; input: EnquiryInput; origin: string; ownerId: string; hasLogo: boolean }): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY
    if (!key || !opts.input.email) return
    const origin = opts.origin.replace(/\/+$/, '')
    const mail = buildEnquiryThanksEmail(opts.companyName, opts.input, opts.hasLogo && origin ? `${origin}/api/public/company-logo/${opts.ownerId}` : undefined)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', opts.companyName),
        to: opts.input.email,
        ...(opts.companyEmail ? { reply_to: opts.companyEmail } : {}),
        subject: mail.subject,
        html: withPoweredBy(mail.html),
      }),
    })
    if (!res.ok) console.error('[enquiry] thank-you email refused:', res.status)
  } catch (err) {
    console.error('[enquiry] thank-you email failed (the enquiry is saved):', err)
  }
}
