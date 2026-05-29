'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAIScopeMappings, upsertAIScopeMapping, deleteAIScopeMapping, fetchPhases, fetchSubPhases, fetchTasks } from '@/lib/back-office-queries'
import type { BOAIScopeMapping, BOPhase, BOSubPhase, BOTask } from '@/lib/back-office-types'
import { Plus, Trash2, Search } from 'lucide-react'

interface Props { userId: string }

export default function SectionAIMapping({ userId }: Props) {
  const sb = createClient()
  const [mappings, setMappings] = useState<BOAIScopeMapping[]>([])
  const [phases, setPhases] = useState<BOPhase[]>([])
  const [subPhases, setSubPhases] = useState<BOSubPhase[]>([])
  const [tasks, setTasks] = useState<BOTask[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BOAIScopeMapping | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [m, p, sp, t] = await Promise.all([
      fetchAIScopeMappings(sb, userId),
      fetchPhases(sb, userId),
      fetchSubPhases(sb, userId),
      fetchTasks(sb, userId),
    ])
    setMappings(m)
    setPhases(p)
    setSubPhases(sp)
    setTasks(t)
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing({ id: '', user_id: userId, keyword: '', phase_id: phases[0]?.id ?? '', sub_phase_id: null, task_id: null, weight: 5, active: true } as BOAIScopeMapping)
    setIsNew(true)
  }

  async function save() {
    if (!editing) return
    const { phase: _p, sub_phase: _sp, task: _t, ...row } = editing
    const saved = await upsertAIScopeMapping(sb, { ...row, user_id: userId })
    if (saved) {
      const withJoins = { ...saved, phase: phases.find(p => p.id === saved.phase_id), sub_phase: subPhases.find(sp => sp.id === saved.sub_phase_id), task: tasks.find(t => t.id === saved.task_id) }
      if (isNew) setMappings(prev => [withJoins as BOAIScopeMapping, ...prev])
      else setMappings(prev => prev.map(m => m.id === saved.id ? withJoins as BOAIScopeMapping : m))
    }
    setEditing(null)
  }

  async function remove(id: string) {
    await deleteAIScopeMapping(sb, id)
    setMappings(prev => prev.filter(m => m.id !== id))
  }

  const filtered = mappings.filter(m => !search || m.keyword.toLowerCase().includes(search.toLowerCase()) || m.phase?.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Scope Mapping</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            When the AI Scope Writer sees these keywords in a project brief, it will suggest the mapped phases and tasks.
            Higher weight = higher priority suggestion.
          </p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Mapping
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keywords or phases…"
            style={{ width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <th style={th}>Keyword / Phrase</th>
            <th style={th}>Phase</th>
            <th style={th}>Sub-Phase</th>
            <th style={th}>Task</th>
            <th style={{ ...th, textAlign: 'center' }}>Weight</th>
            <th style={{ ...th, textAlign: 'center' }}>Active</th>
            <th style={{ width: 64 }} />
          </tr>
        </thead>
        <tbody>
          {filtered.map(m => (
            <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '7px 8px', fontWeight: 600, color: '#1e293b' }}>
                <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, padding: '2px 10px', fontSize: 12 }}>
                  {m.keyword}
                </span>
              </td>
              <td style={{ padding: '7px 8px', color: '#374151' }}>{m.phase?.name ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11 }}>{m.sub_phase?.name ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11 }}>{m.task?.name ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                <span style={{ display: 'inline-block', width: 24, height: 24, lineHeight: '24px', textAlign: 'center', borderRadius: '50%', background: m.weight >= 8 ? '#dcfce7' : m.weight >= 5 ? '#fef9c3' : '#f1f5f9', color: m.weight >= 8 ? '#166534' : m.weight >= 5 ? '#713f12' : '#64748b', fontSize: 11, fontWeight: 700 }}>
                  {m.weight}
                </span>
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: m.active ? '#dcfce7' : '#f1f5f9', color: m.active ? '#166534' : '#64748b' }}>
                  {m.active ? 'On' : 'Off'}
                </span>
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => { setEditing({ ...m }); setIsNew(false) }} style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 3 }}>✏️</button>
                <button onClick={() => remove(m.id)} style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
          {mappings.length === 0 ? 'No mappings yet. Add keywords so the AI knows which phases to suggest.' : 'No results.'}
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Mapping' : '✏️ Edit Mapping'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Keyword / Phrase</label>
                <input value={editing.keyword} onChange={e => setEditing({ ...editing, keyword: e.target.value })}
                  placeholder="e.g. bifold doors, extension, loft conversion" style={inp} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>When the AI sees this in a brief, it will suggest the mapped phase/task.</div>
              </div>
              <div>
                <label style={lbl}>Phase</label>
                <select value={editing.phase_id} onChange={e => setEditing({ ...editing, phase_id: e.target.value, sub_phase_id: null, task_id: null })} style={inp}>
                  <option value="">— Select phase —</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Sub-Phase (optional)</label>
                <select value={editing.sub_phase_id ?? ''} onChange={e => setEditing({ ...editing, sub_phase_id: e.target.value || null })} style={inp}>
                  <option value="">— None —</option>
                  {subPhases.filter(sp => sp.phase_id === editing.phase_id).map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Specific Task (optional)</label>
                <select value={editing.task_id ?? ''} onChange={e => setEditing({ ...editing, task_id: e.target.value || null })} style={inp}>
                  <option value="">— None (whole phase) —</option>
                  {tasks.filter(t => t.phase_id === editing.phase_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Weight (1–10)</label>
                <input type="number" min={1} max={10} value={editing.weight} onChange={e => setEditing({ ...editing, weight: Math.min(10, Math.max(1, +e.target.value)) })} style={{ ...inp, width: 80 }} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Higher weight = AI more likely to suggest this mapping when keyword is found.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 22px', background: '#4a90a4', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
