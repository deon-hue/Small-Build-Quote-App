'use client'

// The page a supplier opens from a quote request: no login, nothing to install. They see what is wanted and give a price, a delivery date and how long the price stands, or say they
// cannot do it. Everything it shows and saves goes through /api/public/supplier-quote/[token]. The street address is never shown here, only the area.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Info {
  company: string; contactPhone: string; contactName: string; logoUrl: string; ref: string; supplierName: string
  inboxEmail?: string; title: string; details: string; orderType: string; items: { id: string; name: string; qty: number; unit: string }[]; area: string; deliveryDate: string; deliverySlot: string; offHireDate: string
  rateBasis: 'fixed' | 'day' | 'week'; plannedUnits: number
  state: 'open' | 'chosen' | 'closed'; status: string; amendedAt?: string; account?: string
  reply: { price: number | null; rateBasis: 'fixed' | 'day' | 'week'; deliveryDate: string; validUntil: string; notes: string; lines?: { id: string; unitPrice: number | null; unavailable: boolean; note: string }[]; deliveryCharge?: number; supplierRef?: string } | null
}

const LIME = '#7ab533', CHARCOAL = '#3a4149', INK = '#1e2022', MUTED = '#64748b', LINE = '#e2e8f0'
const longDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '')
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SupplierQuotePage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [price, setPrice] = useState('')
  const [basis, setBasis] = useState<'fixed' | 'day' | 'week'>('fixed')
  const [delivery, setDelivery] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  const [declining, setDeclining] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'' | 'quote' | 'decline'>('')
  const [formError, setFormError] = useState('')
  // a request that lists items: a price for each, and delivery
  const [lines, setLines] = useState<Record<string, { price: string; unavailable: boolean; note: string }>>({})
  const [deliveryCharge, setDeliveryCharge] = useState('')

  useEffect(() => {
    let live = true
    fetch(`/api/public/supplier-quote/${token}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) { setError(d.error || 'This link is not valid.'); return }
        const i = d as Info
        setInfo(i); setBasis(i.reply?.rateBasis ?? i.rateBasis)
        if (i.reply) { setPrice(i.reply.price ? String(i.reply.price) : ''); setDelivery(i.reply.deliveryDate); setValidUntil(i.reply.validUntil); setNotes(i.reply.notes); setSupplierRef(i.reply.supplierRef ?? '') }
        else setDelivery(i.deliveryDate)
        if (i.reply?.lines) {
          const m: Record<string, { price: string; unavailable: boolean; note: string }> = {}
          for (const l of i.reply.lines) m[l.id] = { price: l.unitPrice === null ? '' : String(l.unitPrice), unavailable: l.unavailable, note: l.note }
          setLines(m)
          setDeliveryCharge(i.reply.deliveryCharge ? String(i.reply.deliveryCharge) : '')
        }
      })
      .catch(() => live && setError('Could not load this page. Check your connection and try again.'))
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [token])

  async function send(action: 'quote' | 'decline') {
    setFormError('')
    const items = info?.items ?? []
    const lineBody = items.map(it => { const l = lines[it.id]; return { id: it.id, unitPrice: l && !l.unavailable && l.price !== '' ? parseFloat(l.price) : null, unavailable: !!l?.unavailable, note: l?.note ?? '' } })
    if (action === 'quote' && items.length > 0 && !lineBody.some(l => l.unitPrice !== null && l.unitPrice >= 0)) { setFormError('Please enter a price for at least one item.'); return }
    if (action === 'quote' && items.length === 0 && !(parseFloat(price) > 0)) { setFormError('Please enter your price, not including VAT.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/public/supplier-quote/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(action === 'quote' ? (items.length > 0 ? { action, lines: lineBody, deliveryCharge: parseFloat(deliveryCharge) || 0, deliveryDate: delivery, validUntil, notes } : { action, price: parseFloat(price), rateBasis: basis, deliveryDate: delivery, validUntil, notes }) : { action, notes }), supplierRef }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(d.error || 'Could not send your reply. Please try again.'); return }
      setDone(action)
    } catch { setFormError('Could not send your reply. Check your connection and try again.') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 12px', border: `1px solid #cbd5e1`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const lab: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }
  const row = (k: string, v: string) => v ? (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: `1px solid ${LINE}`, fontSize: 15 }}>
      <div style={{ width: 92, flexShrink: 0, color: MUTED, fontSize: 13, paddingTop: 1 }}>{k}</div>
      <div style={{ fontWeight: 600, color: INK, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v}</div>
    </div>
  ) : null

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#f1f5f9', fontFamily: "'DM Sans', Helvetica, Arial, sans-serif", color: INK }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 14px 40px' }}>
        <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ borderBottom: `3px solid ${LIME}`, background: '#f8faf8', padding: '22px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              {info?.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={info.logoUrl} alt={info.company} style={{ display: 'block', maxHeight: 52, maxWidth: 190, height: 'auto', width: 'auto' }} />
                : <div style={{ fontSize: 18, fontWeight: 700 }}>{info?.company ?? ''}</div>}
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginTop: 8 }}>Request for a price</div>
            </div>
            {info && <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, whiteSpace: 'nowrap' }}>{info.ref}</div>}
          </div>

          <div style={{ padding: '24px 22px 26px' }}>
            {loading && <div style={{ color: MUTED }}>Loading…</div>}
            {!loading && error && <div style={{ color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px' }}>{error}</div>}

            {info && info.state === 'closed' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>This request is closed</div>
                <p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>Thank you for your time. {info.company} has now been in touch with a supplier for this, so a price is no longer needed.</p>
              </div>
            )}

            {info && info.state === 'chosen' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Your price has been accepted</div>
                <p style={{ margin: '0 0 12px', color: MUTED, lineHeight: 1.6 }}>Thank you. {info.company} will send you the order confirmation, with the full address, shortly.</p>
                <div style={{ background: '#f8fafc', border: `1px solid ${LINE}`, borderLeft: `3px solid ${LIME}`, borderRadius: 6, padding: '12px 16px', fontSize: 15, lineHeight: 1.6 }}>
                  Please <strong>quote {info.ref}</strong> on your invoice.
                </div>
              </div>
            )}

            {info && info.state === 'open' && done === 'quote' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Thank you, your price has been sent</div>
                <p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>{info.company} will come back to you if they would like to go ahead. You can open this link again to change your price until then.</p>
              </div>
            )}
            {info && info.state === 'open' && done === 'decline' && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Thank you for letting us know</div>
                <p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>We have told {info.company} you cannot do this one. If that changes, open this link again.</p>
              </div>
            )}

            {info && info.state === 'open' && !done && (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Hello{info.supplierName ? ` ${info.supplierName}` : ''},</div>
                <p style={{ margin: '0 0 16px', color: MUTED, lineHeight: 1.6 }}>{info.company} would like a price for the following. It takes a minute and you do not need to log in.</p>
                <div style={{ background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 8, padding: '4px 18px', marginBottom: 22 }}>
                  {row('What', info.title + (info.items.length > 0 ? (info.details.startsWith('Please price') ? '' : `\n${info.details.split('\n\nPlease price')[0]}`) : info.details ? `\n${info.details}` : ''))}
                  {row('Needed', [longDate(info.deliveryDate), info.deliverySlot].filter(Boolean).join(', '))}
                  {row('Collect', longDate(info.offHireDate))}
                  {row('Where', info.area)}
                  {row('Our account', info.account ?? '')}
                  {row('Price for', info.rateBasis === 'fixed' ? '' : `${info.plannedUnits} ${info.rateBasis === 'day' ? 'day' : 'week'}${info.plannedUnits === 1 ? '' : 's'} (give your rate per ${info.rateBasis})`)}
                </div>

                {info.amendedAt && info.state === 'open' && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}><strong>This request has been amended</strong> ({new Date(info.amendedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}). Please check the details above{info.status === 'replied' ? ' and update your price if it changes' : ''}.</div>}
                {info.status === 'replied' && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>You have already sent a price{info.reply?.price ? ` of ${gbp(info.reply.price)}` : ''}. You can change it below.</div>}
                {info.status === 'declined' && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>You told us you cannot do this. You can still give a price below if that has changed.</div>}

                {!declining && (
                  <>
                    {info.items.length > 0 && (() => {
                      const lineTotal = (id: string, qty: number) => { const l = lines[id]; const p = l && !l.unavailable && l.price !== '' ? parseFloat(l.price) : NaN; return Number.isFinite(p) && p >= 0 ? Math.round(qty * p * 100) / 100 : null }
                      const itemsTotal = info.items.reduce((s, it) => s + (lineTotal(it.id, it.qty) ?? 0), 0)
                      const del = parseFloat(deliveryCharge) > 0 ? parseFloat(deliveryCharge) : 0
                      const priced = info.items.filter(it => lineTotal(it.id, it.qty) !== null).length
                      return (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 13, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Give a <strong style={{ color: INK }}>unit price</strong> (ex VAT) for each item. If you cannot supply one, tick it, or tell us what you would offer instead.</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {info.items.map(it => {
                              const l = lines[it.id] ?? { price: '', unavailable: false, note: '' }
                              const set = (patch: Partial<typeof l>) => setLines(prev => ({ ...prev, [it.id]: { ...l, ...patch } }))
                              const lt = lineTotal(it.id, it.qty)
                              return (
                                <div key={it.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '10px 12px', background: l.unavailable ? '#f8fafc' : '#fff' }}>
                                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>{it.name}</div>
                                  <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{it.qty} {it.unit}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, alignItems: 'end' }}>
                                    <div>
                                      <label style={lab}>Unit price (£)</label>
                                      <input style={{ ...inp, opacity: l.unavailable ? 0.5 : 1 }} type="number" inputMode="decimal" min={0} step="0.01" disabled={l.unavailable} value={l.price} onChange={e => set({ price: e.target.value })} placeholder="0.00" />
                                    </div>
                                    <div style={{ paddingBottom: 11, fontSize: 15, fontWeight: 700, textAlign: 'right' }}>{l.unavailable ? <span style={{ color: MUTED, fontWeight: 400 }}>not supplied</span> : lt !== null ? gbp(lt) : <span style={{ color: MUTED, fontWeight: 400 }}>—</span>}</div>
                                  </div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 14, color: MUTED }}>
                                    <input type="checkbox" checked={l.unavailable} onChange={e => set({ unavailable: e.target.checked })} style={{ width: 18, height: 18 }} /> I can&apos;t supply this
                                  </label>
                                  <input style={{ ...inp, marginTop: 8, fontSize: 14 }} value={l.note} onChange={e => set({ note: e.target.value })} placeholder="Note or alternative (optional)" maxLength={300} />
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <label style={lab}>Delivery charge (£, ex VAT, if any)</label>
                            <input style={inp} type="number" inputMode="decimal" min={0} step="0.01" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)} placeholder="0.00" />
                          </div>
                          <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8faf8', border: `1px solid ${LINE}`, borderLeft: `3px solid ${LIME}`, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: MUTED }}>{priced} of {info.items.length} items priced{del > 0 ? ' · delivery included' : ''}, ex VAT</span>
                            <strong style={{ fontSize: 18 }}>{gbp(Math.round((itemsTotal + del) * 100) / 100)}</strong>
                          </div>
                        </div>
                      )
                    })()}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {info.items.length === 0 && <><div>
                        <label style={lab}>{info.orderType === 'materials' ? 'Price for everything (£, ex VAT)' : 'Your price (£, ex VAT)'}</label>
                        <input style={inp} type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <label style={lab}>Price is</label>
                        <select style={inp} value={basis} onChange={e => setBasis(e.target.value as 'fixed' | 'day' | 'week')}>
                          <option value="fixed">One price</option><option value="day">Per day</option><option value="week">Per week</option>
                        </select>
                      </div></>}
                      <div>
                        <label style={lab}>Earliest delivery</label>
                        <input style={inp} type="date" value={delivery} onChange={e => setDelivery(e.target.value)} />
                      </div>
                      <div>
                        <label style={lab}>Price valid until</label>
                        <input style={inp} type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={lab}>Your quote reference (if you have one)</label>
                      <input style={inp} value={supplierRef} onChange={e => setSupplierRef(e.target.value)} maxLength={60} placeholder="e.g. your quote number" />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={lab}>Anything we should know</label>
                      <textarea style={{ ...inp, minHeight: 78, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={info.orderType === 'materials' ? 'Items you cannot supply or would swap, delivery charge, minimum order…' : 'Permit needed, minimum hire, delivery slot, what is included…'} maxLength={1000} />
                    </div>
                    {formError && <div style={{ marginTop: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>{formError}</div>}
                    <button onClick={() => send('quote')} disabled={busy} style={{ marginTop: 16, width: '100%', padding: '14px 18px', background: LIME, color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : info.status === 'replied' ? 'Update my price' : 'Send my price'}</button>
                    <button onClick={() => { setDeclining(true); setFormError('') }} style={{ marginTop: 10, width: '100%', padding: '11px 18px', background: 'none', color: MUTED, border: `1px solid #cbd5e1`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>I can&apos;t do this one</button>
                  </>
                )}

                {declining && (
                  <>
                    <label style={lab}>Reason (optional)</label>
                    <textarea style={{ ...inp, minHeight: 78, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Fully booked that week, outside our area…" maxLength={1000} />
                    {formError && <div style={{ marginTop: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>{formError}</div>}
                    <button onClick={() => send('decline')} disabled={busy} style={{ marginTop: 16, width: '100%', padding: '14px 18px', background: CHARCOAL, color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Tell them I can’t do it'}</button>
                    <button onClick={() => setDeclining(false)} style={{ marginTop: 10, width: '100%', padding: '11px 18px', background: 'none', color: MUTED, border: `1px solid #cbd5e1`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back, I will give a price</button>
                  </>
                )}

                {info.inboxEmail && <p style={{ margin: '18px 0 0', fontSize: 14, color: MUTED, lineHeight: 1.6, padding: '10px 12px', background: '#f8fafc', border: `1px solid ${LINE}`, borderRadius: 8 }}>Rather use your own quoting system? Forward or email your quote, attached to the email as a PDF (not pasted in or as a link), to <strong style={{ color: INK }}>{info.inboxEmail}</strong> with <strong style={{ color: INK }}>{info.ref}</strong> on it, and we will pick it up. You do not need to fill this in as well.</p>}

                {info.contactPhone && <p style={{ margin: '20px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>Questions? Call {info.contactName || info.company} on <strong style={{ color: INK }}>{info.contactPhone}</strong>.</p>}
              </>
            )}
          </div>
          <div style={{ background: '#1e293b', padding: '16px 22px', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}><strong style={{ color: '#fff' }}>{info?.company ?? ''}</strong></div>
        </div>
      </div>
    </div>
  )
}
