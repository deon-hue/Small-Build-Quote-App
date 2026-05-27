'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, VAT, JOB_TYPES, calcPhase, calcPhaseSell } from '@/lib/utils'
import type { QuotePhase, QuoteItem, Quote } from '@/lib/types'
import { itemFromTemplate, estimatorAggregates } from '@/lib/estimator'
import type { EstimatorItem } from '@/lib/estimator'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import ScopeChat from '@/components/ScopeChat'
import EstimatorBreakdown from '@/components/EstimatorBreakdown'

let phaseCounter = 0
let itemCounter = 0

function makePhase(
  phase: string,
  items: Omit<QuoteItem, 'id'>[],
  parentPhase?: string,
  estimatorItems?: EstimatorItem[],
): QuotePhase {
  return {
    id: ++phaseCounter,
    phase,
    parentPhase,
    items: items.map(i => ({ ...i, id: ++itemCounter })),
    estimatorItems: estimatorItems ?? [],
    useEstimator: true,
  }
}

function defaultTypedItems(): Omit<QuoteItem, 'id'>[] {
  return [
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' as const },
  ]
}


export default function NewQuotePage() {
  const { quotes, clients, addQuote, updateQuote, upsertClientFromQuote, getTemplate, loading } = useApp()

  const [custName, setCustName] = useState('')
  const [custAddr, setCustAddr] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [jobType, setJobType] = useState('Rear Extension')
  const [markup, setMarkup] = useState(15)
  const [vatOn, setVatOn] = useState(true)
  const [scope, setScope] = useState('')
  const [photo, setPhoto] = useState('')
  const [phases, setPhases] = useState<QuotePhase[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLockedQuote, setIsLockedQuote] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingScope, setGeneratingScope] = useState(false)
  const [generatingPhases, setGeneratingPhases] = useState(false)
  const [showScopeChat, setShowScopeChat] = useState(false)
  const [showScopeHelp, setShowScopeHelp] = useState(false)
  const [clientDrop, setClientDrop] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set())
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ── Phase collapse helpers ────────────────────────────────────────────────
  function togglePhase(id: number) {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function collapseAllPhases() { setCollapsedPhases(new Set(phases.map(p => p.id))) }
  function expandAllPhases()   { setCollapsedPhases(new Set()) }
  const allCollapsed = phases.length > 0 && phases.every(p => collapsedPhases.has(p.id))

  // Wait for ALL context data (including customTemplates) to finish loading before
  // calling loadTemplate. Previously this depended on [quotes] which fires before
  // customTemplates is populated — causing the hardcoded JOB_TEMPLATES to be used
  // instead of the saved Back Office template with zeroed rates.
  useEffect(() => {
    if (loading) return
    const editId = sessionStorage.getItem('sbc_edit_quote')
    if (editId) {
      sessionStorage.removeItem('sbc_edit_quote')
      const q = quotes.find(x => x.id === editId)
      if (q) { loadQuoteForEdit(q); return }
    }
    loadTemplate('Rear Extension')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadTemplate(type: string) {
    const tpl = getTemplate(type)
    setPhases(tpl.map(p => {
      const estimatorItems = p.estimatorItems?.map(itemFromTemplate) ?? []

      // Synchronously sync typed QuoteItems from current estimator aggregates.
      // This ensures stale hardcoded template amounts (e.g. labour=£800) are
      // replaced by the actual estimator values immediately — including £0
      // when Back Office defaults have been zeroed. Zero is a valid cost value.
      let typedItems: Omit<QuoteItem, 'id'>[] = p.items
      if (estimatorItems.length > 0) {
        const agg = estimatorAggregates(estimatorItems, [])
        typedItems = p.items.map(qi => {
          if (qi.itemType === 'labour')         return { ...qi, labour:         agg.labour }
          if (qi.itemType === 'materials')      return { ...qi, materials:      agg.materials }
          if (qi.itemType === 'plant')          return { ...qi, plantHire:      agg.plant }
          if (qi.itemType === 'subcontractors') return { ...qi, subcontractors: agg.subcontractors }
          if (qi.itemType === 'other')          return { ...qi, other:          agg.other }
          return qi
        })
      }

      return makePhase(p.phase, typedItems, p.parentPhase || undefined, estimatorItems)
    }))
  }

  function toTypedItems(items: QuoteItem[]): Omit<QuoteItem, 'id'>[] {
    if (items.length > 0 && items.every(i => !i.itemType)) {
      // Legacy: aggregate old-format items into 5 typed rows
      const l = items.reduce((s, i) => s + (Number(i.labour) || 0), 0)
      const m = items.reduce((s, i) => s + (Number(i.materials) || 0), 0)
      const p = items.reduce((s, i) => s + (Number(i.plantHire) || 0), 0)
      return [
        { desc: '', qty: 1, unit: 'Item', labour: l, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: m, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: p, subcontractors: 0, other: 0, notes: '', itemType: 'plant' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' as const },
      ]
    }
    return items
  }

  function loadQuoteForEdit(q: Quote) {
    setCustName(q.customer.name || '')
    setCustAddr(q.customer.address || '')
    setCustEmail(q.customer.email || '')
    setCustPhone(q.customer.phone || '')
    setJobType(q.jobType || 'Rear Extension')
    setMarkup(q.markup || 15)
    setVatOn(q.vatIncluded !== false)
    setScope(q.scope || '')
    setPhoto(q.photo || '')
    setPhases(JSON.parse(JSON.stringify(q.phases)).map((p: QuotePhase) => ({
      ...p, id: ++phaseCounter,
      items: toTypedItems(p.items).map((i: Omit<QuoteItem,'id'>) => ({ ...i, id: ++itemCounter })),
    })))
    setEditingId(q.id)
    setIsLockedQuote(q.status === 'accepted')
  }

  function onJobTypeChange(type: string) {
    setJobType(type)
    if (phases.length && !confirm('Load the ' + type + ' template? This replaces current lines.')) return
    loadTemplate(type)
  }

  // AI generate phases from scope
  async function generatePhases() {
    if (!scope.trim()) { alert('Write a scope of works first — then click Generate Phases.'); return }
    if (phases.length && !confirm('Replace current phases with AI-generated ones?')) return
    setGeneratingPhases(true)
    try {
      const res = await fetch('/api/generate-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, jobType, address: custAddr }),
      })
      const data = await res.json()
      if (data.error) { alert('Could not generate phases: ' + data.error); return }
      if (Array.isArray(data.phases) && data.phases.length) {
        setPhases(data.phases.map((p: {
          parentPhase?: string; phase: string
          labour: number; labourNotes: string
          materials: number; materialsNotes: string
          plant: number; plantNotes: string
          subcontractors?: number; subNotes?: string
          other?: number; otherNotes?: string
        }) =>
          makePhase(p.phase, [
            { desc: '', qty: 1, unit: 'Item', labour: Number(p.labour) || 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: String(p.labourNotes || ''), itemType: 'labour' as const },
            { desc: '', qty: 1, unit: 'Item', labour: 0, materials: Number(p.materials) || 0, plantHire: 0, subcontractors: 0, other: 0, notes: String(p.materialsNotes || ''), itemType: 'materials' as const },
            { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: Number(p.plant) || 0, subcontractors: 0, other: 0, notes: String(p.plantNotes || ''), itemType: 'plant' as const },
            { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: Number(p.subcontractors) || 0, other: 0, notes: String(p.subNotes || ''), itemType: 'subcontractors' as const },
            { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: Number(p.other) || 0, notes: String(p.otherNotes || ''), itemType: 'other' as const },
          ], p.parentPhase)
        ))
      }
    } catch {
      alert('Failed to generate phases — check your connection.')
    } finally {
      setGeneratingPhases(false)
    }
  }

  // ── Main phase / sub-phase management ─────────────────────────────────────
  function addMainPhase() {
    const name = 'New Phase'
    setPhases(prev => [...prev, makePhase('New Sub-Phase', defaultTypedItems(), name)])
  }

  function addSubPhase(parentPhase: string) {
    setPhases(prev => [...prev, makePhase('New Sub-Phase', defaultTypedItems(), parentPhase)])
  }

  function removeMainPhase(parentPhase: string) {
    if (!confirm(`Remove "${parentPhase}" and all its sub-phases?`)) return
    setPhases(prev => prev.filter(p => p.parentPhase !== parentPhase))
  }

  function updateMainPhaseName(oldName: string, newName: string) {
    setPhases(prev => prev.map(p => p.parentPhase === oldName ? { ...p, parentPhase: newName } : p))
  }

  function removePhase(id: number) { setPhases(prev => prev.filter(p => p.id !== id)) }
  function updatePhaseName(id: number, name: string) {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, phase: name } : p))
  }

  // ── Full-phase update (used by EstimatorBreakdown) ───────────────────────
  function updatePhase(updated: QuotePhase) {
    setPhases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const cost = phases.reduce((s, p) => s + calcPhase(p), 0)
  const sell = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  const mu = sell - cost
  const vatAmt = vatOn ? sell * VAT : 0
  const total = sell + vatAmt

  function mainPhaseTotal(parentPhase: string) {
    return phases.filter(p => p.parentPhase === parentPhase).reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (isLockedQuote) { alert('This quote has been accepted and is locked — it cannot be modified.'); return }
    if (!custName && !confirm('No customer name — save anyway?')) return
    if (!phases.length) { alert('Add some quote lines first.'); return }
    setSaving(true)
    try {
      const customer = { name: custName, address: custAddr, email: custEmail, phone: custPhone }
      const qData = { status: 'pending' as const, jobType, markup, vatIncluded: vatOn, scope, photo, convertedToJob: false, lastEdited: '', customer, phases: JSON.parse(JSON.stringify(phases)) }
      if (editingId) {
        const existing = quotes.find(q => q.id === editingId)!
        await updateQuote({ ...existing, ...qData })
        setEditingId(null)
        alert('Quote updated successfully.')
      } else {
        const newQuote = await addQuote(qData)
        await upsertClientFromQuote(customer)
        alert('Quote saved! Reference: ' + newQuote.ref)
      }
      setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
      setScope(''); setPhoto('')
      loadTemplate(jobType)
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setIsLockedQuote(false)
    setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
    setScope(''); setPhoto('')
    loadTemplate(jobType)
  }

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 4 * 1024 * 1024) { alert('Photo too large — max 4MB.'); return }
    const reader = new FileReader()
    reader.onload = e => setPhoto(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const filteredClients = clientSearch.trim()
    ? clients.filter(c => {
        const n = c.name || ''
        const q = clientSearch.toLowerCase()
        return n.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      })
    : clients

  function selectClient(cid: string) {
    const c = clients.find(x => x.id === cid)
    if (!c) return
    setCustName(c.name || ''); setCustEmail(c.email || '')
    setCustPhone(c.phone || ''); setCustAddr(c.address || '')
    setClientDrop(false); setClientSearch('')
  }

  async function generateScope() {
    if (!jobType || !custAddr) { alert('Please fill in the job type and address first.'); return }
    setGeneratingScope(true)
    try {
      const res = await fetch('/api/generate-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, address: custAddr, phases: phases.map(p => p.phase) }),
      })
      const data = await res.json()
      if (data.scope) setScope(data.scope)
      else alert('Could not generate scope — check your API key in settings.')
    } catch {
      alert('Failed to generate scope.')
    } finally {
      setGeneratingScope(false)
    }
  }

  // Build ordered list of unique main phase names
  const mainPhaseOrder: string[] = []
  const seenMain = new Set<string>()
  for (const p of phases) {
    const mp = p.parentPhase || ''
    if (mp && !seenMain.has(mp)) { seenMain.add(mp); mainPhaseOrder.push(mp) }
  }
  const orphanPhases = phases.filter(p => !p.parentPhase)

  const previewQuote: Quote = {
    id: editingId || 'preview', ref: 'PREVIEW',
    savedDate: new Date().toLocaleDateString('en-GB'), lastEdited: '',
    status: 'pending', jobType, markup, vatIncluded: vatOn, scope, photo,
    convertedToJob: false,
    customer: { name: custName, address: custAddr, email: custEmail, phone: custPhone },
    phases: JSON.parse(JSON.stringify(phases)),
  }



  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  return (
    <>
      {editingId && isLockedQuote && (
        <div style={{ background: '#f0f9e8', border: '1.5px solid #7ab533', borderRadius: 6, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>
            🔒 <strong>Accepted quote — read only.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              {quotes.find(q => q.id === editingId)?.ref || editingId} · This quote has been accepted and cannot be modified.
            </span>
          </span>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Close</button>
        </div>
      )}
      {editingId && !isLockedQuote && (
        <div style={{ background: 'rgba(74,144,164,0.1)', border: '1px solid #4a90a4', borderRadius: 6, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>✎ Editing saved quote: <strong>{quotes.find(q => q.id === editingId)?.ref || editingId}</strong></span>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Cancel Edit</button>
        </div>
      )}

      <div className="qb-grid" style={{ gridTemplateColumns: '270px 1fr' }}>
        {/* Left panel */}
        <div className="qb-left">
          <div className="card">
            <div className="card-hd">Customer Details</div>
            <div style={{ padding: '14px 16px' }}>
              <div className="fg" style={{ position: 'relative' }}>
                <label>Client Name</label>
                <input
                  value={custName}
                  onChange={e => { setCustName(e.target.value); setClientSearch(e.target.value) }}
                  onFocus={() => setClientDrop(true)}
                  onBlur={() => setTimeout(() => setClientDrop(false), 200)}
                  placeholder="Search or type name…"
                  autoComplete="off"
                />
                {clientDrop && filteredClients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid var(--border)', borderRadius: 6, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                    {filteredClients.map(c => (
                      <div key={c.id} onMouseDown={() => selectClient(c.id)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--slate)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                          {(c.name[0] || '').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="fg">
                <label>Address</label>
                <textarea value={custAddr} onChange={e => setCustAddr(e.target.value)} rows={2} placeholder="14 Thornton Road&#10;London SW1 2AB" />
              </div>
              <div className="fg">
                <label>Email</label>
                <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="client@email.com" />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="07700 900000" />
              </div>
              {custAddr && (
                <a href={`https://www.google.com/maps/search/${encodeURIComponent(custAddr)}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--sky)', display: 'inline-block', marginBottom: 8 }}>
                  🗺 View on Maps
                </a>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">Job Type</div>
            <div style={{ padding: '14px 16px' }}>
              <div className="fg">
                <label>Type</label>
                <select value={jobType} onChange={e => onJobTypeChange(e.target.value)}>
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">Property Photo</div>
            <div style={{ padding: '14px 16px' }}>
              {photo
                ? <div>
                    <img src={photo} alt="Property" style={{ width: '100%', borderRadius: 4, objectFit: 'cover', maxHeight: 140, marginBottom: 8 }} />
                    <button className="btn-sm btn-danger" onClick={() => setPhoto('')}>Remove Photo</button>
                  </div>
                : <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePhotoFile(f) }}
                    onClick={() => photoInputRef.current?.click()}
                    style={{ border: '2px dashed var(--border)', borderRadius: 6, padding: 24, textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                    Drag & drop or click to upload
                    <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }} />
                  </div>
              }
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <span>Scope of Works</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className="btn-sm btn-outline"
                  onClick={() => setShowScopeHelp(true)}
                  title="How to use the AI Scope Writer"
                  style={{ fontSize: 11, width: 24, height: 24, padding: 0, borderRadius: '50%', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                >?</button>
                <button className="btn-sm btn-sky" onClick={() => setShowScopeChat(true)} style={{ fontSize: 11 }}>✦ AI Chat</button>
              </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <textarea value={scope} onChange={e => setScope(e.target.value)} rows={6} placeholder="Describe the works to be carried out…" />
            </div>
          </div>

          {/* Summary */}
          <div className="totals-box">
            <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 13 }}>
              Quote Summary
              <span className="mono" style={{ marginLeft: 10, fontSize: 16, color: '#7ab533' }}>{fmt(total)}</span>
            </div>
            <div className="tot-row"><span>Your Cost</span><span className="mono" style={{ color: '#e67e22' }}>{fmt(cost)}</span></div>
            <div className="tot-row"><span>Markup ({markup}%)</span><span className="mono" style={{ color: '#7ab533' }}>{fmt(mu)}</span></div>
            <div className="tot-row"><span>Sell Price (ex-VAT)</span><span className="mono">{fmt(sell)}</span></div>
            {vatOn && <div className="tot-row"><span>VAT (20%)</span><span className="mono" style={{ color: '#4a90a4' }}>{fmt(vatAmt)}</span></div>}
            <div className="tot-final">
              <span style={{ fontWeight: 700 }}>TOTAL</span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(total)}</span>
            </div>
          </div>

          <div style={{ marginTop: 14, background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
            <div className="fg" style={{ marginBottom: 8 }}>
              <label>Markup: {markup}%</label>
              <input type="range" min={0} max={40} value={markup} onChange={e => setMarkup(Number(e.target.value))} style={{ padding: 0, border: 'none', background: 'none' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={vatOn} onChange={e => setVatOn(e.target.checked)} style={{ width: 'auto' }} />
              Include VAT (20%)
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setShowPreview(true)} style={{ flex: 1 }}>👁 Preview</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || isLockedQuote}
              style={{ flex: 1, opacity: isLockedQuote ? 0.45 : 1 }}
              title={isLockedQuote ? 'Accepted quotes are locked and cannot be modified' : undefined}>
              {saving ? 'Saving…' : isLockedQuote ? '🔒 Locked' : editingId ? '💾 Update Quote' : '💾 Save Quote'}
            </button>
          </div>
        </div>

        {/* Right panel — phases */}
        <div className="qb-right">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Quote Lines — <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{mainPhaseOrder.length} phase{mainPhaseOrder.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {phases.length > 0 && (
                <button
                  className="btn-sm btn-outline"
                  onClick={allCollapsed ? expandAllPhases : collapseAllPhases}
                  title={allCollapsed ? 'Expand all phases' : 'Collapse all phases'}
                  style={{ fontSize: 11 }}
                >
                  {allCollapsed ? '▶▶ Expand All' : '▼▼ Collapse All'}
                </button>
              )}
              <button className="btn-sm btn-sky" onClick={generatePhases} disabled={generatingPhases} style={{ fontSize: 11 }}>
                {generatingPhases ? '⏳ Generating…' : '✦ Generate Phases'}
              </button>
              <button className="btn-sm btn-primary" onClick={addMainPhase}>+ Add Phase</button>
            </div>
          </div>

          {!phases.length
            ? <div className="empty-dashed"><div style={{ fontSize: 14, marginBottom: 6 }}>No phases yet</div><div style={{ fontSize: 12 }}>Select a job type to load a template, or click Add Phase.</div></div>
            : <>
                {/* ── Grouped main phases ── */}
                {mainPhaseOrder.map(mainPhase => {
                  const subPhases = phases.filter(p => p.parentPhase === mainPhase)
                  const mainSell = mainPhaseTotal(mainPhase)
                  return (
                    <div key={mainPhase} style={{ marginBottom: 20 }}>
                      {/* Main phase header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2c3e50', color: 'white', padding: '8px 14px', borderRadius: '6px 6px 0 0', fontSize: 13 }}>
                        <input
                          value={mainPhase}
                          onChange={e => updateMainPhaseName(mainPhase, e.target.value)}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, outline: 'none', minWidth: 0 }}
                        />
                        <span className="mono" style={{ fontSize: 12, color: '#7ab533', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(mainSell)}</span>
                        <button
                          onClick={() => addSubPhase(mainPhase)}
                          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: 11, borderRadius: 4, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >+ Sub-Phase</button>
                        <button
                          onClick={() => removeMainPhase(mainPhase)}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                          title="Remove this phase and all its sub-phases"
                        >×</button>
                      </div>

                      {/* Sub-phases */}
                      {subPhases.map((p, pi) => (
                        <SubPhaseBlock
                          key={p.id}
                          p={p}
                          pi={pi}
                          markup={markup}
                          vatOn={vatOn}
                          collapsed={collapsedPhases.has(p.id)}
                          onToggleCollapse={() => togglePhase(p.id)}
                          onUpdatePhaseName={updatePhaseName}
                          onRemovePhase={removePhase}
                          onUpdatePhase={updatePhase}
                        />
                      ))}
                    </div>
                  )
                })}

                {/* ── Orphan phases (no parentPhase) ── */}
                {orphanPhases.map((p, pi) => (
                  <SubPhaseBlock
                    key={p.id}
                    p={p}
                    pi={pi}
                    markup={markup}
                    vatOn={vatOn}
                    collapsed={collapsedPhases.has(p.id)}
                    onToggleCollapse={() => togglePhase(p.id)}
                    onUpdatePhaseName={updatePhaseName}
                    onRemovePhase={removePhase}
                    onUpdatePhase={updatePhase}
                  />
                ))}
              </>
          }

          <div style={{ marginTop: 12 }}>
            <button className="btn-sm btn-primary" onClick={addMainPhase}>+ Add Phase</button>
          </div>
        </div>
      </div>

      {showPreview && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setShowPreview(false)} />
      )}

      {/* ── Scope of Works AI help modal ── */}
      {showScopeHelp && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScopeHelp(false) }}>
          <div className="form-modal" style={{ width: 'min(500px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>✦ How to use the AI Scope Writer</div>
              <button className="modal-close" onClick={() => setShowScopeHelp(false)}>×</button>
            </div>
            <div className="form-modal-bd" style={{ fontSize: 13, lineHeight: 1.7 }}>

              {/* Step list */}
              {[
                {
                  n: '1', icon: '🖊️', title: 'Open the chat',
                  body: 'Click the “❖ AI Chat” button on the Scope of Works card. A chat window will open in the corner of the screen.',
                },
                {
                  n: '2', icon: '📝', title: 'Describe the job',
                  body: 'Type a short description of the project — the job type, size, and key works. For example: “Single storey rear extension, approx 5m \xd7 4m, new kitchen, bi-fold doors, structural steel beam.”',
                },
                {
                  n: '3', icon: '📎', title: 'Attach plans or photos (optional)',
                  body: 'Click the \u{1F4CE} paperclip button to attach building plans, architect drawings, or site photos. The AI will read them and pull out key details automatically. Supports PDF, JPG, and PNG (max 3 files, 8 MB each).',
                },
                {
                  n: '4', icon: '⚡', title: 'Use a quick prompt',
                  body: 'Hit one of the suggestion chips that appear — like “Write a scope based on the phases” or “Make it detailed with all trades” — or type your own instruction.',
                },
                {
                  n: '5', icon: '🎤', title: 'Or dictate it (optional)',
                  body: 'Click the microphone button and speak your description aloud. Works in Chrome and Edge.',
                },
                {
                  n: '6', icon: '✅', title: 'Insert into your quote',
                  body: `When you are happy with the scope, click “✔ Use This Scope” inside the chat bubble, or “✔ Insert into Quote” in the sticky bar at the bottom. The text is pasted straight into the Scope of Works box.`,
                },
                {
                  n: '7', icon: '⚙️', title: 'Generate your build phases',
                  body: `Once the scope has been pasted in, scroll down to the Phases section and click the “✶ Generate Phases” button. The AI will read your scope and automatically build out all the relevant construction phases and cost rows for your quote.`,
                },
                {
                  n: '8', icon: '✏️', title: 'Refine with follow-up messages',
                  body: `Keep chatting to tweak the scope. Try: “Make it shorter”, “Add exclusions at the end”, “Add a provisional sums paragraph”, or “Make it more formal.”`,
                },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                    color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{step.icon} {step.title}</div>
                    <div style={{ color: 'var(--muted)' }}>{step.body}</div>
                  </div>
                </div>
              ))}

              {/* Tip box */}
              <div style={{
                background: 'rgba(74,144,164,0.08)', border: '1px solid rgba(74,144,164,0.25)',
                borderRadius: 8, padding: '12px 14px', marginTop: 4,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 Tips</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
                  <li>Fill in the <strong>job type</strong> and <strong>client address</strong> first — the AI uses these automatically.</li>
                  <li>If you've already added phases, the AI can see them and write the scope around them.</li>
                  <li>You can re-open the chat to regenerate the scope as many times as you like.</li>
                  <li>The scope won't be saved until you click <strong>“Save Quote”</strong>.</li>
                </ul>
              </div>
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-primary" onClick={() => { setShowScopeHelp(false); setShowScopeChat(true) }}>
                ✦ Open AI Chat
              </button>
              <button className="btn btn-outline" onClick={() => setShowScopeHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showScopeChat && (
        <ScopeChat
          quoteId={editingId}
          jobType={jobType}
          address={custAddr}
          phases={phases.map(p => p.phase)}
          onInsert={text => setScope(text)}
          onClose={() => setShowScopeChat(false)}
        />
      )}
    </>
  )
}

// ── Sub-phase block component ─────────────────────────────────────────────────
interface SubPhaseBlockProps {
  p: QuotePhase
  pi: number
  markup: number
  vatOn: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onUpdatePhaseName: (id: number, name: string) => void
  onRemovePhase: (id: number) => void
  onUpdatePhase: (updated: QuotePhase) => void
}

function SubPhaseBlock({ p, pi, markup, collapsed, onToggleCollapse, onUpdatePhaseName, onRemovePhase, onUpdatePhase }: SubPhaseBlockProps) {
  const subSell = calcPhaseSell(p, markup)

  return (
    <div className="phase-block" style={{ borderRadius: p.parentPhase ? '0' : undefined, marginBottom: 2 }}>
      <div className="phase-hd" style={{ background: '#f7f9f7', borderTop: '1px solid #e8ede8' }}>
        {/* Collapse / expand toggle */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand phase' : 'Collapse phase'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 10, padding: '0 2px',
            lineHeight: 1, flexShrink: 0,
          }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, minWidth: 16 }}>{pi + 1}.</span>
        <input value={p.phase} onChange={e => onUpdatePhaseName(p.id, e.target.value)} style={{ fontSize: 13 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{fmt(subSell)}</span>
        <button className="rm-btn" onClick={() => onRemovePhase(p.id)} title="Remove this sub-phase">×</button>
      </div>

      {/* Cost breakdown — estimator is the sole pricing engine */}
      {!collapsed && (
        <EstimatorBreakdown phase={p} onUpdatePhase={onUpdatePhase} markup={markup} />
      )}
    </div>
  )
}
