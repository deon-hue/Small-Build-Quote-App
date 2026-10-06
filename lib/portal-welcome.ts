/**
 * The wording every message that introduces a client to the portal uses — the quote email,
 * the quote WhatsApp, and the portal invite — so what the portal is for, and how to put it on
 * a home screen, is explained the same way everywhere. Server-safe (plain strings, no imports).
 */

import { BRAND, emailCallout } from './email-layout'

const USES: [string, string][] = [
  ['Your quote', 'read it, ask us questions and approve it online'],
  ['Work schedule', 'see what is happening on site, and when'],
  ['Changes', 'review and approve any extra or changed work'],
  ['Invoices', 'see what is due and what you have paid'],
  ['Plans and documents', 'download the drawings and paperwork we share with you'],
]

const INSTALL: [string, string][] = [
  ['iPhone (Safari)', 'open the portal, tap the Share button, then "Add to Home Screen".'],
  ['Android (Chrome)', 'open the portal, tap the ⋮ menu, then "Add to Home screen" (or "Install app").'],
  ['Computer', 'in Chrome or Edge, click the install icon at the right of the address bar, or open the menu and choose "Install". On a Mac in Safari, choose File, then "Add to Dock".'],
]

/** HTML block for the email: what the portal is for, then how to add it to a home screen. Same look as every other email (lib/email-layout.ts). */
export function portalExplainerHtml(): string {
  const uses = USES.map(([t, d]) => `<li style="margin:0 0 4px"><strong style="color:${BRAND.ink}">${t}</strong> – ${d}</li>`).join('')
  const install = INSTALL.map(([p, s]) =>
    `<div style="margin:0 0 8px;font-size:13px;color:#4a5568;line-height:1.6"><strong style="color:${BRAND.ink}">${p}:</strong> ${s}</div>`).join('')
  return emailCallout(
    `<ul style="margin:0 0 18px;padding-left:18px;font-size:13.5px;color:#4a5568;line-height:1.7">${uses}</ul>
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.limeDark};margin-bottom:6px">Keep it one tap away</div>
        <p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.6">Add the portal to your home screen and it opens like an app, with no App Store needed.</p>
        ${install}
        <p style="margin:10px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.6">The first time you open it from your home screen you may be asked to sign in once.</p>`,
    'What your client portal is for',
  )
}

/** Plain-text lines for WhatsApp. Pass the (reusable) portal address; empty means leave it out. */
export function portalWhatsAppLines(portalUrl: string): string[] {
  const lines = [
    `Your client portal lets you view and approve your quote, follow the work schedule, approve any changes and see your invoices.`,
  ]
  if (portalUrl) lines.push(portalUrl)
  lines.push(
    ``,
    `Add it to your home screen so it opens like an app:`,
    `*iPhone:* Share → "Add to Home Screen"`,
    `*Android:* ⋮ menu → "Add to Home screen"`,
    `*Computer:* click the install icon in the browser's address bar`,
  )
  return lines
}
