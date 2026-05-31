'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchPhases, upsertPhase, deletePhase,
  fetchSubPhases, upsertSubPhase, deleteSubPhase,
  fetchTasks, upsertTask, deleteTask,
  fetchLabourTrades,
} from '@/lib/back-office-queries'
import type { BOPhase, BOSubPhase, BOTask, BOLabourTrade } from '@/lib/back-office-types'
import { TASK_UNITS } from '@/lib/back-office-types'
import { JOB_TYPES } from '@/lib/utils'
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
  const [loading, setLoading] = useState(true)
  const [taskModal, setTaskModal] = useState<TaskModalState>(null)
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('All')
  const [labourTrades, setLabourTrades] = useState<BOLabourTrade[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [p, sp, t, lt] = await Promise.all([
      fetchPhases(sb, userId),
      fetchSubPhases(sb, userId),
      fetchTasks(sb, userId),
      fetchLabourTrades(sb, userId),
    ])
    setPhases(p)
    setSubPhases(sp)
    setTasks(t)
    setLabourTrades(lt.filter(l => l.active))
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
    const saved = await upsertTask(sb, { ...taskModal.task, user_id: userId })
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
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{spCount} sub · {tCount} tasks</div>
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
              <button
                onClick={() => addSubPhase(selectedPhase.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                <Plus size={13} /> Sub-Phase
              </button>
              <button
                onClick={() => openNewTask(selectedPhase.id, null)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1d4ed8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                <Plus size={13} /> Task
              </button>
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
                <TaskTable tasks={directTasks} onEdit={openEditTask} onDelete={removeTask} onDuplicate={duplicateTask} onToggleActive={toggleTaskActive} />
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
                    <input
                      value={sp.name}
                      onClick={e => e.stopPropagation()}
                      onChange={e => renameSubPhase(sp.id, e.target.value)}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', minWidth: 0 }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{spTasks.length} tasks</span>
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
                      <Plus size={11} /> Task
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
                        <TaskTable tasks={spTasks} onEdit={openEditTask} onDelete={removeTask} onDuplicate={duplicateTask} onToggleActive={toggleTaskActive} />
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
                          No tasks yet — click <strong>+ Task</strong> to add one
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

// ── Task table ────────────────────────────────────────────────────────────────

function TaskTable({ tasks, onEdit, onDelete, onDuplicate, onToggleActive }: {
  tasks: BOTask[]
  onEdit: (t: BOTask) => void
  onDelete: (id: string) => void
  onDuplicate: (t: BOTask) => void
  onToggleActive: (t: BOTask) => void
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
          <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>Task</th>
          <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600, width: 55 }}>Unit</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 72 }}>Labour</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 72 }}>Materials</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 60 }}>Plant</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 60 }}>Sub</th>
          <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 55 }}>Waste</th>
          <th style={{ width: 80 }} />
        </tr>
      </thead>
      <tbody>
        {tasks.map(task => (
          <tr key={task.id} style={{ borderBottom: '1px solid #f8fafc', opacity: task.active ? 1 : 0.45 }}>
            <td style={{ padding: '6px 6px', color: '#1e293b', fontWeight: 500 }}>
              <span>{task.name}</span>
              {!task.active && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>inactive</span>}
            </td>
            <td style={{ padding: '6px 6px', textAlign: 'center', color: '#64748b' }}>/{task.unit}</td>
            <td style={{ padding: '6px 6px', textAlign: 'right', color: task.labour_cost > 0 ? '#f59e0b' : '#cbd5e1', fontFamily: 'monospace' }}>£{task.labour_cost}</td>
            <td style={{ padding: '6px 6px', textAlign: 'right', color: task.materials_cost > 0 ? '#3b82f6' : '#cbd5e1', fontFamily: 'monospace' }}>£{task.materials_cost}</td>
            <td style={{ padding: '6px 6px', textAlign: 'right', color: task.plant_cost > 0 ? '#8b5cf6' : '#cbd5e1', fontFamily: 'monospace' }}>£{task.plant_cost}</td>
            <td style={{ padding: '6px 6px', textAlign: 'right', color: task.subcontract_cost > 0 ? '#ef4444' : '#cbd5e1', fontFamily: 'monospace' }}>£{task.subcontract_cost}</td>
            <td style={{ padding: '6px 6px', textAlign: 'right', color: task.waste_cost > 0 ? '#94a3b8' : '#cbd5e1', fontFamily: 'monospace' }}>£{task.waste_cost}</td>
            <td style={{ padding: '4px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button
                onClick={() => onToggleActive(task)}
                title={task.active ? 'Deactivate' : 'Activate'}
                style={{ padding: '2px 5px', border: `1px solid ${task.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: task.active ? '#f0fdf4' : '#f8fafc', color: task.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer', marginRight: 2 }}
              >{task.active ? '●' : '○'}</button>
              <button onClick={() => onDuplicate(task)} title="Duplicate task" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>⧉</button>
              <button onClick={() => onEdit(task)} style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>✏️</button>
              <button onClick={() => onDelete(task.id)} style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  // Labour calculator local state
  const [calcTradeId, setCalcTradeId]   = useState<string>(labourTrades[0]?.id ?? '')
  const [calcRateType, setCalcRateType] = useState<LabourRateType>('day')
  const [calcQty,      setCalcQty]      = useState(1)
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

  const otherCostFields: Array<{ key: keyof BOTask; label: string; color: string }> = [
    { key: 'materials_cost',   label: '📦 Materials',   color: '#dbeafe' },
    { key: 'plant_cost',       label: '🚜 Plant',       color: '#ede9fe' },
    { key: 'subcontract_cost', label: '👷 Subcontract', color: '#fee2e2' },
    { key: 'waste_cost',       label: '🗑 Waste',       color: '#f1f5f9' },
    { key: 'other_cost',       label: '📋 Other',       color: '#f1f5f9' },
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

          {/* ── LABOUR ── */}
          <div style={{ border: '1.5px solid #fef3c7', borderRadius: 8, overflow: 'hidden' }}>
            {/* Labour header with mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fefce8' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>🔨 Labour Cost</span>
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

            <div style={{ padding: '12px 12px' }}>
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

          {/* Other costs */}
          <div>
            <label style={{ ...lbl, marginBottom: 8 }}>Other Costs (per unit, ex-VAT)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {otherCostFields.map(({ key, label, color }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: 3 }}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#94a3b8' }}>£</span>
                    <input type="number" min={0} step={1}
                      value={task[key] as number}
                      onChange={e => set(key, +e.target.value)}
                      style={{ width: '100%', padding: '5px 6px 5px 16px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, background: color, boxSizing: 'border-box' }} />
                  </div>
                </div>
              ))}
            </div>
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
