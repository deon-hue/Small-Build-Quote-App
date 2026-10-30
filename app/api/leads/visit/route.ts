// Book, change or cancel a site visit with a lead, and email the customer the details with a calendar file. Signed-in company owners only (the lead is read and written with the owner's own login, so the
// row security that keeps each company's leads apart applies). The email goes ONLY to the address already on the lead, never to one sent in the request, so this cannot be used to email anyone else.
//   POST { leadId, action: 'book' | 'reschedule' | 'cancel', date, time, minutes, note, address, sendEmail }
//   -> { ok, kind, visit, status, chase_on, emailed, emailNote, message }   (message is the same words as the email, for a WhatsApp message to a customer with no email address)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { usageGuard } from '@/lib/usage'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { siteOrigin } from '@/lib/site-origin'
import { mapsUrl } from '@/lib/leads'
import { checkVisitInput, buildVisitIcs, visitUid, visitWhenLong, visitMessageText, type VisitWords } from '@/lib/lead-visit'
import { applyVisit } from '@/lib/lead-visit-submit'
import { buildVisitEmail } from '@/lib/lead-visit-email'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 }) }
  const leadId = typeof body.leadId === 'string' ? body.leadId : ''
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return NextResponse.json({ error: 'That lead could not be found.' }, { status: 404 })

  const check = checkVisitInput(body, Date.now())
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
  const v = check.value

  // an email counts towards the company's daily limit for sending messages; refused up front so nothing is half done
  if (v.sendEmail) { const limited = await usageGuard(sb, 'send', 'lead-visit'); if (limited) return limited }

  const applied = await applyVisit(sb, user.id, leadId, v)
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status })
  const { lead, kind, was } = applied

  const { data: st } = await sb.from('settings').select('company_name, phone, email, logo').eq('user_id', user.id).maybeSingle()
  const companyName = ((st?.company_name as string) || '').trim() || 'Your builder'
  const companyEmail = ((st?.email as string) || '').trim()
  const phone = ((st?.phone as string) || '').trim()
  const address = ((lead.visit_address || lead.project_address || '') as string).trim()
  const startIso = kind === 'cancelled' ? (was?.at || (lead.visit_at as string)) : (lead.visit_at as string)
  const minutes = kind === 'cancelled' ? (was?.minutes || lead.visit_minutes || 60) : (lead.visit_minutes || 60)
  const words: VisitWords = {
    kind, companyName, firstName: (lead.client_name || '').trim().split(/\s+/)[0] || '', whenLong: visitWhenLong(startIso), minutes, address,
    note: kind === 'cancelled' ? v.note : (lead.visit_note || ''), phone,
    ...(kind !== 'booked' && was ? { wasLong: visitWhenLong(was.at) } : {}),
  }
  const message = visitMessageText(words)

  let emailed = false
  let emailNote = ''
  if (v.sendEmail) {
    const to = (lead.client_email || '').trim()
    const key = process.env.RESEND_API_KEY
    if (!to) emailNote = 'This lead has no email address, so nothing was emailed. Use the WhatsApp message instead.'
    else if (!key) emailNote = 'Email sending is not set up on this site, so nothing was emailed.'
    else {
      try {
        const origin = siteOrigin(req).replace(/\/+$/, '')
        const hasLogo = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test((st?.logo as string) || '')
        const mail = buildVisitEmail(words, { logoUrl: hasLogo && origin ? `${origin}/api/public/company-logo/${user.id}` : undefined, mapsLink: mapsUrl(address, '') })
        const ics = buildVisitIcs({
          uid: visitUid(leadId), startIso, minutes, summary: `Site visit: ${companyName}`, location: address.replace(/\s*\n\s*/g, ', '),
          description: [kind === 'cancelled' ? '' : (lead.visit_note || ''), phone ? `Contact: ${phone}` : ''].filter(Boolean).join('\n'),
          sequence: lead.visit_seq ?? 1, cancelled: kind === 'cancelled',
        })
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', companyName),
            to,
            ...(companyEmail ? { reply_to: companyEmail, bcc: [companyEmail] } : {}),   // replies come to the company, and a copy is kept as a record of what was sent
            subject: mail.subject, html: withPoweredBy(mail.html), text: mail.text,
            attachments: [{ filename: 'site-visit.ics', content: Buffer.from(ics, 'utf8').toString('base64'), content_type: 'text/calendar; charset=UTF-8; method=PUBLISH' }],
          }),
        })
        if (res.ok) {
          emailed = true
          await sb.from('quote_requests').update({ visit_emailed_at: new Date().toISOString() }).eq('id', leadId).eq('user_id', user.id)   // a record; never worth failing for
        } else {
          console.error('[lead-visit] email refused:', res.status)
          emailNote = 'The visit is saved, but the email could not be sent just now. Use the WhatsApp message, or try again.'
        }
      } catch (err) {
        console.error('[lead-visit] email failed:', err)
        emailNote = 'The visit is saved, but the email could not be sent just now. Use the WhatsApp message, or try again.'
      }
    }
  }

  return NextResponse.json({
    ok: true, kind, emailed, emailNote, message,
    visit: { at: lead.visit_at ?? null, minutes: lead.visit_minutes ?? 60, note: lead.visit_note ?? '', address: lead.visit_address ?? '', status: lead.visit_status ?? '', seq: lead.visit_seq ?? 0 },
    status: lead.status, chase_on: lead.chase_on ?? null,
  })
}
