// The supplier's side of a quote request. A supplier opens the secret link from an email or WhatsApp message (no login), sees what is wanted, and gives a price, a delivery date and how long
// the price stands, or says they cannot do it. Anyone holding the link can use it, so it only ever shows and changes that one request, never anything else of the company's, and the job's
// street address is never sent: only the area (lib/job-orders.ts areaOnly). The builder is emailed when a reply arrives.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { rowToOrder, rowToQuote, areaOnly, poRef, quoteNet, pricedQuote, type QuoteLine } from '@/lib/job-orders'
import { senderFrom, withPoweredBy, escapeHtml } from '@/lib/email-brand'
import { BRAND, emailShell, emailPara, emailCard, emailButton } from '@/lib/email-layout'
import { pushToOwner } from '@/lib/push'
import { withCode } from '@/lib/mail-address'

const TOKEN = /^[0-9a-f]{64}$/
const YMD = /^\d{4}-\d{2}-\d{2}$/
const BASES = ['fixed', 'day', 'week']

type Ctx = { params: Promise<{ token: string }> }

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const validDate = (s: unknown): s is string => typeof s === 'string' && YMD.test(s) && !Number.isNaN(new Date(s + 'T12:00:00').getTime())

async function load(token: string) {
  if (!TOKEN.test(token)) return null
  const sb = createServiceRoleClient()
  const { data: qRow } = await sb.from('job_order_quotes').select('*').eq('token', token).maybeSingle()
  if (!qRow) return null
  const { data: oRow } = await sb.from('job_orders').select('*').eq('id', qRow.order_id).maybeSingle()
  if (!oRow) return null
  const { data: s } = await sb.from('settings').select('company_name, phone, email, logo, contact, address, mail_code').eq('user_id', oRow.user_id).maybeSingle()
  return { sb, quote: rowToQuote(qRow), order: rowToOrder(oRow), ownerId: oRow.user_id as string, settings: s as Record<string, string> | null }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  try {
    const f = await load(token)
    if (!f) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
    const { sb, quote: q, order: o, settings } = f
    const open = o.kind === 'quote_request' && o.status !== 'cancelled'
    if (!q.viewedAt) await sb.from('job_order_quotes').update({ viewed_at: new Date().toISOString() }).eq('id', q.id)
    return NextResponse.json({
      company: settings?.company_name || 'The builder',
      contactPhone: settings?.phone || '',
      contactName: settings?.contact || '',
      logoUrl: settings?.logo ? `/api/public/company-logo/${f.ownerId}` : '',
      ref: poRef(o.poNumber),
      supplierName: q.supplierName,
      title: o.title, details: o.details, orderType: o.orderType,
      area: areaOnly(o.siteAddress),
      deliveryDate: o.deliveryDate, deliverySlot: o.deliverySlot, offHireDate: o.offHireDate,
      rateBasis: o.rateBasis, plannedUnits: o.plannedUnits,
      // open: can still be answered; chosen: they won it; closed: gone elsewhere or withdrawn
      inboxEmail: withCode((process.env.NEXT_PUBLIC_QUOTES_EMAIL || '').trim(), settings?.mail_code),
      state: q.status === 'chosen' ? 'chosen' : open && q.status !== 'not_chosen' ? 'open' : 'closed',
      status: q.status,
      items: (o.items ?? []).map(i => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit })),
      reply: q.status === 'replied' || q.status === 'chosen' ? { price: q.price, rateBasis: q.rateBasis, deliveryDate: q.deliveryDate, validUntil: q.validUntil, notes: q.notes, lines: q.lines, deliveryCharge: q.deliveryCharge } : null,
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  try {
    const f = await load(token)
    if (!f) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
    const { sb, quote: q, order: o, settings } = f
    if (o.kind !== 'quote_request' || o.status === 'cancelled' || q.status === 'chosen' || q.status === 'not_chosen') {
      return NextResponse.json({ error: 'This request is closed, so it can no longer be answered. Thank you.' }, { status: 409 })
    }

    const now = new Date().toISOString()
    let patch: Record<string, unknown>
    let summary: string
    if (body.action === 'decline') {
      const why = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
      patch = { status: 'declined', price: null, notes: why, replied_at: now }
      summary = `${q.supplierName} cannot do this${why ? `: ${why}` : '.'}`
    } else if (body.action === 'quote' && (o.items ?? []).length > 0) {
      // a list of items: a unit price for each (or "cannot supply"), and delivery. The total is worked out here from the quantities we hold, never taken from the page.
      const items = o.items ?? []
      const sent = Array.isArray(body.lines) ? body.lines : []
      const lines: QuoteLine[] = []
      for (const it of items) {
        const r = (sent.find((x: unknown) => x && typeof x === 'object' && (x as Record<string, unknown>).id === it.id) ?? {}) as Record<string, unknown>
        const unavailable = !!r.unavailable
        const raw = r.unitPrice === null || r.unitPrice === undefined || r.unitPrice === '' ? null : Number(r.unitPrice)
        if (raw !== null && (!Number.isFinite(raw) || raw < 0 || raw > 1_000_000)) return NextResponse.json({ error: 'One of the prices is not a number. Please check them.' }, { status: 400 })
        lines.push({ id: it.id, unitPrice: unavailable || raw === null ? null : Math.round(raw * 100) / 100, unavailable, note: typeof r.note === 'string' ? r.note.trim().slice(0, 300) : '' })
      }
      const delivery = Number(body.deliveryCharge)
      const deliveryCharge = Number.isFinite(delivery) && delivery > 0 && delivery <= 1_000_000 ? Math.round(delivery * 100) / 100 : 0
      const calc = pricedQuote(items, lines, deliveryCharge)
      if (calc.priced === 0) return NextResponse.json({ error: 'Please enter a price for at least one item.' }, { status: 400 })
      const delivery_date = validDate(body.deliveryDate) ? body.deliveryDate : null
      const validUntil = validDate(body.validUntil) ? body.validUntil : null
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
      patch = { status: 'replied', price: calc.total, rate_basis: 'fixed', lines, delivery_charge: deliveryCharge, delivery_date, valid_until: validUntil, notes, replied_at: now }
      summary = `${q.supplierName} quoted ${gbp(calc.total)} + VAT for ${calc.priced} of ${calc.count} items${deliveryCharge > 0 ? ` (including ${gbp(deliveryCharge)} delivery)` : ''}${delivery_date ? `, delivery ${new Date(delivery_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}.`
    } else if (body.action === 'quote') {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) return NextResponse.json({ error: 'Please enter your price, not including VAT.' }, { status: 400 })
      const basis = typeof body.rateBasis === 'string' && BASES.includes(body.rateBasis) ? body.rateBasis : o.rateBasis
      const delivery = validDate(body.deliveryDate) ? body.deliveryDate : null
      const validUntil = validDate(body.validUntil) ? body.validUntil : null
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
      patch = { status: 'replied', price: Math.round(price * 100) / 100, rate_basis: basis, delivery_date: delivery, valid_until: validUntil, notes, replied_at: now }
      const net = quoteNet({ price: patch.price as number, rateBasis: basis as 'fixed' | 'day' | 'week' }, o.plannedUnits)
      summary = `${q.supplierName} quoted ${gbp(patch.price as number)} + VAT${basis === 'fixed' ? '' : ` per ${basis}`}${basis !== 'fixed' ? ` (about ${gbp(net)} for the planned time)` : ''}${delivery ? `, delivery ${new Date(delivery + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}.`
    } else {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    const { error } = await sb.from('job_order_quotes').update(patch).eq('id', q.id)
    if (error) return NextResponse.json({ error: 'Could not save your reply. Please try again.' }, { status: 500 })

    // an alert on the builder's phone and tablet, best effort (does nothing until notifications are set up)
    await pushToOwner(f.ownerId, 'supplier_replies', {
      title: body.action === 'decline' ? `${q.supplierName} cannot do it` : `Prices in from ${q.supplierName}`,
      body: `${poRef(o.poNumber)} ${o.title}: ${summary}`.slice(0, 180),
      url: o.jobId ? `/jobs?orders=${encodeURIComponent(o.jobId)}` : '/jobs?requests=1',
      tag: `reply-${q.id}`,
    })

    // tell the builder, best effort: the reply is saved either way
    try {
      const resendKey = process.env.RESEND_API_KEY
      const to = settings?.email?.trim()
      if (resendKey && to && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) {
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || '').replace(/\/$/, '')
        const e = escapeHtml
        const company = e(settings?.company_name || 'Your company')
        const html = emailShell({
          company, kicker: 'Quote reply', title: body.action === 'decline' ? 'A supplier cannot do it' : 'A supplier has quoted', ref: e(poRef(o.poNumber)),
          logoUrl: settings?.logo && appUrl ? `${appUrl}/api/public/company-logo/${f.ownerId}` : undefined,
          body:
            emailPara(e(summary), 14) +
            emailCard(`<div style="font-size:13px;color:${BRAND.muted}">${e(poRef(o.poNumber))}</div><div style="font-size:16px;font-weight:700;color:${BRAND.ink};margin-top:2px">${e(o.title)}</div>`) +
            (appUrl ? emailButton(o.jobId ? `${appUrl}/jobs?orders=${encodeURIComponent(o.jobId)}` : `${appUrl}/jobs?requests=1`, 'See the prices', o.jobId ? 'Opens this job\'s Orders, where you compare the prices and approve one.' : 'Opens your Price requests, where you compare the prices. Attach it to a job to approve one.') : ''),
        })
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: senderFrom(process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev', settings?.company_name),
            to, subject: `${poRef(o.poNumber)}: ${summary}`.slice(0, 200), html: withPoweredBy(html), text: `${summary}\n${poRef(o.poNumber)} ${o.title}`,
          }),
        })
      }
    } catch { /* the reply is already saved */ }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
