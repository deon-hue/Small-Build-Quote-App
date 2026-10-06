// One look for every email the app sends on a builder's behalf, matching the quote and the website: a white header with a lime rule and the
// company's initial in a lime square, lime buttons and callouts, and a charcoal footer. Every template builds on these pieces so the colours
// can only ever be changed in one place.
//
// Server-safe: plain strings, no imports. Callers pass text that is ALREADY HTML-safe (the routes escape what the sender typed before it
// reaches the template) — nothing in here escapes again, so the pieces can also carry deliberate HTML such as <strong>.

export const BRAND = {
  lime: '#7ab533',
  limeDark: '#5e8f20',
  ink: '#1e2022',
  charcoal: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  paper: '#f1f5f9',
  card: '#f8fafc',
} as const

const FONT = `'DM Sans',Helvetica,Arial,sans-serif`

function initialOf(company: string): string {
  const c = company.trim()
  const ch = c.startsWith('&') ? '' : c.charAt(0)     // an escaped "&amp;" is not a letter
  return (ch || 'B').toUpperCase()
}

export interface EmailShellOptions {
  /** Company name (HTML-safe) shown in the header and footer */
  company: string
  /** Small uppercase label under the company name, e.g. "Quotation" */
  kicker: string
  /** The big heading at the top of the body */
  title: string
  /** Optional reference shown at the right of the header, e.g. "QT-1234" */
  ref?: string
  /** Everything between the heading and the footer (HTML-safe) */
  body: string
  /** The footer line (HTML-safe). Defaults to "Kind regards · Company" */
  footerHtml?: string
}

export function emailShell(o: EmailShellOptions): string {
  const footer = o.footerHtml ?? `Kind regards · ${o.company}`
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.paper};font-family:${FONT};color:${BRAND.ink}">
  <div style="max-width:580px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${BRAND.lime};background:#f8faf8">
      <tr>
        <td style="padding:26px 32px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:52px;height:52px;background:${BRAND.lime};border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-size:24px;font-weight:700">${initialOf(o.company)}</td>
            <td style="padding-left:16px;vertical-align:middle">
              <div style="font-size:18px;font-weight:700;color:${BRAND.ink}">${o.company}</div>
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.muted};margin-top:2px">${o.kicker}</div>
            </td>
          </tr></table>
        </td>
        ${o.ref ? `<td style="padding:26px 32px 26px 0;text-align:right;vertical-align:middle;font-size:13px;font-weight:700;color:${BRAND.muted};white-space:nowrap">${o.ref}</td>` : ''}
      </tr>
    </table>
    <div style="padding:30px 32px 26px">
      <div style="font-size:22px;font-weight:700;color:${BRAND.ink};margin:0 0 16px">${o.title}</div>
      ${o.body}
    </div>
    <div style="background:${BRAND.charcoal};padding:20px 32px;font-size:12px;color:rgba(255,255,255,0.75);line-height:1.6">${footer}</div>
  </div>
</body>
</html>`
}

/** A normal paragraph of body text */
export function emailPara(html: string, marginBottom = 18): string {
  return `<p style="margin:0 0 ${marginBottom}px;font-size:15px;line-height:1.6;color:${BRAND.ink}">${html}</p>`
}

/** The lime call-to-action button, with an optional small note under it */
export function emailButton(href: string, label: string, note?: string): string {
  return `<div style="margin:0 0 24px">
        <a href="${href}" style="display:inline-block;background:${BRAND.lime};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:6px;font-size:15px;font-weight:700">${label}</a>
        ${note ? `<p style="margin:12px 0 0;font-size:12px;color:${BRAND.faint};line-height:1.5">${note}</p>` : ''}
      </div>`
}

/** A grey summary card (reference, title, address, amount…) */
export function emailCard(html: string): string {
  return `<div style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:8px;padding:18px 20px;margin:0 0 24px">${html}</div>`
}

/** A callout with a lime bar down the left, for the builder's own message and for "what this is for" boxes */
export function emailCallout(html: string, heading?: string): string {
  return `<div style="background:${BRAND.card};border-left:3px solid ${BRAND.lime};border-radius:0 6px 6px 0;padding:16px 20px;margin:0 0 24px">
        ${heading ? `<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.limeDark};margin-bottom:8px">${heading}</div>` : ''}
        ${html}
      </div>`
}

/** An amber notice, e.g. "your PDF is attached" */
export function emailNotice(html: string): string {
  return `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;margin:0 0 24px"><p style="margin:0;font-size:13px;color:#5d4037;line-height:1.5">${html}</p></div>`
}

/** The closing "get in touch" paragraph with the builder's phone and email */
export function emailContact(lead: string, phone?: string, email?: string): string {
  return `<p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.7">
        ${lead}
        ${phone ? `<br><br>📞 <strong style="color:${BRAND.ink}">${phone}</strong>` : ''}
        ${email ? `<br>${phone ? '' : '<br>'}✉ <strong style="color:${BRAND.ink}">${email}</strong>` : ''}
      </p>`
}

/** A link coloured for this brand */
export function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:${BRAND.limeDark};text-decoration:none">${label}</a>`
}
