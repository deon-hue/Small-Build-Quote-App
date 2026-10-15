// The automatic reply to a supplier who emailed a quote to the quotes address with nothing we can read attached: it asks them to send it again as a PDF attachment.
// Pure (plain text in, HTML and text out) so it can be shown and tested without sending anything.

import { BRAND, emailShell, emailPara, emailCallout } from './email-layout'

export interface NoAttachmentReplyInput {
  company: string
  companyPhone?: string
  /** the reference to put on the quote, e.g. PO-0007; '' when not known */
  ref: string
  /** from whyNothingReadable(): "there was no file attached to your email" */
  reason: string
  logoUrl?: string
  footerLines?: string[]
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildNoAttachmentReply(p: NoAttachmentReplyInput): { subject: string; html: string; text: string } {
  const refBit = p.ref ? ` with ${p.ref} on it` : ''
  const subject = `We could not read your quote${p.ref ? ` (${p.ref})` : ''}`
  const html = emailShell({
    company: esc(p.company), kicker: 'Your quote', title: 'We could not read your quote', ref: p.ref ? esc(p.ref) : undefined, logoUrl: p.logoUrl,
    body:
      emailPara('Hello,', 12) +
      emailPara(`Thank you for sending a quote to ${esc(p.company)}. We could not use it because ${esc(p.reason)}.`, 14) +
      emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">Please <strong>send it again as a PDF attached to the email</strong> (a photo attached as a file is fine too)${esc(refBit)}. A quote pasted into the writing of the email, or a link to it, cannot be read.</p>`, 'What to do') +
      emailPara(`Thanks,<br><strong>${esc(p.company)}</strong>${p.companyPhone ? `<br>${esc(p.companyPhone)}` : ''}`, 0),
    footerHtml: (p.footerLines && p.footerLines.length ? p.footerLines : [`<strong style="color:#ffffff">${esc(p.company)}</strong>`]).join('<br>'),
  })
  const text = [
    'Hello,', '',
    `Thank you for sending a quote to ${p.company}. We could not use it because ${p.reason}.`, '',
    `Please send it again as a PDF attached to the email (a photo attached as a file is fine too)${refBit}. A quote pasted into the writing of the email, or a link to it, cannot be read.`, '',
    'Thanks,', p.company + (p.companyPhone ? `\n${p.companyPhone}` : ''),
  ].join('\n')
  return { subject, html, text }
}
