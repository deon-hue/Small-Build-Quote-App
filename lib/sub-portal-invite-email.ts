// The subcontractor portal invite: the email (and the WhatsApp lines, for when Twilio is switched on). Styled to match the quote and the
// website — white header with a lime rule and monogram, lime button, charcoal footer — so everything a builder sends looks like one brand.
// Server-safe: plain strings.

import { BRAND, emailShell, emailPara, emailButton, emailCallout, emailContact, emailLink } from './email-layout'

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const USES: [string, string][] = [
  ['Your jobs', 'see the jobs you are working on, and where they are'],
  ['Timesheets', 'send in the days and hours you have worked, so you are paid correctly'],
  ['Payments', 'see what has been paid and what is still to come'],
]

const INSTALL: [string, string][] = [
  ['iPhone (Safari)', 'open the portal, tap the Share button, then "Add to Home Screen".'],
  ['Android (Chrome)', 'open the portal, tap the ⋮ menu, then "Add to Home screen" (or "Install app").'],
  ['Computer', 'in Chrome or Edge, click the install icon at the right of the address bar, or open the menu and choose "Install".'],
]

export function subInviteSubject(company: string): string {
  return `${company.replace(/[\r\n\t]+/g, ' ')}: Your subcontractor portal`
}

export function buildSubInviteEmail(o: {
  firstName: string; company: string; signInUrl: string; loginUrl: string; companyPhone?: string; companyEmail?: string
}): string {
  const company = esc(o.company)
  const uses = USES.map(([t, d]) => `<li style="margin:0 0 4px"><strong style="color:${BRAND.ink}">${t}</strong> – ${d}</li>`).join('')
  const install = INSTALL.map(([p, s]) =>
    `<div style="margin:0 0 8px;font-size:13px;color:#4a5568;line-height:1.6"><strong style="color:${BRAND.ink}">${p}:</strong> ${s}</div>`).join('')
  return emailShell({
    company,
    kicker: 'Subcontractor portal',
    title: 'Your subcontractor portal',
    body: [
      emailPara(`Dear ${esc(o.firstName)},`, 14),
      emailPara(`${company} has set up a secure portal for you. Press the button below to sign in. There is no password to remember.`, 22),
      emailButton(o.signInUrl, 'Open your portal →',
        `This button signs you in once and then expires. If it has stopped working, go to ${emailLink(o.loginUrl, 'the portal sign-in page')} and choose &ldquo;Send sign-in link&rdquo; for a fresh one.`),
      emailCallout(
        `<ul style="margin:0 0 18px;padding-left:18px;font-size:13.5px;color:#4a5568;line-height:1.7">${uses}</ul>
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.limeDark};margin-bottom:6px">Keep it one tap away</div>
        <p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.6">Add the portal to your home screen and it opens like an app, with no App Store needed.</p>
        ${install}
        <p style="margin:10px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.6">The first time you open it from your home screen you may be asked to sign in once.</p>`,
        'What your portal is for'),
      emailContact('If anything is unclear, just get in touch.', o.companyPhone ? esc(o.companyPhone) : undefined, o.companyEmail ? esc(o.companyEmail) : undefined),
    ].join('\n      '),
  })
}

/** Plain-text lines for a WhatsApp invite (used once WhatsApp via Twilio is switched on). */
export function subInviteWhatsAppLines(company: string, firstName: string, portalUrl: string): string[] {
  const lines = [
    `Hi ${firstName} 👋`,
    ``,
    `${company} has set up a subcontractor portal for you, where you can see your jobs, send in timesheets and check your payments. We've emailed you a sign-in button — if you can't see it, please check your spam/junk folder.`,
  ]
  if (portalUrl) lines.push('', portalUrl)
  return lines
}
