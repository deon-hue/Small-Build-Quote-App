'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { signedDocUrlById } from '@/lib/job-costs'
import type { Bill, BillLineItem, BillStatus } from '@/lib/types'
import { ContactPicker } from '@/components/ContactPicker'

let lineCounter = 0
const BLANK_LINE = (): BillLineItem => ({ id: ++lineCounter, desc: '', category: 'labour', amount: 0 })

const BILL_BADGE: Record<BillStatus, string> = {
  draft: 'b-complete', approved: 'b-pending', paid: 'b-accepted',
}
const BILL_LABEL: Record<BillStatus, string> = {
  draft: 'Draft', approved: 'Approved', paid: 'Paid',
}

const CIS_RATES = [
  { value: 0,  label: 'No CIS' },
  { value: 20, label: '20% — registered subcontractor' },
  { value: 30, label: '30% — unregistered subcontractor' },
]

function todayStr() { return new Date().toISOString().split('T')[0] }

function calcTotals(lines: BillLineItem[], cisRate: number) {
  let labour = 0, materials = 0, plant = 0, other = 0
  for (const l of lines) {
    const a = Number(l.amount) || 0
    if (l.category === 'labour')    labour    += a
    if (l.category === 'materials') materials += a
    if (l.category === 'plant')     plant     += a
    if (l.category === 'other')     other     += a
  }
  const subtotal     = labour + materials + plant + other
  const cisDeduction = Math.round(labour * cisRate) / 100
  const totalPayable = subtotal - cisDeduction
  return { labour, materials, plant, other, subtotal, cisDeduction, totalPayable }
}

export default function BillsPage() {
  const { bills, suppliers, jobs, addBill, updateBill, deleteBill, loading } = useApp()

  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<Bill | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | BillStatus>('all')
  const [search, setSearch]           = useState('')

  // Form state
  const [supplierId, setSupplierId]   = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [jobId, setJobId]             = useState('')
  const [billDate, setBillDate]       = useState(todayStr())
  const [dueDate, setDueDate]         = useState('')
  const [description, setDescription] = useState('')
  const [lineItems, setLineItems]     = useState<BillLineItem[]>([BLANK_LINE()])
  const [cisRate, setCisRate]         = useState(0)
  const [status, setStatus]           = useState<BillStatus>('draft')
  const [notes, setNotes]             = useState('')
  const [syncToXero, setSyncToXero]   = useState(false)
  const [documentId, setDocumentId]   = useState<string | undefined>(undefined)
  const [saving, setSaving]           = useState(false)
  const [viewingDoc, setViewingDoc]   = useState(false)

  // Xero state
  const [xeroConnected, setXeroConnected]     = useState(false)
  const [xeroTenantName, setXeroTenantName]   = useState('')
  const [xeroError, setXeroError]             = useState<string | null>(null)
  const [xeroPushing, setXeroPushing]         = useState(false)
  const [xeroPulling, setXeroPulling]         = useState<string | null>(null)
  const [autoSyncing, setAutoSyncing]         = useState(false)
  const [lastSynced, setLastSynced]           = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/xero/status')
      .then(r => r.json())
      .then((d: { connected?: boolean; tenantName?: string }) => {
        setXeroConnected(d.connected ?? false)
        setXeroTenantName(d.tenantName ?? '')
      })
      .catch(() => {})
  }, [])

  // Auto-sync unpaid Xero-linked bills once bills are loaded and Xero is connected
  useEffect(() => {
    if (loading || !xeroConnected) return
    if (lastSynced !== null) return  // only once per page load
    setAutoSyncing(true)
    fetch('/api/xero/sync-bills', { method: 'POST' })
      .then(r => r.json())
      .then((d: { synced?: Array<{ id: string; status: BillStatus }> }) => {
        if (d.synced?.length) {
          for (const { id, status } of d.synced) {
            const bill = bills.find(b => b.id === id)
            if (bill) updateBill({ ...bill, status })
          }
        }
        setLastSynced(Date.now())
      })
      .catch(() => {})
      .finally(() => setAutoSyncing(false))
  }, [loading, xeroConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  // Filter
  const q = search.trim().toLowerCase()
  const filtered = bills.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false
    if (q && !b.supplierName.toLowerCase().includes(q) && !b.ref.toLowerCase().includes(q) && !b.description.toLowerCase().includes(q)) return false
    return true
  })

  // Summary stats
  const totalBills  = bills.reduce((s, b) => s + b.subtotal, 0)
  const outstanding = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.totalPayable, 0)
  const paid        = bills.filter(b => b.status === 'paid').reduce((s, b) => s + b.totalPayable, 0)
  const cisTotal    = bills.filter(b => b.status !== 'draft').reduce((s, b) => s + b.cisDeduction, 0)

  function openNew() {
    setEditing(null)
    setSupplierId(''); setSupplierName(''); setJobId('')
    setBillDate(todayStr()); setDueDate('')
    setDescription(''); setLineItems([BLANK_LINE()])
    setCisRate(0); setStatus('draft'); setNotes('')
    setSyncToXero(false); setXeroError(null); setDocumentId(undefined)
    setShowModal(true)
  }

  function openEdit(b: Bill) {
    setEditing(b)
    setSupplierId(b.supplierId); setSupplierName(b.supplierName); setJobId(b.jobId)
    setBillDate(b.billDate); setDueDate(b.dueDate)
    setDescription(b.description)
    setLineItems(b.lineItems.map(l => ({ ...l, id: ++lineCounter })))
    setCisRate(b.cisRate); setStatus(b.status); setNotes(b.notes)
    setSyncToXero(b.syncToXero ?? false); setXeroError(null); setDocumentId(b.documentId)
    setShowModal(true)
  }

  async function viewInvoice() {
    if (!documentId) return
    setViewingDoc(true)
    try {
      const sb = createClient()
      const url = await signedDocUrlById(sb, documentId)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } finally { setViewingDoc(false) }
  }

  function handleSupplierChange(id: string) {
    setSupplierId(id)
    const sup = suppliers.find(s => s.id === id)
    setSupplierName(sup?.name || '')
  }

  function setLine(idx: number, field: keyof BillLineItem, value: string | number) {
    setLineItems(prev => prev.map((l, i) => i === idx ? { ...l, [field]: field === 'amount' ? Number(value) || 0 : value } : l))
  }

  function addLine()           { setLineItems(prev => [...prev, BLANK_LINE()]) }
  function removeLine(idx: number) { setLineItems(prev => prev.filter((_, i) => i !== idx)) }

  const totals = calcTotals(lineItems, cisRate)

  async function save() {
    if (!supplierName.trim()) { alert('Please select or enter a supplier.'); return }
    setSaving(true)
    setXeroError(null)
    try {
      const payload = {
        supplierId, supplierName: supplierName.trim(),
        jobId, billDate, dueDate, description, lineItems,
        labourAmount: totals.labour, materialsAmount: totals.materials,
        plantAmount: totals.plant, otherAmount: totals.other,
        subtotal: totals.subtotal, cisRate,
        cisDeduction: totals.cisDeduction, totalPayable: totals.totalPayable,
        status, notes, syncToXero,
        xeroBillId: editing?.xeroBillId,
        documentId,
      }

      let savedBill: Bill
      if (editing) {
        await updateBill({ ...editing, ...payload })
        savedBill = { ...editing, ...payload }
      } else {
        savedBill = await addBill(payload)
      }

      // Push to Xero if toggled on, connected, and not yet synced
      if (syncToXero && xeroConnected && !savedBill.xeroBillId) {
        setXeroPushing(true)
        try {
          const r = await fetch('/api/xero/push-bill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bill: savedBill }),
          })
          const d = await r.json() as { xeroBillId?: string; error?: string }
          if (d.error) {
            setXeroError(d.error)
            setSaving(false); setXeroPushing(false)
            return
          }
          if (d.xeroBillId) {
            const updated = { ...savedBill, xeroBillId: d.xeroBillId }
            await updateBill(updated)
          }
        } finally { setXeroPushing(false) }
      }

      setShowModal(false)
    } finally { setSaving(false) }
  }

  async function pushToXero(b: Bill) {
    setXeroPushing(true); setXeroError(null)
    try {
      const r = await fetch('/api/xero/push-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bill: b }),
      })
      const d = await r.json() as { xeroBillId?: string; error?: string }
      if (d.error) { alert(`Xero error: ${d.error}`); return }
      if (d.xeroBillId) await updateBill({ ...b, xeroBillId: d.xeroBillId })
    } finally { setXeroPushing(false) }
  }

  async function pullFromXero(b: Bill) {
    if (!b.xeroBillId) return
    setXeroPulling(b.id)
    try {
      const r = await fetch('/api/xero/pull-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xeroBillId: b.xeroBillId, billId: b.id }),
      })
      const d = await r.json() as { status?: BillStatus; error?: string }
      if (d.error) { alert(`Xero error: ${d.error}`); return }
      if (d.status) await updateBill({ ...b, status: d.status })
    } finally { setXeroPulling(null) }
  }

  async function markPaid(b: Bill) { await updateBill({ ...b, status: 'paid' }) }

  async function del(b: Bill) {
    if (!confirm(`Delete bill ${b.ref}? This cannot be undone.`)) return
    await deleteBill(b.id)
  }

  const jobLabel = (id: string) => {
    const j = jobs.find(x => x.id === id)
    return j ? `${j.client}` : '—'
  }

  return (
    <>
      {/* Summary cards */}
      <div className="fin-snapshot" style={{ marginBottom: 20 }}>
        <div className="fin-card">
          <div className="fin-label">Total Bills</div>
          <div className="fin-value">{fmt(totalBills)}</div>
        </div>
        <div className="fin-card fin-card-due">
          <div className="fin-label">Outstanding</div>
          <div className="fin-value">{fmt(outstanding)}</div>
        </div>
        <div className="fin-card">
          <div className="fin-label">Paid</div>
          <div className="fin-value">{fmt(paid)}</div>
        </div>
        <div className="fin-card">
          <div className="fin-label">CIS Deducted</div>
          <div className="fin-value">{fmt(cisTotal)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Search bills…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, minWidth: 200 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'draft', 'approved', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`btn btn-sm${filterStatus === s ? ' btn-primary' : ' btn-outline'}`}
              style={{ textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : BILL_LABEL[s as BillStatus]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {xeroConnected && (
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {autoSyncing
              ? <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#facc15', animation: 'pulse 1s infinite' }} />Syncing Xero…</>
              : lastSynced !== null
              ? <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />Xero synced</>
              : null}
          </span>
        )}
        <button className="btn btn-primary" onClick={openNew}>+ Add Bill</button>
      </div>

      {/* Table */}
      {!filtered.length ? (
        <div className="empty-dashed">
          <div style={{ fontSize: 14, marginBottom: 6 }}>No bills{q || filterStatus !== 'all' ? ' match your filter' : ' yet'}</div>
          {!q && filterStatus === 'all' && <div style={{ fontSize: 12 }}>Record supplier invoices and subcontractor bills here.</div>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--warm, #f8fafc)', borderBottom: '2px solid var(--border)' }}>
                {['Ref', 'Supplier', 'Job', 'Date', 'Subtotal', 'CIS', 'Payable', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{b.ref}</div>
                    {b.xeroBillId && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>✓ Xero</div>
                    )}
                    {b.documentId && (
                      <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>📄 Invoice attached</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{b.supplierName || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{b.jobId ? jobLabel(b.jobId) : '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{b.billDate || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{fmt(b.subtotal)}</td>
                  <td style={{ padding: '10px 14px', color: b.cisDeduction > 0 ? 'var(--danger, #e53e3e)' : 'var(--muted)' }}>
                    {b.cisDeduction > 0 ? `−${fmt(b.cisDeduction)}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(b.totalPayable)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${BILL_BADGE[b.status]}`}>{BILL_LABEL[b.status]}</span>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-outline" style={{ marginRight: 4 }} onClick={() => openEdit(b)}>Edit</button>
                    {b.status !== 'paid' && (
                      <button className="btn btn-sm btn-outline" style={{ marginRight: 4 }} onClick={() => markPaid(b)}>Mark Paid</button>
                    )}
                    {xeroConnected && !b.xeroBillId && (
                      <button className="btn btn-sm btn-outline" style={{ marginRight: 4 }}
                        onClick={() => pushToXero(b)} disabled={xeroPushing}>
                        {xeroPushing ? '…' : '⟳ Xero'}
                      </button>
                    )}
                    {b.xeroBillId && (
                      <button className="btn btn-sm btn-outline" style={{ marginRight: 4 }}
                        onClick={() => pullFromXero(b)} disabled={xeroPulling === b.id}>
                        {xeroPulling === b.id ? '…' : '🔗 Xero ↻'}
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => del(b)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box form-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="form-modal-hd">
              <div>{editing ? `Edit Bill — ${editing.ref}` : 'Add Bill'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="form-modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Supplier + Job */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Supplier</div>
                  <ContactPicker
                    value={supplierId}
                    onChange={handleSupplierChange}
                    contacts={suppliers}
                    placeholder="Search supplier…"
                  />
                  {!supplierId && (
                    <input placeholder="Or type supplier name" value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, marginTop: 6, boxSizing: 'border-box' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Job (optional)</div>
                  <select value={jobId} onChange={e => setJobId(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                    <option value="">— No job linked —</option>
                    {jobs.filter(j => j.stage !== 'complete').map(j => (
                      <option key={j.id} value={j.id}>{j.client} — {j.address}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates + Description */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Bill Date</div>
                  <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Due Date</div>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Brickwork Phase 2"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>Line Items</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, color: 'var(--muted)' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, color: 'var(--muted)', width: 150 }}>Category</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11, color: 'var(--muted)', width: 110 }}>Amount (£)</th>
                      <th style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, i) => (
                      <tr key={l.id}>
                        <td style={{ padding: '4px 6px' }}>
                          <input value={l.desc} onChange={e => setLine(i, 'desc', e.target.value)} placeholder="Description"
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <select value={l.category} onChange={e => setLine(i, 'category', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
                            <option value="labour">Labour</option>
                            <option value="materials">Materials</option>
                            <option value="plant">Plant Hire</option>
                            <option value="other">Other</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input type="number" min="0" step="0.01" value={l.amount || ''}
                            onChange={e => setLine(i, 'amount', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, textAlign: 'right', boxSizing: 'border-box' }} />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          {lineItems.length > 1 && (
                            <button onClick={() => removeLine(i)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 2 }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={addLine}>+ Add Line</button>
              </div>

              {/* CIS */}
              <div style={{ background: 'var(--warm, #f8fafc)', borderRadius: 8, padding: 14, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>CIS — Construction Industry Scheme</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Deduction Rate</div>
                    <select value={cisRate} onChange={e => setCisRate(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                      {CIS_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  {cisRate > 0 && (
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ color: 'var(--muted)' }}>Labour: {fmt(totals.labour)}</div>
                      <div style={{ color: 'var(--danger, #e53e3e)', fontWeight: 600 }}>
                        Deduction ({cisRate}%): −{fmt(totals.cisDeduction)}
                      </div>
                    </div>
                  )}
                </div>
                {cisRate > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                    CIS applies to labour only. Deducted amount must be paid to HMRC on behalf of the subcontractor.
                    The deduction is posted to Xero as a separate CIS liability line.
                  </div>
                )}
              </div>

              {/* Totals */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'Labour',    value: totals.labour },
                  { label: 'Materials', value: totals.materials },
                  { label: 'Plant',     value: totals.plant },
                  { label: 'Other',     value: totals.other },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--warm, #f8fafc)', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 14, paddingRight: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Subtotal: <strong>{fmt(totals.subtotal)}</strong></span>
                {totals.cisDeduction > 0 && (
                  <span style={{ color: 'var(--danger, #e53e3e)' }}>CIS: −<strong>{fmt(totals.cisDeduction)}</strong></span>
                )}
                <span>Total Payable: <strong style={{ fontSize: 16 }}>{fmt(totals.totalPayable)}</strong></span>
              </div>

              {/* Status + Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Status</div>
                  <select value={status} onChange={e => setStatus(e.target.value as BillStatus)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Notes</div>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Xero sync */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {xeroConnected ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={syncToXero} onChange={e => setSyncToXero(e.target.checked)} />
                    <span>
                      <strong>Sync to Xero</strong>
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
                        Connected: {xeroTenantName} — bill will be pushed as a purchase invoice when saved
                      </span>
                    </span>
                  </label>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 12px', background: 'var(--warm, #f8fafc)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    ⚠ Xero not connected. Go to <strong>Settings → Integrations</strong> to connect.
                  </div>
                )}
                {editing?.xeroBillId && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                    ✓ Synced to Xero — ID: {editing.xeroBillId}
                  </div>
                )}
                {xeroError && (
                  <div style={{ fontSize: 12, color: 'var(--danger, #e53e3e)', marginTop: 8, padding: '8px 12px', background: '#fff5f5', borderRadius: 6, border: '1px solid #fed7d7' }}>
                    {xeroError}
                  </div>
                )}
              </div>

            </div>

            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              {documentId && (
                <button className="btn btn-outline" onClick={viewInvoice} disabled={viewingDoc}
                  style={{ color: '#7c3aed', borderColor: '#7c3aed' }}>
                  {viewingDoc ? '…' : '📄 View Invoice'}
                </button>
              )}
              <button className="btn btn-primary" onClick={save} disabled={saving || xeroPushing}>
                {xeroPushing ? 'Syncing to Xero…' : saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
