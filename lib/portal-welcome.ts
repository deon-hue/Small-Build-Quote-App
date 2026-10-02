/**
 * The wording every message that introduces a client to the portal uses — the quote email,
 * the quote WhatsApp, and the portal invite — so what the portal is for, and how to put it on
 * a home screen, is explained the same way everywhere. Server-safe (plain strings, no imports).
 */

const USES: [string, string][] = [
  ['Your quote', 'read it, ask us questions and approve it online'],
  ['Build plan', 'see what is happening on site, and when'],
  ['Changes', 'review and approve any extra or changed work'],
  ['Invoices', 'see what is due and what you have paid'],
  ['Plans and documents', 'download the drawings and paperwork we share with you'],
]

const INSTALL: [string, string][] = [
  ['iPhone (Safari)', 'open the portal, tap the Share button, then "Add to Home Screen".'],
  ['Android (Chrome)', 'open the portal, tap the ⋮ menu, then "Add to Home screen" (or "Install app").'],
  ['Computer', 'in Chrome or Edge, click the install icon at the right of the address bar, or open the menu and choose "Install". On a Mac in Safari, choose File, then "Add to Dock".'],
]

/** HTML block for the email: what the portal is for, then how to add it to a home screen. */
export function portalExplainerHtml(): string {
  const uses = USES.map(([t, d]) => `<li><strong style="color:#1e2022">${t}</strong> – ${d}</li>`).join('')
  const install = INSTALL.map(([p, s]) =>
    `<div style="margin:0 0 8px;font-size:13px;color:#4a5568;line-height:1.6"><strong style="color:#1e2022">${p}:</strong> ${s}</div>`).join('')
  return `<div style="background:#f8fafc;border:1px solid #dde1e5;border-radius:8px;padding:18px 20px;margin-bottom:24px">
        <div style="font-weight:700;font-size:14px;color:#1e2022;margin-bottom:8px">What your client portal is for</div>
        <ul style="margin:0 0 18px;padding-left:18px;font-size:13px;color:#4a5568;line-height:1.8">${uses}</ul>
        <div style="font-weight:700;font-size:14px;color:#1e2022;margin-bottom:6px">Keep it one tap away</div>
        <p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.6">Add the portal to your home screen and it opens like an app, with no App Store needed.</p>
        ${install}
        <p style="margin:10px 0 0;font-size:12px;color:#6b7580;line-height:1.6">The first time you open it from your home screen you may be asked to sign in once.</p>
      </div>`
}

/** Plain-text lines for WhatsApp. Pass the (reusable) portal address; empty means leave it out. */
export function portalWhatsAppLines(portalUrl: string): string[] {
  const lines = [
    `Your client portal lets you view and approve your quote, follow the build plan, approve any changes and see your invoices.`,
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
