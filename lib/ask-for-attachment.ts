// A supplier emailed a quote to the quotes address but nothing in it can be read: answer them, asking for the quote again as a PDF attached to the email. Server only.
//
// Careful on purpose, because this sends an email to someone outside the company without a person pressing anything:
//   - only for mail sent to the QUOTES address (never the documents address)
//   - only from a person: not a no-reply, a bounce, a mailing list, or anything marked as automatic (and our own reply is marked automatic, so two machines cannot go back and forth)
//   - only from a supplier we actually asked: the email names one of the open PO numbers, or comes from the exact address on a price request
//   - at most once a day to the same address
//   - never allowed to break the email itself: any problem just means no reply is sent

import type { SupabaseClient } from '@supabase/supabase-js'
import { knownQuoteSender } from '@/lib/quote-inbox'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { buildNoAttachmentReply } from '@/lib/no-attachment-reply'
import { escapeLike } from '@/lib/email-match'
import { looksAutomated, whyNothingReadable, type NormalisedEmail } from '@/lib/inbound-email'

export interface AskDeps {
  /** the shared quotes address, e.g. quotes@buildospro.ai (NEXT_PUBLIC_QUOTES_EMAIL) */
  quotesEmail: string
  resendKey?: string
  fromEmail?: string
  fetchFn?: typeof fetch
}

/** Returns a note for the log ("An automatic reply was sent to …"), or '' when nothing was sent. */
export async function askForAttachment(sb: SupabaseClient, userId: string, email: NormalisedEmail, deps: AskDeps): Promise<string> {
  try {
    const [qLocal, qDomain] = (deps.quotesEmail || '').trim().toLowerCase().split('@')
    if (!qLocal || !qDomain || !deps.resendKey) return ''
    const addressed = (email.recipients.join(' ').toLowerCase().match(/[a-z0-9._+-]+@[a-z0-9.-]+/g) || []).some(a => a.endsWith('@' + qDomain) && a.split('@')[0].startsWith(qLocal))
    if (!addressed || !email.fromEmail || email.fromEmail.endsWith('@' + qDomain) || looksAutomated(email)) return ''

    const known = await knownQuoteSender(sb, userId, email.fromEmail, email.subject, email.body)
    if (!known.known) return ''

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: recent } = await sb.from('inbound_email_log').select('id').eq('user_id', userId)
      .ilike('from_address', `%${escapeLike(email.fromEmail)}%`).ilike('detail', '%automatic reply%').gte('received_at', since).limit(1)
    if (recent && recent.length > 0) return ''

    const { data: st } = await sb.from('settings').select('company_name, phone, email').eq('user_id', userId).maybeSingle()
    const company = (st?.company_name as string) || 'the builder'
    const r = buildNoAttachmentReply({ company, companyPhone: (st?.phone as string) || '', ref: known.ref, reason: whyNothingReadable(email) })
    const own = ((st?.email as string) || '').trim()
    const payload: Record<string, unknown> = {
      from: senderFrom(deps.fromEmail || 'noreply@resend.dev', company),
      to: email.fromEmail, subject: r.subject, html: withPoweredBy(r.html), text: r.text,
      headers: { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' },
    }
    if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(own)) { payload.reply_to = own; payload.bcc = [own] }
    const res = await (deps.fetchFn ?? fetch)('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${deps.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    return res.ok ? ` An automatic reply was sent to ${email.fromEmail} asking for the quote again as a PDF attachment.` : ''
  } catch { return '' }
}
