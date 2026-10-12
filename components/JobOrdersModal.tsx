'use client'

// A job's purchase orders: a skip, a portaloo, plant hire, a materials delivery. Raise one, send it to the supplier by email or WhatsApp, and follow it until the supplier's
// invoice arrives. An order on account is an EXPECTED cost on the job (the job's margin already allows for it); an order you pay when you place it goes onto the job as a real,
// paid cost straight away. See lib/job-orders.ts for the rules and supabase/job-orders.sql for the table.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { fetchJobCosts, insertJobCost, updateJobCost } from '@/lib/job-costs'
import type { JobCost, JobCostCategory } from '@/lib/types'
import {
  ORDER_TYPES, ORDER_STATUS_LABEL, poRef, expectedNet, hireUnits, isCommitted, committedTotals, overrunNote, matchSuggestions, orderWhatsAppText, waLink, addDays, todayYmd, orderDateLabel,
  fetchJobOrders, insertJobOrder, updateJobOrder, deleteJobOrder,
  quoteRequestText, quoteLink, cheapestQuoteId, quoteNet, areaOnly, QUOTE_STATUS_LABEL, fetchOrderQuotes, insertOrderQuotes, updateOrderQuote, deleteOrderQuote,
  type JobOrder, type OrderType, type PayTerms, type RateBasis, type OrderStatus, type OrderQuote, type QuoteInvitee, type QuoteStatus,
} from '@/lib/job-orders'
import type { Supplier } from '@/lib/types'

interface Props {
  jobId: string
  jobLabel: string
  jobAddress?: string
  /** told whenever an order or a cost changes, so a window behind this one (the job's costs) can refresh */
  onChanged?: () => void
  onClose: () => void
}

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const CATS: { value: JobCostCategory; label: string }[] = [
  { value: 'labour', label: 'Labour' }, { value: 'materials', label: 'Materials' }, { value: 'plant', label: 'Plant' }, { value: 'subcontractors', label: 'Subcontractors' }, { value: 'other', label: 'Other' },
]
const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string }> = {
  draft: { bg: '#f1f5f9', fg: '#475569' }, ordered: { bg: '#e0f2fe', fg: '#075985' }, confirmed: { bg: '#dcfce7', fg: '#166534' }, delivered: { bg: '#fef9c3', fg: '#854d0e' },
  collected: { bg: '#ede9fe', fg: '#6d28d9' }, invoiced: { bg: '#f1f5f9', fg: '#166534' }, cancelled: { bg: '#fee2e2', fg: '#991b1b' },
}

type Form = Omit<JobOrder, 'id' | 'poNumber' | 'status' | 'sentVia' | 'jobId' | 'kind'> & { id?: string; poNumber?: number }

const QUOTE_STYLE: Record<QuoteStatus, { bg: string; fg: string }> = {
  invited: { bg: '#f1f5f9', fg: '#475569' }, replied: { bg: '#dcfce7', fg: '#166534' }, declined: { bg: '#fee2e2', fg: '#991b1b' }, chosen: { bg: '#dbeafe', fg: '#1e40af' }, not_chosen: { bg: '#f1f5f9', fg: '#94a3b8' },
}

const blankWho = (): QuoteInvitee => ({ supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '' })

/** Who a request goes to: pick suppliers from Contacts, or type one that is not there. */
function Recipients({ suppliers, value, onChange, inp, lab, btn }: { suppliers: Supplier[]; value: QuoteInvitee[]; onChange: (v: QuoteInvitee[]) => void; inp: React.CSSProperties; lab: React.CSSProperties; btn: React.CSSProperties }) {
  const [one, setOne] = useState<QuoteInvitee>(blankWho())
  const taken = new Set(value.map(v => v.supplierId).filter(Boolean))
  function addContact(id: string) {
    const s = suppliers.find(x => x.id === id)
    if (!s || taken.has(s.id)) return
    onChange([...value, { supplierId: s.id, supplierName: s.name, supplierContact: s.contactName || '', supplierEmail: s.email || '', supplierPhone: s.phone || '' }])
  }
  function addTyped() {
    if (!one.supplierName.trim()) return
    onChange([...value, { ...one, supplierName: one.supplierName.trim() }]); setOne(blankWho())
  }
  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, background: '#fff' }}>
      <label style={lab}>Who to ask for a price</label>
      {value.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Add one or more suppliers. Each gets their own link to give a price, and you compare the answers.</div>}
      {value.map((w, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}>
          <strong>{w.supplierName}</strong>
          <span style={{ color: '#64748b', flex: 1 }}>{[w.supplierContact, w.supplierEmail, w.supplierPhone].filter(Boolean).join(' · ') || 'no email or mobile yet'}</span>
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ ...btn, padding: '2px 8px', color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 8 }}>
        <select style={inp} value="" onChange={e => addContact(e.target.value)}>
          <option value="">＋ Add from your Contacts…</option>
          {[...suppliers].filter(s => !taken.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 4px' }}>Not in Contacts? Type them in:</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Supplier name" value={one.supplierName} onChange={e => setOne({ ...one, supplierName: e.target.value })} />
        <input style={inp} placeholder="Person there" value={one.supplierContact} onChange={e => setOne({ ...one, supplierContact: e.target.value })} />
        <input style={inp} type="email" placeholder="Email" value={one.supplierEmail} onChange={e => setOne({ ...one, supplierEmail: e.target.value })} />
        <input style={inp} placeholder="Mobile (WhatsApp)" value={one.supplierPhone} onChange={e => setOne({ ...one, supplierPhone: e.target.value })} />
        <button onClick={addTyped} disabled={!one.supplierName.trim()} style={btn}>Add</button>
      </div>
    </div>
  )
}

export default function JobOrdersModal({ jobId, jobLabel, jobAddress = '', onChanged, onClose }: Props) {
  const sb = useMemo(() => createClient(), [])
  const { suppliers, settings } = useApp()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [quotes, setQuotes] = useState<OrderQuote[]>([])
  const [mode, setMode] = useState<'order' | 'request'>('order')
  const [recips, setRecips] = useState<QuoteInvitee[]>([])
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [moreRecips, setMoreRecips] = useState<QuoteInvitee[]>([])
  const [costs, setCosts] = useState<JobCost[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [invoiceFor, setInvoiceFor] = useState<{ order: JobOrder; net: string; docNumber: string; date: string; status: 'unpaid' | 'paid' } | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: owner } = await sb.rpc('get_effective_owner_id')
    setOwnerId((owner as string) || user.id)
    const [{ orders: o, missing: m }, c] = await Promise.all([fetchJobOrders(sb, jobId), fetchJobCosts(sb, user.id, jobId)])
    setOrders(o); setMissing(m); setCosts(c)
    setQuotes(await fetchOrderQuotes(sb, o.filter(x => x.kind === 'quote_request').map(x => x.id)))
    setLoading(false)
  }, [sb, jobId])
  useEffect(() => { load() }, [load])

  const today = todayYmd()
  const committed = committedTotals(orders, today)
  const suggestions = matchSuggestions(orders, costs)
  const sender = { name: settings.contact || '', company: settings.name || 'Your builder' }

  function blank(type: OrderType = 'skip'): Form {
    const t = ORDER_TYPES[type]
    return {
      orderType: type, supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '', title: '', details: '',
      costCategory: t.category, payTerms: t.payTerms, rateBasis: t.rateBasis, rate: 0, plannedUnits: 1,
      deliveryDate: '', deliverySlot: '', offHireDate: '', expectedInvoice: '',
      siteAddress: jobAddress, siteContact: settings.contact || '', sitePhone: settings.phone || '', accessNotes: '',
    }
  }
  const startForm = (m: 'order' | 'request') => { setNotice(null); setMode(m); setRecips([]); setForm(blank()) }
  function changeType(type: OrderType) {
    setForm(f => { if (!f) return f; const t = ORDER_TYPES[type]; return { ...f, orderType: type, costCategory: t.category, payTerms: t.payTerms, rateBasis: t.rateBasis } })
  }
  function pickSupplier(id: string) {
    const s = suppliers.find(x => x.id === id)
    if (!s) return
    setForm(f => f ? { ...f, supplierId: s.id, supplierName: s.name, supplierContact: s.contactName || '', supplierEmail: s.email || '', supplierPhone: s.phone || '' } : f)
  }

  async function save() {
    if (!form || !ownerId) return
    if (mode === 'order' && !form.supplierName.trim()) { setNotice({ ok: false, text: 'Say who the supplier is.' }); return }
    if (!form.title.trim()) { setNotice({ ok: false, text: mode === 'request' ? 'Say what you want a price for.' : 'Say what you are ordering.' }); return }
    if (mode === 'request' && !form.id && recips.length === 0) { setNotice({ ok: false, text: 'Add at least one supplier to ask.' }); return }
    setBusy('save')
    const body = { ...form, expectedInvoice: form.payTerms === 'account' ? (form.expectedInvoice || (form.deliveryDate ? addDays(form.deliveryDate, 30) : '')) : '' }
    if (form.id) {
      const o = await updateJobOrder(sb, form.id, body)
      if (!o) setNotice({ ok: false, text: 'Could not save the order.' })
    } else {
      const { order, error } = await insertJobOrder(sb, ownerId, { ...body, jobId, kind: mode === 'request' ? 'quote_request' : 'order', status: 'draft' })
      if (!order) setNotice({ ok: false, text: `Could not save. ${error ?? ''}` })
      else if (mode === 'request') {
        const r = await insertOrderQuotes(sb, ownerId, order.id, recips)
        if (!r.ok) setNotice({ ok: false, text: /does not exist|schema cache|PGRST205|42P01/i.test(r.error ?? '') ? 'Price requests need a small database update first: run supabase/job-orders-quotes.sql in the Supabase SQL editor.' : `The request was saved but the suppliers were not: ${r.error ?? ''}` })
      }
    }
    setBusy(null); setForm(null); await load(); onChanged?.()
  }

  /** The order is placed: ordered, and for one you pay for at once, the real paid cost goes on the job now. */
  async function placeOrder(o: JobOrder, via: string, sent = true) {
    if (!userId) return
    let paidCostId = o.paidCostId
    if (o.payTerms === 'on_order' && !paidCostId) {
      const net = expectedNet(o, today)
      const vat = +(net * 0.2).toFixed(2)
      const c = await insertJobCost(sb, userId, {
        jobId, supplier: o.supplierName, docDate: today, docNumber: '', description: `${poRef(o.poNumber)} · ${o.title} (VAT assumed at 20% until the receipt is attached)`,
        costCategory: o.costCategory, netAmount: net, vatAmount: vat, grossAmount: +(net + vat).toFixed(2), paymentStatus: 'paid', source: 'manual', poRef: poRef(o.poNumber),
      })
      paidCostId = c?.id
    }
    await updateJobOrder(sb, o.id, { status: o.status === 'draft' ? 'ordered' : o.status, ...(sent ? { sentAt: new Date().toISOString() } : {}), sentVia: via, paidCostId })
    await load(); onChanged?.()
  }

  /** An order made by approving a price that the supplier has not been sent the order for yet. */
  const unconfirmed = (o: JobOrder) => o.kind === 'order' && o.sentVia === 'quote accepted' && !o.sentAt

  async function sendEmail(o: JobOrder) {
    if (!o.supplierEmail.trim()) { setNotice({ ok: false, text: 'This order has no email address for the supplier. Edit it to add one, or use WhatsApp.' }); return }
    if (!confirm(`Email ${poRef(o.poNumber)} to ${o.supplierEmail}?\n\nA copy goes to you as well.`)) return
    setBusy(`email-${o.id}`); setNotice(null)
    try {
      const res = await fetch('/api/orders/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: o.id,
          note: unconfirmed(o) ? `Thank you for your price${o.rate > 0 ? ` of ${fmt(o.rate)} + VAT${o.rateBasis === 'fixed' ? '' : ' per ' + o.rateBasis}` : ''}. Please treat this email as our order.` : undefined,
          branding: {
            companyName: settings.name, companyPhone: settings.phone, companyEmail: settings.email, senderName: settings.contact,
            address: settings.address, companyNumber: settings.companyNumber, vatNumber: settings.vatNumber, website: settings.website,
            logoOwnerId: settings.logo ? ownerId ?? undefined : undefined,
          },
        }),
      })
      const text = await res.text()
      let data: { ok?: boolean; error?: string } = {}
      try { data = JSON.parse(text) } catch { data = { error: 'The email service did not answer properly. Try again.' } }
      if (!res.ok || data.error) { setNotice({ ok: false, text: data.error || 'Could not send the email.' }); return }
      await placeOrder(o, 'email')
      setNotice({ ok: true, text: `${poRef(o.poNumber)} emailed to ${o.supplierEmail}. A copy is in your inbox.` })
    } finally { setBusy(null) }
  }

  async function sendWhatsApp(o: JobOrder) {
    const link = waLink(o.supplierPhone, orderWhatsAppText(o, sender))
    if (!link) { setNotice({ ok: false, text: 'This order has no usable phone number for the supplier. Edit it to add one, or copy the text.' }); return }
    window.open(link, '_blank', 'noopener')
    if ((o.status === 'draft' || unconfirmed(o)) && confirm(`WhatsApp has opened with ${poRef(o.poNumber)} ready to send.\n\nPress OK once you have sent it, to mark the order as ordered.`)) await placeOrder(o, 'whatsapp')
  }

  const linkBase = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) || (typeof window !== 'undefined' ? window.location.origin : '')

  async function emailQuoteRequest(o: JobOrder, q: OrderQuote) {
    if (!q.supplierEmail.trim()) { setNotice({ ok: false, text: `${q.supplierName} has no email address. Use WhatsApp or copy the link.` }); return }
    if (!confirm(`Email the price request ${poRef(o.poNumber)} to ${q.supplierEmail}?\n\nThey get a link to give their price. The job's street address is not in it, only the area. A copy goes to you.`)) return
    setBusy(`rq-${q.id}`); setNotice(null)
    try {
      const res = await fetch('/api/orders/request-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: q.id,
          branding: {
            companyName: settings.name, companyPhone: settings.phone, companyEmail: settings.email, senderName: settings.contact,
            address: settings.address, companyNumber: settings.companyNumber, vatNumber: settings.vatNumber, website: settings.website,
            logoOwnerId: settings.logo ? ownerId ?? undefined : undefined,
          },
        }),
      })
      const text = await res.text()
      let data: { ok?: boolean; error?: string } = {}
      try { data = JSON.parse(text) } catch { data = { error: 'The email service did not answer properly. Try again.' } }
      if (!res.ok || data.error) { setNotice({ ok: false, text: data.error || 'Could not send the email.' }); return }
      await updateOrderQuote(sb, q.id, { sentAt: new Date().toISOString(), sentVia: 'email' })
      setNotice({ ok: true, text: `Price request emailed to ${q.supplierEmail}. A copy is in your inbox, and you are emailed when they reply.` })
      await load()
    } finally { setBusy(null) }
  }

  async function whatsAppQuoteRequest(o: JobOrder, q: OrderQuote) {
    const link = waLink(q.supplierPhone, quoteRequestText(o, q, quoteLink(linkBase, q.token), sender))
    if (!link) { setNotice({ ok: false, text: `${q.supplierName} has no usable mobile number. Edit it, or copy the message.` }); return }
    window.open(link, '_blank', 'noopener')
    if (confirm(`WhatsApp has opened with the price request for ${q.supplierName}.\n\nPress OK once you have sent it.`)) { await updateOrderQuote(sb, q.id, { sentAt: new Date().toISOString(), sentVia: 'whatsapp' }); await load() }
  }

  async function copyQuoteRequest(o: JobOrder, q: OrderQuote) {
    try { await navigator.clipboard.writeText(quoteRequestText(o, q, quoteLink(linkBase, q.token), sender)); setNotice({ ok: true, text: 'Copied the message with their link. Paste it anywhere.' }) }
    catch { setNotice({ ok: false, text: 'Could not copy automatically.' }) }
  }

  async function addSuppliersTo(o: JobOrder) {
    if (!ownerId || moreRecips.length === 0) return
    const r = await insertOrderQuotes(sb, ownerId, o.id, moreRecips)
    setNotice(r.ok ? { ok: true, text: 'Added. Send them their link below.' } : { ok: false, text: `Could not add them: ${r.error ?? ''}` })
    setAddingTo(null); setMoreRecips([]); await load()
  }

  /** Approve one reply: the request becomes an order with the same PO number, at their price and date, and counts as an expected cost straight away. */
  async function approveQuote(o: JobOrder, q: OrderQuote) {
    if (q.price === null) return
    const days = q.deliveryDate || o.deliveryDate
    const asks = `${fmt(q.price)} + VAT${q.rateBasis === 'fixed' ? '' : ' per ' + q.rateBasis}`
    if (!confirm(`Approve ${q.supplierName} at ${asks}?\n\n${poRef(o.poNumber)} becomes an order with them${o.payTerms === 'account' ? ' and counts as an expected cost on the job' : ' and is put on the job as a paid cost'}. The other suppliers are marked as not chosen. You then send ${q.supplierName} the order confirmation with the full address.`)) return
    setBusy(`ap-${q.id}`)
    const updated = await updateJobOrder(sb, o.id, {
      kind: 'order', status: 'ordered', supplierId: q.supplierId ?? '', supplierName: q.supplierName, supplierContact: q.supplierContact, supplierEmail: q.supplierEmail, supplierPhone: q.supplierPhone,
      rate: q.price, rateBasis: q.rateBasis, deliveryDate: days, sentVia: 'quote accepted', sentAt: '',
      expectedInvoice: o.payTerms === 'account' ? (o.expectedInvoice && o.expectedInvoice > days ? o.expectedInvoice : days ? addDays(days, 30) : '') : '',
    })
    if (!updated) { setBusy(null); setNotice({ ok: false, text: 'Could not approve it. Try again.' }); return }
    await updateOrderQuote(sb, q.id, { status: 'chosen' })
    for (const other of quotes.filter(x => x.orderId === o.id && x.id !== q.id && (x.status === 'invited' || x.status === 'replied'))) await updateOrderQuote(sb, other.id, { status: 'not_chosen' })
    await placeOrder(updated, 'quote accepted', false)
    setBusy(null)
    setNotice({ ok: true, text: `${q.supplierName} approved at ${asks}. ${poRef(o.poNumber)} is now an order. Press Send confirmation to send them the full details.` })
  }

  async function copyText(o: JobOrder) {
    try { await navigator.clipboard.writeText(orderWhatsAppText(o, sender)); setNotice({ ok: true, text: 'Copied. Paste it into a message, a text or an email.' }) }
    catch { setNotice({ ok: false, text: 'Could not copy automatically.' }) }
  }

  async function setStatus(o: JobOrder, status: OrderStatus, extra: Partial<JobOrder> = {}) {
    await updateJobOrder(sb, o.id, { status, ...extra })
    await load(); onChanged?.()
  }

  async function removeOrder(o: JobOrder) {
    const msg = o.paidCostId ? `Delete ${poRef(o.poNumber)}?\n\nThe paid cost it put on the job stays; delete that from the job's costs if it should go too.` : `Delete ${poRef(o.poNumber)}?`
    if (!confirm(msg)) return
    await deleteJobOrder(sb, o.id); await load(); onChanged?.()
  }

  async function matchTo(o: JobOrder, c: JobCost) {
    await updateJobCost(sb, c.id, { poRef: poRef(o.poNumber) })
    await updateJobOrder(sb, o.id, { status: 'invoiced', invoicedCostId: c.id })
    setNotice({ ok: true, text: `${poRef(o.poNumber)} matched to ${c.supplier}'s invoice. It no longer counts as an expected cost.` })
    await load(); onChanged?.()
  }

  async function recordInvoice() {
    if (!invoiceFor || !userId) return
    const net = parseFloat(invoiceFor.net)
    if (!(net >= 0)) { setNotice({ ok: false, text: 'Enter the invoice amount, not including VAT.' }); return }
    const o = invoiceFor.order
    setBusy('invoice')
    const vat = +(net * 0.2).toFixed(2)
    const c = await insertJobCost(sb, userId, {
      jobId, supplier: o.supplierName, docDate: invoiceFor.date, docNumber: invoiceFor.docNumber, description: `${poRef(o.poNumber)} · ${o.title}`,
      costCategory: o.costCategory, netAmount: net, vatAmount: vat, grossAmount: +(net + vat).toFixed(2), paymentStatus: invoiceFor.status, source: 'manual', poRef: poRef(o.poNumber),
    })
    if (c) await updateJobOrder(sb, o.id, { status: 'invoiced', invoicedCostId: c.id })
    setBusy(null); setInvoiceFor(null)
    setNotice({ ok: true, text: `${poRef(o.poNumber)} invoiced: ${fmt(net)} ex VAT is now a real cost on the job (VAT at 20%; change it in Costs if different).` })
    await load(); onChanged?.()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const lab: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }
  const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const primary: React.CSSProperties = { ...btn, background: '#0369a1', borderColor: '#0369a1', color: '#fff' }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => f ? { ...f, [k]: v } : f)

  function editOrder(o: JobOrder) {
    setNotice(null); setInvoiceFor(null); setMode(o.kind === 'quote_request' ? 'request' : 'order')
    const { id, poNumber, status, sentVia, jobId: _j, kind, ...rest } = o as JobOrder & { sentVia: string }
    void status; void sentVia; void _j; void kind
    setForm({ ...(rest as Omit<Form, 'id' | 'poNumber'>), id, poNumber })
  }

  /** A request for a price: who was asked, what came back side by side, and Approve on the one you want. */
  function renderRequest(o: JobOrder) {
    const qs = quotes.filter(q => q.orderId === o.id)
    const replied = qs.filter(q => q.status === 'replied').length
    const cheapest = cheapestQuoteId(qs, o.plannedUnits)
    const live = o.status !== 'cancelled'
    const when = [o.deliveryDate ? `needed ${orderDateLabel(o.deliveryDate)}${o.deliverySlot ? ', ' + o.deliverySlot : ''}` : '', o.offHireDate ? `collect ${orderDateLabel(o.offHireDate)}` : ''].filter(Boolean).join(' · ')
    const sentDay = (q: OrderQuote) => (q.sentAt ? new Date(q.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
    return (
      <div key={o.id} style={{ border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px', background: o.status === 'cancelled' ? '#fafafa' : '#f0f9ff', opacity: o.status === 'cancelled' ? 0.7 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{poRef(o.poNumber)}</strong>
          <span style={{ fontWeight: 700 }}>{o.title}</span>
          <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10, background: o.status === 'cancelled' ? '#fee2e2' : '#e0f2fe', color: o.status === 'cancelled' ? '#991b1b' : '#075985', fontWeight: 700 }}>{o.status === 'cancelled' ? 'Cancelled' : 'Price request'}</span>
          {live && <span style={{ fontSize: 12, color: '#475569' }}>{qs.length === 0 ? 'no suppliers yet' : `${replied} of ${qs.length} quoted`}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.6 }}>
          {[when, o.rateBasis !== 'fixed' ? `priced per ${o.rateBasis}, ${o.plannedUnits} planned` : '', areaOnly(o.siteAddress) ? `suppliers see only: ${areaOnly(o.siteAddress)}` : 'suppliers are not shown an address'].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {qs.map(q => {
            const sty = QUOTE_STYLE[q.status]
            const net = quoteNet(q, o.plannedUnits)
            const expired = q.validUntil && q.validUntil < today
            const open = live && (q.status === 'invited' || q.status === 'replied' || q.status === 'declined')
            return (
              <div key={q.id} style={{ border: q.id === cheapest ? '1px solid #16a34a' : '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{q.supplierName}</strong>
                  <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: sty.bg, color: sty.fg, fontWeight: 700 }}>{QUOTE_STATUS_LABEL[q.status]}</span>
                  {q.id === cheapest && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>CHEAPEST</span>}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {q.sentAt ? `link sent ${sentDay(q)}${q.sentVia ? ' by ' + q.sentVia : ''}` : 'link not sent yet'}{q.viewedAt && q.status === 'invited' ? ' · opened' : ''}
                  </span>
                  <span style={{ flex: 1 }} />
                  {q.status === 'replied' && q.price !== null && (
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }} title="Ex VAT">
                      {fmt(q.price)}{q.rateBasis === 'fixed' ? '' : ` per ${q.rateBasis}`}{q.rateBasis !== 'fixed' ? <span style={{ color: '#64748b', fontWeight: 400 }}> (≈ {fmt(net)})</span> : null}
                    </span>
                  )}
                </div>
                {(q.status === 'replied' || q.status === 'chosen') && (
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 3, lineHeight: 1.6 }}>
                    {q.deliveryDate ? `delivery ${orderDateLabel(q.deliveryDate)}` : 'no delivery date given'}
                    {q.validUntil ? <span style={{ color: expired ? '#dc2626' : undefined, fontWeight: expired ? 700 : undefined }}> · {expired ? 'price expired' : 'valid until'} {orderDateLabel(q.validUntil)}</span> : ''}
                    {q.notes ? <span style={{ color: '#334155' }}> · “{q.notes}”</span> : ''}
                  </div>
                )}
                {q.status === 'declined' && q.notes && <div style={{ fontSize: 12, color: '#991b1b', marginTop: 3 }}>“{q.notes}”</div>}
                {open && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {q.status === 'replied' && <button onClick={() => approveQuote(o, q)} disabled={busy === `ap-${q.id}`} style={{ ...primary, background: '#16a34a', borderColor: '#16a34a' }}>{busy === `ap-${q.id}` ? 'Approving…' : '✔ Approve this price'}</button>}
                    <button onClick={() => emailQuoteRequest(o, q)} disabled={busy === `rq-${q.id}`} style={q.sentAt || q.status !== 'invited' ? btn : primary}>{busy === `rq-${q.id}` ? 'Sending…' : q.sentAt ? '✉ Email link again' : '✉ Email the link'}</button>
                    <button onClick={() => whatsAppQuoteRequest(o, q)} style={btn}>🟢 WhatsApp the link</button>
                    <button onClick={() => copyQuoteRequest(o, q)} style={btn}>Copy message</button>
                    <button onClick={async () => { if (confirm(`Take ${q.supplierName} off this request?`)) { await deleteOrderQuote(sb, q.id); await load() } }} style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
                  </div>
                )}
              </div>
            )
          })}
          {addingTo === o.id && (
            <div>
              <Recipients suppliers={suppliers.filter(s => !qs.some(q => q.supplierId === s.id))} value={moreRecips} onChange={setMoreRecips} inp={inp} lab={lab} btn={btn} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => addSuppliersTo(o)} disabled={moreRecips.length === 0} style={primary}>Add to this request</button>
                <button onClick={() => { setAddingTo(null); setMoreRecips([]) }} style={btn}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {live && addingTo !== o.id && <button onClick={() => { setAddingTo(o.id); setMoreRecips([]) }} style={btn}>＋ Ask another supplier</button>}
          {live && <button onClick={() => editOrder(o)} style={btn}>Edit request</button>}
          {live && <button onClick={() => { if (confirm(`Cancel the price request ${poRef(o.poNumber)}? Suppliers who open their link will be told it is closed.`)) setStatus(o, 'cancelled') }} style={btn}>Cancel request</button>}
          <button onClick={() => removeOrder(o)} style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }}>Delete</button>
        </div>
      </div>
    )
  }

  const preview = form ? expectedNet({ rate: form.rate, rateBasis: form.rateBasis, plannedUnits: form.plannedUnits, deliveryDate: form.deliveryDate, offHireDate: form.offHireDate }, today) : 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 14px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 880, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📦 Orders</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{jobLabel}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>}

          {!loading && missing && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              Orders need a small database update first. Run <strong>supabase/job-orders.sql</strong> in the Supabase SQL editor, then reopen this window.
            </div>
          )}

          {!loading && !missing && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <button onClick={() => startForm('order')} style={primary}>＋ New order</button>
                <button onClick={() => startForm('request')} style={btn} title="Ask one or more suppliers for a price: they get a link, no login, and you compare and approve">💬 Ask for a price</button>
                {committed.total > 0 && (
                  <span style={{ fontSize: 13, color: '#334155' }}>
                    Expected costs still to come: <strong style={{ fontFamily: 'monospace' }}>{fmt(committed.total)}</strong> <span style={{ color: '#94a3b8' }}>ex VAT, already counted in the job&apos;s margin</span>
                  </span>
                )}
              </div>

              {notice && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 7, fontSize: 13, background: notice.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${notice.ok ? '#bbf7d0' : '#fecaca'}`, color: notice.ok ? '#166534' : '#991b1b' }}>{notice.text}</div>
              )}

              {suggestions.length > 0 && (
                <div style={{ marginBottom: 14, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Might be an invoice you were waiting for</div>
                  {suggestions.map(({ order, cost, strong }) => (
                    <div key={order.id + cost.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0', fontSize: 13, color: '#44403c' }}>
                      <span style={{ flex: 1, minWidth: 220 }}>
                        <strong>{cost.supplier}</strong> {cost.docNumber ? `invoice ${cost.docNumber}` : 'cost'} for {fmt(cost.netAmount)} ex VAT — is this <strong>{poRef(order.poNumber)}</strong> ({order.title}, expected {fmt(expectedNet(order, today))})?
                        {strong && <span style={{ marginLeft: 6, fontSize: 11, color: '#15803d', fontWeight: 700 }}>NAMES THE PO NUMBER</span>}
                      </span>
                      <button onClick={() => matchTo(order, cost)} style={{ ...btn, borderColor: '#d97706', color: '#92400e' }}>Yes, match it</button>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Until matched, the job&apos;s margin counts the expected cost and this invoice both.</div>
                </div>
              )}

              {/* The order form */}
              {form && (
                <div style={{ border: '2px solid #0369a1', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fcff' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{form.id ? `Edit ${poRef(form.poNumber ?? 0)}` : mode === 'request' ? 'Ask suppliers for a price' : 'New order'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={lab}>What kind of order</label>
                      <select style={inp} value={form.orderType} onChange={e => changeType(e.target.value as OrderType)}>
                        {(Object.keys(ORDER_TYPES) as OrderType[]).map(k => <option key={k} value={k}>{ORDER_TYPES[k].label}</option>)}
                      </select>
                    </div>
                    {mode === 'order' && <>
                    <div>
                      <label style={lab}>Supplier from your Contacts</label>
                      <select style={inp} value={form.supplierId ?? ''} onChange={e => pickSupplier(e.target.value)}>
                        <option value="">Pick a supplier…</option>
                        {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div><label style={lab}>Supplier name *</label><input style={inp} value={form.supplierName} onChange={e => set('supplierName', e.target.value)} placeholder="Dave's Skips" /></div>
                    <div><label style={lab}>Person there (for “Hi Dave”)</label><input style={inp} value={form.supplierContact} onChange={e => set('supplierContact', e.target.value)} /></div>
                    <div><label style={lab}>Their email</label><input style={inp} type="email" value={form.supplierEmail} onChange={e => set('supplierEmail', e.target.value)} /></div>
                    <div><label style={lab}>Their mobile (for WhatsApp)</label><input style={inp} value={form.supplierPhone} onChange={e => set('supplierPhone', e.target.value)} /></div>
                    </>}
                  </div>
                  {mode === 'request' && !form.id && <div style={{ marginTop: 10 }}><Recipients suppliers={suppliers} value={recips} onChange={setRecips} inp={inp} lab={lab} btn={btn} /></div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 10, marginTop: 10 }}>
                    <div><label style={lab}>What *</label><input style={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder={ORDER_TYPES[form.orderType].example || 'What are you ordering?'} /></div>
                    <div><label style={lab}>More detail for the supplier</label><input style={inp} value={form.details} onChange={e => set('details', e.target.value)} placeholder="Quantity, size, anything they need to know" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={lab}>Price is</label>
                      <select style={inp} value={form.rateBasis} onChange={e => set('rateBasis', e.target.value as RateBasis)}>
                        <option value="fixed">One price</option><option value="day">Per day</option><option value="week">Per week</option>
                      </select>
                    </div>
                    {mode === 'order' && <div><label style={lab}>{form.rateBasis === 'fixed' ? 'Price (£, ex VAT)' : `Rate per ${form.rateBasis} (£, ex VAT)`}</label><input style={inp} type="number" min={0} step="0.01" value={form.rate || ''} onChange={e => set('rate', Math.max(0, +e.target.value || 0))} /></div>}
                    {form.rateBasis !== 'fixed' && <div><label style={lab}>Planned {form.rateBasis === 'day' ? 'days' : 'weeks'}</label><input style={inp} type="number" min={1} step="1" value={form.plannedUnits} onChange={e => set('plannedUnits', Math.max(1, +e.target.value || 1))} /></div>}
                    <div>
                      <label style={lab}>Cost category</label>
                      <select style={inp} value={form.costCategory} onChange={e => set('costCategory', e.target.value as JobCostCategory)}>
                        {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lab}>How you pay</label>
                      <select style={inp} value={form.payTerms} onChange={e => set('payTerms', e.target.value as PayTerms)}>
                        <option value="account">On account (invoiced later)</option><option value="on_order">Paid when ordered</option>
                      </select>
                    </div>
                    {form.payTerms === 'account' && <div><label style={lab}>Invoice expected about</label><input style={inp} type="date" value={form.expectedInvoice || (form.deliveryDate ? addDays(form.deliveryDate, 30) : '')} onChange={e => set('expectedInvoice', e.target.value)} /></div>}
                  </div>
                  {mode === 'request' ? <div style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>Suppliers give the price. Where it is hire by the day or week, they quote a rate and it is worked out for the planned time. The supplier sees the area only, never the street, site contact or access notes, until you approve a price.</div> : <div style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>
                    Expected cost: <strong style={{ fontFamily: 'monospace' }}>{fmt(preview)}</strong> ex VAT
                    {form.rateBasis !== 'fixed' && form.rate > 0 ? ` (${fmt(form.rate)} × ${hireUnits({ rateBasis: form.rateBasis, plannedUnits: form.plannedUnits, deliveryDate: form.deliveryDate, offHireDate: form.offHireDate }, today)} ${form.rateBasis}${hireUnits({ rateBasis: form.rateBasis, plannedUnits: form.plannedUnits, deliveryDate: form.deliveryDate, offHireDate: form.offHireDate }, today) === 1 ? '' : 's'})` : ''}
                    {form.payTerms === 'on_order' ? ' · goes onto the job as a paid cost when you place the order' : ' · counts against the job until the invoice is matched'}
                  </div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 10 }}>
                    <div><label style={lab}>Delivery date</label><input style={inp} type="date" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></div>
                    <div><label style={lab}>Time slot</label><input style={inp} value={form.deliverySlot} onChange={e => set('deliverySlot', e.target.value)} placeholder="Morning, 8 to 10am" /></div>
                    {ORDER_TYPES[form.orderType].hire && <div><label style={lab}>Collect / off-hire date</label><input style={inp} type="date" value={form.offHireDate} onChange={e => set('offHireDate', e.target.value)} /></div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
                    <div style={{ gridColumn: 'span 2' }}><label style={lab}>Site address</label><input style={inp} value={form.siteAddress} onChange={e => set('siteAddress', e.target.value)} /></div>
                    <div><label style={lab}>Site contact</label><input style={inp} value={form.siteContact} onChange={e => set('siteContact', e.target.value)} /></div>
                    <div><label style={lab}>Site contact phone</label><input style={inp} value={form.sitePhone} onChange={e => set('sitePhone', e.target.value)} /></div>
                  </div>
                  <div style={{ marginTop: 10 }}><label style={lab}>Access notes</label><input style={inp} value={form.accessNotes} onChange={e => set('accessNotes', e.target.value)} placeholder="Parking, permit, gate code, where to put it" /></div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={save} disabled={busy === 'save'} style={primary}>{busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : mode === 'request' ? 'Save the request' : 'Save order'}</button>
                    <button onClick={() => setForm(null)} style={btn}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Invoice arrived */}
              {invoiceFor && (
                <div style={{ border: '2px solid #16a34a', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f0fdf4' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Invoice arrived for {poRef(invoiceFor.order.poNumber)} ({invoiceFor.order.title})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <div><label style={lab}>Invoice amount (£, ex VAT)</label><input style={inp} type="number" min={0} step="0.01" value={invoiceFor.net} onChange={e => setInvoiceFor({ ...invoiceFor, net: e.target.value })} /></div>
                    <div><label style={lab}>Their invoice number</label><input style={inp} value={invoiceFor.docNumber} onChange={e => setInvoiceFor({ ...invoiceFor, docNumber: e.target.value })} /></div>
                    <div><label style={lab}>Invoice date</label><input style={inp} type="date" value={invoiceFor.date} onChange={e => setInvoiceFor({ ...invoiceFor, date: e.target.value })} /></div>
                    <div><label style={lab}>Paid yet?</label><select style={inp} value={invoiceFor.status} onChange={e => setInvoiceFor({ ...invoiceFor, status: e.target.value as 'unpaid' | 'paid' })}><option value="unpaid">Not yet</option><option value="paid">Paid</option></select></div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>This becomes the real cost on the job, and the expected cost for this order stops counting. If you scanned the invoice into the document inbox already, cancel this and use the match suggestion instead.</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={recordInvoice} disabled={busy === 'invoice'} style={{ ...primary, background: '#16a34a', borderColor: '#16a34a' }}>{busy === 'invoice' ? 'Saving…' : 'Add as a cost'}</button>
                    <button onClick={() => setInvoiceFor(null)} style={btn}>Cancel</button>
                  </div>
                </div>
              )}

              {/* The orders */}
              {orders.length === 0 && !form && (
                <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 14, border: '1px dashed #d1d5db', borderRadius: 8 }}>
                  No orders yet for this job. Press <strong>＋ New order</strong> to raise a skip, a portaloo, plant hire or a materials order, or <strong>💬 Ask for a price</strong> to get quotes from suppliers first.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orders.map(o => {
                  if (o.kind === 'quote_request') return renderRequest(o)
                  const st = STATUS_STYLE[o.status]
                  const net = expectedNet(o, today)
                  const warn = overrunNote(o, today)
                  const invoicedCost = o.invoicedCostId ? costs.find(c => c.id === o.invoicedCostId) : undefined
                  const paidCost = o.paidCostId ? costs.find(c => c.id === o.paidCostId) : undefined
                  const live = o.status !== 'invoiced' && o.status !== 'cancelled'
                  return (
                    <div key={o.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', background: o.status === 'cancelled' ? '#fafafa' : '#fff', opacity: o.status === 'cancelled' ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{poRef(o.poNumber)}</strong>
                        <span style={{ fontWeight: 700 }}>{o.title}</span>
                        <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10, background: st.bg, color: st.fg, fontWeight: 700 }}>{ORDER_STATUS_LABEL[o.status]}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{o.payTerms === 'account' ? 'On account' : 'Paid when ordered'}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }} title="Ex VAT">{fmt(invoicedCost ? invoicedCost.netAmount : paidCost ? paidCost.netAmount : net)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.6 }}>
                        {o.supplierName}{o.deliveryDate ? ` · delivery ${orderDateLabel(o.deliveryDate)}${o.deliverySlot ? ', ' + o.deliverySlot : ''}` : ''}{o.offHireDate ? ` · collected ${orderDateLabel(o.offHireDate)}` : ''}
                        {o.rateBasis !== 'fixed' && o.rate > 0 ? ` · ${fmt(o.rate)} per ${o.rateBasis} × ${hireUnits(o, today)}` : ''}
                        {isCommitted(o) && o.expectedInvoice ? ` · invoice expected about ${orderDateLabel(o.expectedInvoice)}` : ''}
                        {o.sentAt ? ` · sent ${new Date(o.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${o.sentVia ? ' by ' + o.sentVia : ''}` : ''}
                        {invoicedCost ? ` · invoice ${invoicedCost.docNumber || ''} ${invoicedCost.paymentStatus === 'paid' ? '(paid)' : '(not yet paid)'}` : ''}
                      </div>
                      {warn && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600, marginTop: 4 }}>⚠ {warn}</div>}
                      {unconfirmed(o) && live && <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 600, marginTop: 4 }}>Price approved, but {o.supplierName} has not been sent the order yet. Press Send confirmation: it has the full address and asks them to quote {poRef(o.poNumber)} on the invoice.</div>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                        {live && o.status === 'draft' && <>
                          <button onClick={() => sendEmail(o)} disabled={busy === `email-${o.id}`} style={primary}>{busy === `email-${o.id}` ? 'Sending…' : '✉ Email it'}</button>
                          <button onClick={() => sendWhatsApp(o)} style={btn}>🟢 WhatsApp</button>
                          <button onClick={() => copyText(o)} style={btn}>Copy text</button>
                          <button onClick={() => { if (confirm(`Mark ${poRef(o.poNumber)} as ordered without sending a message? Use this when you phoned it through.`)) placeOrder(o, 'phone') }} style={btn}>Ordered another way</button>
                        </>}
                        {live && o.status !== 'draft' && <>
                          <button onClick={() => sendEmail(o)} style={unconfirmed(o) ? primary : btn} title={unconfirmed(o) ? 'Send the order with the full address' : 'Send the order email again'}>{unconfirmed(o) ? '✉ Send confirmation' : '✉ Email again'}</button>
                          <button onClick={() => sendWhatsApp(o)} style={btn}>🟢 WhatsApp</button>
                        </>}
                        {live && o.status === 'ordered' && <button onClick={() => setStatus(o, 'confirmed')} style={btn}>Supplier confirmed</button>}
                        {live && (o.status === 'ordered' || o.status === 'confirmed') && <button onClick={() => setStatus(o, 'delivered', o.deliveryDate ? {} : { deliveryDate: today })} style={btn}>{ORDER_TYPES[o.orderType].hire ? 'Delivered / on site' : 'Delivered'}</button>}
                        {live && o.status === 'delivered' && ORDER_TYPES[o.orderType].hire && <button onClick={() => setStatus(o, 'collected', { offHireDate: o.offHireDate || today })} style={btn}>Collected / off-hire</button>}
                        {live && o.payTerms === 'account' && o.status !== 'draft' && <button onClick={() => setInvoiceFor({ order: o, net: net ? net.toFixed(2) : '', docNumber: '', date: today, status: 'unpaid' })} style={{ ...btn, borderColor: '#16a34a', color: '#166534' }}>Invoice arrived…</button>}
                        {live && <button onClick={() => editOrder(o)} style={btn}>Edit</button>}
                        {live && <button onClick={() => { if (confirm(`Cancel ${poRef(o.poNumber)}? It stops counting as an expected cost.`)) setStatus(o, 'cancelled') }} style={btn}>Cancel order</button>}
                        {(o.status === 'cancelled' || o.status === 'draft') && <button onClick={() => removeOrder(o)} style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }}>Delete</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
