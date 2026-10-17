// The body of the "Request for a price" email a supplier gets (the route wraps it in the shared email shell). Pure: plain text in, HTML out, so it can be
// shown and tested without sending anything. Everything passed in is plain text and is escaped here.

import { BRAND, emailPara, emailCard, emailCallout, emailButton } from './email-layout'

export interface PriceRequestEmailInput {
  hello: string
  title: string
  details: string
  /** already worded, e.g. "Friday 16 October, morning" ('' leaves the row out) */
  needed: string
  collect: string
  where: string
  /** e.g. "5 days: give your rate per day" ('' for a fixed price) */
  priceFor: string
  link: string
  ref: string
  /** the company's own quotes address; '' when none is set up */
  inboxEmail: string
  senderName: string
  companyName: string
  companyPhone: string
  /** the request was changed after this supplier was last sent it */
  amended?: boolean
  /** their own quote reference from an earlier reply, if they gave one */
  theirRef?: string
  /** our account number with this supplier ('' when there is none) */
  account?: string
  /** no price form: the supplier quotes from their own system and emails the quote to inboxEmail (see lib/supplier-quote-config.ts) */
  listOnly?: boolean
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function priceRequestBody(p: PriceRequestEmailInput): string {
  const e = esc
  const cell = (k: string, v: string) => v
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};width:96px;font-size:13px;color:${BRAND.muted};vertical-align:top">${k}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:600;color:${BRAND.ink};line-height:1.5">${v}</td></tr>`
    : ''
  const rows = [
    cell('What', e(p.title) + (p.details ? `<br><span style="font-weight:400;color:${BRAND.muted}">${e(p.details).replace(/\n/g, '<br>')}</span>` : '')),
    cell('Needed', e(p.needed)),
    cell('Collect', e(p.collect)),
    cell('Where', e(p.where)),
    cell('Price for', e(p.priceFor)),
    cell('Our account', e(p.account ?? '')),
  ].join('')

  if (p.listOnly && p.inboxEmail) {
    return (
      emailPara(`Hello ${e(p.hello)},`, 12) +
      emailPara(p.amended
        ? `We have changed this request since we last sent it to you${p.theirRef ? ` (your earlier quote reference was <strong>${e(p.theirRef)}</strong>)` : ''}. Please look at the details below and send us an updated quote.`
        : 'Could you please quote for the following?', 14) +
      emailCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`) +
      emailCallout(`<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${BRAND.ink}">Please quote from your own system and <strong>email the quote as a PDF attached to the email</strong> to:</p><p style="margin:0 0 8px;font-size:15px;font-weight:700;color:${BRAND.ink}">${e(p.inboxEmail)}</p><p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">It <strong>must show our purchase order number ${e(p.ref)}</strong>: please put it on the quote and in the email subject. A quote pasted into the email, or sent as a link, cannot be read.</p>`, 'How to reply') +
      emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">Our purchase order number is <strong>${e(p.ref)}</strong>. If we go ahead we will send you the order with the full address, and ask you to quote ${e(p.ref)} on your invoice.</p>`, 'Reference') +
      emailPara(`Thanks,<br><strong>${e(p.senderName || p.companyName || '')}</strong>${p.companyPhone ? `<br>${e(p.companyPhone)}` : ''}`, 0)
    )
  }

  return (
    emailPara(`Hello ${e(p.hello)},`, 12) +
    emailPara(p.amended
      ? `We have changed this request since we last sent it to you, so please check the details below and update your price if it changes.${p.theirRef ? ` Your earlier quote reference was <strong>${e(p.theirRef)}</strong>.` : ''} It takes a minute and you do not need to log in.`
      : 'Please could you give us a price for the following. It takes a minute and you do not need to log in.', 14) +
    emailCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`) +
    emailButton(e(p.link), p.amended ? 'Check and update your price' : 'Give your price', p.inboxEmail ? 'Price, earliest delivery date and how long the price stands.' : 'Price, earliest delivery date and how long the price stands. Or press reply and tell us.') +
    (p.inboxEmail ? emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">You can send us your own quote from your own system instead. Just <strong>forward or email it as a PDF attached to the email</strong> (a photo attached as a file is fine too) to <strong>${e(p.inboxEmail)}</strong> and put <strong>${e(p.ref)}</strong> on it. A quote pasted into the writing of the email, or a link to it, cannot be read. We will match it to this request, so there is no need to fill in the form as well.</p>`, 'Use your own quoting system?') : '') +
    emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">Our reference is <strong>${e(p.ref)}</strong>. If we go ahead we will send you the order with the full address, and ask you to quote ${e(p.ref)} on your invoice.</p>`, 'Reference') +
    emailPara(`Thanks,<br><strong>${e(p.senderName || p.companyName || '')}</strong>${p.companyPhone ? `<br>${e(p.companyPhone)}` : ''}`, 0)
  )
}
