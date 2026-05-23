'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, fmtK, calcPhaseSell } from '@/lib/utils'
import { buildInvoiceHtml } from '@/lib/invoiceHtml'
import type { Invoice, InvoiceLineItem } from '@/lib/types'

let lineCounter = 0

const BLANK_LINE = (): InvoiceLineItem => ({ id: ++lineCounter, desc: '', qty: 1, unitPrice: 0, total: 0 })

const INV_BADGE: Record<string, string> = {
  draft: 'b-complete', sent: 'b-sent', paid: 'b-accepted', overdue: 'b-onhold',
}
const INV_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function due30Str() {
  const d = new Date(); d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

export default function InvoicesPage() {
  const { invoices, jobs, quotes, settings, addInvoice, updateInvoice, deleteInvoice, loading } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)

  // Form state
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([BLANK_LINE()])
  const [vatOn, setVatOn] = useState(true)
  const [issueDate, setIssueDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState(due30Str())
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<Invoice['status']>('draft')
  const [fromJobId, setFromJobId] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewInv, setPreviewInv] = useState<Invoice | null>(null)

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  // Stats
  const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstanding = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0)

  function openNew() {
    setEditing(null)
    setClientName(''); setClientAddress(''); setClientEmail('')
    setLineItems([BLANK_LINE()])
    setVatOn(true); setIssueDate(todayStr()); setDueDate(due30Str())
    setNotes(''); setStatus('draft'); setFromJobId('')
    setShowModal(true)
  }

  function openEdit(inv: Invoice) {
    setEditing(inv)
    setClientName(inv.clientName); setClientAddress(inv.clientAddress); setClientEmail(inv.clientEmail)
    setLineItems(inv.lineItems.map(l => ({ ...l, id: ++lineCounter })))
    setVatOn(inv.vatIncluded); setIssueDate(inv.issueDate); setDueDate(inv.dueDate)
    setNotes(inv.notes); setStatus(inv.status); setFromJobId(inv.jobId || '')
    setShowModal(true)
  }

  function loadFromJob(jobId: string) {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    setClientName(job.client)
    setClientAddress(job.address)
    // Try to find linked quote for line items
    const linked = quotes.find(q => q.id === job.quoteId) ||
      quotes.find(q => {
        const qn = (q.customer.name || '').toLowerCase()
        const jn = (job.client || '').toLowerCase()
        return qn === jn || qn.includes(jn) || jn.includes(qn)
      })
    if (linked) {
      setClientEmail(linked.customer.email || '')
      const items: InvoiceLineItem[] = linked.phases.map(p => {
        const sell = calcPhaseSell(p, linked.markup)
        return { id: ++lineCounter, desc: p.phase, qty: 1, unitPrice: Math.round(sell * 100) / 100, total: Math.round(sell * 100) / 100 }
      })
      setLineItems(items.length ? items : [BLANK_LINE()])
    } else {
      // Single line for the job value
      setLineItems([{ id: ++lineCounter, desc: job.type + ' works', qty: 1, unitPrice: job.value, total: job.value }])
    }
    setFromJobId(jobId)
  }

  function updateLine(id: number, key: keyof InvoiceLineItem, val: string | number) {
    setLineItems(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [key]: val }
      updated.total = Math.round(updated.qty * updated.unitPrice * 100) / 100
      return updated
    }))
  }

  const subtotal = lineItems.reduce((s, l) => s + (l.total || 0), 0)
  const vatAmount = vatOn ? Math.round(subtotal * 0.2 * 100) / 100 : 0
  const total = subtotal + vatAmount

  async function handleSave() {
    setSaving(true)
    try {
      const data = {
        jobId: fromJobId, quoteId: '', clientName, clientAddress, clientEmail,
        lineItems, subtotal, vatIncluded: vatOn, vatAmount, total,
        status, issueDate, dueDate, notes,
      }
      if (editing) {
        await updateInvoice({ ...editing, ...data })
      } else {
        await addInvoice(data)
      }
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  function handlePrint(inv: Invoice) {
    const html = buildInvoiceHtml(inv, settings)
    const w = window.open('', '_blank')
    if (!w) { alert('Pop-up blocked — please allow pop-ups.'); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  function handleDownload(inv: Invoice) {
    const html = buildInvoiceHtml(inv, settings)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Invoice-${inv.ref}-${inv.clientName.replace(/[^a-z0-9]/gi, '_')}.html`
    a.click()
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Delete invoice ${inv.ref}? This cannot be undone.`)) return
    await deleteInvoice(inv.id)
  }

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat green">
          <div className="stat-label">Total Invoiced</div>
          <div className="stat-val">{fmtK(totalInvoiced)}</div>
          <div className="stat-sub">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">Paid</div>
          <div className="stat-val">{fmtK(paid)}</div>
          <div className="stat-sub">{invoices.filter(i => i.status === 'paid').length} invoices</div>
        </div>
        <div className="stat sky">
          <div className="stat-label">Outstanding</div>
          <div className="stat-val">{fmtK(outstanding)}</div>
          <div className="stat-sub">Awaiting payment</div>
        </div>
        <div className="stat terra">
          <div className="stat-label">Overdue</div>
          <div className="stat-val">{fmtK(overdue)}</div>
          <div className="stat-sub">{invoices.filter(i => i.status === 'overdue').length} overdue</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
      </div>

      {!invoices.length
        ? <div className="empty-dashed">
            <div style={{ fontSize: 14, marginBottom: 6 }}>No invoices yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Create your first invoice from a job or from scratch.</div>
            <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
          </div>
        : invoices.map(inv => (
            <div key={inv.id} className="sq-card" style={
              inv.status === 'paid' ? { borderLeft: '3px solid #7ab533' } :
              inv.status === 'overdue' ? { borderLeft: '3px solid #c0392b' } : {}
            }>
              <div className="sq-ref" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)', minWidth: 72 }}>{inv.ref}</div>
              <div className="sq-info">
                <div className="sq-title">{inv.clientName || '—'}</div>
                <div className="sq-sub">
                  Issued {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-GB') : '—'}
                  {' · '}Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB') : '—'}
                </div>
              </div>
              <div className="sq-val">{fmt(inv.total)}</div>
              <div style={{ textAlign: 'center', minWidth: 220 }}>
                <span className={`badge ${INV_BADGE[inv.status] || 'b-complete'}`}>{INV_LABEL[inv.status] || inv.status}</span>
                <div className="sq-actions" style={{ marginTop: 6 }}>
                  <button className="btn-sm btn-primary" onClick={() => openEdit(inv)}>✎ Edit</button>
                  <button className="btn-sm btn-outline" onClick={() => handlePrint(inv)}>🖨 Print</button>
                  <button className="btn-sm btn-outline" onClick={() => handleDownload(inv)}>⬇ PDF</button>
                  <select value={inv.status} onChange={e => updateInvoice({ ...inv, status: e.target.value as Invoice['status'] })}
                    style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(inv)}>✕</button>
                </div>
              </div>
            </div>
          ))
      }

      {/* Invoice modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="form-modal" style={{ width: 'min(700px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editing ? 'Edit Invoice ' + editing.ref : 'New Invoice'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-modal-bd">
              {/* From job picker */}
              {!editing && (
                <div className="fg">
                  <label>Fill from Job (optional)</label>
                  <select value={fromJobId} onChange={e => { setFromJobId(e.target.value); if (e.target.value) loadFromJob(e.target.value) }}>
                    <option value="">— Select a job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.type} — {j.client}</option>)}
                  </select>
                </div>
              )}

              <div className="row2">
                <div className="fg">
                  <label>Client Name</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Mr & Mrs Davies" />
                </div>
                <div className="fg">
                  <label>Client Email</label>
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" />
                </div>
              </div>
              <div className="fg">
                <label>Client Address</label>
                <textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} rows={2} />
              </div>

              <div className="row2">
                <div className="fg">
                  <label>Issue Date</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                </div>
                <div className="fg">
                  <label>Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {/* Line items */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)' }}>Line Items</label>
                  <button className="btn-sm btn-outline" onClick={() => setLineItems(p => [...p, BLANK_LINE()])}>+ Add Line</button>
                </div>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 28px', gap: 0, background: '#f0f2f4', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)' }}>
                    <span>Description</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'right' }}>Unit Price</span><span style={{ textAlign: 'right' }}>Total</span><span />
                  </div>
                  {lineItems.map(l => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 28px', gap: 0, borderTop: '1px solid var(--border)', padding: '4px 6px', alignItems: 'center' }}>
                      <input value={l.desc} onChange={e => updateLine(l.id, 'desc', e.target.value)} placeholder="Description" style={{ border: 'none', outline: 'none', fontSize: 13, padding: '4px 4px' }} />
                      <input type="number" value={l.qty} onChange={e => updateLine(l.id, 'qty', Number(e.target.value))} style={{ border: 'none', outline: 'none', fontSize: 13, textAlign: 'center', padding: '4px 2px' }} />
                      <input type="number" value={l.unitPrice} onChange={e => updateLine(l.id, 'unitPrice', Number(e.target.value))} style={{ border: 'none', outline: 'none', fontSize: 13, textAlign: 'right', padding: '4px 4px' }} />
                      <span style={{ fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace', padding: '0 4px' }}>{fmt(l.total)}</span>
                      <button className="rm-btn" onClick={() => setLineItems(p => p.filter(x => x.id !== l.id))}>×</button>
                    </div>
                  ))}
                  <div style={{ borderTop: '1.5px solid var(--border)', padding: '10px 14px', background: '#f8f9fa' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right' }}>{fmt(subtotal)}</span>
                    </div>
                    {vatOn && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--muted)' }}>VAT (20%)</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right' }}>{fmt(vatAmount)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 15, fontWeight: 700 }}>
                      <span>Total</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right', color: '#7ab533' }}>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
                  <input type="checkbox" checked={vatOn} onChange={e => setVatOn(e.target.checked)} style={{ width: 'auto' }} />
                  Include VAT (20%)
                </label>
              </div>

              <div className="fg">
                <label>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Payment details, bank info, etc." />
              </div>

              <div className="fg">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as Invoice['status'])}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update Invoice' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
