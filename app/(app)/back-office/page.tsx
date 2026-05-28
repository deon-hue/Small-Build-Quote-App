'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/contexts/AppContext'
import { JOB_TYPES, JOB_TEMPLATES } from '@/lib/utils'
import {
  WALL_MAKEUPS, loadCustomWallTypes, saveCustomWallTypes,
  type FloorMakeup, type FloorLayer,
} from '@/lib/takeoff-types'
import {
  DEFAULT_DEMO_SUBPHASES, loadCustomDemoSubphases, saveCustomDemoSubphases,
  DEMO_UNITS, DEMO_UNIT_LABELS, getAllDemoSubphases,
  type DemoSubphase, type DemoTask, type DemoUnit,
} from '@/lib/demolition-data'
import {
  ALL_PHASE_SUBPHASES, loadCustomPhaseSubphases, saveCustomPhaseSubphases,
  PHASE_TASK_UNIT_LABELS,
  type PhaseSubphase, type PhaseTask, type PhaseTaskUnit,
} from '@/lib/phase-tasks'
import type { TemplatePhaseData, QuoteItem } from '@/lib/types'
import type { EstimatorItemTemplate, MeasurementType } from '@/lib/estimator'
import { MEASUREMENT_LABELS } from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import { COST_CATEGORIES } from '@/lib/costCategories'
import {
  TRADE_TYPES, BUILT_IN_TRADE_RATES, loadTradeRates, saveTradeRatesToStorage,
  getHourlyRate, getHalfDayRate,
  type TradeRate, type TaskLabourLine,
} from '@/lib/tradeRates'
import { HardHat, RotateCcw } from 'lucide-react'
import TaskLabourLinesEditor from '@/components/TaskLabourLinesEditor'

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
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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
            {COST_CATEGORIES.filter(cat => cat.id !== 'labour').map(cat => (
              <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <cat.Icon size={10} strokeWidth={2.2} />
                {cat.shortLabel}
              </span>
            ))}
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Waste%</span>
            <span />
          </div>

          {/* Item rows */}
          {items.map(item => {
            const isOpen   = expandedItems.has(item.id)
            const hasLines = (item.defaultTaskLabourLines?.length ?? 0) > 0
            return (
              <div
                key={item.id}
                style={{
                  marginBottom: 4,
                  border:       isOpen ? '1.5px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                  borderRadius: isOpen ? 6 : 0,
                  background:   isOpen ? 'rgba(59,130,246,0.02)' : 'transparent',
                }}
              >
                {/* Main grid row */}
                <div style={{ display: 'grid', gridTemplateColumns: RATE_COLS, gap: 3, alignItems: 'center' }}>
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
                  {/* Remove */}
                  <button
                    onClick={() => onRemove(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 15, padding: 0, lineHeight: 1, textAlign: 'center' }}
                  >×</button>
                </div>

                {/* Labour defaults bar — always visible below the rate row */}
                <button
                  onClick={() => toggleExpand(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', marginTop: 3,
                    padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                    textAlign: 'left',
                    border: hasLines
                      ? '1px solid rgba(59,130,246,0.3)'
                      : '1px dashed #d1d5db',
                    background: isOpen
                      ? 'rgba(59,130,246,0.08)'
                      : hasLines
                        ? 'rgba(59,130,246,0.05)'
                        : '#fafafa',
                  }}
                >
                  <HardHat
                    size={13} strokeWidth={2.2}
                    style={{ color: (isOpen || hasLines) ? '#1e40af' : '#94a3b8', flexShrink: 0 }}
                  />
                  <span style={{
                    fontSize: 11, fontWeight: hasLines ? 600 : 400,
                    color: (isOpen || hasLines) ? '#1e40af' : '#94a3b8',
                  }}>
                    {hasLines
                      ? `${item.defaultTaskLabourLines!.length} default labour trade${item.defaultTaskLabourLines!.length !== 1 ? 's' : ''} set — click to edit`
                      : '+ Set default task labour trades for this item'
                    }
                  </span>
                  {isOpen && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#1e40af' }}>▲ collapse</span>
                  )}
                </button>

                {/* Task Labour Lines editor — expands inline */}
                {isOpen && (
                  <div style={{ padding: '6px 0 10px 0' }}>
                    <TaskLabourLinesEditor
                      lines={item.defaultTaskLabourLines || []}
                      onChange={(lines: TaskLabourLine[]) =>
                        onUpdate({ ...item, defaultTaskLabourLines: lines.length > 0 ? lines : undefined })
                      }
                    />
                  </div>
                )}
              </div>
            )
          })}
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

  // Custom wall types (localStorage)
  const [customWallTypes, setCustomWallTypes] = useState<FloorMakeup[]>([])
  const [wallTypeDirty, setWallTypeDirty] = useState(false)
  const [expandedWallType, setExpandedWallType] = useState<string | null>(null)
  const [editingWallType, setEditingWallType] = useState<FloorMakeup | null>(null)
  useEffect(() => { setCustomWallTypes(loadCustomWallTypes()) }, [])

  // Demolition admin (localStorage)
  const [demoSubphases, setDemoSubphases] = useState<DemoSubphase[]>(() => {
    try { const raw = loadCustomDemoSubphases(); return raw.length ? raw : DEFAULT_DEMO_SUBPHASES.map(s => ({ ...s })) } catch { return DEFAULT_DEMO_SUBPHASES.map(s => ({ ...s })) }
  })
  const [expandedDemoSub, setExpandedDemoSub] = useState<string | null>(null)
  const [editingDemoTask, setEditingDemoTask] = useState<{ subphaseId: string; task: DemoTask } | null>(null)

  function saveDemoSubphases(subs: DemoSubphase[]) {
    setDemoSubphases(subs)
    saveCustomDemoSubphases(subs)
  }
  function updateDemoSubMarkup(id: string, pct: number) {
    saveDemoSubphases(demoSubphases.map(s => s.id === id ? { ...s, markupPct: pct } : s))
  }
  function toggleDemoTask(subId: string, taskId: string, field: 'showInTakeoff' | 'showInAiScope') {
    saveDemoSubphases(demoSubphases.map(s => s.id !== subId ? s : {
      ...s, tasks: s.tasks.map(t => t.id !== taskId ? t : { ...t, [field]: !t[field] }),
    }))
  }
  function saveDemoTaskEdit() {
    if (!editingDemoTask) return
    saveDemoSubphases(demoSubphases.map(s => s.id !== editingDemoTask.subphaseId ? s : {
      ...s, tasks: s.tasks.map(t => t.id === editingDemoTask.task.id ? editingDemoTask.task : t),
    }))
    setEditingDemoTask(null)
  }
  function addCustomDemoTask(subId: string) {
    const newTask: DemoTask = {
      id: 'custom_' + Math.random().toString(36).slice(2, 8),
      name: 'New Custom Task',
      clientDescription: '',
      unit: 'item', defaultQty: 1,
      labourCost: 0, materialCost: 0, plantCost: 0, wasteCost: 0, subcontractorCost: 0, otherCost: 0,
      showInTakeoff: true, showInAiScope: false,
    }
    saveDemoSubphases(demoSubphases.map(s => s.id !== subId ? s : { ...s, tasks: [...s.tasks, newTask] }))
    setEditingDemoTask({ subphaseId: subId, task: newTask })
  }
  function deleteDemoTask(subId: string, taskId: string) {
    if (!confirm('Delete this task?')) return
    saveDemoSubphases(demoSubphases.map(s => s.id !== subId ? s : { ...s, tasks: s.tasks.filter(t => t.id !== taskId) }))
  }

  // ── Phase Task admin (localStorage) ──────────────────────────────────────
  const [phaseTaskSubs, setPhaseTaskSubs] = useState<PhaseSubphase[]>(() => {
    try {
      const custom = loadCustomPhaseSubphases()
      // Merge custom overrides over defaults
      return ALL_PHASE_SUBPHASES.map(d => custom.find(c => c.id === d.id) ?? d)
    } catch { return ALL_PHASE_SUBPHASES.map(s => ({ ...s })) }
  })
  const [phaseTaskFilter, setPhaseTaskFilter] = useState<string>('Structural Frame')
  const [expandedPhaseSub, setExpandedPhaseSub] = useState<string | null>(null)
  const [editingPhaseTask, setEditingPhaseTask] = useState<{ subphaseId: string; task: PhaseTask } | null>(null)

  function savePhaseTaskSubs(subs: PhaseSubphase[]) {
    setPhaseTaskSubs(subs)
    saveCustomPhaseSubphases(subs.filter(s => {
      const def = ALL_PHASE_SUBPHASES.find(d => d.id === s.id)
      return def ? JSON.stringify(s) !== JSON.stringify(def) : true
    }))
  }
  function updatePhaseSubMarkup(id: string, pct: number) {
    savePhaseTaskSubs(phaseTaskSubs.map(s => s.id === id ? { ...s, markupPct: pct } : s))
  }
  function savePhaseTaskEdit() {
    if (!editingPhaseTask) return
    savePhaseTaskSubs(phaseTaskSubs.map(s => s.id !== editingPhaseTask.subphaseId ? s : {
      ...s, tasks: s.tasks.map(t => t.id === editingPhaseTask.task.id ? editingPhaseTask.task : t),
    }))
    setEditingPhaseTask(null)
  }
  function addCustomPhaseTask(subId: string) {
    const newTask: PhaseTask = {
      id: `custom-${Date.now()}`,
      name: 'New Task',
      unit: 'nr',
      defaultQty: 1,
      labour: 0, materials: 0, plant: 0, subcontractor: 0, other: 0,
      notes: '',
      visible: true,
    }
    savePhaseTaskSubs(phaseTaskSubs.map(s => s.id !== subId ? s : { ...s, tasks: [...s.tasks, newTask] }))
    setEditingPhaseTask({ subphaseId: subId, task: newTask })
  }
  function deletePhaseTask(subId: string, taskId: string) {
    if (!confirm('Delete this task?')) return
    savePhaseTaskSubs(phaseTaskSubs.map(s => s.id !== subId ? s : { ...s, tasks: s.tasks.filter(t => t.id !== taskId) }))
  }

  function saveWallTypes(types: FloorMakeup[]) {
    setCustomWallTypes(types)
    saveCustomWallTypes(types)
    setWallTypeDirty(false)
  }

  function deleteCustomWallType(id: string) {
    if (!confirm('Delete this custom wall type?')) return
    const updated = customWallTypes.filter(t => t.id !== id)
    saveWallTypes(updated)
  }

  function startNewWallType() {
    const newType: FloorMakeup = {
      id: 'custom_' + Math.random().toString(36).slice(2, 8),
      name: 'New Custom Wall Type',
      clientDescription: '',
      labourHrsPerM2: 3.0,
      wastePercent: 10,
      layers: [
        { id: 'cl_labour',   name: 'Labour', thickness: 0,   unit: 'm²', qtyType: 'area', description: '', category: 'labour',    defaultEnabled: true },
        { id: 'cl_mat',      name: 'Main materials', thickness: 0, unit: 'm²', qtyType: 'area', description: '', category: 'materials', defaultEnabled: true },
      ],
    }
    setEditingWallType(newType)
  }

  function saveEditingWallType() {
    if (!editingWallType) return
    const exists = customWallTypes.find(t => t.id === editingWallType.id)
    const updated = exists
      ? customWallTypes.map(t => t.id === editingWallType.id ? editingWallType : t)
      : [...customWallTypes, editingWallType]
    saveWallTypes(updated)
    setEditingWallType(null)
  }

  function addLayerToEditingType() {
    if (!editingWallType) return
    const newLayer: FloorLayer = {
      id: 'cl_' + Math.random().toString(36).slice(2, 8),
      name: 'New Layer',
      thickness: 0,
      unit: 'm²',
      qtyType: 'area',
      description: '',
      category: 'materials',
      defaultEnabled: true,
    }
    setEditingWallType({ ...editingWallType, layers: [...editingWallType.layers, newLayer] })
  }

  function updateEditingLayer(layerIdx: number, changes: Partial<FloorLayer>) {
    if (!editingWallType) return
    const newLayers = editingWallType.layers.map((l, i) => i === layerIdx ? { ...l, ...changes } : l)
    setEditingWallType({ ...editingWallType, layers: newLayers })
  }

  function removeEditingLayer(layerIdx: number) {
    if (!editingWallType) return
    setEditingWallType({ ...editingWallType, layers: editingWallType.layers.filter((_, i) => i !== layerIdx) })
  }

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

      {/* ── Card header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HardHat size={18} strokeWidth={2} style={{ color: '#3b82f6' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Trade Labour Rates</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Day rate is the master rate. Half-day and hourly are auto-calculated (Day ÷ 2 and Day ÷ 8).
              Half-day can be manually overridden. These are cost rates before markup.
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
        <div style={{ fontSize: 12, color: '#b85c00', fontWeight: 500, marginBottom: 10, marginTop: 6 }}>
          ● Unsaved changes — click Save Rates to apply
        </div>
      )}

      {/* ── Column headers ─────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '140px 110px 140px 110px 110px',
        gap: 8, padding: '8px 12px',
        borderBottom: '2px solid #e2e8f0',
        borderTop: '1px solid #f1f5f9',
        marginTop: 12,
      }}>
        {[
          { label: 'Trade',              hint: ''                              },
          { label: 'Day Rate',           hint: '(£/day) — master rate'        },
          { label: 'Half-Day Rate',      hint: '(auto = Day ÷ 2)'             },
          { label: 'Hourly Rate',        hint: '(auto = Day ÷ 8)'             },
          { label: 'Default Markup',     hint: '(% applied to new trades)'    },
        ].map(({ label, hint }) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            {hint && <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>{hint}</div>}
          </div>
        ))}
      </div>

      {/* ── Rate rows ──────────────────────────────────────────────── */}
      {TRADE_TYPES.map(trade => {
        const row         = tradeRates.find(r => r.trade === trade) ?? BUILT_IN_TRADE_RATES.find(r => r.trade === trade)!
        const autoHalf    = +(row.dayRate / 2).toFixed(2)
        const calcHourly  = getHourlyRate(row.dayRate)
        const halfValue   = getHalfDayRate(row.dayRate, row.halfDayRateOverride)
        const halfOverrid = row.halfDayRateOverride != null

        function setField(patch: Partial<TradeRate>) {
          setTradeRates(prev => prev.map(r => r.trade === trade ? { ...r, ...patch } : r))
          setTradeRatesDirty(true)
        }

        return (
          <div key={trade} style={{
            display: 'grid',
            gridTemplateColumns: '140px 110px 140px 110px 110px',
            gap: 8, padding: '9px 12px', alignItems: 'center',
            borderBottom: '1px solid #f1f5f9',
          }}>

            {/* Trade name */}
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{trade}</span>

            {/* Day Rate — PRIMARY */}
            <input
              type="number" value={row.dayRate} min={0} step={5}
              onChange={e => setField({ dayRate: Math.max(0, Number(e.target.value)) })}
              style={{
                padding: '6px 8px', border: '1.5px solid #3b82f6', borderRadius: 5,
                fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
                background: '#eff6ff', maxWidth: 100, fontWeight: 700,
              }}
            />

            {/* Half-Day Rate — auto or overridden */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input
                type="number" value={halfValue} min={0} step={5}
                onChange={e => {
                  const v = Math.max(0, Number(e.target.value))
                  // If the user sets it to the auto value, clear the override
                  setField({ halfDayRateOverride: v === autoHalf ? undefined : v })
                }}
                style={{
                  padding: '6px 8px', maxWidth: 80,
                  border: halfOverrid
                    ? '1.5px solid rgba(234,179,8,0.7)'
                    : '1px solid #e2e8f0',
                  borderRadius: 5,
                  fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
                  background: halfOverrid ? '#fffbeb' : '#f8fafc',
                }}
              />
              {halfOverrid ? (
                <button
                  onClick={() => setField({ halfDayRateOverride: undefined })}
                  title="Clear override — revert to Day ÷ 2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 2 }}
                >
                  <RotateCcw size={12} strokeWidth={2.5} />
                </button>
              ) : (
                <span style={{
                  fontSize: 9, color: '#94a3b8', background: '#f1f5f9',
                  border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 5px',
                  fontWeight: 700, letterSpacing: '0.3px',
                }}>AUTO</span>
              )}
            </div>

            {/* Hourly Rate — always calculated, read-only */}
            <div style={{
              padding: '6px 8px', borderRadius: 5,
              background: '#f8fafc', border: '1px solid #e2e8f0',
              fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
              color: '#64748b', maxWidth: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
            }}>
              £{calcHourly.toFixed(2)}
              <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 4px', fontWeight: 700 }}>AUTO</span>
            </div>

            {/* Default Markup % */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number" value={row.defaultMarkup} min={0} max={100} step={1}
                onChange={e => setField({ defaultMarkup: Math.max(0, Number(e.target.value)) })}
                style={{
                  padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
                  fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace',
                  background: '#fafafa', maxWidth: 70,
                }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>%</span>
            </div>
          </div>
        )
      })}

      {/* ── Formula reminder ── */}
      <div style={{
        padding: '10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
        fontSize: 11, color: '#64748b', display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <span>📐 Standard day = 8 hours</span>
        <span>Hourly = Day ÷ 8</span>
        <span>Half-Day = Day ÷ 2 (auto) or manually set</span>
        <span>Rates are cost prices before markup</span>
      </div>
    </div>

    {/* ── Wall Type Configurations ──────────────────────────────────────────── */}
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🧱 External Wall Types</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            UK-standard external wall build-ups for estimating. Built-in types are read-only. Add custom types below.
          </div>
          <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '5px 10px', marginTop: 8, maxWidth: 600 }}>
            ⚠️ Wall make-up is for estimating purposes only and should be confirmed against drawings, structural design and Building Control requirements.
          </div>
        </div>
        <button
          onClick={startNewWallType}
          style={{ padding: '8px 18px', background: '#16a085', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add Custom Wall Type
        </button>
      </div>

      {/* ── Built-in wall types (read-only, expandable) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Built-in Types ({WALL_MAKEUPS.length})
        </div>
        {WALL_MAKEUPS.map(wt => (
          <div key={wt.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedWallType(expandedWallType === wt.id ? null : wt.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'left',
              }}
            >
              <span>🧱 {wt.name}</span>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                {wt.layers.length} layers · ~{wt.labourHrsPerM2}hrs/m² {expandedWallType === wt.id ? '▲' : '▼'}
              </span>
            </button>
            {expandedWallType === wt.id && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontStyle: 'italic' }}>{wt.clientDescription}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      {['Layer', 'Thickness', 'Qty Type', 'Category', 'Description'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wt.layers.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 500, color: '#1e293b' }}>{l.name}</td>
                        <td style={{ padding: '5px 8px', color: '#64748b' }}>{l.thickness > 0 ? `${l.thickness}mm` : '—'}</td>
                        <td style={{ padding: '5px 8px', color: '#64748b' }}>{l.qtyType}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                            background: l.category === 'labour' ? '#fef3c7' : l.category === 'materials' ? '#dbeafe' : l.category === 'other' ? '#f1f5f9' : '#f3e8ff',
                            color: l.category === 'labour' ? '#92400e' : l.category === 'materials' ? '#1d4ed8' : l.category === 'other' ? '#475569' : '#7e22ce',
                          }}>{l.category}</span>
                        </td>
                        <td style={{ padding: '5px 8px', color: '#64748b', fontSize: 11 }}>{l.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Custom wall types ── */}
      {customWallTypes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Custom Types ({customWallTypes.length})
          </div>
          {customWallTypes.map(wt => (
            <div key={wt.id} style={{ border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#eff6ff',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e3a8a' }}>★ {wt.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>{wt.layers.length} layers</span>
                  <button onClick={() => setEditingWallType({ ...wt })}
                    style={{ padding: '3px 10px', background: '#3b82f6', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                  <button onClick={() => deleteCustomWallType(wt.id)}
                    style={{ padding: '3px 10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 5, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {customWallTypes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
          No custom wall types yet. Click <strong>+ Add Custom Wall Type</strong> to create one.
        </div>
      )}
    </div>

    {/* ── Custom Wall Type Editor Modal ─────────────────────────────────────── */}
    {editingWallType && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px', overflowY: 'auto',
      }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {customWallTypes.find(t => t.id === editingWallType.id) ? '✏️ Edit' : '+ New'} Custom Wall Type
            </div>
            <button onClick={() => setEditingWallType(null)}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>

          <div style={{ padding: '20px 24px' }}>
            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Wall Type Name</label>
              <input
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, fontWeight: 600 }}
                value={editingWallType.name}
                onChange={e => setEditingWallType({ ...editingWallType, name: e.target.value })}
                placeholder="e.g. ICF Wall (Insulated Concrete Form)"
              />
            </div>

            {/* Client description */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Client Description (used in quote text)</label>
              <textarea
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', minHeight: 64 }}
                value={editingWallType.clientDescription}
                onChange={e => setEditingWallType({ ...editingWallType, clientDescription: e.target.value })}
                placeholder="Supply and construct wall including..."
              />
            </div>

            {/* Labour hrs / waste % */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Labour hrs/m² (indicative)</label>
                <input type="number" min={0} step={0.1}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingWallType.labourHrsPerM2}
                  onChange={e => setEditingWallType({ ...editingWallType, labourHrsPerM2: +e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Waste % (material allowance)</label>
                <input type="number" min={0} max={50} step={1}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingWallType.wastePercent}
                  onChange={e => setEditingWallType({ ...editingWallType, wastePercent: +e.target.value })} />
              </div>
            </div>

            {/* Layers */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Layers</label>
                <button onClick={addLayerToEditingType}
                  style={{ padding: '4px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, color: '#166534', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  + Add Layer
                </button>
              </div>

              {/* Layer column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px 32px', gap: 6, padding: '4px 0', borderBottom: '1px solid #e2e8f0', marginBottom: 6 }}>
                {['Layer Name', 'Thick (mm)', 'Qty Type', 'Category', ''].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>

              {editingWallType.layers.map((layer, li) => (
                <div key={layer.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px 32px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 13 }}
                    value={layer.name}
                    onChange={e => updateEditingLayer(li, { name: e.target.value })}
                    placeholder="Layer name"
                  />
                  <input type="number" min={0}
                    style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 13, textAlign: 'right' }}
                    value={layer.thickness}
                    onChange={e => updateEditingLayer(li, { thickness: +e.target.value })}
                  />
                  <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }}
                    value={layer.qtyType}
                    onChange={e => updateEditingLayer(li, { qtyType: e.target.value as FloorLayer['qtyType'] })}>
                    <option value="area">area (m²)</option>
                    <option value="volume">volume (m³)</option>
                    <option value="perimeter">perimeter (lm)</option>
                    <option value="count">count (nr)</option>
                  </select>
                  <select style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }}
                    value={layer.category}
                    onChange={e => updateEditingLayer(li, { category: e.target.value as FloorLayer['category'] })}>
                    <option value="labour">Labour</option>
                    <option value="materials">Materials</option>
                    <option value="plant">Plant</option>
                    <option value="other">Other</option>
                  </select>
                  <button onClick={() => removeEditingLayer(li)}
                    style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 5, color: '#dc2626', fontSize: 14, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>×</button>
                </div>
              ))}

              {editingWallType.layers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '12px 0' }}>No layers — click + Add Layer</div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button onClick={() => setEditingWallType(null)}
              style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={saveEditingWallType}
              style={{ padding: '8px 22px', background: '#16a085', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Save Wall Type
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ── Demolition Admin ─────────────────────────────────────────────────── */}
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🔨 Demolition / Strip Out</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Default tasks, unit rates, markup and visibility for the demolition takeoff tool.
          </div>
        </div>
        <button
          style={{ padding: '7px 16px', background: '#e74c3c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          onClick={() => { if (confirm('Reset all demolition tasks to factory defaults?')) saveDemoSubphases(DEFAULT_DEMO_SUBPHASES.map(s => ({ ...s }))) }}>
          ↺ Reset to Defaults
        </button>
      </div>

      {demoSubphases.map(sub => (
        <div key={sub.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
          {/* Subphase header */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setExpandedDemoSub(expandedDemoSub === sub.id ? null : sub.id)}>
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{expandedDemoSub === sub.id ? '▾' : '▸'} {sub.name}</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>{sub.tasks.length} tasks</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Markup</span>
              <input type="number" min={0} max={200} step={1}
                style={{ width: 58, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, fontWeight: 700, color: '#e74c3c' }}
                value={sub.markupPct}
                onChange={e => updateDemoSubMarkup(sub.id, Math.max(0, +e.target.value || 0))}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>%</span>
            </div>
          </div>

          {/* Subphase tasks */}
          {expandedDemoSub === sub.id && (
            <div style={{ padding: '0 14px 12px' }}>
              {sub.warnings && sub.warnings.length > 0 && (
                <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginTop: 10, marginBottom: 8, lineHeight: 1.5 }}>
                  {sub.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#475569' }}>Task</th>
                    <th style={{ textAlign: 'center', padding: '6px 6px', fontWeight: 600, color: '#475569', width: 56 }}>Unit</th>
                    <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600, color: '#475569', width: 68 }}>Labour/u</th>
                    <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600, color: '#475569', width: 68 }}>Plant/u</th>
                    <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600, color: '#475569', width: 68 }}>Waste/u</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#475569', width: 44 }}>Takeoff</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, color: '#475569', width: 44 }}>AI</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sub.tasks.map(task => (
                    <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 8px', color: '#1e293b' }}>{task.name}</td>
                      <td style={{ textAlign: 'center', padding: '7px 6px', color: '#64748b' }}>{DEMO_UNIT_LABELS[task.unit]}</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px', fontFamily: 'monospace', color: '#334155' }}>£{task.labourCost}</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px', fontFamily: 'monospace', color: '#334155' }}>£{task.plantCost}</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px', fontFamily: 'monospace', color: '#334155' }}>£{task.wasteCost}</td>
                      <td style={{ textAlign: 'center', padding: '7px 4px' }}>
                        <input type="checkbox" checked={task.showInTakeoff} onChange={() => toggleDemoTask(sub.id, task.id, 'showInTakeoff')} />
                      </td>
                      <td style={{ textAlign: 'center', padding: '7px 4px' }}>
                        <input type="checkbox" checked={task.showInAiScope} onChange={() => toggleDemoTask(sub.id, task.id, 'showInAiScope')} />
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        <button
                          onClick={() => setEditingDemoTask({ subphaseId: sub.id, task: { ...task } })}
                          style={{ padding: '3px 8px', fontSize: 11, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, color: '#1d4ed8', cursor: 'pointer', marginRight: 4 }}>✏️</button>
                        <button
                          onClick={() => deleteDemoTask(sub.id, task.id)}
                          style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#dc2626', cursor: 'pointer' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => addCustomDemoTask(sub.id)}
                style={{ marginTop: 8, padding: '5px 14px', fontSize: 12, background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 6, color: '#64748b', cursor: 'pointer' }}>
                + Add Task to {sub.name}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    {/* ── Phase Tasks Admin ─────────────────────────────────────────────────── */}
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🏗️ Phase Task Rates</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Default tasks, UK 2024 rates, markup and visibility for each takeoff phase.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={phaseTaskFilter}
            onChange={e => { setPhaseTaskFilter(e.target.value); setExpandedPhaseSub(null) }}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          >
            {Array.from(new Set(ALL_PHASE_SUBPHASES.map(s => s.phase))).map(ph => (
              <option key={ph} value={ph}>{ph}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!confirm(`Reset all ${phaseTaskFilter} tasks to built-in defaults?`)) return
              const defaults = ALL_PHASE_SUBPHASES.filter(s => s.phase === phaseTaskFilter).map(s => ({ ...s }))
              savePhaseTaskSubs(phaseTaskSubs.map(s => s.phase === phaseTaskFilter ? (defaults.find(d => d.id === s.id) ?? s) : s))
            }}
            style={{ padding: '6px 14px', border: '1px solid #e74c3c', borderRadius: 6, background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <RotateCcw size={13} /> Reset Phase
          </button>
        </div>
      </div>

      {phaseTaskSubs.filter(s => s.phase === phaseTaskFilter).map(sub => (
        <div key={sub.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
          {/* Subphase header */}
          <div
            onClick={() => setExpandedPhaseSub(expandedPhaseSub === sub.id ? null : sub.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{sub.name}</span>
              <span style={{ fontSize: 11, background: '#e2e8f0', color: '#64748b', borderRadius: 99, padding: '1px 8px' }}>
                {sub.tasks.length} tasks
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 12, color: '#64748b' }}>
                Markup:&nbsp;
                <input
                  type="number" min={0} max={200}
                  value={sub.markupPct}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updatePhaseSubMarkup(sub.id, +e.target.value)}
                  style={{ width: 55, padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}
                />
                %
              </label>
              <span style={{ fontSize: 18, color: '#94a3b8' }}>{expandedPhaseSub === sub.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {/* Tasks table */}
          {expandedPhaseSub === sub.id && (
            <div style={{ padding: '0 16px 14px' }}>
              {sub.ukWarning && (
                <div style={{ background: '#fffbe6', border: '1px solid #f59e0b', borderRadius: 6, padding: '6px 10px', marginTop: 10, fontSize: 11.5, color: '#92400e' }}>
                  ⚠️ {sub.ukWarning}
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                <thead>
                  <tr style={{ color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Task</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center' }}>Unit</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Labour</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Materials</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Plant</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Sub</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Other</th>
                    <th style={{ padding: '4px 4px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sub.tasks.map(task => (
                    <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 6px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{task.name}</div>
                        {task.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{task.notes}</div>}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', color: '#64748b' }}>/{task.unit}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: task.labour  > 0 ? '#f39c12' : '#cbd5e1' }}>£{task.labour.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: task.materials > 0 ? '#3498db' : '#cbd5e1' }}>£{task.materials.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: task.plant > 0 ? '#9b59b6' : '#cbd5e1' }}>£{task.plant.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: task.subcontractor > 0 ? '#e74c3c' : '#cbd5e1' }}>£{task.subcontractor.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', color: task.other > 0 ? '#95a5a6' : '#cbd5e1' }}>£{task.other.toFixed(0)}</td>
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        <button
                          onClick={() => setEditingPhaseTask({ subphaseId: sub.id, task: { ...task } })}
                          style={{ padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer' }}
                        >✏️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => addCustomPhaseTask(sub.id)}
                style={{ marginTop: 10, padding: '5px 14px', border: '1px solid #0277bd', borderRadius: 6, background: 'transparent', color: '#0277bd', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                + Add Custom Task
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    {/* ── Demolition Task Editor Modal ──────────────────────────────────────── */}
    {editingDemoTask && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>✏️ Edit Demolition Task</div>
            <button onClick={() => setEditingDemoTask(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Task Name</label>
              <input style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                value={editingDemoTask.task.name}
                onChange={e => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, name: e.target.value } })}
              />
            </div>
            {/* Client Description */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Client Description (quote text)</label>
              <textarea style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, resize: 'vertical', minHeight: 60 }}
                value={editingDemoTask.task.clientDescription}
                onChange={e => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, clientDescription: e.target.value } })}
              />
            </div>
            {/* Unit + Default Qty */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Default Unit</label>
                <select style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingDemoTask.task.unit}
                  onChange={e => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, unit: e.target.value as DemoUnit } })}>
                  {DEMO_UNITS.map(u => <option key={u} value={u}>{DEMO_UNIT_LABELS[u]} ({u})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Default Qty</label>
                <input type="number" min={0} step={0.5} style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingDemoTask.task.defaultQty}
                  onChange={e => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, defaultQty: +e.target.value || 1 } })}
                />
              </div>
            </div>
            {/* Default costs per unit */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Default Costs (per unit, ex-VAT)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { label: '🔨 Labour',         key: 'labourCost'        },
                  { label: '📦 Materials',       key: 'materialCost'      },
                  { label: '🚜 Plant',           key: 'plantCost'         },
                  { label: '🗑 Waste / Skips',   key: 'wasteCost'         },
                  { label: '👷 Subcontractor',   key: 'subcontractorCost' },
                  { label: '📋 Other',           key: 'otherCost'         },
                ] as { label: string; key: keyof DemoTask }[]).map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>£</span>
                      <input type="number" min={0} step={1}
                        style={{ width: '100%', padding: '5px 8px 5px 18px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                        value={editingDemoTask.task[key] as number}
                        onChange={e => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, [key]: Math.max(0, +e.target.value || 0) } })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visibility toggles */}
            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editingDemoTask.task.showInTakeoff}
                  onChange={() => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, showInTakeoff: !editingDemoTask.task.showInTakeoff } })} />
                Show in Takeoff Tool
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editingDemoTask.task.showInAiScope}
                  onChange={() => setEditingDemoTask({ ...editingDemoTask, task: { ...editingDemoTask.task, showInAiScope: !editingDemoTask.task.showInAiScope } })} />
                Show in AI Scope Writer
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button onClick={() => setEditingDemoTask(null)}
              style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={saveDemoTaskEdit}
              style={{ padding: '8px 22px', background: '#e74c3c', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Save Task
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Phase Task Editor Modal ────────────────────────────────────────────── */}
    {editingPhaseTask && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
        <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>✏️ Edit Phase Task</div>
            <button onClick={() => setEditingPhaseTask(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Task Name</label>
              <input style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                value={editingPhaseTask.task.name}
                onChange={e => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, name: e.target.value } })}
              />
            </div>
            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Estimator Notes</label>
              <textarea style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, resize: 'vertical', minHeight: 52 }}
                value={editingPhaseTask.task.notes ?? ''}
                onChange={e => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, notes: e.target.value } })}
              />
            </div>
            {/* Unit + defaultQty */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Unit</label>
                <select style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingPhaseTask.task.unit}
                  onChange={e => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, unit: e.target.value as PhaseTaskUnit } })}
                >
                  {(Object.entries(PHASE_TASK_UNIT_LABELS) as [PhaseTaskUnit, string][]).map(([u, l]) => (
                    <option key={u} value={u}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Default Qty</label>
                <input type="number" min={0} step={0.5} style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                  value={editingPhaseTask.task.defaultQty}
                  onChange={e => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, defaultQty: +e.target.value || 1 } })}
                />
              </div>
            </div>
            {/* Default costs per unit */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Default Costs (per unit, ex-VAT)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { label: '🔨 Labour',       key: 'labour'        },
                  { label: '📦 Materials',     key: 'materials'     },
                  { label: '🚜 Plant',         key: 'plant'         },
                  { label: '👷 Subcontractor', key: 'subcontractor' },
                  { label: '📋 Other',         key: 'other'         },
                ] as { label: string; key: keyof PhaseTask }[]).map(({ label, key }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</label>
                    <input type="number" min={0} step={1} style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 13 }}
                      value={editingPhaseTask.task[key] as number ?? 0}
                      onChange={e => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, [key]: +e.target.value } })}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Visibility */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox"
                checked={editingPhaseTask.task.visible !== false}
                onChange={() => setEditingPhaseTask({ ...editingPhaseTask, task: { ...editingPhaseTask.task, visible: !(editingPhaseTask.task.visible !== false) } })}
              />
              Show in Takeoff Tool
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button
              onClick={() => { deletePhaseTask(editingPhaseTask.subphaseId, editingPhaseTask.task.id); setEditingPhaseTask(null) }}
              style={{ padding: '8px 14px', border: '1px solid #e74c3c', borderRadius: 6, fontSize: 13, background: '#fff', color: '#e74c3c', cursor: 'pointer' }}
            >
              🗑 Delete
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingPhaseTask(null)}
                style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={savePhaseTaskEdit}
                style={{ padding: '8px 22px', background: '#0277bd', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Save Task
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
