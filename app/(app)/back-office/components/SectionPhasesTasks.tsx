'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchPhases, upsertPhase, deletePhase,
  fetchSubPhases, upsertSubPhase, deleteSubPhase,
  fetchTasks, upsertTask, deleteTask,
  fetchLabourTrades, fetchProducts, fetchPlantItems,
} from '@/lib/back-office-queries'
import type { BOPhase, BOSubPhase, BOTask, BOLabourTrade, BOProduct, BOPlantItem } from '@/lib/back-office-types'

// Phases that use FloorMakeup build-ups — tasks under these are "Construction Layers"
const BUILDUP_PHASES = new Set(['External Walls', 'Floors & Screeds', 'Foundations', 'Plastering & Boarding'])
import { TASK_UNITS } from '@/lib/back-office-types'
import { JOB_TYPES } from '@/lib/utils'
import { buildTaskRecipe, uid, plantListTotal } from '@/lib/layer-recipe'
import type { LayerCostRecord, LayerPlantItem } from '@/lib/takeoff-types'
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'

interface Props { userId: string }

const EMPTY_TASK = (userId: string, phaseId: string | null, subPhaseId: string | null, order: number): Omit<BOTask, 'id' | 'created_at' | 'updated_at'> => ({
  user_id: userId, phase_id: phaseId, sub_phase_id: subPhaseId,
  name: 'New Task', description: '', client_description: '', unit: 'item',
  default_qty: 1, labour_cost: 0, materials_cost: 0, plant_cost: 0,
  subcontract_cost: 0, waste_cost: 0, other_cost: 0, markup_pct: 0,
  trade_name: null, productivity_rate: null, active: true,
  from_takeoff: true, from_ai: false, display_order: order,
})

type TaskModalState = { task: BOTask; isNew: boolean } | null

export default function SectionPhasesTasks({ userId }: Props) {
  const sb = createClient()
  const [phases, setPhases] = useState<BOPhase[]>([])
  const [subPhases, setSubPhases] = useState<BOSubPhase[]>([])
  const [tasks, setTasks] = useState<BOTask[]>([])
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [selectedSubPhaseId, setSelectedSubPhaseId] = useState<string | null>(null)
  const [expandedSubPhases, setExpandedSubPhases] = useState<Set<string>>(new Set())
  const [editingSubPhaseId, setEditingSubPhaseId] = useState<string | null>(null)
  const [editingSubPhaseName, setEditingSubPhaseName] = useState('')
  const [loading, setLoading] = useState(true)
  const [taskModal, setTaskModal] = useState<TaskModalState>(null)
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('All')
  const [labourTrades, setLabourTrades] = useState<BOLabourTrade[]>([])
  const [products, setProducts] = useState<BOProduct[]>([])
  const [plantItems, setPlantItems] = useState<BOPlantItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [p, sp, t, lt, prods, pl] = await Promise.all([
      fetchPhases(sb, userId),
      fetchSubPhases(sb, userId),
      fetchTasks(sb, userId),
      fetchLabourTrades(sb, userId),
      fetchProducts(sb, userId),
      fetchPlantItems(sb, userId),
    ])
    setPhases(p)
    setSubPhases(sp)
    setTasks(t)
    setLabourTrades(lt.filter(l => l.active))
    setProducts(prods.filter(x => x.active))
    setPlantItems(pl.filter(x => x.active))
    if (p.length > 0 && !selectedPhaseId) setSelectedPhaseId(p[0].id)
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Phase CRUD ───────────────────────────────────────────────────────────────

  async function addPhase() {
    const phase = await upsertPhase(sb, { user_id: userId, name: 'New Phase', display_order: phases.length, active: true, job_types: [] })
    if (phase) { setPhases(prev => [...prev, phase]); setSelectedPhaseId(phase.id) }
  }

  async function renamePhase(id: string, name: string) {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    const existing = phases.find(p => p.id === id)
    await upsertPhase(sb, { ...(existing ?? {}), id, user_id: userId, name })
  }

  async function removePhase(id: string) {
    if (!confirm('Delete this phase and all its sub-phases and tasks?')) return
    await deletePhase(sb, id)
    setPhases(prev => prev.filter(p => p.id !== id))
    setSubPhases(prev => prev.filter(sp => sp.phase_id !== id))
    setTasks(prev => prev.filter(t => t.phase_id !== id))
    if (selectedPhaseId === id) setSelectedPhaseId(phases.find(p => p.id !== id)?.id ?? null)
  }

  async function duplicatePhase(phase: BOPhase) {
    const copy = await upsertPhase(sb, { user_id: userId, name: `${phase.name} (copy)`, display_order: phases.length, active: phase.active })
    if (!copy) return
    // Copy sub-phases and tasks
    const phaseSubs = subPhases.filter(sp => sp.phase_id === phase.id)
    const subIdMap: Record<string, string> = {}
    for (const sp of phaseSubs) {
      const newSp = await upsertSubPhase(sb, { user_id: userId, phase_id: copy.id, name: sp.name, display_order: sp.display_order, markup_pct: sp.markup_pct, active: sp.active })
      if (newSp) subIdMap[sp.id] = newSp.id
    }
    const phaseTasks = tasks.filter(t => t.phase_id === phase.id)
    for (const t of phaseTasks) {
      const { id: _id, created_at: _c, updated_at: _u, ...row } = t as BOTask & { created_at: string; updated_at: string }
      await upsertTask(sb, { ...row, user_id: userId, phase_id: copy.id, sub_phase_id: t.sub_phase_id ? (subIdMap[t.sub_phase_id] ?? null) : null })
    }
    await load()
    setSelectedPhaseId(copy.id)
  }

  // ── Sub-phase CRUD ───────────────────────────────────────────────────────────

  async function addSubPhase(phaseId: string) {
    const existing = subPhases.filter(sp => sp.phase_id === phaseId)
    const sp = await upsertSubPhase(sb, { user_id: userId, phase_id: phaseId, name: 'New Sub-Phase', display_order: existing.length, markup_pct: 0, active: true })
    if (sp) {
      setSubPhases(prev => [...prev, sp])
      setExpandedSubPhases(prev => new Set([...prev, sp.id]))
    }
  }

  async function renameSubPhase(id: string, name: string) {
    setSubPhases(prev => prev.map(sp => sp.id === id ? { ...sp, name } : sp))
    const sp = subPhases.find(s => s.id === id)!
    await upsertSubPhase(sb, { ...sp, name })
  }

  async function updateSubPhaseMarkup(id: string, markup_pct: number) {
    setSubPhases(prev => prev.map(sp => sp.id === id ? { ...sp, markup_pct } : sp))
    const sp = subPhases.find(s => s.id === id)!
    await upsertSubPhase(sb, { ...sp, markup_pct })
  }

  async function removeSubPhase(id: string) {
    if (!confirm('Delete this sub-phase and all its tasks?')) return
    await deleteSubPhase(sb, id)
    setSubPhases(prev => prev.filter(sp => sp.id !== id))
    setTasks(prev => prev.filter(t => t.sub_phase_id !== id))
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────────

  function openNewTask(phaseId: string, subPhaseId: string | null) {
    const existing = tasks.filter(t => t.phase_id === phaseId && t.sub_phase_id === subPhaseId)
    const newTask = { ...EMPTY_TASK(userId, phaseId, subPhaseId, existing.length), id: '', created_at: '', updated_at: '' } as BOTask
    setTaskModal({ task: newTask, isNew: true })
  }

  function openEditTask(task: BOTask) {
    setTaskModal({ task: { ...task }, isNew: false })
  }

  async function saveTaskModal() {
    if (!taskModal) return
    const taskWithRecipe = { ...taskModal.task, recipe_items: buildTaskRecipe(taskModal.task) as unknown as Record<string, unknown> }
    const saved = await upsertTask(sb, { ...taskWithRecipe, user_id: userId })
    if (saved) {
      if (taskModal.isNew) {
        setTasks(prev => [...prev, saved])
      } else {
        setTasks(prev => prev.map(t => t.id === saved.id ? saved : t))
      }
    }
    setTaskModal(null)
  }

  async function removeTask(id: string) {
    if (!confirm('Delete this task?')) return
    await deleteTask(sb, id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // Persist a single task (used by the inline per-category cost editors).
  // Rebuild recipe_items from the task so the plant list + aggregates stay in
  // sync and the Takeoff layer editor reads the same numbers.
  async function patchTask(task: BOTask) {
    const withRecipe = { ...task, recipe_items: buildTaskRecipe(task) as unknown as Record<string, unknown> }
    setTasks(prev => prev.map(t => t.id === task.id ? withRecipe : t))
    await upsertTask(sb, { ...withRecipe, user_id: userId })
  }

  async function duplicateTask(task: BOTask) {
    const copy = { ...task, id: '', name: `${task.name} (copy)`, display_order: tasks.filter(t => t.phase_id === task.phase_id && t.sub_phase_id === task.sub_phase_id).length }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, updated_at: _u, ...row } = copy as BOTask & { created_at: string; updated_at: string }
    const saved = await upsertTask(sb, { ...row, user_id: userId })
    if (saved) setTasks(prev => [...prev, saved])
  }

  async function toggleTaskActive(task: BOTask) {
    const updated = { ...task, active: !task.active }
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    await upsertTask(sb, updated)
  }

  async function updatePhaseJobTypes(phase: BOPhase, jobTypes: string[]) {
    const updated = { ...phase, job_types: jobTypes }
    setPhases(prev => prev.map(p => p.id === phase.id ? updated : p))
    await upsertPhase(sb, updated)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const filteredPhases = jobTypeFilter === 'All'
    ? phases
    : phases.filter(p => !p.job_types?.length || p.job_types.includes(jobTypeFilter))

  const selectedPhase = phases.find(p => p.id === selectedPhaseId)
  const phaseSubPhases = subPhases.filter(sp => sp.phase_id === selectedPhaseId)
  const directTasks = tasks.filter(t => t.phase_id === selectedPhaseId && !t.sub_phase_id)

  function toggleSubPhase(id: string) {
    setExpandedSubPhases(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading phases…</div>

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 600 }}>

      {/* Phase list (left) */}
      <div style={{ width: 232, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Phases ({filteredPhases.length}{jobTypeFilter !== 'All' ? `/${phases.length}` : ''})</span>
          <button onClick={addPhase} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a90a4', padding: 2 }}>
            <Plus size={16} />
          </button>
        </div>
        {/* Job type filter */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
          <select
            value={jobTypeFilter}
            onChange={e => setJobTypeFilter(e.target.value)}
            style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, color: '#374151', background: jobTypeFilter !== 'All' ? '#e8f4f8' : '#fff' }}
          >
            <option value="All">All job types</option>
            {JOB_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
          </select>
        </div>
        {filteredPhases.map(phase => {
          const spCount = subPhases.filter(sp => sp.phase_id === phase.id).length
          const tCount = tasks.filter(t => t.phase_id === phase.id).length
          const active = phase.id === selectedPhaseId
          const tagged = phase.job_types?.length > 0
          return (
            <button
              key={phase.id}
              onClick={() => { setSelectedPhaseId(phase.id); setSelectedSubPhaseId(null) }}
              style={{
                display: 'block', width: '100%', padding: '9px 14px', border: 'none', textAlign: 'left',
                cursor: 'pointer', fontSize: 13,
                fontWeight: active ? 600 : 400,
                background: active ? '#e8f4f8' : 'transparent',
                color: active ? '#2a7090' : '#374151',
                borderLeft: active ? '3px solid #4a90a4' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phase.name}</span>
                {tagged && (
                  <span title={phase.job_types.join(', ')} style={{ fontSize: 9, background: '#dbeafe', color: '#1d4ed8', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                    {phase.job_types.length}JT
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{spCount} sub · {tCount} {BUILDUP_PHASES.has(phase.name) ? 'layers' : 'tasks'}</div>
            </button>
          )
        })}
        {filteredPhases.length === 0 && (
          <div style={{ padding: '24px 14px', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
            No phases for this job type
          </div>
        )}
      </div>

      {/* Phase content (right) */}
      <div style={{ flex: 1, minWidth: 0, padding: '16px 20px' }}>
        {!selectedPhase ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>Select a phase to view its tasks</div>
        ) : (
          <>
            {/* Phase header */}
            <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input
                value={selectedPhase.name}
                onChange={e => renamePhase(selectedPhase.id, e.target.value)}
                style={{ fontSize: 18, fontWeight: 700, border: 'none', background: 'transparent', outline: 'none', flex: 1, color: '#1e293b' }}
              />
              {BUILDUP_PHASES.has(selectedPhase.name) && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                  🧱 Build-up Phase
                </span>
              )}
              <button
                onClick={() => addSubPhase(selectedPhase.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                <Plus size={13} /> Sub-Phase
              </button>
              {!BUILDUP_PHASES.has(selectedPhase.name) && (
                <button
                  onClick={() => openNewTask(selectedPhase.id, null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1d4ed8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >
                  <Plus size={13} /> Task
                </button>
              )}
              <button
                onClick={() => duplicatePhase(selectedPhase)}
                title="Duplicate this phase (with all sub-phases and tasks)"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, color: '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                ⧉ Duplicate
              </button>
              <button
                onClick={() => removePhase(selectedPhase.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 4 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {/* Job type tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Job types:</span>
              {JOB_TYPES.map(jt => {
                const on = selectedPhase.job_types?.includes(jt)
                return (
                  <button
                    key={jt}
                    onClick={() => {
                      const cur = selectedPhase.job_types ?? []
                      const next = on ? cur.filter(x => x !== jt) : [...cur, jt]
                      updatePhaseJobTypes(selectedPhase, next)
                    }}
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', fontWeight: on ? 700 : 400,
                      border: `1px solid ${on ? '#4a90a4' : '#e2e8f0'}`,
                      background: on ? '#e8f4f8' : '#f8fafc',
                      color: on ? '#2a7090' : '#94a3b8',
                    }}
                  >{jt}</button>
                )
              })}
              {(selectedPhase.job_types?.length ?? 0) === 0 && (
                <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Applies to all job types</span>
              )}
            </div>
            </div>

            {/* Direct tasks (no sub-phase) */}
            {directTasks.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Direct Tasks</div>
                <TaskTable tasks={directTasks} onEdit={openEditTask} onDelete={removeTask} onDuplicate={duplicateTask} onToggleActive={toggleTaskActive} onUpdate={patchTask} labourTrades={labourTrades} products={products} plantItems={plantItems} />
              </div>
            )}

            {/* Sub-phases */}
            {phaseSubPhases.map(sp => {
              const spTasks = tasks.filter(t => t.sub_phase_id === sp.id)
              const isOpen = expandedSubPhases.has(sp.id)
              return (
                <div key={sp.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggleSubPhase(sp.id)}>
                    {isOpen ? <ChevronDown size={15} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />}

                    {/* Sub-phase name — read-only with ✎ edit button */}
                    {editingSubPhaseId === sp.id ? (
                      <input
                        autoFocus
                        value={editingSubPhaseName}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setEditingSubPhaseName(e.target.value)}
                        onBlur={() => {
                          if (editingSubPhaseName.trim()) renameSubPhase(sp.id, editingSubPhaseName.trim())
                          setEditingSubPhaseId(null)
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.currentTarget.blur() }
                          if (e.key === 'Escape') { setEditingSubPhaseId(null) }
                        }}
                        style={{ flex: 1, border: '1.5px solid #4a90a4', borderRadius: 5, background: '#fff', fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', padding: '3px 8px', minWidth: 0 }}
                      />
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</span>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingSubPhaseId(sp.id); setEditingSubPhaseName(sp.name) }}
                          title="Rename sub-phase"
                          style={{ padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#64748b', flexShrink: 0, lineHeight: 1 }}>
                          ✎
                        </button>
                      </div>
                    )}
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                      {spTasks.length} {BUILDUP_PHASES.has(selectedPhase.name) ? 'layers' : 'tasks'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Markup</span>
                      <input
                        type="number" min={0} max={200} value={sp.markup_pct}
                        onChange={e => updateSubPhaseMarkup(sp.id, +e.target.value)}
                        style={{ width: 52, padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b' }}>%</span>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); openNewTask(selectedPhase.id, sp.id) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, color: '#1d4ed8', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                    >
                      <Plus size={11} /> {BUILDUP_PHASES.has(selectedPhase.name) ? 'Layer' : 'Task'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); removeSubPhase(sp.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2, flexShrink: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '8px 14px 12px' }}>
                      {spTasks.length > 0 ? (
                        <TaskTable tasks={spTasks} onEdit={openEditTask} onDelete={removeTask} onDuplicate={duplicateTask} onToggleActive={toggleTaskActive} onUpdate={patchTask} labourTrades={labourTrades} products={products} plantItems={plantItems} />
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
                          No {BUILDUP_PHASES.has(selectedPhase.name) ? 'construction layers' : 'tasks'} yet —
                          click <strong>+ {BUILDUP_PHASES.has(selectedPhase.name) ? 'Layer' : 'Task'}</strong> to add one
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {phaseSubPhases.length === 0 && directTasks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
                No sub-phases or tasks yet. Use the buttons above to add them.
              </div>
            )}
          </>
        )}
      </div>

      {/* Task editor modal */}
      {taskModal && (
        <TaskModal
          task={taskModal.task}
          isNew={taskModal.isNew}
          labourTrades={labourTrades}
          onChange={task => setTaskModal({ ...taskModal, task })}
          onSave={saveTaskModal}
          onCancel={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}

// ── Cost-category cards (shared palette with the quote workspace) ─────────────

const COST_META = {
  labour:      { icon: '🔨', label: 'Labour',         bg: '#fffbeb', border: '#fde68a', accent: '#92400e' },
  materials:   { icon: '📦', label: 'Materials',      bg: '#eff6ff', border: '#bfdbfe', accent: '#1d4ed8' },
  plant:       { icon: '🚜', label: 'Plant',          bg: '#faf5ff', border: '#e9d5ff', accent: '#7c3aed' },
  subcontract: { icon: '👷', label: 'Subcontractors', bg: '#fef2f2', border: '#fecaca', accent: '#991b1b' },
  waste:       { icon: '🗑', label: 'Waste',          bg: '#f8fafc', border: '#e2e8f0', accent: '#64748b' },
  other:       { icon: '📋', label: 'Other',          bg: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
} as const

type CostCat = keyof typeof COST_META
type RowCat  = Exclude<CostCat, 'waste'>

function IconChip({ m, size = 24 }: { m: { icon: string; border: string }; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 7, background: '#fff', border: `1px solid ${m.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.55 }}>
      {m.icon}
    </span>
  )
}

// Row buttons shown per task (Labour / Materials / Plant / Subcontractors / Other)
const ROW_CATS: Array<{ cat: RowCat; field: keyof BOTask }> = [
  { cat: 'labour',      field: 'labour_cost' },
  { cat: 'materials',   field: 'materials_cost' },
  { cat: 'plant',       field: 'plant_cost' },
  { cat: 'subcontract', field: 'subcontract_cost' },
  { cat: 'other',       field: 'other_cost' },
]

// ── Task list (rows: name left, cost-category card-buttons right) ─────────────

function TaskTable({ tasks, onEdit, onDelete, onDuplicate, onToggleActive, onUpdate, labourTrades, products, plantItems }: {
  tasks: BOTask[]
  onEdit: (t: BOTask) => void
  onDelete: (id: string) => void
  onDuplicate: (t: BOTask) => void
  onToggleActive: (t: BOTask) => void
  onUpdate: (t: BOTask) => void
  labourTrades: BOLabourTrade[]
  products: BOProduct[]
  plantItems: BOPlantItem[]
}) {
  const [editing, setEditing] = useState<{ taskId: string; cat: RowCat } | null>(null)
  const editingTask = editing ? tasks.find(t => t.id === editing.taskId) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map(task => (
        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', opacity: task.active ? 1 : 0.5, flexWrap: 'wrap' }}>
          {/* Left: task name */}
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
              {task.name}
              {!task.active && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>inactive</span>}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>per {task.unit}</div>
          </div>

          {/* Right: cost-category card-buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROW_CATS.map(({ cat, field }) => {
              const m   = COST_META[cat]
              const val = task[field] as number
              const on  = val > 0
              return (
                <button key={cat} type="button" onClick={() => setEditing({ taskId: task.id, cat })}
                  title={`Edit ${m.label}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', cursor: 'pointer',
                    border: `1px solid ${on ? m.border : '#e2e8f0'}`, borderRadius: 8,
                    background: on ? m.bg : '#fff', minWidth: 96,
                  }}>
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: on ? m.accent : '#94a3b8' }}>{m.label}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: on ? '#0f172a' : '#cbd5e1' }}>£{val}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Far right: actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button onClick={() => onToggleActive(task)} title={task.active ? 'Deactivate' : 'Activate'} style={{ padding: '2px 5px', border: `1px solid ${task.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: task.active ? '#f0fdf4' : '#f8fafc', color: task.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer' }}>{task.active ? '●' : '○'}</button>
            <button onClick={() => onDuplicate(task)} title="Duplicate task" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer' }}>⧉</button>
            <button onClick={() => onEdit(task)} title="Edit details (name, unit, description, markup)" style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer' }}>✏️</button>
            <button onClick={() => onDelete(task.id)} title="Delete" style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
          </div>
        </div>
      ))}

      {editing && editingTask && (
        <CategoryEditPopover
          task={editingTask}
          cat={editing.cat}
          labourTrades={labourTrades}
          products={products}
          plantItems={plantItems}
          onSave={t => { onUpdate(t); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── Per-category cost editor popup ────────────────────────────────────────────

function CategoryEditPopover({ task, cat, labourTrades, products, plantItems, onSave, onClose }: {
  task: BOTask; cat: RowCat
  labourTrades: BOLabourTrade[]; products: BOProduct[]; plantItems: BOPlantItem[]
  onSave: (t: BOTask) => void; onClose: () => void
}) {
  const m = COST_META[cat]
  const [draft, setDraft] = useState<BOTask>({ ...task })
  const setField = <K extends keyof BOTask>(k: K, v: BOTask[K]) => setDraft(d => ({ ...d, [k]: v }))

  // Plant list (stored in recipe_items.plantItems; plant_cost kept as the sum)
  const plantList: LayerPlantItem[] = ((draft.recipe_items as unknown as LayerCostRecord | null)?.plantItems) ?? []
  function setPlantList(next: LayerPlantItem[]) {
    setDraft(d => {
      const rec = (d.recipe_items as unknown as LayerCostRecord | null) ?? { labourItems: [], materialItems: [], plantItems: [], subItems: [], otherItems: [] }
      return { ...d, recipe_items: { ...rec, plantItems: next } as unknown as Record<string, unknown>, plant_cost: plantListTotal(next) }
    })
  }
  function addPlantFromMaster(id: string) {
    const pl = plantItems.find(p => p.id === id); if (!pl) return
    setPlantList([...plantList, { id: uid(), name: pl.name, unit: pl.unit, qty: 1, hireRate: pl.default_cost, total: pl.default_cost }])
  }
  function updatePlantRow(i: number, patch: Partial<LayerPlantItem>) {
    const next = plantList.map((p, idx) => idx === i ? { ...p, ...patch } : p)
    next[i].total = +((next[i].qty || 0) * (next[i].hireRate || 0)).toFixed(2)
    setPlantList(next)
  }
  function removePlantRow(i: number) { setPlantList(plantList.filter((_, idx) => idx !== i)) }

  // Labour calculator state — pre-filled from task defaults
  const matchedTrade = task.trade_name ? labourTrades.find(t => t.name === task.trade_name) : null
  const [tradeId, setTradeId]   = useState(matchedTrade?.id ?? labourTrades[0]?.id ?? '')
  const [rateType, setRateType] = useState<LabourRateType>('day')
  const [qty, setQty]           = useState(task.default_qty && task.default_qty > 0 ? task.default_qty : 1)
  const [workers, setWorkers]   = useState(1)
  const trade     = labourTrades.find(t => t.id === tradeId)
  const rate      = trade ? effectiveRate(trade, rateType) : 0
  const calcTotal = +(rate * qty * workers).toFixed(2)

  // Auto-apply whenever the calculator changes — no manual "Apply" click needed
  function autoApply(newTradeId: string, newRateType: LabourRateType, newQty: number, newWorkers: number) {
    const t = labourTrades.find(x => x.id === newTradeId)
    if (!t) return
    const newTotal = +(effectiveRate(t, newRateType) * newQty * newWorkers).toFixed(2)
    setDraft(d => ({ ...d, labour_cost: newTotal, trade_name: t.name }))
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }

  function money(field: keyof BOTask, label: string) {
    return (
      <div>
        <label style={lbl}>{label}</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8' }}>£</span>
          <input type="number" min={0} step={1} value={draft[field] as number}
            onChange={e => setField(field, +e.target.value as never)}
            style={{ ...inp, paddingLeft: 20, fontFamily: 'monospace', fontWeight: 600 }} autoFocus />
        </div>
      </div>
    )
  }

  let bodyEl: React.ReactNode = null
  if (cat === 'labour') {
    bodyEl = (
      <>
        {labourTrades.length > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 64px 64px', gap: 8 }}>
              <div>
                <label style={lbl}>Trade</label>
                <select value={tradeId} onChange={e => { setTradeId(e.target.value); autoApply(e.target.value, rateType, qty, workers) }} style={{ ...inp, fontSize: 12 }}>
                  {labourTrades.map(t => <option key={t.id} value={t.id}>{t.name} — £{t.day_rate}/day</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Rate</label>
                <select value={rateType} onChange={e => { const rt = e.target.value as LabourRateType; setRateType(rt); autoApply(tradeId, rt, qty, workers) }} style={{ ...inp, fontSize: 12 }}>
                  {(Object.keys(RATE_LABELS) as LabourRateType[]).map(rt => <option key={rt} value={rt}>{RATE_LABELS[rt]}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{QTY_LABELS[rateType]}</label>
                <input type="number" min={0} step={0.5} value={qty} onChange={e => { const q = Math.max(0, +e.target.value); setQty(q); autoApply(tradeId, rateType, q, workers) }} style={{ ...inp, fontSize: 12 }} />
              </div>
              <div>
                <label style={lbl}>Workers</label>
                <input type="number" min={1} step={1} value={workers} onChange={e => { const w = Math.max(1, +e.target.value); setWorkers(w); autoApply(tradeId, rateType, qty, w) }} style={{ ...inp, fontSize: 12 }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: m.bg, borderRadius: 6, fontSize: 12, color: m.accent }}>
              <span style={{ flex: 1 }}>{trade?.name} · £{rate.toFixed(2)}/{rateType === 'hourly' ? 'hr' : rateType === 'half_day' ? 'half-day' : 'day'} × {qty} × {workers} = </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14 }}>£{calcTotal.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: m.accent, opacity: 0.7 }}>auto-applied ✓</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
            No labour trades set up — add them in Back Office → Labour &amp; Trades, or enter a cost manually.
          </div>
        )}
        {money('labour_cost', 'Labour cost (per unit, ex-VAT)')}
      </>
    )
  } else if (cat === 'materials') {
    bodyEl = (
      <>
        <div>
          <label style={lbl}>Pick from Products (master data)</label>
          {products.length > 0 ? (
            <select value="" onChange={e => {
              const prod = products.find(p => p.id === e.target.value)
              if (prod) setDraft(d => ({ ...d, materials_cost: prod.default_cost }))
            }} style={{ ...inp, fontSize: 12 }}>
              <option value="">Select a product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — £{p.default_cost}/{p.unit}{p.supplier ? ` · ${p.supplier}` : ''}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              No products in master data — add them in Back Office → Products, or enter a cost manually.
            </div>
          )}
        </div>
        {money('materials_cost', 'Materials cost (per unit, ex-VAT)')}
      </>
    )
  } else if (cat === 'plant') {
    bodyEl = (
      <>
        <div>
          <label style={lbl}>Add from Plant &amp; Equipment library</label>
          {plantItems.length > 0 ? (
            <select value="" onChange={e => { if (e.target.value) addPlantFromMaster(e.target.value) }} style={{ ...inp, fontSize: 12 }}>
              <option value="">Select a plant item to add…</option>
              {plantItems.map(p => <option key={p.id} value={p.id}>{p.name} — £{p.default_cost}/{p.unit}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              No plant items in master data — add them in Back Office → Plant &amp; Equipment, or enter a cost manually below.
            </div>
          )}
        </div>
        {plantList.length > 0 ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 70px 64px 22px', gap: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#94a3b8' }}>
              <span>Item</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'center' }}>£/unit</span><span style={{ textAlign: 'right' }}>Total</span><span />
            </div>
            {plantList.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 70px 64px 22px', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.name} (per ${p.unit})`}>{p.name}</span>
                <input type="number" min={0} step={0.5} value={p.qty} onChange={e => updatePlantRow(i, { qty: Math.max(0, +e.target.value) })} style={{ ...inp, fontSize: 12, padding: '5px 6px', textAlign: 'center' }} />
                <input type="number" min={0} step={1} value={p.hireRate} onChange={e => updatePlantRow(i, { hireRate: Math.max(0, +e.target.value) })} style={{ ...inp, fontSize: 12, padding: '5px 6px', textAlign: 'right' }} />
                <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: '#0f172a' }}>£{p.total.toFixed(2)}</span>
                <button onClick={() => removePlantRow(i)} title="Remove" style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15, padding: 0 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 6, fontSize: 12, fontWeight: 700, color: m.accent }}>
              <span>Plant total (per task unit)</span>
              <span style={{ fontFamily: 'monospace' }}>£{plantListTotal(plantList).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          money('plant_cost', 'Plant cost (per unit, ex-VAT)')
        )}
      </>
    )
  } else if (cat === 'subcontract') {
    bodyEl = money('subcontract_cost', 'Subcontractor cost (per unit, ex-VAT)')
  } else {
    bodyEl = (
      <>
        {money('other_cost', 'Other cost (per unit, ex-VAT)')}
        {money('waste_cost', '🗑 Waste cost (per unit, ex-VAT)')}
      </>
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: m.bg, borderBottom: `1px solid ${m.border}` }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconChip m={m} />
            <span style={{ fontSize: 13, fontWeight: 800, color: m.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>{task.name}</span>
        </div>
        {/* Body */}
        <div style={{ padding: '16px', display: 'grid', gap: 12 }}>
          {bodyEl}
        </div>
        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(draft)} style={{ padding: '7px 20px', background: m.accent, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Task editor modal ─────────────────────────────────────────────────────────

// ── Labour rate helpers ────────────────────────────────────────────────────────
type LabourRateType = 'hourly' | 'half_day' | 'day'

function effectiveRate(trade: BOLabourTrade, rateType: LabourRateType): number {
  if (rateType === 'day')      return trade.day_rate
  if (rateType === 'half_day') return trade.half_day_rate_override ?? +(trade.day_rate / 2).toFixed(2)
  return +(trade.day_rate / 8).toFixed(2)
}

const RATE_LABELS: Record<LabourRateType, string> = { hourly: 'Hourly', half_day: 'Half Day', day: 'Day' }
const QTY_LABELS:  Record<LabourRateType, string> = { hourly: 'Hours', half_day: 'Half-days', day: 'Days' }

// ── Task editor modal ─────────────────────────────────────────────────────────

function TaskModal({ task, isNew, labourTrades, onChange, onSave, onCancel }: {
  task: BOTask; isNew: boolean; labourTrades: BOLabourTrade[]
  onChange: (t: BOTask) => void; onSave: () => void; onCancel: () => void
}) {
  // Labour calculator local state — pre-filled from task defaults
  const modalMatchedTrade = task.trade_name ? labourTrades.find(t => t.name === task.trade_name) : null
  const [calcTradeId, setCalcTradeId]   = useState<string>(modalMatchedTrade?.id ?? labourTrades[0]?.id ?? '')
  const [calcRateType, setCalcRateType] = useState<LabourRateType>('day')
  const [calcQty,      setCalcQty]      = useState(task.default_qty && task.default_qty > 0 ? task.default_qty : 1)
  const [calcWorkers,  setCalcWorkers]  = useState(1)
  const [labourMode,   setLabourMode]   = useState<'calculator' | 'manual'>(
    labourTrades.length > 0 ? 'calculator' : 'manual'
  )

  function set<K extends keyof BOTask>(key: K, value: BOTask[K]) { onChange({ ...task, [key]: value }) }

  // Recalculate labour_cost whenever calculator inputs change
  function applyCalc(tradeId: string, rateType: LabourRateType, qty: number, workers: number) {
    const trade = labourTrades.find(t => t.id === tradeId)
    if (!trade) return
    const rate   = effectiveRate(trade, rateType)
    const cost   = +(rate * qty * workers).toFixed(2)
    onChange({ ...task, labour_cost: cost, trade_name: trade.name })
  }

  function onCalcTradeChange(id: string) {
    setCalcTradeId(id)
    applyCalc(id, calcRateType, calcQty, calcWorkers)
  }
  function onCalcRateTypeChange(rt: LabourRateType) {
    setCalcRateType(rt)
    applyCalc(calcTradeId, rt, calcQty, calcWorkers)
  }
  function onCalcQtyChange(q: number) {
    setCalcQty(q)
    applyCalc(calcTradeId, calcRateType, q, calcWorkers)
  }
  function onCalcWorkersChange(w: number) {
    setCalcWorkers(w)
    applyCalc(calcTradeId, calcRateType, calcQty, w)
  }

  const calcTrade = labourTrades.find(t => t.id === calcTradeId)
  const calcRate  = calcTrade ? effectiveRate(calcTrade, calcRateType) : 0
  const calcTotal = +(calcRate * calcQty * calcWorkers).toFixed(2)

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }

  const simpleCards: Array<{ key: keyof BOTask; meta: typeof COST_META[keyof typeof COST_META] }> = [
    { key: 'materials_cost',   meta: COST_META.materials },
    { key: 'plant_cost',       meta: COST_META.plant },
    { key: 'subcontract_cost', meta: COST_META.subcontract },
    { key: 'waste_cost',       meta: COST_META.waste },
    { key: 'other_cost',       meta: COST_META.other },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Task' : '✏️ Edit Task'}</div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>

          {/* Name + Unit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Task Name</label>
              <input value={task.name} onChange={e => set('name', e.target.value)} style={{ ...inp, fontWeight: 600 }} />
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <select value={task.unit} onChange={e => set('unit', e.target.value)} style={inp}>
                {TASK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={lbl}>Description (internal)</label>
            <input value={task.description} onChange={e => set('description', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Client Description (quote text)</label>
            <textarea value={task.client_description} onChange={e => set('client_description', e.target.value)}
              style={{ ...inp, resize: 'vertical', minHeight: 52, fontSize: 12 }} />
          </div>

          {/* ── COSTS (card layout — matches quote workspace) ── */}
          <label style={{ ...lbl, marginBottom: 8 }}>Costs (per unit, ex-VAT)</label>

          {/* ── LABOUR card ── */}
          <div style={{ border: `1.5px solid ${COST_META.labour.border}`, borderRadius: 10, overflow: 'hidden', background: COST_META.labour.bg }}>
            {/* Labour header with mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: COST_META.labour.bg, borderBottom: `1px solid ${COST_META.labour.border}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconChip m={COST_META.labour} />
                <span style={{ fontSize: 11, fontWeight: 800, color: COST_META.labour.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Labour</span>
              </span>
              {labourTrades.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['calculator','manual'] as const).map(m => (
                    <button key={m} onClick={() => setLabourMode(m)} style={{
                      padding: '3px 10px', borderRadius: 4, border: '1px solid #f59e0b', fontSize: 11,
                      background: labourMode === m ? '#f59e0b' : 'transparent',
                      color: labourMode === m ? '#fff' : '#92400e', cursor: 'pointer', fontWeight: 600,
                    }}>
                      {m === 'calculator' ? '🔧 Calculator' : '✏️ Manual'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 12px', background: '#fff' }}>
              {labourMode === 'calculator' && labourTrades.length > 0 ? (
                <>
                  {/* Trade + Rate Type + Qty + Workers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 72px 72px', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ ...lbl, fontSize: 11 }}>Trade</label>
                      <select value={calcTradeId} onChange={e => onCalcTradeChange(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                        {labourTrades.map(t => (
                          <option key={t.id} value={t.id}>{t.name} — £{t.day_rate}/day</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...lbl, fontSize: 11 }}>Rate Type</label>
                      <select value={calcRateType} onChange={e => onCalcRateTypeChange(e.target.value as LabourRateType)} style={{ ...inp, fontSize: 12 }}>
                        {(Object.keys(RATE_LABELS) as LabourRateType[]).map(rt => (
                          <option key={rt} value={rt}>{RATE_LABELS[rt]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...lbl, fontSize: 11 }}>{QTY_LABELS[calcRateType]}</label>
                      <input type="number" min={0} step={0.5} value={calcQty}
                        onChange={e => onCalcQtyChange(Math.max(0, +e.target.value))}
                        style={{ ...inp, fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ ...lbl, fontSize: 11 }}>Workers</label>
                      <input type="number" min={1} step={1} value={calcWorkers}
                        onChange={e => onCalcWorkersChange(Math.max(1, +e.target.value))}
                        style={{ ...inp, fontSize: 12 }} />
                    </div>
                  </div>
                  {/* Calculation summary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                    <span style={{ flex: 1 }}>
                      {calcTrade?.name} · £{calcRate.toFixed(2)}/{calcRateType === 'hourly' ? 'hr' : calcRateType === 'half_day' ? 'half-day' : 'day'} × {calcQty} × {calcWorkers} worker{calcWorkers > 1 ? 's' : ''}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'monospace' }}>= £{calcTotal.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  {labourTrades.length === 0 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
                      No labour trades set up. Add trades in Back Office → Labour &amp; Trades, or enter a cost manually.
                    </div>
                  )}
                  <div>
                    <label style={{ ...lbl, fontSize: 11 }}>Labour Cost (ex-VAT)</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>£</span>
                      <input type="number" min={0} step={1} value={task.labour_cost}
                        onChange={e => set('labour_cost', +e.target.value)}
                        style={{ ...inp, paddingLeft: 18, background: '#fef3c7' }} />
                    </div>
                  </div>
                </>
              )}

              {/* Labour cost display / sync when using calculator */}
              {labourMode === 'calculator' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Saved as labour cost:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#92400e' }}>£{task.labour_cost.toFixed(2)}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>· Trade: {task.trade_name ?? '—'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Other cost cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
            {simpleCards.map(({ key, meta }) => (
              <div key={key} style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <IconChip m={meta} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: meta.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{meta.label}</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: meta.accent, opacity: 0.6 }}>£</span>
                  <input type="number" min={0} step={1}
                    value={task[key] as number}
                    onChange={e => set(key, +e.target.value)}
                    style={{ width: '100%', padding: '6px 6px 6px 18px', border: `1px solid ${meta.border}`, borderRadius: 6, fontSize: 13, background: '#fff', boxSizing: 'border-box', color: '#0f172a', fontFamily: 'monospace', fontWeight: 600 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Qty + Markup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Default Qty</label>
              <input type="number" min={0} value={task.default_qty} onChange={e => set('default_qty', +e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Markup %</label>
              <input type="number" min={0} max={200} value={task.markup_pct} onChange={e => set('markup_pct', +e.target.value)} style={inp} />
            </div>
          </div>

          {/* Flags */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={task.from_takeoff} onChange={e => set('from_takeoff', e.target.checked)} /> Available in Takeoff Tool
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={task.from_ai} onChange={e => set('from_ai', e.target.checked)} /> Available in AI Scope Writer
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={task.active} onChange={e => set('active', e.target.checked)} /> Active
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSave} style={{ padding: '8px 22px', background: '#4a90a4', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Task</button>
        </div>
      </div>
    </div>
  )
}
