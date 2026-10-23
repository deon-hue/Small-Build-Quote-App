// The sign-in email for the subcontractor and client portals: a 6-digit code to type into the page the person is already on, and a button that does the same in one tap. The code is the reliable
// way in: it works however their email app handles links (some open them in a different browser, and some security scanners open a link before the person does, which uses it up).
// Server-safe: plain strings.

import { BRAND, emailShell, emailPara, emailButton, emailCallout } from './email-layout'

export type PortalKind = 'sub' | 'client'

export const portalCodeSubject = (kind: PortalKind): string => (kind === 'sub' ? 'Your subcontractor portal sign-in code' : 'Your client portal sign-in code')

/** A code spaced for reading: 123 456 (6 digits) or 1234 5678 (8). The length is whatever the Supabase project is set to send. */
export const spacedCode = (code: string): string => (code.length >= 6 && code.length % 2 === 0 ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}` : code)

export function buildPortalCodeEmail(o: { kind: PortalKind; code: string; signInUrl: string; product: string }): string {
  const who = o.kind === 'sub' ? 'subcontractor portal' : 'client portal'
  const code = `<div style="margin:0 0 22px;text-align:center"><div style="display:inline-block;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:8px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:8px;color:${BRAND.ink};font-family:'Courier New',monospace">${spacedCode(o.code)}</div></div>`
  return emailShell({
    company: o.product,
    kicker: o.kind === 'sub' ? 'Subcontractor portal' : 'Client portal',
    title: 'Your sign-in code',
    body: [
      emailPara(`Type this code into the ${who} sign-in page to get in. There is no password to remember.`, 18),
      code,
      emailButton(o.signInUrl, 'Or tap here to sign in →', 'The code and this button work once and run out after 60 minutes. If you did not ask to sign in, you can ignore this email.'),
      emailCallout('If the button says the link has already been used, do not worry: some email apps open links before you do. Use the code above instead, on the page you were already on.', 'Tip'),
    ].join('\n      '),
    footerHtml: `Sent by ${o.product}`,
  })
}
