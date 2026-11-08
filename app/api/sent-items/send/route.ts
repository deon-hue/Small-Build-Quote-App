// Email something to a lead or a contact from the app, and keep a record of exactly what was sent ("Sent to them"). Signed-in company accounts only (the lead or contact is read, and the record written,
// with the account's own login, so the row security that keeps each company's data apart applies). The email goes ONLY to the address already on the lead or contact, never to one sent in the request, so this
// cannot be used to email anyone else. The files must be ones the account itself uploaded for this (its own <user>/sent/ folder). The record is made only after the email has really gone.
//   POST { leadId?, clientId?, subject, body, files: [{ name, path, isImage, size }], showInPortal }
//   -> { ok: true, item }   or   { error }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { usageGuard } from '@/lib/usage'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { siteOrigin } from '@/lib/site-origin'
import { checkSendInput, sentItemFromRow, firstNameOf, likeSafe, EMAIL_ATTACH_MAX_BYTES } from '@/lib/sent-items'
import { buildSentEmail } from '@/lib/sent-items-email'

export const maxDuration = 60

const BUCKET = 'job-documents'
const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 }) }
  const check = checkSendInput(raw, user.id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
  const v = check.value

  // who it is for: read with the account's own login, so another company's lead or contact simply is not there
  let toName = '', toEmail = '', toPhone = ''
  if (v.leadId) {
    const { data: lead } = await sb.from('quote_requests').select('id, client_name, client_email, client_phone').eq('id', v.leadId).maybeSingle()
    if (!lead) return NextResponse.json({ error: 'That lead could not be found.' }, { status: 404 })
    toName = (lead.client_name as string) || ''; toEmail = ((lead.client_email as string) || '').trim(); toPhone = (lead.client_phone as string) || ''
  }
  if (v.clientId) {
    const { data: c } = await sb.from('clients').select('id, name, email, phone').eq('id', v.clientId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'That contact could not be found.' }, { status: 404 })
    toName = (c.name as string) || toName; toEmail = ((c.email as string) || '').trim() || toEmail; toPhone = (c.phone as string) || toPhone
  }
  if (!toEmail || !looksLikeEmail(toEmail)) return NextResponse.json({ error: 'There is no email address on file for them. Add one, or use WhatsApp.' }, { status: 400 })

  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'Email sending is not set up on this site, so nothing was sent.' }, { status: 503 })

  // the daily limit for sending messages: refused up front so nothing is half done
  const limited = await usageGuard(sb, 'send', 'sent-item')
  if (limited) return limited

  // the files, read with the account's own login from its own folder
  const attachments: { filename: string; content: string }[] = []
  let total = 0
  for (const f of v.files) {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(f.path)
    if (error || !blob) return NextResponse.json({ error: `${f.name} could not be read: add it again.` }, { status: 400 })
    const buf = Buffer.from(await blob.arrayBuffer())
    total += buf.length
    if (total > EMAIL_ATTACH_MAX_BYTES) return NextResponse.json({ error: `The files are over ${Math.round(EMAIL_ATTACH_MAX_BYTES / 1024 / 1024)} MB together, which is too much for one email. Send them in two emails.` }, { status: 413 })
    attachments.push({ filename: f.name, content: buf.toString('base64') })
  }

  const { data: st } = await sb.from('settings').select('company_name, phone, email, logo').eq('user_id', user.id).maybeSingle()
  const companyName = ((st?.company_name as string) || '').trim() || 'Your builder'
  const companyEmail = ((st?.email as string) || '').trim()
  const phone = ((st?.phone as string) || '').trim()
  const origin = siteOrigin(req).replace(/\/+$/, '')
  const hasLogo = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test((st?.logo as string) || '')
  // a link to the portal only for someone who can sign in to it: a client contact (the portal's sign-in code is only ever emailed to a contact's address), and only when the message is switched on for the portal
  let canUsePortal = false
  if (v.showInPortal && origin) {
    if (v.clientId) canUsePortal = true
    else {
      const { data: same } = await sb.from('clients').select('client_type').ilike('email', likeSafe(toEmail))
      canUsePortal = ((same ?? []) as { client_type: string | null }[]).some(r => r.client_type !== 'supplier' && r.client_type !== 'subcontractor')
    }
  }
  const mail = buildSentEmail({ companyName, firstName: firstNameOf(toName), subject: v.subject, body: v.body, fileNames: v.files.map(f => f.name), phone, logoUrl: hasLogo && origin ? `${origin}/api/public/company-logo/${user.id}` : undefined, portalUrl: canUsePortal ? `${origin}/portal` : undefined })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', companyName),
        to: toEmail,
        ...(companyEmail ? { reply_to: companyEmail, bcc: [companyEmail] } : {}),   // replies come to the company, and a copy is kept in its own inbox
        subject: mail.subject, html: withPoweredBy(mail.html), text: mail.text,
        ...(attachments.length ? { attachments } : {}),
      }),
    })
    if (!res.ok) {
      console.error('[sent-items] email refused:', res.status)
      return NextResponse.json({ error: 'The email could not be sent just now, so nothing was recorded. Try again in a moment.' }, { status: 502 })
    }
  } catch (err) {
    console.error('[sent-items] email failed:', err)
    return NextResponse.json({ error: 'The email could not be sent just now, so nothing was recorded. Try again in a moment.' }, { status: 502 })
  }

  // it has gone: now keep the record (the owner is the company owner; a team member writes it for their company)
  const { data: owner } = await sb.rpc('get_effective_owner_id')
  const ownerId = typeof owner === 'string' && owner ? owner : user.id
  const { data: row, error: insErr } = await sb.from('sent_items').insert({
    user_id: ownerId, lead_id: v.leadId, client_id: v.clientId, channel: 'email', kind: 'sent', subject: v.subject, body: v.body,
    files: v.files, to_name: toName, to_email: toEmail, to_phone: toPhone, show_in_portal: v.showInPortal, sent_by: user.id,
  }).select('*').single()
  if (insErr || !row) {
    console.error('[sent-items] record failed after the email went:', insErr?.message)
    return NextResponse.json({ ok: true, item: null, warning: /does not exist|schema cache|PGRST205|42P01/i.test(insErr?.message || '') ? 'The email was sent, but it could not be recorded: run supabase/sent-items.sql.' : 'The email was sent, but the record of it could not be saved.' })
  }
  return NextResponse.json({ ok: true, item: sentItemFromRow(row as Record<string, unknown>) })
}
