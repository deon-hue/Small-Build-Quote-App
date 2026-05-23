'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, VAT, UNITS, JOB_TYPES, JOB_TEMPLATES, calcItem, calcPhase, calcItemSell, calcPhaseSell, quoteTotal } from '@/lib/utils'
import type { QuotePhase, QuoteItem, Quote } from '@/lib/types'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import ScopeChat from '@/components/ScopeChat'

let phaseCounter = 0
let itemCounter = 0

function makePhase(phase: string, items: Omit<QuoteItem, 'id'>[]): QuotePhase {
  return { id: ++phaseCounter, phase, items: items.map(i => ({ ...i, id: ++itemCounter })) }
}

export default function NewQuotePage() {
  const { quotes, clients, addQuote, updateQuote, upsertClientFromQuote, loading } = useApp()

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
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingScope, setGeneratingScope] = useState(false)
  const [showScopeChat, setShowScopeChat] = useState(false)
  const [clientDrop, setClientDrop] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Load template or edit state
  useEffect(() => {
    const editId = sessionStorage.getItem('sbc_edit_quote')
    if (editId) {
      sessionStorage.removeItem('sbc_edit_quote')
      const q = quotes.find(x => x.id === editId)
      if (q) {
        loadQuoteForEdit(q)
        return
      }
    }
    loadTemplate('Rear Extension')
  }, [quotes]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadTemplate(type: string) {
    const tpl = JOB_TEMPLATES[type] || []
    setPhases(tpl.map(p => makePhase(p.phase, p.items)))
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
      ...p, id: ++phaseCounter, items: p.items.map((i: QuoteItem) => ({ ...i, id: ++itemCounter }))
    })))
    setEditingId(q.id)
  }

  function onJobTypeChange(type: string) {
    setJobType(type)
    if (phases.length && !confirm('Load the ' + type + ' template? This replaces current lines.')) return
    loadTemplate(type)
  }

  // Phases
  function addPhase() {
    setPhases(prev => [...prev, makePhase('New Phase', [{ desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, notes: '' }])])
  }
  function removePhase(id: number) { setPhases(prev => prev.filter(p => p.id !== id)) }
  function updatePhaseName(id: number, name: string) {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, phase: name } : p))
  }

  // Items
  function addItem(phaseId: number) {
    setPhases(prev => prev.map(p => p.id === phaseId
      ? { ...p, items: [...p.items, { id: ++itemCounter, desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, notes: '' }] }
      : p))
  }
  function removeItem(phaseId: number, itemId: number) {
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, items: p.items.filter(i => i.id !== itemId) } : p))
  }
  function updateItem(phaseId: number, itemId: number, key: keyof QuoteItem, val: string | number) {
    setPhases(prev => prev.map(p => p.id === phaseId
      ? { ...p, items: p.items.map(i => i.id === itemId ? { ...i, [key]: val } : i) }
      : p))
  }

  // Totals
  const cost = phases.reduce((s, p) => s + calcPhase(p), 0)
  const sell = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  const mu = sell - cost
  const vatAmt = vatOn ? sell * VAT : 0
  const total = sell + vatAmt

  // Save
  async function handleSave() {
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
      // Reset
      setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
      setScope(''); setPhoto('')
      loadTemplate(jobType)
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
    setScope(''); setPhoto('')
    loadTemplate(jobType)
  }

  // Photo
  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 4 * 1024 * 1024) { alert('Photo too large — max 4MB.'); return }
    const reader = new FileReader()
    reader.onload = e => setPhoto(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  // Client autocomplete
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
    setCustName(c.name || '')
    setCustEmail(c.email || '')
    setCustPhone(c.phone || '')
    setCustAddr(c.address || '')
    setClientDrop(false)
    setClientSearch('')
  }

  // AI scope
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

  // Preview quote object
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
      {/* Editing notice */}
      {editingId && (
        <div style={{ background: 'rgba(74,144,164,0.1)', border: '1px solid #4a90a4', borderRadius: 6, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>✎ Editing saved quote: <strong>{quotes.find(q => q.id === editingId)?.ref || editingId}</strong></span>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Cancel Edit</button>
        </div>
      )}

      <div className="qb-grid" style={{ gridTemplateColumns: '270px 1fr' }}>
        {/* Left panel */}
        <div className="qb-left">
          {/* Customer details */}
          <div className="card">
            <div className="card-hd">Customer Details</div>
            <div style={{ padding: '14px 16px' }}>
              {/* Client search */}
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

          {/* Job type */}
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

          {/* Property photo */}
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

          {/* Scope of works */}
          <div className="card">
            <div className="card-hd">
              <span>Scope of Works</span>
              <button className="btn-sm btn-sky" onClick={() => setShowScopeChat(true)} style={{ fontSize: 11 }}>
                ✦ AI Chat
              </button>
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

          {/* Markup + VAT */}
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
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Saving…' : editingId ? '💾 Update Quote' : '💾 Save Quote'}
            </button>
          </div>
        </div>

        {/* Right panel — phases */}
        <div className="qb-right">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Quote Lines — <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{phases.length} phase{phases.length !== 1 ? 's' : ''}</span></div>
            <button className="btn-sm btn-primary" onClick={addPhase}>+ Add Phase</button>
          </div>

          {!phases.length
            ? <div className="empty-dashed"><div style={{ fontSize: 14, marginBottom: 6 }}>No phases yet</div><div style={{ fontSize: 12 }}>Select a job type to load a template, or click Add Phase.</div></div>
            : phases.map((p, pi) => (
                <div key={p.id} className="phase-block">
                  <div className="phase-hd">
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, minWidth: 20 }}>{pi + 1}.</span>
                    <input value={p.phase} onChange={e => updatePhaseName(p.id, e.target.value)} />
                    <span className="mono" style={{ fontSize: 12, color: 'var(--slate)', fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                      {fmt(calcPhaseSell(p, markup))}
                    </span>
                    <button className="rm-btn" onClick={() => removePhase(p.id)}>×</button>
                  </div>
                  {/* Column headers */}
                  <div className="col-heads" style={{ gridTemplateColumns: '1fr 46px 58px 78px 78px 78px 78px 78px 100px 22px' }}>
                    <span>Description</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'center' }}>Unit</span>
                    <span style={{ textAlign: 'right' }}>Labour</span><span style={{ textAlign: 'right' }}>Materials</span>
                    <span style={{ textAlign: 'right', color: '#c0392b' }}>Cost</span>
                    <span style={{ textAlign: 'right', color: '#7ab533' }}>Sell</span>
                    <span style={{ textAlign: 'right', color: '#4a90a4' }}>VAT</span>
                    <span>Notes</span><span></span>
                  </div>
                  {p.items.map(item => {
                    const itemCost = calcItem(item)
                    const itemSell = calcItemSell(item, markup)
                    const itemVat = vatOn ? itemSell * VAT : 0
                    return (
                      <div key={item.id} className="item-row" style={{ gridTemplateColumns: '1fr 46px 58px 78px 78px 78px 78px 78px 100px 22px' }}>
                        <input value={item.desc} onChange={e => updateItem(p.id, item.id, 'desc', e.target.value)} placeholder="Description" />
                        <input type="number" value={item.qty} onChange={e => updateItem(p.id, item.id, 'qty', Number(e.target.value))} style={{ textAlign: 'center' }} />
                        <select value={item.unit} onChange={e => updateItem(p.id, item.id, 'unit', e.target.value)}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                        <input type="number" value={item.labour} onChange={e => updateItem(p.id, item.id, 'labour', Number(e.target.value))} style={{ textAlign: 'right' }} />
                        <input type="number" value={item.materials} onChange={e => updateItem(p.id, item.id, 'materials', Number(e.target.value))} style={{ textAlign: 'right' }} />
                        <span style={{ textAlign: 'right', fontSize: 11, color: '#c0392b', fontFamily: 'DM Mono, monospace', padding: '0 4px' }}>{fmt(itemCost)}</span>
                        <span style={{ textAlign: 'right', fontSize: 11, color: '#2b8a3e', fontFamily: 'DM Mono, monospace', padding: '0 4px', fontWeight: 600 }}>{fmt(itemSell)}</span>
                        <span style={{ textAlign: 'right', fontSize: 11, color: '#4a90a4', fontFamily: 'DM Mono, monospace', padding: '0 4px' }}>{vatOn ? fmt(itemVat) : '—'}</span>
                        <input value={item.notes} onChange={e => updateItem(p.id, item.id, 'notes', e.target.value)} placeholder="Note" />
                        <button className="rm-btn" onClick={() => removeItem(p.id, item.id)}>×</button>
                      </div>
                    )
                  })}
                  <div style={{ padding: '7px 12px' }}>
                    <button className="btn-sm btn-outline" onClick={() => addItem(p.id)}>+ Add Line</button>
                  </div>
                </div>
              ))
          }
          {phases.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-sm btn-primary" onClick={addPhase}>+ Add Phase</button>
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setShowPreview(false)} />
      )}

      {showScopeChat && (
        <ScopeChat
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
