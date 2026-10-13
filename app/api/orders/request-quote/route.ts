// Emails a request for a price to one supplier: your logo and colours, what is wanted and when, the AREA of the job (not the street), the PO reference, and a button to the page where they
// give their price. Replies to the email come back to you. Only a signed-in contractor can use it, and the request is read with that person's own login.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'
import { usageGuard } from '@/lib/usage'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { BRAND, emailShell, emailPara, emailCard, emailCallout, emailButton } from '@/lib/email-layout'
import { rowToOrder, rowToQuote, areaOnly, poRef, quoteLink, quoteRequestText, requestDetails } from '@/lib/job-orders'

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
    if (o.kind !== 'quote_request') return NextResponse.json({ error: 'This is already an order, not a request for a price.' }, { status: 400 })
    if (!EMAIL_RX.test(q.supplierEmail.trim())) return NextResponse.json({ error: 'This supplier has no valid email address.' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Email is not set up on this site yet (no email key).' }, { status: 500 })
    const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || '').replace(/\/$/, '')
    if (!appUrl) return NextResponse.json({ error: 'The site address is not set, so the price link cannot be made.' }, { status: 500 })
    const link = quoteLink(appUrl, q.token)

    const b = body.branding ?? {}
    const e = escapeHtml
    const company = e(b.companyName || 'Your builder')
    const ref = poRef(o.poNumber)
    const hello = (q.supplierContact.trim().split(/\s+/)[0] || q.supplierName.trim().split(/\s+/)[0] || 'there')

    const cell = (k: string, v: string) => v
      ? `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};width:96px;font-size:13px;color:${BRAND.muted};vertical-align:top">${k}</td><td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:600;color:${BRAND.ink};line-height:1.5">${v}</td></tr>`
      : ''
    const rows = [
      cell('What', e(o.title) + (requestDetails(o) ? `<br><span style="font-weight:400;color:${BRAND.muted}">${e(requestDetails(o)).replace(/\n/g, '<br>')}</span>` : '')),
      cell('Needed', e([longDate(o.deliveryDate), o.deliverySlot].filter(Boolean).join(', '))),
      cell('Collect', e(longDate(o.offHireDate))),
      cell('Where', e(areaOnly(o.siteAddress))),
      cell('Price for', o.rateBasis === 'fixed' ? '' : e(`${o.plannedUnits} ${o.rateBasis === 'day' ? 'day' : 'week'}${o.plannedUnits === 1 ? '' : 's'}: give your rate per ${o.rateBasis}`)),
    ].join('')

    const html = emailShell({
      company,
      kicker: 'Request for a price',
      title: `Could you quote for this?`,
      ref: e(ref),
      logoUrl: b.logoOwnerId ? `${appUrl}/api/public/company-logo/${encodeURIComponent(b.logoOwnerId)}` : undefined,
      body:
        emailPara(`Hello ${e(hello)},`, 12) +
        emailPara('Please could you give us a price for the following. It takes a minute and you do not need to log in.', 14) +
        emailCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`) +
        emailButton(e(link), 'Give your price', 'Price, earliest delivery date and how long the price stands. Or press reply and tell us.') +
        emailCallout(`<p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.ink}">Our reference is <strong>${e(ref)}</strong>. If we go ahead we will send you the order with the full address, and ask you to quote ${e(ref)} on your invoice.</p>`, 'Reference') +
        emailPara(`Thanks,<br><strong>${e(b.senderName || b.companyName || '')}</strong>${b.companyPhone ? `<br>${e(b.companyPhone)}` : ''}`, 0),
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
      subject: `Price request ${ref}: ${o.title}`,
      html: withPoweredBy(html),
      text: quoteRequestText(o, q, link, { name: b.senderName || '', company: b.companyName || 'Your builder' }),
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
