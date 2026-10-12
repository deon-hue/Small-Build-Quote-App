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
  type JobOrder, type OrderType, type PayTerms, type RateBasis, type OrderStatus,
} from '@/lib/job-orders'

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

export default function JobOrdersModal({ jobId, jobLabel, jobAddress = '', onChanged, onClose }: Props) {
  const sb = useMemo(() => createClient(), [])
  const { suppliers, settings } = useApp()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [orders, setOrders] = useState<JobOrder[]>([])
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
    setOrders(o); setMissing(m); setCosts(c); setLoading(false)
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
    if (!form.supplierName.trim()) { setNotice({ ok: false, text: 'Say who the supplier is.' }); return }
    if (!form.title.trim()) { setNotice({ ok: false, text: 'Say what you are ordering.' }); return }
    setBusy('save')
    const body = { ...form, expectedInvoice: form.payTerms === 'account' ? (form.expectedInvoice || (form.deliveryDate ? addDays(form.deliveryDate, 30) : '')) : '' }
    if (form.id) {
      const o = await updateJobOrder(sb, form.id, body)
      if (!o) setNotice({ ok: false, text: 'Could not save the order.' })
    } else {
      const { order, error } = await insertJobOrder(sb, ownerId, { ...body, jobId, kind: 'order', status: 'draft' })
      if (!order) setNotice({ ok: false, text: `Could not save the order. ${error ?? ''}` })
    }
    setBusy(null); setForm(null); await load(); onChanged?.()
  }

  /** The order is placed: ordered, and for one you pay for at once, the real paid cost goes on the job now. */
  async function placeOrder(o: JobOrder, via: string) {
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
    await updateJobOrder(sb, o.id, { status: o.status === 'draft' ? 'ordered' : o.status, sentAt: new Date().toISOString(), sentVia: via, paidCostId })
    await load(); onChanged?.()
  }

  async function sendEmail(o: JobOrder) {
    if (!o.supplierEmail.trim()) { setNotice({ ok: false, text: 'This order has no email address for the supplier. Edit it to add one, or use WhatsApp.' }); return }
    if (!confirm(`Email ${poRef(o.poNumber)} to ${o.supplierEmail}?\n\nA copy goes to you as well.`)) return
    setBusy(`email-${o.id}`); setNotice(null)
    try {
      const res = await fetch('/api/orders/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: o.id,
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
    if (o.status === 'draft' && confirm(`WhatsApp has opened with ${poRef(o.poNumber)} ready to send.\n\nPress OK once you have sent it, to mark the order as ordered.`)) await placeOrder(o, 'whatsapp')
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
                <button onClick={() => { setNotice(null); setForm(blank()) }} style={primary}>＋ New order</button>
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
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{form.id ? `Edit ${poRef(form.poNumber ?? 0)}` : 'New order'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={lab}>What kind of order</label>
                      <select style={inp} value={form.orderType} onChange={e => changeType(e.target.value as OrderType)}>
                        {(Object.keys(ORDER_TYPES) as OrderType[]).map(k => <option key={k} value={k}>{ORDER_TYPES[k].label}</option>)}
                      </select>
                    </div>
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
                  </div>
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
                    <div><label style={lab}>{form.rateBasis === 'fixed' ? 'Price (£, ex VAT)' : `Rate per ${form.rateBasis} (£, ex VAT)`}</label><input style={inp} type="number" min={0} step="0.01" value={form.rate || ''} onChange={e => set('rate', Math.max(0, +e.target.value || 0))} /></div>
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
                  <div style={{ fontSize: 12, color: '#475569', margin: '8px 0 0' }}>
                    Expected cost: <strong style={{ fontFamily: 'monospace' }}>{fmt(preview)}</strong> ex VAT
                    {form.rateBasis !== 'fixed' && form.rate > 0 ? ` (${fmt(form.rate)} × ${hireUnits({ rateBasis: form.rateBasis, plannedUnits: form.plannedUnits, deliveryDate: form.deliveryDate, offHireDate: form.offHireDate }, today)} ${form.rateBasis}${hireUnits({ rateBasis: form.rateBasis, plannedUnits: form.plannedUnits, deliveryDate: form.deliveryDate, offHireDate: form.offHireDate }, today) === 1 ? '' : 's'})` : ''}
                    {form.payTerms === 'on_order' ? ' · goes onto the job as a paid cost when you place the order' : ' · counts against the job until the invoice is matched'}
                  </div>
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
                    <button onClick={save} disabled={busy === 'save'} style={primary}>{busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : 'Save order'}</button>
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
                  No orders yet for this job. Press <strong>＋ New order</strong> to raise a skip, a portaloo, plant hire or a materials order.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orders.map(o => {
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
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                        {live && o.status === 'draft' && <>
                          <button onClick={() => sendEmail(o)} disabled={busy === `email-${o.id}`} style={primary}>{busy === `email-${o.id}` ? 'Sending…' : '✉ Email it'}</button>
                          <button onClick={() => sendWhatsApp(o)} style={btn}>🟢 WhatsApp</button>
                          <button onClick={() => copyText(o)} style={btn}>Copy text</button>
                          <button onClick={() => { if (confirm(`Mark ${poRef(o.poNumber)} as ordered without sending a message? Use this when you phoned it through.`)) placeOrder(o, 'phone') }} style={btn}>Ordered another way</button>
                        </>}
                        {live && o.status !== 'draft' && <>
                          <button onClick={() => sendEmail(o)} style={btn} title="Send the order email again">✉ Email again</button>
                          <button onClick={() => sendWhatsApp(o)} style={btn}>🟢 WhatsApp</button>
                        </>}
                        {live && o.status === 'ordered' && <button onClick={() => setStatus(o, 'confirmed')} style={btn}>Supplier confirmed</button>}
                        {live && (o.status === 'ordered' || o.status === 'confirmed') && <button onClick={() => setStatus(o, 'delivered', o.deliveryDate ? {} : { deliveryDate: today })} style={btn}>{ORDER_TYPES[o.orderType].hire ? 'Delivered / on site' : 'Delivered'}</button>}
                        {live && o.status === 'delivered' && ORDER_TYPES[o.orderType].hire && <button onClick={() => setStatus(o, 'collected', { offHireDate: o.offHireDate || today })} style={btn}>Collected / off-hire</button>}
                        {live && o.payTerms === 'account' && o.status !== 'draft' && <button onClick={() => setInvoiceFor({ order: o, net: net ? net.toFixed(2) : '', docNumber: '', date: today, status: 'unpaid' })} style={{ ...btn, borderColor: '#16a34a', color: '#166534' }}>Invoice arrived…</button>}
                        {live && <button onClick={() => { setNotice(null); setInvoiceFor(null); const { id, poNumber, status, sentVia, jobId: _j, kind, ...rest } = o as JobOrder & { sentVia: string }; void status; void sentVia; void _j; void kind; setForm({ ...(rest as Omit<Form, 'id' | 'poNumber'>), id, poNumber }) }} style={btn}>Edit</button>}
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
