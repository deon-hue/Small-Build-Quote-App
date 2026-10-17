// Emails a purchase order to a supplier: your logo and colours, what you want, when and where, the PO number to quote on the invoice, and replies come back to you.
// Only a signed-in contractor can use it, and the order is read with that person's own login, so nobody can send an order that is not theirs.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'
import { usageGuard } from '@/lib/usage'
import { callerIsPortalOnly } from '@/lib/caller-role'
import { emailShell } from '@/lib/email-layout'
import { rowToOrder, orderWording, orderWhatsAppText, orderIsFromQuote } from '@/lib/job-orders'
import { orderConfirmationBody } from '@/lib/order-confirmation-email'
import { accountNumberFor } from '@/lib/supplier-account'

interface Branding {
  companyName?: string; companyPhone?: string; companyEmail?: string; senderName?: string
  address?: string; companyNumber?: string; vatNumber?: string; website?: string
  /** the id the company's logo is served under (the owner's id); only sent when a logo has been uploaded */
  logoOwnerId?: string
}

const EMAIL_RX = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (await callerIsPortalOnly(sb, user.id)) return NextResponse.json({ error: 'Only contractor accounts can send orders.' }, { status: 403 })
  const limited = await usageGuard(sb, 'send', 'orders-send')
  if (limited) return limited

  let body: { orderId?: string; branding?: Branding; note?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!body.orderId) return NextResponse.json({ error: 'No order given.' }, { status: 400 })

  try {
    const { data: row } = await sb.from('job_orders').select('*').eq('id', body.orderId).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    const o = rowToOrder(row)
    if (o.deletedAt) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    if (!EMAIL_RX.test(o.supplierEmail.trim())) return NextResponse.json({ error: 'This order has no valid email address for the supplier.' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Email is not set up on this site yet (no email key).' }, { status: 500 })
    const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''

    const b = body.branding ?? {}
    const e = escapeHtml
    const company = e(b.companyName || 'Your builder')
    const account = await accountNumberFor(sb, o.supplierId, o.supplierName)
    // did this follow a supplier's quote the builder approved? (the quote is marked chosen, its reference came across, or it is still waiting to be confirmed)
    const { data: chosen } = await sb.from('job_order_quotes').select('id').eq('order_id', o.id).eq('status', 'chosen').limit(1)
    const fromQuote = orderIsFromQuote(o, (chosen ?? []).length > 0)
    const w = orderWording(o, account, fromQuote)
    const hello = (o.supplierContact.trim().split(/\s+/)[0] || o.supplierName.trim().split(/\s+/)[0] || 'there')

    const html = emailShell({
      company,
      kicker: fromQuote ? 'Order confirmed' : 'Purchase order',
      title: fromQuote ? 'Please go ahead with this order' : `Order ${e(w.poRef)}`,
      ref: e(w.poRef),
      logoUrl: b.logoOwnerId && appUrl ? `${appUrl.replace(/\/$/, '')}/api/public/company-logo/${encodeURIComponent(b.logoOwnerId)}` : undefined,
      body: orderConfirmationBody({
        hello, fromQuote: w.fromQuote, poRef: w.poRef, theirRef: w.theirRef, account: w.account, title: w.title, details: w.details,
        deliverTo: w.where, when: w.when, collect: w.collect, contact: w.contact, access: o.accessNotes, price: w.priceLine.replace(/^Agreed (price|rate) /, ''),
        note: (body.note || '').trim(), senderName: b.senderName || '', companyName: b.companyName || '', companyPhone: b.companyPhone || '',
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
      to: o.supplierEmail.trim(),
      subject: `${fromQuote ? 'Please go ahead: order' : 'Order'} ${w.poRef}: ${w.title}${o.deliveryDate ? ` (${new Date(o.deliveryDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''}`,
      html: withPoweredBy(html),
      text: orderWhatsAppText(o, { name: b.senderName || '', company: b.companyName || 'Your builder' }, account, fromQuote),
    }
    if (b.companyEmail && EMAIL_RX.test(b.companyEmail)) {
      payload.reply_to = b.companyEmail
      // a copy to you as a record of exactly what the supplier was sent
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send the order.' }, { status: 500 })
  }
}
