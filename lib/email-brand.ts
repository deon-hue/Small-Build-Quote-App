// Branding rules for emails sent to a contractor's customers and subcontractors:
// the contractor is the sender they know ("Acme Build via BuildOS Pro"), replies go to the contractor,
// and BuildOS Pro appears only as a small "Powered by" credit at the foot.

import { PRODUCT_NAME } from './product-config'

/** `"<Company> via BuildOS Pro" <noreply@…>` — keeps an address that is already in "Name <addr>" form as it is. */
export function senderFrom(fromEmail: string, companyName?: string): string {
  if (fromEmail.includes('<')) return fromEmail
  const clean = (companyName || '').replace(/["<>\r\n\\]/g, '').trim()
  const display = clean ? `${clean} via ${PRODUCT_NAME}` : PRODUCT_NAME
  return `"${display}" <${fromEmail}>`
}

const POWERED_BY = `<p style="text-align:center;font-size:11px;color:#9a9ea1;margin:16px 0 24px;font-family:Arial,Helvetica,sans-serif">Powered by <strong style="color:#7da826">${PRODUCT_NAME}</strong></p>`

/** Adds the "Powered by" line just before the closing </body> (or at the end if there isn't one). */
export function withPoweredBy(html: string): string {
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i === -1 ? html + POWERED_BY : html.slice(0, i) + POWERED_BY + html.slice(i)
}
