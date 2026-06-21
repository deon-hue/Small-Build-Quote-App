import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { clientName: string; clientEmail: string; companyName?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { clientName, clientEmail, companyName } = body
  if (!clientEmail) return NextResponse.json({ error: 'No email' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''

  if (!resendKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const portalUrl = `${appUrl}/portal`
  const firstName = clientName.split(' ')[0] || clientName
  const company = companyName || 'The Small Build Co'

  const html = buildEmail({ firstName, company, portalUrl })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: clientEmail,
      subject: `${company}: Access your client portal on your phone`,
      html,
    }),
  })

  if (!res.ok) {
    const data = await res.json()
    return NextResponse.json({ error: data?.message || 'Email failed' }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}

function buildEmail({ firstName, company, portalUrl }: { firstName: string; company: string; portalUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#484f5a;padding:28px 32px;border-bottom:3px solid #b8cc00">
      <div style="color:#b8cc00;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${company}</div>
      <div style="color:#fff;font-size:22px;font-weight:700">Access your portal on your phone</div>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:15px;color:#2b2f33">Hi ${firstName},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#2b2f33;line-height:1.6">
        You can now add your project portal to your phone's home screen — it works just like a downloaded app,
        with no App Store required. One tap and you're straight in.
      </p>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${portalUrl}" style="display:inline-block;background:#484f5a;color:#fff;text-decoration:none;padding:16px 36px;border-radius:8px;font-size:16px;font-weight:700;border-bottom:3px solid #b8cc00">
          Open your portal →
        </a>
      </div>

      <div style="background:#f8fafc;border:1px solid #dde1e5;border-radius:8px;padding:20px 22px;margin-bottom:24px">
        <div style="font-weight:700;font-size:13px;color:#1e2022;margin-bottom:14px">📱 How to install — takes 10 seconds:</div>

        <div style="margin-bottom:16px">
          <div style="display:inline-block;background:#484f5a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:6px">iPhone</div>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#4a5568;line-height:2">
            <li>Open the link above in <strong>Safari</strong></li>
            <li>Tap the <strong>Share</strong> button (square with arrow at the bottom)</li>
            <li>Tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        </div>

        <div>
          <div style="display:inline-block;background:#484f5a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:6px">Android</div>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#4a5568;line-height:2">
            <li>Open the link above in <strong>Chrome</strong></li>
            <li>Tap the <strong>⋮ menu</strong> (top right corner)</li>
            <li>Tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        </div>
      </div>

      <p style="margin:0;font-size:13px;color:#6b7580;line-height:1.6">
        Once installed, the portal icon will appear on your home screen. Use it any time to check your
        quotes, variations, and invoices — or to approve change orders on site.
      </p>
    </div>
    <div style="background:#f4f4f0;padding:16px 32px;border-top:1px solid #dde1e5">
      <div style="font-size:11px;color:#9aa3ad">${company} · <a href="${portalUrl}" style="color:#484f5a;text-decoration:none">Open portal</a></div>
    </div>
  </div>
</body>
</html>`
}
