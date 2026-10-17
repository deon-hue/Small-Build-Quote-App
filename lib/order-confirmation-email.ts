// The body of the email that confirms an ORDER to a supplier (the route wraps it in the shared email shell): "yes, please go ahead", our order reference, their quote reference,
// what, where to, and the delivery date to confirm. Pure: plain text in, HTML out, so it can be shown and tested without sending anything. Everything passed in is escaped here.

import { BRAND, emailPara, emailCard, emailCallout } from './email-layout'

export interface OrderConfirmationInput {
  hello: string
  /** it follows a quote the builder approved */
  fromQuote: boolean
  poRef: string
  theirRef: string
  account: string
  title: string
  /** the note and the items, one per line */
  details: string
  deliverTo: string
  /** "Friday 16 October, morning", or '' when no date is set */
  when: string
  collect: string
  contact: string
  access: string
  /** "£123.45 + VAT" or '' */
  price: string
  /** an extra message the builder typed, if any */
  note: string
  senderName: string
  companyName: string
  companyPhone: string
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function orderConfirmationBody(p: OrderConfirmationInput): string {
  const cell = (k: string, v: string, strong = true) => v
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};width:112px;font-size:13px;color:${BRAND.muted};vertical-align:top">${k}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:${strong ? 600 : 400};color:${BRAND.ink};line-height:1.5">${v}</td></tr>`
    : ''
  const nl = (s: string) => esc(s).replace(/\n/g, '<br>')
  const rows = [
    cell('Our order ref', `<strong>${esc(p.poRef)}</strong>`),
    cell('Your quote ref', esc(p.theirRef)),
    cell('Our account', esc(p.account)),
    cell('What', esc(p.title) + (p.details ? `<br><span style="font-weight:400;color:${BRAND.muted}">${nl(p.details)}</span>` : '')),
    cell('Deliver to', nl(p.deliverTo)),
    cell('Delivery date', p.when ? `<strong>${esc(p.when)}</strong>` : '<span style="font-weight:400;color:' + BRAND.muted + '">Please tell us when you can deliver</span>'),
    cell('Collect', esc(p.collect)),
    cell('Site contact', esc(p.contact)),
    cell('Access', nl(p.access)),
    cell('Agreed price', esc(p.price), false),
  ].join('')
  const confirm = p.when
    ? `Please <strong>reply to confirm you will deliver on ${esc(p.when)}</strong>, and quote <strong>${esc(p.poRef)}</strong> on your invoice.`
    : `Please <strong>reply with the date you can deliver</strong>, and quote <strong>${esc(p.poRef)}</strong> on your invoice.`
  return (
    emailPara(`Hello ${esc(p.hello)},`, 12) +
    emailPara(p.fromQuote
      ? `Thank you for your quote${p.theirRef ? ` (your ref <strong>${esc(p.theirRef)}</strong>)` : ''}. <strong>Yes, we would like you to go ahead with this order.</strong>`
      : 'We would like to place the following order with you.', 14) +
    emailCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`) +
    (p.note.trim() ? emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">${nl(p.note.trim())}</p>`) : '') +
    emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">${confirm}</p>`, 'Please confirm') +
    emailPara(`Thanks,<br><strong>${esc(p.senderName || p.companyName || '')}</strong>${p.companyPhone ? `<br>${esc(p.companyPhone)}` : ''}`, 0)
  )
}
