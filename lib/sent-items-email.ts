// The email a lead or contact gets when the company sends them something from the app (design ideas, photographs, a scope of works, a brief): the company's own message, with the files attached.
// Everything typed by the builder is escaped. Replies go to the company. It never adds a price, a quote or a link to anything else.

import { BRAND, emailShell, emailPara } from './email-layout'
import { escapeHtml } from './email-brand'
import { emailParagraphs } from './sent-items'

export interface SentEmail { subject: string; html: string; text: string }

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim()

export function buildSentEmail(o: { companyName: string; firstName: string; subject: string; body: string; fileNames: string[]; phone?: string; logoUrl?: string }): SentEmail {
  const company = escapeHtml(o.companyName)
  const paras = emailParagraphs({ firstName: o.firstName, body: o.body })
  const title = o.subject.trim() || 'Some information for you'
  const files = o.fileNames.length
    ? `<div style="margin:0 0 18px;padding:12px 16px;border-left:3px solid ${BRAND.lime};background:${BRAND.card};font-size:13px;line-height:1.7;color:${BRAND.ink}"><strong>Attached (${o.fileNames.length})</strong><br>${o.fileNames.map(n => escapeHtml(n)).join('<br>')}</div>`
    : ''
  const html = emailShell({
    company, kicker: 'Information', logoUrl: o.logoUrl, title: escapeHtml(title),
    body: [
      ...paras.map((p, i) => emailPara(escapeHtml(p).replace(/\n/g, '<br>'), i === paras.length - 1 ? 14 : 10)),
      files,
      `<p style="margin:18px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.6">If you have any questions, just reply to this email${o.phone ? ` or call us on <strong>${escapeHtml(o.phone)}</strong>` : ''}.</p>`,
    ].join('\n      '),
    footerHtml: `Kind regards · ${company}`,
  })
  const text = [...paras, o.fileNames.length ? `Attached: ${o.fileNames.join(', ')}` : '', `Kind regards, ${o.companyName}`].filter(Boolean).join('\n\n')
  return { subject: oneLine(title).slice(0, 200), html, text }
}
