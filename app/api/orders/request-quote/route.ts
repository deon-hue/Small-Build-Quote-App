// Emails a request for a price to one supplier: your logo and colours, what is wanted and when, the AREA of the job (not the street), the PO reference, and a button to the page where they
// give their price. Replies to the email come back to you. Only a signed-in contractor can use it, and the request is read with that person's own login.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'
import { usageGuard } from '@/lib/usage'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { emailShell } from '@/lib/email-layout'
import { priceRequestBody } from '@/lib/price-request-email'
import { rowToOrder, rowToQuote, areaOnly, poRef, quoteLink, quoteRequestText, requestDetails, amendedSince } from '@/lib/job-orders'
import { withCode } from '@/lib/mail-address'

interface Branding {
  companyName?: string; companyPhone?: string; companyEmail?: string; senderName?: string
  address?: string; companyNumber?: string; vatNumber?: string; website?: string
  logoOwnerId?: string
}

const EMAIL_RX = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
const longDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '')

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send requests.' }, { status: 403 })
  const limited = await usageGuard(sb, 'send', 'orders-request-quote')
  if (limited) return limited

  let body: { quoteId?: string; branding?: Branding }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!body.quoteId) return NextResponse.json({ error: 'No request given.' }, { status: 400 })

  try {
    const { data: qRow } = await sb.from('job_order_quotes').select('*').eq('id', body.quoteId).maybeSingle()
    if (!qRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    const q = rowToQuote(qRow)
    const { data: oRow } = await sb.from('job_orders').select('*').eq('id', q.orderId).maybeSingle()
    if (!oRow) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    const o = rowToOrder(oRow)
    if (o.deletedAt) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    if (o.kind !== 'quote_request') return NextResponse.json({ error: 'This is already an order, not a request for a price.' }, { status: 400 })
    if (!EMAIL_RX.test(q.supplierEmail.trim())) return NextResponse.json({ error: 'This supplier has no valid email address.' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Email is not set up on this site yet (no email key).' }, { status: 500 })
    const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || '').replace(/\/$/, '')
    if (!appUrl) return NextResponse.json({ error: 'The site address is not set, so the price link cannot be made.' }, { status: 500 })
    const link = quoteLink(appUrl, q.token)
    // where a supplier can email their own quote instead (set in the host's settings; omitted if there isn't one)
    const { data: ownerForMail } = await sb.rpc('get_effective_owner_id')
    const { data: mc } = await sb.from('settings').select('mail_code').eq('user_id', (ownerForMail as string) || user.id).maybeSingle()
    const inboxEmail = withCode((process.env.NEXT_PUBLIC_QUOTES_EMAIL || '').trim(), (mc?.mail_code as string) || '')

    const b = body.branding ?? {}
    const e = escapeHtml
    const company = e(b.companyName || 'Your builder')
    const ref = poRef(o.poNumber)
    // the request was changed after this supplier was last sent it: say so
    const amended = amendedSince(o, q.sentAt)
    const hello = (q.supplierContact.trim().split(/\s+/)[0] || q.supplierName.trim().split(/\s+/)[0] || 'there')

    const html = emailShell({
      company,
      kicker: amended ? 'Amended request for a price' : 'Request for a price',
      title: amended ? 'This request has been amended' : `Could you quote for this?`,
      ref: e(ref),
      logoUrl: b.logoOwnerId ? `${appUrl}/api/public/company-logo/${encodeURIComponent(b.logoOwnerId)}` : undefined,
      body: priceRequestBody({
        hello, title: o.title, details: requestDetails(o),
        needed: [longDate(o.deliveryDate), o.deliverySlot].filter(Boolean).join(', '),
        collect: longDate(o.offHireDate),
        where: areaOnly(o.siteAddress),
        priceFor: o.rateBasis === 'fixed' ? '' : `${o.plannedUnits} ${o.rateBasis === 'day' ? 'day' : 'week'}${o.plannedUnits === 1 ? '' : 's'}: give your rate per ${o.rateBasis}`,
        link, ref, inboxEmail, amended, theirRef: q.supplierRef,
        senderName: b.senderName || '', companyName: b.companyName || '', companyPhone: b.companyPhone || '',
      }),
      footerHtml: [
        `<strong style="color:#ffffff">${company}</strong>`,
        b.address ? e(b.address).replace(/\n/g, ', ') : '',
        [b.companyNumber ? `Company no. ${e(b.companyNumber)}` : '', b.vatNumber ? `VAT no. ${e(b.vatNumber)}` : ''].filter(Boolean).join(' &nbsp;|&nbsp; '),
        [b.companyEmail ? e(b.companyEmail) : '', b.website ? e(b.website) : ''].filter(Boolean).join(' &nbsp;|&nbsp; '),
      ].filter(Boolean).join('<br>'),
    })

    const payload: Record<string, unknown> = {
      from: senderFrom(fromEmail, b.companyName),
      to: q.supplierEmail.trim(),
      subject: `${amended ? 'Amended price request' : 'Price request'} ${ref}: ${o.title}`,
      html: withPoweredBy(html),
      text: quoteRequestText(o, q, link, { name: b.senderName || '', company: b.companyName || 'Your builder' }, inboxEmail, amended),
    }
    if (b.companyEmail && EMAIL_RX.test(b.companyEmail)) {
      payload.reply_to = b.companyEmail
      payload.bcc = [b.companyEmail]
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: (data as { message?: string })?.message || `Email service error ${res.status}` }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the request.' }, { status: 500 })
  }
}
