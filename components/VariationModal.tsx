'use client'

import { useState, useCallback } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job, Variation, VariationLineItem, VariationStatus } from '@/lib/types'
import { fmt } from '@/lib/utils'
import { notifyClient } from '@/lib/notify'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<VariationStatus, string> = {
  draft:     'Draft',
  sent:      'Sent to Customer',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
  invoiced:  'Invoiced',
  paid:      'Paid',
}
const STATUS_COLOR: Record<VariationStatus, string> = {
  draft:     '#888',
  sent:      '#e67e22',
  approved:  '#27ae60',
  rejected:  '#c0392b',
  cancelled: '#9aa3ad',
  invoiced:  '#4a90a4',
  paid:      '#7ab533',
}
const STATUS_BADGE: Record<VariationStatus, string> = {
  draft:     'b-planning',
  sent:      'b-onhold',
  approved:  'b-active',
  rejected:  'b-danger',
  cancelled: 'b-complete',
  invoiced:  'b-planning',
  paid:      'b-active',
}
const ITEM_TYPES = [
  { value: 'labour',         label: 'Labour' },
  { value: 'materials',      label: 'Materials' },
  { value: 'plant',          label: 'Plant' },
  { value: 'subcontractors', label: 'Subcontractors' },
  { value: 'other',          label: 'Other' },
]
const UNITS = ['item', 'hrs', 'days', 'weeks', 'm', 'm²', 'm³', 'kg', 'bag', 'load', 'sheet', 'litre', 'no.']

// ── Pricing helpers ───────────────────────────────────────────────────────────

function calcNet(items: VariationLineItem[]): number {
  return items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
}
function calcSell(items: VariationLineItem[], markup: number): number {
  return calcNet(items) * (1 + (markup || 0) / 100)
}
function calcVarTotal(items: VariationLineItem[], markup: number, vatIncluded: boolean): number {
  const sell = calcSell(items, markup)
  return vatIncluded ? sell * 1.2 : sell
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  job: Job
  onClose: () => void
}

type EditorForm = {
  title: string
  description: string
  items: VariationLineItem[]
  markup: number
  vatIncluded: boolean
  notes: string
}

function blankForm(): EditorForm {
  return { title: '', description: '', items: [], markup: 15, vatIncluded: true, notes: '' }
}
function blankItem(id: number): VariationLineItem {
  return { id, itemType: 'labour', desc: '', qty: 1, unit: 'item', rate: 0, notes: '' }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VariationModal({ job, onClose }: Props) {
  const { variations, addVariation, updateVariation, deleteVariation, clients, settings } = useApp()

  const jobVars = variations
    .filter(v => v.jobId === job.id)
    .sort((a, b) => a.ref.localeCompare(b.ref))

  const [view, setView] = useState<'list' | 'editor'>('list')
  const [editingVar, setEditingVar] = useState<Variation | null>(null)
  const [form, setForm] = useState<EditorForm>(blankForm())
  const [nextItemId, setNextItemId] = useState(1)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)   // status-change in progress
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectBox, setShowRejectBox] = useState(false)

  // ── Summaries ─────────────────────────────────────────────────
  const approvedTotal = jobVars
    .filter(v => v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid')
    .reduce((s, v) => s + v.total, 0)
  const pendingTotal = jobVars
    .filter(v => v.status === 'sent')
    .reduce((s, v) => s + v.total, 0)

  // ── Navigation ────────────────────────────────────────────────
  function openNew() {
    setEditingVar(null)
    setForm(blankForm())
    setNextItemId(1)
    setShowRejectBox(false)
    setView('editor')
  }

  function openEdit(v: Variation) {
    setEditingVar(v)
    setForm({
      title: v.title, description: v.description,
      items: v.items, markup: v.markup, vatIncluded: v.vatIncluded, notes: v.notes,
    })
    const maxId = v.items.reduce((m, i) => Math.max(m, i.id), 0)
    setNextItemId(maxId + 1)
    setShowRejectBox(false)
    setView('editor')
  }

  function backToList() { setView('list'); setEditingVar(null) }

  // ── Item helpers ──────────────────────────────────────────────
  function addItem() {
    const id = nextItemId
    setNextItemId(id + 1)
    setForm(f => ({ ...f, items: [...f.items, blankItem(id)] }))
  }
  function updateItem(id: number, patch: Partial<VariationLineItem>) {
    setForm(f => ({ ...f, items: f.items.map(i => i.id === id ? { ...i, ...patch } : i) }))
  }
  function removeItem(id: number) {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }))
  }

  // ── Save draft ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.title.trim()) { alert('Please enter a title for this variation.'); return }
    setSaving(true)
    const total = calcVarTotal(form.items, form.markup, form.vatIncluded)
    try {
      if (editingVar) {
        await updateVariation({
          ...editingVar,
          title: form.title, description: form.description, items: form.items,
          markup: form.markup, vatIncluded: form.vatIncluded, total, notes: form.notes,
        })
        setEditingVar(v => v ? { ...v, title: form.title, description: form.description,
          items: form.items, markup: form.markup, vatIncluded: form.vatIncluded, total, notes: form.notes } : v)
      } else {
        await addVariation(job.id, {
          title: form.title, description: form.description, status: 'draft',
          items: form.items, markup: form.markup, vatIncluded: form.vatIncluded,
          total, notes: form.notes, locked: false,
          clientApprovedAt: null, clientApprovedBy: null,
          clientRejectedAt: null, clientRejectionReason: null, sentAt: null,
        })
        backToList()
      }
    } finally { setSaving(false) }
  }, [form, editingVar, job.id, addVariation, updateVariation])

  // ── Status transitions ────────────────────────────────────────
  const changeStatus = useCallback(async (newStatus: VariationStatus, extra?: Partial<Variation>) => {
    if (!editingVar) return
    setBusy(true)
    const total = calcVarTotal(form.items, form.markup, form.vatIncluded)
    const updated: Variation = {
      ...editingVar,
      title: form.title, description: form.description, items: form.items,
      markup: form.markup, vatIncluded: form.vatIncluded, total, notes: form.notes,
      status: newStatus,
      sentAt: newStatus === 'sent' ? new Date().toISOString() : editingVar.sentAt,
      locked: newStatus === 'approved' ? true : editingVar.locked,
      clientApprovedAt: newStatus === 'approved' ? (editingVar.clientApprovedAt ?? new Date().toISOString()) : editingVar.clientApprovedAt,
      clientApprovedBy: newStatus === 'approved' ? (editingVar.clientApprovedBy ?? '(Admin)') : editingVar.clientApprovedBy,
      ...extra,
    }
    try {
      await updateVariation(updated)
      setEditingVar(updated)
      setForm(f => ({ ...f })) // trigger re-render
      if (newStatus === 'approved') backToList()
    } finally { setBusy(false) }
  }, [editingVar, form, updateVariation])

  const handleDelete = useCallback(async () => {
    if (!editingVar) return
    if (!confirm(`Delete variation ${editingVar.ref}? This cannot be undone.`)) return
    await deleteVariation(editingVar.id)
    backToList()
  }, [editingVar, deleteVariation])

  const handleCreateRevision = useCallback(() => {
    if (!editingVar) return
    setEditingVar(null)
    setForm({
      title: editingVar.title + ' (Revision)',
      description: editingVar.description,
      items: editingVar.items.map(i => ({ ...i })),
      markup: editingVar.markup,
      vatIncluded: editingVar.vatIncluded,
      notes: editingVar.notes,
    })
    const maxId = editingVar.items.reduce((m, i) => Math.max(m, i.id), 0)
    setNextItemId(maxId + 1)
    setView('editor')
  }, [editingVar])

  // ── Pricing for editor ────────────────────────────────────────
  const netCost   = calcNet(form.items)
  const sellEx    = calcSell(form.items, form.markup)
  const vatAmt    = form.vatIncluded ? sellEx * 0.2 : 0
  const totalVal  = sellEx + vatAmt
  const isLocked  = editingVar?.locked === true

  // ── Render: list view ─────────────────────────────────────────
  function renderList() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
        {/* Contract summary */}
        <div style={{
          background: '#f0f4f8', border: '1px solid var(--border)', borderRadius: 8,
          padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Base Contract</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, marginTop: 2 }}>{fmt(job.value)}</div>
          </div>
          {approvedTotal > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#27ae60', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Approved Variations</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#27ae60', marginTop: 2 }}>+{fmt(approvedTotal)}</div>
            </div>
          )}
          {pendingTotal > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e67e22', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Pending Approval</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#e67e22', marginTop: 2 }}>{fmt(pendingTotal)}</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Effective Total</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 19, fontWeight: 700, marginTop: 2 }}>{fmt(job.value + approvedTotal)}</div>
          </div>
        </div>

        {/* New variation button */}
        <button className="btn btn-primary" onClick={openNew} style={{ marginBottom: 18 }}>
          + New Variation / Change Order
        </button>

        {/* Variations list */}
        {!jobVars.length ? (
          <div className="empty-dashed" style={{ padding: '32px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No variations yet. Create one above.</div>
          </div>
        ) : (
          jobVars.map(v => {
            const col = STATUS_COLOR[v.status] || '#888'
            return (
              <div key={v.id} onClick={() => openEdit(v)} style={{
                background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                padding: '14px 18px', marginBottom: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{v.ref}</span>
                    <span className={`badge ${STATUS_BADGE[v.status] || 'b-planning'}`}>{STATUS_LABEL[v.status]}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title || '(Untitled)'}</div>
                  {v.status === 'approved' && v.clientApprovedBy && (
                    <div style={{ fontSize: 11, color: '#27ae60', marginTop: 2 }}>
                      ✓ Approved by {v.clientApprovedBy} · {fmtDate(v.clientApprovedAt)}
                    </div>
                  )}
                  {v.status === 'rejected' && (
                    <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>
                      ✗ Rejected {fmtDate(v.clientRejectedAt)}
                      {v.clientRejectionReason ? ` — "${v.clientRejectionReason}"` : ''}
                    </div>
                  )}
                  {v.status === 'sent' && (
                    <div style={{ fontSize: 11, color: '#e67e22', marginTop: 2 }}>
                      Sent {fmtDate(v.sentAt)} — awaiting customer response
                    </div>
                  )}
                  {v.status === 'draft' && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Draft · created {fmtDate(v.createdAt)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: col }}>
                    {v.status === 'rejected' || v.status === 'cancelled' ? '' : '+'}{fmt(v.total)}
                  </div>
                  {v.vatIncluded && <div style={{ fontSize: 10, color: 'var(--muted)' }}>inc. VAT</div>}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 16 }}>›</div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  // ── Render: editor view ───────────────────────────────────────
  function renderEditor() {
    const canEdit  = !isLocked
    const status   = editingVar?.status ?? 'draft'
    const isDraft  = status === 'draft'
    const isSent   = status === 'sent'
    const isApproved = status === 'approved'
    const isRejected = status === 'rejected'
    const isClosed = status === 'cancelled' || isRejected

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

        {/* Locked banner */}
        {isLocked && (
          <div style={{
            background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 8,
            padding: '12px 16px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#4a7c1f' }}>
                Approved — locked
              </div>
              {editingVar?.clientApprovedBy && (
                <div style={{ fontSize: 12, color: '#6a9a3a' }}>
                  Approved by {editingVar.clientApprovedBy}
                  {editingVar.clientApprovedAt ? ` · ${fmtDateTime(editingVar.clientApprovedAt)}` : ''}
                </div>
              )}
            </div>
            <button
              className="btn-sm btn-outline"
              style={{ marginLeft: 'auto' }}
              onClick={handleCreateRevision}
            >
              + Create Revision
            </button>
          </div>
        )}

        {/* Rejected banner */}
        {isRejected && (
          <div style={{
            background: '#fdf0ef', border: '1px solid #f5a0a0', borderRadius: 8,
            padding: '12px 16px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>✗</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#c0392b' }}>
                Rejected by customer {editingVar?.clientRejectedAt ? `· ${fmtDate(editingVar.clientRejectedAt)}` : ''}
              </div>
              {editingVar?.clientRejectionReason && (
                <div style={{ fontSize: 12, color: '#c0392b' }}>
                  Reason: &ldquo;{editingVar.clientRejectionReason}&rdquo;
                </div>
              )}
            </div>
            <button
              className="btn-sm btn-outline"
              style={{ marginLeft: 'auto' }}
              onClick={handleCreateRevision}
            >
              + Create Revised Variation
            </button>
          </div>
        )}

        {/* Title */}
        <div className="fg" style={{ marginBottom: 14 }}>
          <label>Variation Title <span style={{ color: '#c0392b' }}>*</span></label>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Additional blockwork to side return"
            readOnly={!canEdit}
            style={{ background: canEdit ? '' : '#f8fafc' }}
          />
        </div>

        {/* Description */}
        <div className="fg" style={{ marginBottom: 18 }}>
          <label>Scope / Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Describe the change in detail — what is included, what has changed from the original scope…"
            readOnly={!canEdit}
            style={{ background: canEdit ? '' : '#f8fafc' }}
          />
        </div>

        {/* Line items */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ margin: 0 }}>Line Items</label>
            {canEdit && (
              <button className="btn-sm btn-outline" onClick={addItem}>+ Add Item</button>
            )}
          </div>

          {form.items.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 13 }}>
              {canEdit ? 'No items yet — click "+ Add Item" to start building this variation.' : 'No line items.'}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 70px 80px 80px 1fr 28px', gap: 0, background: '#f0f2ee', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <div>Type</div>
                <div>Description</div>
                <div style={{ textAlign: 'right' }}>Qty</div>
                <div style={{ textAlign: 'center' }}>Unit</div>
                <div style={{ textAlign: 'right' }}>Rate (£)</div>
                <div style={{ textAlign: 'right' }}>Total</div>
                <div>Notes</div>
                <div />
              </div>
              {form.items.map((item, idx) => {
                const itemTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0)
                return (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 70px 80px 80px 1fr 28px', gap: 0, padding: '6px 10px', borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? '#fff' : '#fafaf8', alignItems: 'center' }}>
                    {/* Type */}
                    <select
                      value={item.itemType}
                      onChange={e => updateItem(item.id, { itemType: e.target.value as VariationLineItem['itemType'] })}
                      disabled={!canEdit}
                      style={{ fontSize: 11, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 3, background: canEdit ? '#fff' : '#f8fafc' }}
                    >
                      {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {/* Desc */}
                    <input
                      value={item.desc}
                      onChange={e => updateItem(item.id, { desc: e.target.value })}
                      placeholder="Description"
                      readOnly={!canEdit}
                      style={{ fontSize: 12, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3, background: canEdit ? '#fff' : '#f8fafc', marginLeft: 6 }}
                    />
                    {/* Qty */}
                    <input
                      type="number"
                      value={item.qty}
                      onChange={e => updateItem(item.id, { qty: Number(e.target.value) })}
                      readOnly={!canEdit}
                      style={{ fontSize: 12, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 3, textAlign: 'right', background: canEdit ? '#fff' : '#f8fafc', marginLeft: 6 }}
                    />
                    {/* Unit */}
                    <select
                      value={item.unit}
                      onChange={e => updateItem(item.id, { unit: e.target.value })}
                      disabled={!canEdit}
                      style={{ fontSize: 11, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 3, background: canEdit ? '#fff' : '#f8fafc', marginLeft: 4 }}
                    >
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    {/* Rate */}
                    <input
                      type="number"
                      value={item.rate}
                      onChange={e => updateItem(item.id, { rate: Number(e.target.value) })}
                      readOnly={!canEdit}
                      style={{ fontSize: 12, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 3, textAlign: 'right', background: canEdit ? '#fff' : '#f8fafc', marginLeft: 4 }}
                    />
                    {/* Total */}
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, textAlign: 'right', padding: '0 6px', color: 'var(--ink)' }}>
                      {fmt(itemTotal)}
                    </div>
                    {/* Notes */}
                    <input
                      value={item.notes}
                      onChange={e => updateItem(item.id, { notes: e.target.value })}
                      placeholder="Notes…"
                      readOnly={!canEdit}
                      style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 3, background: canEdit ? '#fff' : '#f8fafc', marginLeft: 4, color: 'var(--muted)' }}
                    />
                    {/* Delete */}
                    {canEdit ? (
                      <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 15, padding: '0 2px', marginLeft: 4 }}>×</button>
                    ) : <div />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Markup + VAT */}
        {canEdit && (
          <div className="row2" style={{ marginBottom: 18 }}>
            <div className="fg">
              <label>Markup %</label>
              <input
                type="number"
                value={form.markup}
                onChange={e => setForm(f => ({ ...f, markup: Number(e.target.value) }))}
                min={0} step={0.5}
              />
            </div>
            <div className="fg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ marginBottom: 8 }}>VAT</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.vatIncluded}
                  onChange={e => setForm(f => ({ ...f, vatIncluded: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                Include VAT (20%)
              </label>
            </div>
          </div>
        )}

        {/* Pricing summary */}
        {form.items.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Net cost</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(netCost)}</span>
            </div>
            <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Markup ({form.markup}%)</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>+{fmt(sellEx - netCost)}</span>
            </div>
            <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: form.vatIncluded ? '1px solid var(--border)' : undefined, background: '#fafaf8' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(sellEx)}</span>
            </div>
            {form.vatIncluded && (
              <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>+{fmt(vatAmt)}</span>
              </div>
            )}
            <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--moss)' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
                Total{form.vatIncluded ? ' (inc. VAT)' : ''}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>
                {fmt(totalVal)}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="fg" style={{ marginBottom: 18 }}>
          <label>Notes (internal / to customer)</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Any additional notes to include on this variation…"
            readOnly={!canEdit}
            style={{ background: canEdit ? '' : '#f8fafc' }}
          />
        </div>

        {/* Reject reason box */}
        {showRejectBox && (
          <div style={{ marginBottom: 14, padding: '12px 16px', background: '#fff0ef', border: '1px solid #f5a0a0', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#c0392b' }}>
              Reason for rejection (optional — visible to customer)
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
              placeholder="Explain why this variation was rejected or what changes are needed…"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-danger" disabled={busy} onClick={async () => {
                await changeStatus('rejected', { clientRejectedAt: new Date().toISOString(), clientRejectionReason: rejectReason })
                setShowRejectBox(false)
                setRejectReason('')
                backToList()
              }}>
                {busy ? 'Saving…' : 'Confirm Rejection'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowRejectBox(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {/* Delete — only drafts */}
          {editingVar && isDraft && (
            <button className="btn btn-danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              Delete
            </button>
          )}

          {/* Save draft — draft or sent (editable) */}
          {(isDraft || (!isLocked && !isClosed)) && (
            <button className="btn btn-outline" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingVar ? 'Save Changes' : 'Save as Draft'}
            </button>
          )}

          {/* Draft → Send to Customer */}
          {isDraft && (
            <button className="btn btn-primary" disabled={busy || saving || !form.title.trim()} onClick={async () => {
              if (!form.title.trim()) { alert('Please enter a title first.'); return }
              if (!confirm(`Send variation "${form.title}" to the customer portal? They will be able to view, approve, or reject it.`)) return
              setBusy(true)
              const total = calcVarTotal(form.items, form.markup, form.vatIncluded)
              try {
                let savedRef = editingVar?.ref ?? ''
                if (editingVar) {
                  // Existing draft: update fields + set status in one write
                  const updated: Variation = {
                    ...editingVar,
                    title: form.title, description: form.description, items: form.items,
                    markup: form.markup, vatIncluded: form.vatIncluded, total, notes: form.notes,
                    status: 'sent', sentAt: new Date().toISOString(),
                  }
                  await updateVariation(updated)
                  setEditingVar(updated)
                } else {
                  // New variation: create directly with status 'sent'
                  const created = await addVariation(job.id, {
                    title: form.title, description: form.description, status: 'sent',
                    items: form.items, markup: form.markup, vatIncluded: form.vatIncluded,
                    total, notes: form.notes, locked: false,
                    clientApprovedAt: null, clientApprovedBy: null,
                    clientRejectedAt: null, clientRejectionReason: null,
                    sentAt: new Date().toISOString(),
                  })
                  savedRef = created?.ref ?? ''
                }

                // ── Notify client ─────────────────────────────────────
                const client = clients.find(c =>
                  c.name?.toLowerCase() === job.client?.toLowerCase()
                )
                if (client?.phone || client?.email) {
                  notifyClient({
                    type:           'variation_sent',
                    clientName:     client.name || job.client,
                    clientPhone:    client.phone || undefined,
                    clientEmail:    client.email || undefined,
                    jobType:        job.type,
                    jobAddress:     job.address,
                    variationRef:   savedRef,
                    variationTitle: form.title,
                    variationTotal: total,
                    vatIncluded:    form.vatIncluded,
                    companyName:    settings?.name,
                    companyPhone:   settings?.phone,
                    companyEmail:   settings?.email,
                    portalUrl:      typeof window !== 'undefined'
                                      ? window.location.origin + '/portal'
                                      : undefined,
                  })
                }
                // ─────────────────────────────────────────────────────

                backToList()
              } finally { setBusy(false) }
            }}>
              {busy ? 'Sending…' : '📤 Send to Customer'}
            </button>
          )}

          {/* Sent → approve or reject by admin */}
          {isSent && (
            <>
              <button className="btn-sm btn-outline" disabled={busy} onClick={() => {
                setShowRejectBox(v => !v)
              }}>
                ✗ Reject
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={async () => {
                if (!confirm(`Mark variation "${editingVar?.title}" as Approved? This locks the record.`)) return
                await changeStatus('approved')
              }}>
                {busy ? 'Saving…' : '✓ Approve (Admin)'}
              </button>
            </>
          )}

          {/* Sent → cancel */}
          {isSent && (
            <button className="btn-sm btn-outline" disabled={busy} style={{ color: '#888' }} onClick={async () => {
              if (!confirm('Cancel this variation?')) return
              await changeStatus('cancelled')
              backToList()
            }}>
              Cancel Variation
            </button>
          )}

          {/* Approved → invoiced */}
          {isApproved && (
            <button className="btn-sm btn-outline" disabled={busy} onClick={async () => {
              if (!confirm('Mark this variation as Invoiced?')) return
              await changeStatus('invoiced')
            }}>
              Mark as Invoiced
            </button>
          )}

          {/* Invoiced → paid */}
          {editingVar?.status === 'invoiced' && (
            <button className="btn-sm btn-sky" disabled={busy} onClick={async () => {
              if (!confirm('Mark this variation as Paid?')) return
              await changeStatus('paid')
            }}>
              Mark as Paid
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Modal shell ───────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--cream)', borderRadius: 8,
        width: 'min(920px, 96vw)', maxHeight: '93vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div className="form-modal-hd">
          <div>
            {view === 'editor' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={backToList}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', padding: 0, fontFamily: 'inherit' }}
                >
                  ← Variations
                </button>
                <span style={{ color: 'var(--muted)' }}>/</span>
                <span className="serif" style={{ fontSize: 17 }}>
                  {editingVar ? `${editingVar.ref} · ${editingVar.title || '(Untitled)'}` : 'New Variation'}
                </span>
                {editingVar && (
                  <span className={`badge ${STATUS_BADGE[editingVar.status] || 'b-planning'}`}>
                    {STATUS_LABEL[editingVar.status]}
                  </span>
                )}
              </div>
            ) : (
              <div>
                <div className="serif" style={{ fontSize: 20 }}>Variations — {job.type}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {job.client} · {job.address}
                </div>
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        {view === 'list' ? renderList() : renderEditor()}
      </div>
    </div>
  )
}
