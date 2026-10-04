// Tells the builder (by email) when a client has finished signing a contract. Called from the portal's finalize-contract route
// once the final signed PDF exists. Never throws: a failed email must not undo a signed contract.

import type { SupabaseClient } from '@supabase/supabase-js'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'

interface ContractRow {
  client_signed_by?: string | null
  client2_signed_by?: string | null
  client_signed_at?: string | null
  user_id?: string | null
}

export async function notifyBuilderContractSigned(
  sb: SupabaseClient,           // service-role client
  contract: ContractRow,
  job: { id: string; user_id: string; client?: string | null },
  appUrl: string,
): Promise<void> {
  try {
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return

    // Who to tell: the company's own email, or failing that the owner's login email
    const { data: settings } = await sb.from('settings').select('company_name, email').eq('user_id', job.user_id).maybeSingle()
    let to = (settings?.email || '').trim()
    if (!to) {
      const { data: owner } = await sb.auth.admin.getUserById(job.user_id)
      to = owner?.user?.email || ''
    }
    if (!to) return

    const company = settings?.company_name || 'Your company'
    const { data: jobRow } = await sb.from('jobs').select('type, address, title').eq('id', job.id).maybeSingle()
    const jobName = [jobRow?.title || jobRow?.type, (jobRow?.address || '').split('\n')[0]].filter(Boolean).join(' — ') || 'your job'
    const who = [contract.client_signed_by, contract.client2_signed_by].filter(Boolean).join(' and ') || job.client || 'Your client'
    const when = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const link = appUrl ? `${appUrl.replace(/\/+$/, '')}/jobs` : ''

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:Georgia,serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#2b3a2b;padding:26px 32px">
      <div style="color:#c8d8a8;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${escapeHtml(company)}</div>
      <div style="color:#fff;font-size:22px;font-weight:700">✅ Contract signed</div>
    </div>
    <div style="padding:26px 32px">
      <p style="margin:0 0 14px;font-size:15px;color:#2b2f33;line-height:1.6"><strong>${escapeHtml(who)}</strong> has signed the building contract for <strong>${escapeHtml(jobName)}</strong>.</p>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7580">Signed on ${escapeHtml(when)}. The final signed copy, with both signatures, is saved with the job.</p>
      ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:#2b3a2b;color:#fff;text-decoration:none;padding:12px 26px;border-radius:6px;font-size:14px;font-weight:700">Open your jobs →</a>` : ''}
    </div>
  </div>
</body></html>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', 'BuildOS Pro'),
        to,
        subject: `✅ Contract signed — ${who} · ${jobName}`.replace(/[\r\n\t]+/g, ' '),
        html: withPoweredBy(html),
      }),
    })
  } catch (err) {
    console.error('[notifyBuilderContractSigned] failed (contract is still signed):', err)
  }
}
