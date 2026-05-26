'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/contexts/AppContext'
import { JOB_TYPES, JOB_TEMPLATES, fmt } from '@/lib/utils'
import type { TemplatePhaseData, QuoteItem } from '@/lib/types'
import type { EstimatorItemTemplate, MeasurementType } from '@/lib/estimator'
import { MEASUREMENT_LABELS } from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'

type ItemType = 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'

const TYPE_CFG: Record<ItemType, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  labour:         { label: 'Labour',        emoji: '🔨', color: '#2a7090', bg: '#e8f4f8', border: '#4a90a4' },
  materials:      { label: 'Materials',     emoji: '📦', color: '#b85c00', bg: '#fff3e8', border: '#e67e22' },
  plant:          { label: 'Plant Hire',    emoji: '🚜', color: '#4a7a1a', bg: '#eef8e0', border: '#7ab533' },
  subcontractors: { label: 'Subcontractors',emoji: '👷', color: '#6b21a8', bg: '#f3e8ff', border: '#9333ea' },
  other:          { label: 'Other',         emoji: '📋', color: '#555555', bg: '#f5f5f5', border: '#999999' },
}

const ITEM_TYPES: ItemType[] = ['labour', 'materials', 'plant', 'subcontractors', 'other']

function defaultItems(): Omit<QuoteItem, 'id'>[] {
  return [
    { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour'         },
    { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials'      },
    { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant'          },
    { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
    { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other'          },
  ]
}

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

function getItemVal(items: Omit<QuoteItem, 'id'>[], t: ItemType): number {
  const item = items.find(i => i.itemType === t)
  if (!item) return 0
  if (t === 'labour') return item.labour
  if (t === 'materials') return item.materials
  if (t === 'plant') return item.plantHire ?? 0
  if (t === 'subcontractors') return item.subcontractors ?? 0
  return item.other ?? 0
}

function getItemNote(items: Omit<QuoteItem, 'id'>[], t: ItemType): string {
  return items.find(i => i.itemType === t)?.notes || ''
}

function subPhaseTotal(items: Omit<QuoteItem, 'id'>[]): number {
  return items.reduce((s, i) =>
    s + i.labour + i.materials + (i.plantHire ?? 0) + (i.subcontractors ?? 0) + (i.other ?? 0), 0)
}

function mainPhaseTotal(template: TemplatePhaseData[], pp: string): number {
  return template.filter(p => p.parentPhase === pp).reduce((s, p) => s + subPhaseTotal(p.items), 0)
}

// ── Estimator defaults editor (compact, per-phase) ───────────────────────────
interface EstimatorDefaultsEditorProps {
  phaseIdx: number
  phase: TemplatePhaseData
  onLoad: () => void
  onAdd: () => void
  onUpdate: (item: EstimatorItemTemplate) => void
  onRemove: (id: string) => void
}

function EstimatorDefaultsEditor({ phaseIdx: _phaseIdx, phase, onLoad, onAdd, onUpdate, onRemove }: EstimatorDefaultsEditorProps) {
  const [open, setOpen] = useState(false)
  const items: EstimatorItemTemplate[] = phase.estimatorItems || []
  const builtIn = getPhaseEstimatorDefaults(phase.phase)

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, color: '#4a90a4' }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 12, color: '#4a90a4', fontWeight: 600 }}>
          📐 Estimator defaults
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {items.length > 0 ? `${items.length} item${items.length !== 1 ? 's' : ''}` : builtIn.length > 0 ? `${builtIn.length} available` : 'none available'}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              No estimator defaults for this phase yet.
              {builtIn.length > 0 && (
                <button
                  onClick={onLoad}
                  style={{ marginLeft: 8, padding: '2px 8px', border: '1px solid #4a90a4', borderRadius: 4, background: 'transparent', color: '#4a90a4', fontSize: 11, cursor: 'pointer' }}
                >
                  Load built-in defaults ({builtIn.length})
                </button>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 8 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 60px 60px 60px 24px', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <input
                    value={item.name}
                    onChange={e => onUpdate({ ...item, name: e.target.value })}
                    style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4 }}
                  />
                  <select
                    value={item.measurementType}
                    onChange={e => onUpdate({ ...item, measurementType: e.target.value as MeasurementType, unit: MEASUREMENT_LABELS[e.target.value as MeasurementType].unit })}
                    style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}
                  >
                    {(Object.keys(MEASUREMENT_LABELS) as MeasurementType[]).map(t => (
                      <option key={t} value={t}>{MEASUREMENT_LABELS[t].label}</option>
                    ))}
                  </select>
                  <input type="number" value={item.labourRate} min={0} step={0.5}
                    onChange={e => onUpdate({ ...item, labourRate: Number(e.target.value) })}
                    placeholder="Labour"
                    style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, textAlign: 'right' }}
                    title="Labour rate £/unit"
                  />
                  <input type="number" value={item.materialsRate} min={0} step={0.5}
                    onChange={e => onUpdate({ ...item, materialsRate: Number(e.target.value) })}
                    placeholder="Mat"
                    style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, textAlign: 'right' }}
                    title="Materials rate £/unit"
                  />
                  <input type="number" value={item.plantRate} min={0} step={0.5}
                    onChange={e => onUpdate({ ...item, plantRate: Number(e.target.value) })}
                    placeholder="Plant"
                    style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, textAlign: 'right' }}
                    title="Plant rate £/unit"
                  />
                  <button
                    onClick={() => onRemove(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0, lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={onAdd} style={{ padding: '3px 10px', border: '1px solid #4a90a4', borderRadius: 4, background: 'transparent', color: '#4a90a4', fontSize: 11, cursor: 'pointer' }}>
              + Add item
            </button>
            {builtIn.length > 0 && (
              <button onClick={onLoad} style={{ padding: '3px 10px', border: '1px solid #94a3b8', borderRadius: 4, background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                ↺ Reset to defaults
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BackOfficePage() {
  const { customTemplates, getTemplate, saveJobTypeTemplate, resetJobTypeTemplate, loading } = useApp()

  const [selectedJobType, setSelectedJobType] = useState<string>(JOB_TYPES[0])
  const [localTemplate, setLocalTemplate] = useState<TemplatePhaseData[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupFrom, setDupFrom] = useState('')

  // Load template when job type changes or data finishes loading
  useEffect(() => {
    if (!loading) {
      setLocalTemplate(deepClone(getTemplate(selectedJobType)))
      setDirty(false)
      setDupFrom('')
    }
  }, [selectedJobType, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const mainPhaseOrder = localTemplate.reduce<string[]>((acc, p) => {
    if (!acc.includes(p.parentPhase)) acc.push(p.parentPhase)
    return acc
  }, [])

  // Flat template = all phases have no parent (Rear Extension new structure)
  const isFlatTemplate = mainPhaseOrder.length === 1 && mainPhaseOrder[0] === ''

  const isCustomised = !!customTemplates[selectedJobType]
  const totalCost = localTemplate.reduce((s, p) => s + subPhaseTotal(p.items), 0)

  function handleSelectJobType(jt: string) {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return
    setSelectedJobType(jt)
  }

  function handleDuplicateFrom(e: React.ChangeEvent<HTMLSelectElement>) {
    const src = e.target.value
    if (!src) return
    if (!confirm(`Copy "${src}" template to "${selectedJobType}"?\n\nThis replaces the current template.`)) {
      setDupFrom('')
      return
    }
    setLocalTemplate(deepClone(getTemplate(src)))
    setDirty(true)
    setDupFrom('')
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveJobTypeTemplate(selectedJobType, localTemplate)
      setDirty(false)
    } catch {
      alert('Failed to save template. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!confirm(`Reset "${selectedJobType}" to built-in default?\n\nYour custom template will be permanently deleted.`)) return
    setSaving(true)
    try {
      await resetJobTypeTemplate(selectedJobType)
      setLocalTemplate(deepClone(JOB_TEMPLATES[selectedJobType] || []))
      setDirty(false)
    } catch {
      alert('Failed to reset template. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Template edit functions ──────────────────────────────────────────────────

  function updateCostVal(phaseIdx: number, t: ItemType, val: number) {
    const fieldKey = t === 'labour' ? 'labour'
      : t === 'materials' ? 'materials'
      : t === 'plant' ? 'plantHire'
      : t === 'subcontractors' ? 'subcontractors'
      : 'other'
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : {
      ...p,
      items: p.items.map(item => item.itemType !== t ? item : { ...item, [fieldKey]: val }),
    }))
    setDirty(true)
  }

  function updateCostNote(phaseIdx: number, t: ItemType, note: string) {
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : {
      ...p,
      items: p.items.map(item => item.itemType !== t ? item : { ...item, notes: note }),
    }))
    setDirty(true)
  }

  function renameSubPhase(phaseIdx: number, name: string) {
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, phase: name }))
    setDirty(true)
  }

  function renameMainPhase(oldName: string, newName: string) {
    setLocalTemplate(prev => prev.map(p => p.parentPhase !== oldName ? p : { ...p, parentPhase: newName }))
    setDirty(true)
  }

  function addSubPhase(parentPhase: string) {
    setLocalTemplate(prev => {
      let lastIdx = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].parentPhase === parentPhase) { lastIdx = i; break }
      }
      const newPhase: TemplatePhaseData = { parentPhase, phase: 'New Sub-Phase', items: defaultItems() }
      const next = [...prev]
      next.splice(lastIdx + 1, 0, newPhase)
      return next
    })
    setDirty(true)
  }

  function removeSubPhase(phaseIdx: number) {
    setLocalTemplate(prev => prev.filter((_, i) => i !== phaseIdx))
    setDirty(true)
  }

  function addMainPhase() {
    const num = mainPhaseOrder.length + 1
    const name = `Phase ${num} – New Phase`
    setLocalTemplate(prev => [...prev, { parentPhase: name, phase: 'New Sub-Phase', items: defaultItems() }])
    setDirty(true)
  }

  function removeMainPhase(pp: string) {
    const count = localTemplate.filter(p => p.parentPhase === pp).length
    if (!confirm(`Remove "${pp}" and all ${count} sub-phase${count !== 1 ? 's' : ''} under it?`)) return
    setLocalTemplate(prev => prev.filter(p => p.parentPhase !== pp))
    setDirty(true)
  }

  // ── Estimator defaults ───────────────────────────────────────────────────────

  function loadEstimatorDefaults(phaseIdx: number, phaseName: string) {
    const defs = getPhaseEstimatorDefaults(phaseName)
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, estimatorItems: defs }))
    setDirty(true)
  }

  function addEstimatorItem(phaseIdx: number) {
    const newItem: EstimatorItemTemplate = {
      id: `custom-${Date.now()}`,
      name: 'New item', description: '', measurementType: 'quantity', unit: 'nr',
      labourRate: 0, materialsRate: 0, plantRate: 0, subRate: 0, otherRate: 0, wastePercent: 0,
    }
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : {
      ...p, estimatorItems: [...(p.estimatorItems || []), newItem],
    }))
    setDirty(true)
  }

  function updateEstimatorItem(phaseIdx: number, updated: EstimatorItemTemplate) {
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : {
      ...p, estimatorItems: (p.estimatorItems || []).map(ei => ei.id === updated.id ? updated : ei),
    }))
    setDirty(true)
  }

  function removeEstimatorItem(phaseIdx: number, itemId: string) {
    setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : {
      ...p, estimatorItems: (p.estimatorItems || []).filter(ei => ei.id !== itemId),
    }))
    setDirty(true)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

      {/* ── Left: job type list ─────────────────────────────────────────── */}
      <div style={{ width: 196, flexShrink: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
            fontWeight: 600, fontSize: 11, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Job Types
          </div>
          {JOB_TYPES.map(jt => {
            const active = jt === selectedJobType
            const custom = !!customTemplates[jt]
            return (
              <button
                key={jt}
                onClick={() => handleSelectJobType(jt)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 14px', border: 'none', textAlign: 'left',
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  background: active ? '#e8f4f8' : 'transparent',
                  color: active ? '#2a7090' : '#374151',
                  borderLeft: active ? '3px solid #4a90a4' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span>{jt}</span>
                {custom && <span title="Custom template saved" style={{ color: '#7ab533', fontSize: 9 }}>●</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: template editor ──────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Toolbar */}
        <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{selectedJobType}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                <span style={{ color: isCustomised ? '#7ab533' : '#94a3b8' }}>
                  {isCustomised ? '● Custom template' : '○ Built-in defaults'}
                </span>
                {' · '}
                {mainPhaseOrder.length} main phase{mainPhaseOrder.length !== 1 ? 's' : ''}
                {' · '}
                {localTemplate.length} sub-phase{localTemplate.length !== 1 ? 's' : ''}
                {' · '}
                {fmt(totalCost)} template total
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={dupFrom}
                onChange={handleDuplicateFrom}
                disabled={saving}
                style={{
                  padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer',
                }}
              >
                <option value="">Duplicate from…</option>
                {JOB_TYPES.filter(jt => jt !== selectedJobType).map(jt => (
                  <option key={jt} value={jt}>{jt}</option>
                ))}
              </select>

              {isCustomised && (
                <button
                  onClick={handleReset}
                  disabled={saving}
                  style={{
                    padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
                    fontSize: 13, background: '#fff', color: '#6b7280', cursor: 'pointer',
                  }}
                >
                  Reset to Default
                </button>
              )}

              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                style={{
                  padding: '6px 18px', border: 'none', borderRadius: 6, fontSize: 13,
                  fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                  background: dirty ? '#4a90a4' : '#cbd5e1', color: '#fff',
                  transition: 'background 0.15s',
                }}
              >
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
          {dirty && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#b85c00', fontWeight: 500 }}>
              ● Unsaved changes — click Save Template to apply
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>
            Loading templates…
          </div>
        ) : mainPhaseOrder.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>
            <p style={{ margin: '0 0 16px' }}>No phases yet for this job type.</p>
            <button
              onClick={addMainPhase}
              style={{
                padding: '8px 20px', border: 'none', borderRadius: 6,
                background: '#4a90a4', color: '#fff', fontSize: 13, cursor: 'pointer',
              }}
            >
              + Add First Phase
            </button>
          </div>
        ) : isFlatTemplate ? (
          /* ── Flat template (e.g. Rear Extension) — no parent grouping ── */
          <>
            {localTemplate.map((sp, globalIdx) => (
              <div key={globalIdx} style={{
                border: '1px solid #e2e8f0', borderRadius: 8,
                background: '#fff', marginBottom: 10, overflow: 'hidden',
              }}>
                <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 22 }}>{globalIdx + 1}.</span>
                  <input
                    value={sp.phase}
                    onChange={e => renameSubPhase(globalIdx, e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, fontWeight: 600 }}
                  />
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmt(subPhaseTotal(sp.items))}</span>
                  <button onClick={() => removeSubPhase(globalIdx)} style={{ padding: '3px 8px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Remove</button>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ITEM_TYPES.map(t => {
                      const val = getItemVal(sp.items, t)
                      const note = getItemNote(sp.items, t)
                      const cfg = TYPE_CFG[t]
                      return (
                        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 128, flexShrink: 0, fontSize: 12, color: cfg.color, fontWeight: 500 }}>{cfg.emoji} {cfg.label}</span>
                          <span style={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>£</span>
                          <input type="number" min={0} value={val === 0 ? '' : val}
                            onChange={e => updateCostVal(globalIdx, t, Number(e.target.value) || 0)}
                            style={{ width: 90, flexShrink: 0, padding: '3px 6px', border: `1px solid ${val > 0 ? cfg.border : '#e2e8f0'}`, borderRadius: 4, fontSize: 13, textAlign: 'right', background: val > 0 ? cfg.bg : '#fafafa' }}
                            placeholder="0"
                          />
                          <input value={note} onChange={e => updateCostNote(globalIdx, t, e.target.value)}
                            style={{ flex: 1, minWidth: 0, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, color: '#64748b' }}
                            placeholder="Notes (optional)"
                          />
                        </div>
                      )
                    })}
                  </div>
                  <EstimatorDefaultsEditor
                    phaseIdx={globalIdx}
                    phase={sp}
                    onLoad={() => loadEstimatorDefaults(globalIdx, sp.phase)}
                    onAdd={() => addEstimatorItem(globalIdx)}
                    onUpdate={item => updateEstimatorItem(globalIdx, item)}
                    onRemove={id => removeEstimatorItem(globalIdx, id)}
                  />
                </div>
              </div>
            ))}
            <button onClick={() => {
              setLocalTemplate(prev => [...prev, { parentPhase: '', phase: 'New Phase', items: defaultItems(), estimatorItems: [] }])
              setDirty(true)
            }} style={{ width: '100%', padding: '12px 20px', border: '2px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              + Add Phase
            </button>
          </>
        ) : (
          <>
            {mainPhaseOrder.map(pp => {
              const ppTotal = mainPhaseTotal(localTemplate, pp)
              type IndexedPhase = { tpl: TemplatePhaseData; idx: number }
              const subPhases: IndexedPhase[] = localTemplate.reduce<IndexedPhase[]>((acc, p, i) => {
                if (p.parentPhase === pp) acc.push({ tpl: p, idx: i })
                return acc
              }, [])

              return (
                <div key={pp} style={{ marginBottom: 14 }}>
                  {/* Main phase header */}
                  <div style={{
                    background: '#2c3e50', color: '#ecf0f1', padding: '9px 14px',
                    borderRadius: '8px 8px 0 0',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <input
                      value={pp}
                      onChange={e => renameMainPhase(pp, e.target.value)}
                      style={{
                        flex: 1, background: 'transparent', border: 'none',
                        color: '#ecf0f1', fontWeight: 600, fontSize: 13,
                        outline: 'none', minWidth: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {fmt(ppTotal)}
                    </span>
                    <button
                      onClick={() => addSubPhase(pp)}
                      style={{
                        padding: '3px 10px', background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4,
                        color: '#e2e8f0', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      + Sub-Phase
                    </button>
                    <button
                      onClick={() => removeMainPhase(pp)}
                      title="Remove this main phase"
                      style={{
                        padding: '3px 9px', background: 'rgba(220,50,50,0.25)',
                        border: '1px solid rgba(220,50,50,0.45)', borderRadius: 4,
                        color: '#fca5a5', fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Sub-phases */}
                  <div style={{
                    border: '1px solid #e2e8f0', borderTop: 'none',
                    borderRadius: '0 0 8px 8px', overflow: 'hidden',
                    background: '#fff',
                  }}>
                    {subPhases.map(({ tpl: sp, idx: globalIdx }, spLocalIdx) => (
                      <div
                        key={globalIdx}
                        style={{
                          borderBottom: spLocalIdx < subPhases.length - 1 ? '1px solid #e2e8f0' : 'none',
                          padding: '12px 14px',
                        }}
                      >
                        {/* Sub-phase name row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <input
                            value={sp.phase}
                            onChange={e => renameSubPhase(globalIdx, e.target.value)}
                            style={{
                              flex: 1, padding: '5px 9px', border: '1px solid #d1d5db',
                              borderRadius: 5, fontSize: 13, fontWeight: 600,
                            }}
                            placeholder="Sub-phase name"
                          />
                          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {fmt(subPhaseTotal(sp.items))}
                          </span>
                          <button
                            onClick={() => removeSubPhase(globalIdx)}
                            style={{
                              padding: '4px 10px', background: '#fee2e2',
                              border: '1px solid #fca5a5', borderRadius: 5,
                              color: '#dc2626', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            Remove
                          </button>
                        </div>

                        {/* Cost type rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {ITEM_TYPES.map(t => {
                            const val = getItemVal(sp.items, t)
                            const note = getItemNote(sp.items, t)
                            const cfg = TYPE_CFG[t]
                            return (
                              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  width: 128, flexShrink: 0, fontSize: 12,
                                  color: cfg.color, fontWeight: 500,
                                }}>
                                  {cfg.emoji} {cfg.label}
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>£</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={val === 0 ? '' : val}
                                  onChange={e => updateCostVal(globalIdx, t, Number(e.target.value) || 0)}
                                  style={{
                                    width: 90, flexShrink: 0, padding: '3px 6px',
                                    border: `1px solid ${val > 0 ? cfg.border : '#e2e8f0'}`,
                                    borderRadius: 4, fontSize: 13, textAlign: 'right',
                                    background: val > 0 ? cfg.bg : '#fafafa',
                                  }}
                                  placeholder="0"
                                />
                                <input
                                  value={note}
                                  onChange={e => updateCostNote(globalIdx, t, e.target.value)}
                                  style={{
                                    flex: 1, minWidth: 0, padding: '3px 6px',
                                    border: '1px solid #e2e8f0', borderRadius: 4,
                                    fontSize: 12, color: '#64748b',
                                  }}
                                  placeholder="Notes (optional)"
                                />
                              </div>
                            )
                          })}
                        </div>

                        {/* Estimator defaults section */}
                        <EstimatorDefaultsEditor
                          phaseIdx={globalIdx}
                          phase={sp}
                          onLoad={() => loadEstimatorDefaults(globalIdx, sp.phase)}
                          onAdd={() => addEstimatorItem(globalIdx)}
                          onUpdate={item => updateEstimatorItem(globalIdx, item)}
                          onRemove={id => removeEstimatorItem(globalIdx, id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Add main phase */}
            <button
              onClick={addMainPhase}
              style={{
                width: '100%', padding: '12px 20px',
                border: '2px dashed #cbd5e1', borderRadius: 8,
                background: 'transparent', color: '#64748b',
                fontSize: 13, cursor: 'pointer', marginTop: 4,
              }}
            >
              + Add Main Phase
            </button>
          </>
        )}
      </div>
    </div>
  )
}
