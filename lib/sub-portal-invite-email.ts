// The subcontractor portal invite: the email (and the WhatsApp lines, for when Twilio is switched on). Styled to match the quote and the
// website — white header with a lime rule and monogram, lime button, charcoal footer — so everything a builder sends looks like one brand.
// Server-safe: plain strings, no imports.

const LIME = '#7ab533'
const INK = '#1e2022'
const CHARCOAL = '#1e293b'

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
  const initial = esc((o.company.trim()[0] || 'B').toUpperCase())
  const uses = USES.map(([t, d]) => `<li style="margin:0 0 4px"><strong style="color:${INK}">${t}</strong> – ${d}</li>`).join('')
  const install = INSTALL.map(([p, s]) =>
    `<div style="margin:0 0 8px;font-size:13px;color:#4a5568;line-height:1.6"><strong style="color:${INK}">${p}:</strong> ${s}</div>`).join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:${INK}">
  <div style="max-width:580px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:3px solid ${LIME};background:#f8faf8">
      <tr>
        <td style="padding:26px 32px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:52px;height:52px;background:${LIME};border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-size:24px;font-weight:700">${initial}</td>
            <td style="padding-left:16px;vertical-align:middle">
              <div style="font-size:18px;font-weight:700;color:${INK}">${company}</div>
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-top:2px">Subcontractor portal</div>
            </td>
          </tr></table>
        </td>
      </tr>
    </table>
    <div style="padding:30px 32px 26px">
      <div style="font-size:22px;font-weight:700;color:${INK};margin:0 0 16px">Your subcontractor portal</div>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Dear ${esc(o.firstName)},</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6">
        ${company} has set up a secure portal for you. Press the button below to sign in. There is no password to remember.
      </p>
      <div style="margin-bottom:26px">
        <a href="${o.signInUrl}" style="display:inline-block;background:${LIME};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:6px;font-size:15px;font-weight:700">Open your portal →</a>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
          This button signs you in once and then expires. If it has stopped working, go to
          <a href="${o.loginUrl}" style="color:#5e8f20">the portal sign-in page</a> and choose &ldquo;Send sign-in link&rdquo; for a fresh one.
        </p>
      </div>
      <div style="background:#f8fafc;border-left:3px solid ${LIME};border-radius:0 6px 6px 0;padding:18px 20px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5e8f20;margin-bottom:8px">What your portal is for</div>
        <ul style="margin:0 0 18px;padding-left:18px;font-size:13.5px;color:#4a5568;line-height:1.7">${uses}</ul>
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5e8f20;margin-bottom:6px">Keep it one tap away</div>
        <p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.6">Add the portal to your home screen and it opens like an app, with no App Store needed.</p>
        ${install}
        <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.6">The first time you open it from your home screen you may be asked to sign in once.</p>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7">
        If anything is unclear, just get in touch.
        ${o.companyPhone ? `<br><br>📞 <strong style="color:${INK}">${esc(o.companyPhone)}</strong>` : ''}
        ${o.companyEmail ? `<br>✉ <strong style="color:${INK}">${esc(o.companyEmail)}</strong>` : ''}
      </p>
    </div>
    <div style="background:${CHARCOAL};padding:20px 32px;font-size:12px;color:rgba(255,255,255,0.75);line-height:1.6">Kind regards · ${company}</div>
  </div>
</body>
</html>`
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
