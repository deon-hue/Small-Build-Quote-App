'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { syncBackOfficeFromProduct } from '@/lib/back-office-queries'
import { JOB_TYPES, JOB_TEMPLATES } from '@/lib/utils'
import type { TemplatePhaseData, QuoteItem } from '@/lib/types'
import type { EstimatorItemTemplate, MeasurementType } from '@/lib/estimator'
import { MEASUREMENT_LABELS } from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import { COST_CATEGORIES } from '@/lib/costCategories'
import { type TaskLabourLine } from '@/lib/tradeRates'
import { HardHat } from 'lucide-react'
import TaskLabourLinesEditor from '@/components/TaskLabourLinesEditor'

// New DB-backed section components
import SectionLabour from './components/SectionLabour'
import SectionPhasesTasks from './components/SectionPhasesTasks'
import SectionProducts from './components/SectionProducts'
import SectionPlant from './components/SectionPlant'
import SectionTakeoffMapping from './components/SectionTakeoffMapping'
import SectionFormulaRules from './components/SectionFormulaRules'
import SectionAIMapping from './components/SectionAIMapping'
import SectionWallTypes from './components/SectionWallTypes'

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

// ── Section definitions ───────────────────────────────────────────────────────

type SectionId =
  | 'job-templates'
  | 'phases-tasks'
  | 'labour'
  | 'products'
  | 'plant'
  | 'takeoff-mapping'
  | 'formula-rules'
  | 'ai-mapping'
  | 'wall-types'

const SECTIONS: Array<{ id: SectionId; label: string; icon: string; badge?: string; group?: string }> = [
  { id: 'job-templates',    label: 'Job Templates',      icon: '📋', badge: 'DB',    group: 'Master Data' },
  { id: 'phases-tasks',     label: 'Phases & Tasks',     icon: '🏗️', badge: 'DB',    group: 'Master Data' },
  { id: 'labour',           label: 'Labour & Trades',    icon: '👷', badge: 'DB',    group: 'Master Data' },
  { id: 'products',         label: 'Products',           icon: '📦', badge: 'DB',    group: 'Master Data' },
  { id: 'plant',            label: 'Plant & Equipment',  icon: '🚜', badge: 'DB',    group: 'Master Data' },
  { id: 'takeoff-mapping',  label: 'Takeoff Mapping',    icon: '📐', badge: 'DB',    group: 'Tool Config' },
  { id: 'formula-rules',    label: 'Formula Rules',      icon: '∑',  badge: 'DB',    group: 'Tool Config' },
  { id: 'ai-mapping',       label: 'AI Scope Mapping',   icon: '🤖', badge: 'DB',    group: 'Tool Config' },
  { id: 'wall-types',       label: 'Wall Types',         icon: '🧱', badge: 'DB',    group: 'Master Data' },
]

// ── Estimator items editor (unchanged from original) ─────────────────────────
const MEAS_TYPES = Object.keys(MEASUREMENT_LABELS) as MeasurementType[]
const RATE_COLS = '1fr 90px 55px 55px 55px 55px 44px 24px'

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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  function toggleExpand(id: string) {
    setExpandedItems(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return (
    <div>
      {items.length === 0 ? (
        <div style={{ padding: '14px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No estimator items for this phase yet.
          {hasBuiltIn && (
            <button onClick={onLoad} style={{ marginLeft: 10, padding: '4px 12px', border: '1px solid #4a90a4', borderRadius: 5, background: 'transparent', color: '#4a90a4', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Load {builtIn.length} built-in defaults
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: RATE_COLS, gap: 3, padding: '3px 0 5px', borderBottom: '1px solid #e2e8f0', marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Item name</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Measure</span>
            {COST_CATEGORIES.filter(cat => cat.id !== 'labour').map(cat => (
              <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <cat.Icon size={10} strokeWidth={2.2} />{cat.shortLabel}
              </span>
            ))}
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Waste%</span>
            <span />
          </div>
          {items.map(item => {
            const isOpen = expandedItems.has(item.id)
            const hasLines = (item.defaultTaskLabourLines?.length ?? 0) > 0
            return (
              <div key={item.id} style={{ marginBottom: 4, border: isOpen ? '1.5px solid rgba(59,130,246,0.2)' : '1px solid transparent', borderRadius: isOpen ? 6 : 0, background: isOpen ? 'rgba(59,130,246,0.02)' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: RATE_COLS, gap: 3, alignItems: 'center' }}>
                  <input value={item.name} onChange={e => onUpdate({ ...item, name: e.target.value })} style={{ padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
                  <select value={item.measurementType} onChange={e => { const t = e.target.value as MeasurementType; onUpdate({ ...item, measurementType: t, unit: MEASUREMENT_LABELS[t].unit }) }} style={{ padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11 }}>
                    {MEAS_TYPES.map(t => <option key={t} value={t}>{MEASUREMENT_LABELS[t].label} ({MEASUREMENT_LABELS[t].unit})</option>)}
                  </select>
                  {([['materialsRate', item.materialsRate] as const, ['plantRate', item.plantRate] as const, ['subRate', item.subRate] as const, ['otherRate', item.otherRate] as const, ['wastePercent', item.wastePercent] as const]).map(([key, val]) => (
                    <input key={key} type="number" value={val} min={0} step={0.5} onChange={e => onUpdate({ ...item, [key]: Number(e.target.value) })} style={{ padding: '3px 4px', border: `1px solid ${val > 0 ? '#c7d7e0' : '#e2e8f0'}`, borderRadius: 4, fontSize: 12, textAlign: 'right', background: val > 0 ? '#f0f8fc' : '#fafafa' }} />
                  ))}
                  <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 15, padding: 0, lineHeight: 1, textAlign: 'center' }}>×</button>
                </div>
                <button onClick={() => toggleExpand(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 3, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', textAlign: 'left', border: hasLines ? '1px solid rgba(59,130,246,0.3)' : '1px dashed #d1d5db', background: isOpen ? 'rgba(59,130,246,0.08)' : hasLines ? 'rgba(59,130,246,0.05)' : '#fafafa' }}>
                  <HardHat size={13} strokeWidth={2.2} style={{ color: (isOpen || hasLines) ? '#1e40af' : '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: hasLines ? 600 : 400, color: (isOpen || hasLines) ? '#1e40af' : '#94a3b8' }}>
                    {hasLines ? `${item.defaultTaskLabourLines!.length} default labour trade${item.defaultTaskLabourLines!.length !== 1 ? 's' : ''} set — click to edit` : '+ Set default task labour trades for this item'}
                  </span>
                  {isOpen && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1e40af' }}>▲ collapse</span>}
                </button>
                {isOpen && (
                  <div style={{ padding: '6px 0 10px 0' }}>
                    <TaskLabourLinesEditor lines={item.defaultTaskLabourLines || []} onChange={(lines: TaskLabourLine[]) => onUpdate({ ...item, defaultTaskLabourLines: lines.length > 0 ? lines : undefined })} />
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={onAdd} style={{ padding: '4px 12px', border: '1px solid #4a90a4', borderRadius: 5, background: 'transparent', color: '#4a90a4', fontSize: 12, cursor: 'pointer' }}>+ Add item</button>
        {hasBuiltIn && <button onClick={onLoad} style={{ padding: '4px 12px', border: '1px solid #94a3b8', borderRadius: 5, background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>↺ Reset to {builtIn.length} built-in defaults</button>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackOfficePage() {
  const { customTemplates, getTemplate, saveJobTypeTemplate, resetJobTypeTemplate, loading } = useApp()
  const [activeSection, setActiveSection] = useState<SectionId>('job-templates')
  const [userId, setUserId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  // Incremented after every sync completes so DB-backed sections re-fetch
  // with the latest data (fixes race where SectionPhasesTasks loaded before
  // syncBackOfficeFromProduct finished inserting new rows).
  const [syncKey, setSyncKey] = useState(0)

  // Get current user then sync product structure into Back Office DB.
  // Runs on every page load — adds new phases/tasks from code, renames changed
  // items, and preserves any customer-set rates. Safe to run repeatedly.
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      setSyncing(true)
      try {
        await syncBackOfficeFromProduct(sb, data.user.id)
      } finally {
        setSyncing(false)
        setSyncKey(k => k + 1)   // signal DB-backed sections to reload
      }
    })
  }, [])

  // ── Job Templates state (unchanged) ─────────────────────────────────────────
  const [selectedJobType, setSelectedJobType] = useState<string>(JOB_TYPES[0])
  const [localTemplate, setLocalTemplate] = useState<TemplatePhaseData[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupFrom, setDupFrom] = useState('')

  useEffect(() => {
    if (!loading) { setLocalTemplate(deepClone(getTemplate(selectedJobType))); setDirty(false); setDupFrom('') }
  }, [selectedJobType, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const mainPhaseOrder = localTemplate.reduce<string[]>((acc, p) => { if (!acc.includes(p.parentPhase)) acc.push(p.parentPhase); return acc }, [])
  const isFlatTemplate = mainPhaseOrder.length === 1 && mainPhaseOrder[0] === ''
  const isCustomised = !!customTemplates[selectedJobType]
  const totalEstimatorItems = localTemplate.reduce((s, p) => s + (p.estimatorItems?.length || 0), 0)

  function handleSelectJobType(jt: string) { if (dirty && !confirm('You have unsaved changes. Discard them?')) return; setSelectedJobType(jt) }
  function handleDuplicateFrom(e: React.ChangeEvent<HTMLSelectElement>) {
    const src = e.target.value; if (!src) return
    if (!confirm(`Copy "${src}" template to "${selectedJobType}"?\n\nThis replaces the current template.`)) { setDupFrom(''); return }
    setLocalTemplate(deepClone(getTemplate(src))); setDirty(true); setDupFrom('')
  }
  async function handleSave() {
    setSaving(true)
    try { await saveJobTypeTemplate(selectedJobType, localTemplate); setDirty(false) } catch { alert('Failed to save template.') } finally { setSaving(false) }
  }
  async function handleReset() {
    if (!confirm(`Reset "${selectedJobType}" to built-in default?`)) return
    setSaving(true)
    try { await resetJobTypeTemplate(selectedJobType); setLocalTemplate(deepClone(JOB_TEMPLATES[selectedJobType] || [])); setDirty(false) } catch { alert('Failed to reset.') } finally { setSaving(false) }
  }

  function renameSubPhase(idx: number, name: string) { setLocalTemplate(prev => prev.map((p, i) => i !== idx ? p : { ...p, phase: name })); setDirty(true) }
  function renameMainPhase(oldName: string, newName: string) { setLocalTemplate(prev => prev.map(p => p.parentPhase !== oldName ? p : { ...p, parentPhase: newName })); setDirty(true) }
  function addSubPhase(parentPhase: string) {
    setLocalTemplate(prev => {
      let lastIdx = -1; for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].parentPhase === parentPhase) { lastIdx = i; break } }
      const newPhase: TemplatePhaseData = { parentPhase, phase: 'New Sub-Phase', items: defaultItems(), estimatorItems: [] }
      const next = [...prev]; next.splice(lastIdx + 1, 0, newPhase); return next
    }); setDirty(true)
  }
  function removeSubPhase(idx: number) { setLocalTemplate(prev => prev.filter((_, i) => i !== idx)); setDirty(true) }
  function addMainPhase() { const name = `Phase ${mainPhaseOrder.length + 1} – New Phase`; setLocalTemplate(prev => [...prev, { parentPhase: name, phase: 'New Sub-Phase', items: defaultItems(), estimatorItems: [] }]); setDirty(true) }
  function removeMainPhase(pp: string) { const count = localTemplate.filter(p => p.parentPhase === pp).length; if (!confirm(`Remove "${pp}" and all ${count} sub-phase${count !== 1 ? 's' : ''} under it?`)) return; setLocalTemplate(prev => prev.filter(p => p.parentPhase !== pp)); setDirty(true) }

  function loadEstimatorDefaults(phaseIdx: number, phaseName: string) { const defs = getPhaseEstimatorDefaults(phaseName); setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, estimatorItems: defs })); setDirty(true) }
  function addEstimatorItem(phaseIdx: number) { const newItem: EstimatorItemTemplate = { id: `custom-${Date.now()}`, name: 'New item', description: '', measurementType: 'quantity', unit: 'nr', labourRate: 0, materialsRate: 0, plantRate: 0, subRate: 0, otherRate: 0, wastePercent: 0 }; setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, estimatorItems: [...(p.estimatorItems || []), newItem] })); setDirty(true) }
  function updateEstimatorItem(phaseIdx: number, updated: EstimatorItemTemplate) { setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, estimatorItems: (p.estimatorItems || []).map(ei => ei.id === updated.id ? updated : ei) })); setDirty(true) }
  function removeEstimatorItem(phaseIdx: number, itemId: string) { setLocalTemplate(prev => prev.map((p, i) => i !== phaseIdx ? p : { ...p, estimatorItems: (p.estimatorItems || []).filter(ei => ei.id !== itemId) })); setDirty(true) }

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  const groups = Array.from(new Set(SECTIONS.map(s => s.group ?? '')))

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', minHeight: '80vh' }}>

      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fff', borderRadius: '10px 0 0 10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {groups.map(group => (
          <div key={group}>
            <div style={{ padding: '10px 14px 5px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group}</div>
            {SECTIONS.filter(s => (s.group ?? '') === group).map(section => {
              const active = section.id === activeSection
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '8px 14px', border: 'none', textAlign: 'left',
                    cursor: 'pointer', fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    background: active ? '#e8f4f8' : 'transparent',
                    color: active ? '#2a7090' : '#374151',
                    borderLeft: active ? '3px solid #4a90a4' : '3px solid transparent',
                    gap: 6,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14 }}>{section.icon}</span>
                    <span style={{ fontSize: 12 }}>{section.label}</span>
                  </span>
                  {section.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                      background: section.badge === 'DB' ? '#dbeafe' : '#f1f5f9',
                      color: section.badge === 'DB' ? '#1d4ed8' : '#64748b',
                      border: `1px solid ${section.badge === 'DB' ? '#bfdbfe' : '#e2e8f0'}`,
                    }}>
                      {section.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
            <span style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 3, padding: '1px 4px', fontWeight: 700, fontSize: 9 }}>DB</span> = Supabase — syncs everywhere
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '20px 24px', border: '1px solid #e2e8f0', borderLeft: 'none', borderRadius: '0 10px 10px 0', background: '#fff' }}>

        {/* ── DB-backed sections ── */}
        {activeSection === 'labour' && userId && <SectionLabour userId={userId} key={syncKey} />}
        {activeSection === 'phases-tasks' && userId && <SectionPhasesTasks userId={userId} key={syncKey} />}
        {activeSection === 'products' && userId && <SectionProducts userId={userId} />}
        {activeSection === 'plant' && userId && <SectionPlant userId={userId} />}
        {activeSection === 'takeoff-mapping' && userId && <SectionTakeoffMapping userId={userId} />}
        {activeSection === 'formula-rules' && userId && <SectionFormulaRules userId={userId} />}
        {activeSection === 'ai-mapping' && userId && <SectionAIMapping userId={userId} />}
        {activeSection === 'wall-types' && userId && <SectionWallTypes userId={userId} />}

        {!userId && ['labour','phases-tasks','products','plant','takeoff-mapping','formula-rules','ai-mapping','wall-types'].includes(activeSection) && (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Loading…</div>
        )}

        {/* ── Job Templates (existing, unchanged) ── */}
        {activeSection === 'job-templates' && (
          <>
            <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>Job Templates</h2>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ width: 196, flexShrink: 0 }}>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job Types</div>
                  {JOB_TYPES.map(jt => {
                    const active = jt === selectedJobType
                    return (
                      <button key={jt} onClick={() => handleSelectJobType(jt)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, background: active ? '#e8f4f8' : 'transparent', color: active ? '#2a7090' : '#374151', borderLeft: active ? '3px solid #4a90a4' : '3px solid transparent' }}>
                        <span>{jt}</span>
                        {!!customTemplates[jt] && <span title="Custom" style={{ color: '#7ab533', fontSize: 9 }}>●</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>{selectedJobType}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        <span style={{ color: isCustomised ? '#7ab533' : '#94a3b8' }}>{isCustomised ? '● Custom template' : '○ Built-in defaults'}</span>
                        {' · '}{localTemplate.length} phase{localTemplate.length !== 1 ? 's' : ''}
                        {' · '}{totalEstimatorItems} estimator item{totalEstimatorItems !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={dupFrom} onChange={handleDuplicateFrom} disabled={saving} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                        <option value="">Duplicate from…</option>
                        {JOB_TYPES.filter(jt => jt !== selectedJobType).map(jt => <option key={jt} value={jt}>{jt}</option>)}
                      </select>
                      {isCustomised && <button onClick={handleReset} disabled={saving} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Reset to Default</button>}
                      <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: '6px 18px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', background: dirty ? '#4a90a4' : '#cbd5e1', color: '#fff' }}>
                        {saving ? 'Saving…' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                  {dirty && <div style={{ marginTop: 8, fontSize: 12, color: '#b85c00', fontWeight: 500 }}>● Unsaved changes — click Save Template to apply</div>}
                </div>
                {loading ? <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>Loading templates…</div>
                  : mainPhaseOrder.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>
                      <p style={{ margin: '0 0 16px' }}>No phases yet.</p>
                      <button onClick={addMainPhase} style={{ padding: '8px 20px', border: 'none', borderRadius: 6, background: '#4a90a4', color: '#fff', fontSize: 13, cursor: 'pointer' }}>+ Add First Phase</button>
                    </div>
                  ) : isFlatTemplate ? (
                    <>
                      {localTemplate.map((sp, idx) => (
                        <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', marginBottom: 10, overflow: 'hidden' }}>
                          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, minWidth: 24 }}>{idx + 1}.</span>
                            <input value={sp.phase} onChange={e => renameSubPhase(idx, e.target.value)} style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, fontWeight: 600 }} />
                            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{(sp.estimatorItems?.length || 0)} items</span>
                            <button onClick={() => removeSubPhase(idx)} style={{ padding: '3px 8px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Remove</button>
                          </div>
                          <div style={{ padding: '10px 14px' }}>
                            <EstimatorEditor phase={sp} phaseIdx={idx} onLoad={() => loadEstimatorDefaults(idx, sp.phase)} onAdd={() => addEstimatorItem(idx)} onUpdate={item => updateEstimatorItem(idx, item)} onRemove={id => removeEstimatorItem(idx, id)} />
                          </div>
                        </div>
                      ))}
                      <button onClick={() => { setLocalTemplate(prev => [...prev, { parentPhase: '', phase: 'New Phase', items: defaultItems(), estimatorItems: [] }]); setDirty(true) }} style={{ width: '100%', padding: '12px 20px', border: '2px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>+ Add Phase</button>
                    </>
                  ) : (
                    <>
                      {mainPhaseOrder.map(pp => {
                        type Indexed = { tpl: TemplatePhaseData; idx: number }
                        const subPhases: Indexed[] = localTemplate.reduce<Indexed[]>((acc, p, i) => { if (p.parentPhase === pp) acc.push({ tpl: p, idx: i }); return acc }, [])
                        return (
                          <div key={pp} style={{ marginBottom: 14 }}>
                            <div style={{ background: '#2c3e50', color: '#ecf0f1', padding: '9px 14px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input value={pp} onChange={e => renameMainPhase(pp, e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', color: '#ecf0f1', fontWeight: 600, fontSize: 13, outline: 'none', minWidth: 0 }} />
                              <button onClick={() => addSubPhase(pp)} style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, color: '#e2e8f0', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>+ Sub-Phase</button>
                              <button onClick={() => removeMainPhase(pp)} style={{ padding: '3px 9px', background: 'rgba(220,50,50,0.25)', border: '1px solid rgba(220,50,50,0.45)', borderRadius: 4, color: '#fca5a5', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>×</button>
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden', background: '#fff' }}>
                              {subPhases.map(({ tpl: sp, idx: globalIdx }, spLocalIdx) => (
                                <div key={globalIdx} style={{ borderBottom: spLocalIdx < subPhases.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <input value={sp.phase} onChange={e => renameSubPhase(globalIdx, e.target.value)} style={{ flex: 1, padding: '5px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, fontWeight: 600 }} placeholder="Sub-phase name" />
                                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{(sp.estimatorItems?.length || 0)} items</span>
                                    <button onClick={() => removeSubPhase(globalIdx)} style={{ padding: '4px 10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 5, color: '#dc2626', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Remove</button>
                                  </div>
                                  <EstimatorEditor phase={sp} phaseIdx={globalIdx} onLoad={() => loadEstimatorDefaults(globalIdx, sp.phase)} onAdd={() => addEstimatorItem(globalIdx)} onUpdate={item => updateEstimatorItem(globalIdx, item)} onRemove={id => removeEstimatorItem(globalIdx, id)} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={addMainPhase} style={{ width: '100%', padding: '12px 20px', border: '2px dashed #cbd5e1', borderRadius: 8, background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>+ Add Main Phase</button>
                    </>
                  )}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
