// The email a customer gets about a site visit (booked, changed or cancelled), with the words from lib/lead-visit.ts and a calendar file attached. Everything typed by the builder or the customer is escaped.
// Replies go to the company. It never contains anything but the visit itself: no price, no quote.

import { BRAND, emailShell, emailPara, emailButton } from './email-layout'
import { escapeHtml } from './email-brand'
import { durationWords, visitMessageText, type VisitWords } from './lead-visit'

export interface VisitEmail { subject: string; html: string; text: string }

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()

/** `mapsLink` is a Google Maps link for the address, or '' */
export function buildVisitEmail(w: VisitWords, opts: { logoUrl?: string; mapsLink?: string } = {}): VisitEmail {
  const company = escapeHtml(w.companyName)
  const row = (label: string, value: string) => value ? `<tr><td style="padding:6px 14px 6px 0;font-size:12px;color:${BRAND.muted};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:15px;color:${BRAND.ink};vertical-align:top"><strong>${value}</strong></td></tr>` : ''
  const hello = w.firstName ? `Hello ${escapeHtml(w.firstName)},` : 'Hello,'

  const intro = w.kind === 'cancelled'
    ? `We are sorry, but we need to cancel the site visit${w.wasLong ? ` we had booked for <strong>${escapeHtml(w.wasLong)}</strong>` : ''}.`
    : w.kind === 'changed'
      ? `The time of your site visit has changed${w.wasLong ? ` (it was ${escapeHtml(w.wasLong)})` : ''}. Your new time is below.`
      : 'Thank you for your enquiry. We have booked a visit to look at the job.'

  const details = w.kind === 'cancelled' ? '' : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:6px;padding:10px 16px">${[
    row('When', escapeHtml(w.whenLong)), row('How long', escapeHtml(durationWords(w.minutes))), row('Where', escapeHtml(w.address.replace(/\s*\n\s*/g, ', '))),
  ].join('')}</table>`

  const closing = w.kind === 'cancelled'
    ? `We will be in touch to arrange another time${w.phone ? `, or you can call us on <strong>${escapeHtml(w.phone)}</strong>` : ''}.`
    : `If you need to change it, please reply to this email${w.phone ? ` or call us on <strong>${escapeHtml(w.phone)}</strong>` : ''}. The attached file adds the visit to your calendar.`

  const html = emailShell({
    company, kicker: 'Site visit', logoUrl: opts.logoUrl,
    title: w.kind === 'cancelled' ? 'Site visit cancelled' : w.kind === 'changed' ? 'Site visit time changed' : 'Your site visit is booked',
    body: [
      emailPara(hello, 10),
      emailPara(intro, 14),
      details,
      w.kind !== 'cancelled' && w.note ? `<div style="margin:0 0 18px;padding:12px 16px;border-left:3px solid ${BRAND.lime};background:${BRAND.card};font-size:14px;line-height:1.6;color:${BRAND.ink}">${escapeHtml(w.note).replace(/\n/g, '<br>')}</div>` : '',
      w.kind !== 'cancelled' && opts.mapsLink ? emailButton(escapeHtml(opts.mapsLink), 'See the address on a map →') : '',
      `<p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.6">${closing}</p>`,
    ].join('\n      '),
    footerHtml: `Kind regards · ${company}`,
  })

  const subject = w.kind === 'cancelled'
    ? `Site visit cancelled — ${w.companyName}`
    : `${w.kind === 'changed' ? 'Site visit changed' : 'Site visit booked'}: ${w.whenLong} — ${w.companyName}`
  return { subject: oneLine(subject).slice(0, 200), html, text: visitMessageText(w) }
}
