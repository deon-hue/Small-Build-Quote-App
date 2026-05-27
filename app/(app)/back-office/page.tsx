'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/contexts/AppContext'
import { JOB_TYPES, JOB_TEMPLATES } from '@/lib/utils'
import type { TemplatePhaseData, QuoteItem } from '@/lib/types'
import type { EstimatorItemTemplate, MeasurementType } from '@/lib/estimator'
import { MEASUREMENT_LABELS } from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import { COST_CATEGORIES } from '@/lib/costCategories'
import {
  TRADE_TYPES, BUILT_IN_TRADE_RATES, loadTradeRates, saveTradeRatesToStorage,
  type TradeRate,
} from '@/lib/tradeRates'
import { HardHat } from 'lucide-react'

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

function defaultItems(): Omit<QuoteItem, 'id'>[] {
  return [
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
  ]
}

// ── Estimator items editor (main pricing surface per phase) ──────────────────
const MEAS_TYPES = Object.keys(MEASUREMENT_LABELS) as MeasurementType[]
const RATE_COLS = '1fr 90px 55px 55px 55px 55px 55px 44px 24px'

interface EstimatorEditorProps {
  phase: TemplatePhaseData
  phaseIdx: number
  onLoad: () => void
  onAdd: () => void
  onUpdate: (item: EstimatorItemTemplate) => void
  onRemove: (id: string) => void
}

function EstimatorEditor({ phase, onLoad, onAdd, onUpdate, onRemove }: EstimatorEditorProps) {
  const items: EstimatorItemTemplate[] = phase.estimatorItems || []
  const builtIn = getPhaseEstimatorDefaults(phase.phase)
  const hasBuiltIn = builtIn.length > 0

  return (
    <div>
      {items.length === 0 ? (
        <div style={{ padding: '14px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No estimator items for this phase yet.
          {hasBuiltIn && (
            <button
              onClick={onLoad}
              style={{ marginLeft: 10, padding: '4px 12px', border: '1px solid #4a90a4', borderRadius: 5, background: 'transparent', color: '#4a90a4', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            >
              Load {builtIn.length} built-in defaults
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: RATE_COLS, gap: 3, padding: '3px 0 5px', borderBottom: '1px solid #e2e8f0', marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Item name</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Measure</span>
            {COST_CATEGORIES.map(cat => (
              <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <cat.Icon size={10} strokeWidth={2.2} />
                {cat.shortLabel}
              </span>
            ))}
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Waste%</span>
            <span />
          </div>

          {/* Item rows */}
          {items.map(item => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: RATE_COLS, gap: 3, alignItems: 'center', marginBottom: 4 }}>
              <input
                value={item.name}
                onChange={e => onUpdate({ ...item, name: e.target.value })}
                style={{ padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}
              />
              <select
                value={item.measurementType}
                onChange={e => {
                  const t = e.target.value as MeasurementType
                  onUpdate({ ...item, measurementType: t, unit: MEASUREMENT_LABELS[t].unit })
                }}
                style={{ padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }}
              >
                {MEAS_TYPES.map(t => (
                  <option key={t} value={t}>{MEASUREMENT_LABELS[t].label} ({MEASUREMENT_LABELS[t].unit})</option>
                ))}
              </select>
              {(
                [
                  ['labourRate',    item.labourRate]    as const,
                  ['materialsRate', item.materialsRate] as const,
                  ['plantRate',     item.plantRate]     as const,
                  ['subRate',       item.subRate]       as const,
                  ['otherRate',     item.otherRate]     as const,
                  ['wastePercent',  item.wastePercent]  as const,
                ]
              ).map(([key, val]) => (
                <input
                  key={key}
                  type="number"
                  value={val}
                  min={0}
                  step={0.5}
                  onChange={e => onUpdate({ ...item, [key]: Number(e.target.value) })}
                  style={{
                    padding: '3px 4px', border: `1px solid ${val > 0 ? '#c7d7e0' : '#e2e8f0'}`,
                    borderRadius: 4, fontSize: 12, textAlign: 'right',
                    background: val > 0 ? '#f0f8fc' : '#fafafa',
                  }}
                />
              ))}
              <button
                onClick={() => onRemove(item.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 15, padding: 0, lineHeight: 1, textAlign: 'center' }}
              >×</button>
            </div>
          ))}
        </>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onAdd}
          style={{ padding: '4px 12px', border: '1px solid #4a90a4', borderRadius: 5, background: 'transparent', color: '#4a90a4', fontSize: 12, cursor: 'pointer' }}
        >
          + Add item
        </button>
        {hasBuiltIn && (
          <button
            onClick={onLoad}
            style={{ padding: '4px 12px', border: '1px solid #94a3b8', borderRadius: 5, background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
          >
            ↺ Reset to {builtIn.length} built-in defaults
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main back-office page ────────────────────────────────────────────────────
export default function BackOfficePage() {
  const { customTemplates, getTemplate, saveJobTypeTemplate, resetJobTypeTemplate, loading } = useApp()

  const [selectedJobType, setSelectedJobType] = useState<string>(JOB_TYPES[0])
  const [localTemplate, setLocalTemplate] = useState<TemplatePhaseData[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupFrom, setDupFrom] = useState('')

  // Trade rate defaults (loaded from localStorage)
  const [tradeRates, setTradeRates] = useState<TradeRate[]>(BUILT_IN_TRADE_RATES)
  const [tradeRatesDirty, setTradeRatesDirty] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTradeRates(loadTradeRates()) }, [])

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

  const isFlatTemplate = mainPhaseOrder.length === 1 && mainPhaseOrder[0] === ''
  const isCustomised = !!customTemplates[selectedJobType]
  const totalEstimatorItems = localTemplate.reduce((s, p) => s + (p.estimatorItems?.length || 0), 0)

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

  // ── Phase structure ──────────────────────────────────────────────────────────

  function renameSubPhase(idx: number, name: string) {
    setLocalTemplate(prev => prev.map((p, i) => i !== idx ? p : { ...p, phase: name }))
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
      const newPhase: TemplatePhaseData = { parentPhase, phase: 'New Sub-Phase', items: defaultItems(), estimatorItems: [] }
      const next = [...prev]
      next.splice(lastIdx + 1, 0, newPhase)
      return next
    })
    setDirty(true)
  }

  function removeSubPhase(idx: number) {
    setLocalTemplate(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  function addMainPhase() {
    const name = `Phase ${mainPhaseOrder.length + 1} – New Phase`
    setLocalTemplate(prev => [...prev, { parentPhase: name, phase: 'New Sub-Phase', items: defaultItems(), estimatorItems: [] }])
    setDirty(true)
  }

  function removeMainPhase(pp: string) {
    const count = localTemplate.filter(p => p.parentPhase === pp).length
    if (!confirm(`Remove "${pp}" and all ${count} sub-phase${count !== 1 ? 's' : ''} under it?`)) return
    setLocalTemplate(prev => prev.filter(p => p.parentPhase !== pp))
    setDirty(true)
  }

  // ── Estimator item defaults ──────────────────────────────────────────────────

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
    <>
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
                {localTemplate.length} phase{localTemplate.length !== 1 ? 's' : ''}
                {' · '}
                {totalEstimatorItems} estimator item{totalEstimatorItems !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={dupFrom}
                onChange={handleDuplicateFrom}
                disabled={saving}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}
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
                  style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
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

        {/* Loading / empty */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>
            Loading templates…
          </div>
        ) : mainPhaseOrder.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>
            <p style={{ margin: '0 0 16px' }}>No phases yet for this job type.</p>
            <button
              onClick={addMainPhase}
              style={{ padding: '8px 20px', border: 'none', borderRadius: 6, background: '#4a90a4', color: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              + Add First Phase
            </button>
          </div>

        ) : isFlatTemplate ? (
          /* ── Flat template (Rear Extension etc.) ── */
          <>
            {localTemplate.map((sp, idx) => {
              const itemCount = sp.estimatorItems?.length || 0
              return (
                <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', marginBottom: 10, overflow: 'hidden' }}>
                  {/* Phase header */}
                  <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 24 }}>{idx + 1}.</span>
                    <input
                      value={sp.phase}
                      onChange={e => renameSubPhase(idx, e.target.value)}
                      style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, fontWeight: 600 }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => removeSubPhase(idx)}
                      style={{ padding: '3px 8px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Estimator items — the sole pricing content */}
                  <div style={{ padding: '10px 14px' }}>
                    <EstimatorEditor
                      phase={sp}
                      phaseIdx={idx}
                      onLoad={() => loadEstimatorDefaults(idx, sp.phase)}
                      onAdd={() => addEstimatorItem(idx)}
                      onUpdate={item => updateEstimatorItem(idx, item)}
                      onRemove={id => removeEstimatorItem(idx, id)}
                    />
                  </div>
                </div>
              )
            })}
            <button
              onClick={() => {
                setLocalTemplate(prev => [...prev, { parentPhase: '', phase: 'New Phase', items: defaultItems(), estimatorItems: [] }])
                setDirty(true)
              }}
              style={{ width: '100%', padding: '12px 20px', border: '2px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
            >
              + Add Phase
            </button>
          </>

        ) : (
          /* ── Grouped template (all other job types) ── */
          <>
            {mainPhaseOrder.map(pp => {
              type Indexed = { tpl: TemplatePhaseData; idx: number }
              const subPhases: Indexed[] = localTemplate.reduce<Indexed[]>((acc, p, i) => {
                if (p.parentPhase === pp) acc.push({ tpl: p, idx: i })
                return acc
              }, [])
              const ppItemCount = subPhases.reduce((s, { tpl }) => s + (tpl.estimatorItems?.length || 0), 0)

              return (
                <div key={pp} style={{ marginBottom: 14 }}>
                  {/* Main phase header */}
                  <div style={{ background: '#2c3e50', color: '#ecf0f1', padding: '9px 14px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={pp}
                      onChange={e => renameMainPhase(pp, e.target.value)}
                      style={{ flex: 1, background: 'transparent', border: 'none', color: '#ecf0f1', fontWeight: 600, fontSize: 13, outline: 'none', minWidth: 0 }}
                    />
                    <span style={{ fontSize: 11, opacity: 0.65, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {ppItemCount} item{ppItemCount !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => addSubPhase(pp)}
                      style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, color: '#e2e8f0', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      + Sub-Phase
                    </button>
                    <button
                      onClick={() => removeMainPhase(pp)}
                      style={{ padding: '3px 9px', background: 'rgba(220,50,50,0.25)', border: '1px solid rgba(220,50,50,0.45)', borderRadius: 4, color: '#fca5a5', fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Sub-phases */}
                  <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden', background: '#fff' }}>
                    {subPhases.map(({ tpl: sp, idx: globalIdx }, spLocalIdx) => {
                      const itemCount = sp.estimatorItems?.length || 0
                      return (
                        <div
                          key={globalIdx}
                          style={{ borderBottom: spLocalIdx < subPhases.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '12px 14px' }}
                        >
                          {/* Sub-phase header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <input
                              value={sp.phase}
                              onChange={e => renameSubPhase(globalIdx, e.target.value)}
                              style={{ flex: 1, padding: '5px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, fontWeight: 600 }}
                              placeholder="Sub-phase name"
                            />
                            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {itemCount} item{itemCount !== 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => removeSubPhase(globalIdx)}
                              style={{ padding: '4px 10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 5, color: '#dc2626', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                            >
                              Remove
                            </button>
                          </div>

                          {/* Estimator items — the sole pricing content */}
                          <EstimatorEditor
                            phase={sp}
                            phaseIdx={globalIdx}
                            onLoad={() => loadEstimatorDefaults(globalIdx, sp.phase)}
                            onAdd={() => addEstimatorItem(globalIdx)}
                            onUpdate={item => updateEstimatorItem(globalIdx, item)}
                            onRemove={id => removeEstimatorItem(globalIdx, id)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <button
              onClick={addMainPhase}
              style={{ width: '100%', padding: '12px 20px', border: '2px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
            >
              + Add Main Phase
            </button>
          </>
        )}
      </div>
    </div>

    {/* ── Trade Rate Defaults ────────────────────────────────────────────── */}
    <div className="card" style={{ marginTop: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HardHat size={18} strokeWidth={2} style={{ color: '#3b82f6' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Trade Day &amp; Hour Rates</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Default cost rates used when adding labour trades to a phase. Editable per-quote.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tradeRatesDirty && (
            <button
              onClick={() => { setTradeRates(loadTradeRates()); setTradeRatesDirty(false) }}
              style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => { setTradeRates([...BUILT_IN_TRADE_RATES]); setTradeRatesDirty(true) }}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
          >
            Reset to Built-in
          </button>
          <button
            onClick={() => { saveTradeRatesToStorage(tradeRates); setTradeRatesDirty(false) }}
            disabled={!tradeRatesDirty}
            style={{
              padding: '6px 18px', border: 'none', borderRadius: 6, fontSize: 13,
              fontWeight: 600, cursor: tradeRatesDirty ? 'pointer' : 'not-allowed',
              background: tradeRatesDirty ? '#4a90a4' : '#cbd5e1', color: '#fff',
              transition: 'background 0.15s',
            }}
          >
            Save Rates
          </button>
        </div>
      </div>

      {tradeRatesDirty && (
        <div style={{ fontSize: 12, color: '#b85c00', fontWeight: 500, marginBottom: 12 }}>
          ● Unsaved changes — click Save Rates to apply
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '160px 1fr 1fr',
        gap: 8, padding: '6px 12px',
        borderBottom: '2px solid #e2e8f0', marginBottom: 4,
      }}>
        {['Trade', 'Day Rate (£)', 'Hour Rate (£)'].map(h => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
        ))}
      </div>

      {/* Rate rows */}
      {TRADE_TYPES.map(trade => {
        const row = tradeRates.find(r => r.trade === trade) ?? BUILT_IN_TRADE_RATES.find(r => r.trade === trade)!
        return (
          <div key={trade} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr 1fr',
            gap: 8, padding: '7px 12px', alignItems: 'center',
            borderBottom: '1px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{trade}</span>
            <input
              type="number" value={row.dayRate} min={0} step={5}
              onChange={e => {
                setTradeRates(prev => prev.map(r =>
                  r.trade === trade ? { ...r, dayRate: Number(e.target.value) } : r,
                ))
                setTradeRatesDirty(true)
              }}
              style={{
                padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
                fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
                background: '#fafafa', maxWidth: 120,
              }}
            />
            <input
              type="number" value={row.hourRate} min={0} step={1}
              onChange={e => {
                setTradeRates(prev => prev.map(r =>
                  r.trade === trade ? { ...r, hourRate: Number(e.target.value) } : r,
                ))
                setTradeRatesDirty(true)
              }}
              style={{
                padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
                fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
                background: '#fafafa', maxWidth: 120,
              }}
            />
          </div>
        )
      })}
    </div>
    </>
  )
}
