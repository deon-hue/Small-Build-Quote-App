'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchTakeoffTools, upsertTakeoffTool, deleteTakeoffTool,
  fetchTakeoffSubtypes, upsertTakeoffSubtype, deleteTakeoffSubtype,
  fetchToolTaskMappings, upsertToolTaskMapping, deleteToolTaskMapping,
  fetchTasks,
} from '@/lib/back-office-queries'
import type { BOTakeoffTool, BOTakeoffSubtype, BOToolTaskMapping, BOTask } from '@/lib/back-office-types'
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'

interface Props { userId: string }

export default function SectionTakeoffMapping({ userId }: Props) {
  const sb = createClient()
  const [tools, setTools] = useState<BOTakeoffTool[]>([])
  const [subtypes, setSubtypes] = useState<BOTakeoffSubtype[]>([])
  const [mappings, setMappings] = useState<BOToolTaskMapping[]>([])
  const [allTasks, setAllTasks] = useState<BOTask[]>([])
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
  const [selectedSubtypeId, setSelectedSubtypeId] = useState<string | null>(null)
  const [expandedSubtypes, setExpandedSubtypes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, st, tasks] = await Promise.all([
      fetchTakeoffTools(sb, userId),
      fetchTakeoffSubtypes(sb, userId),
      fetchTasks(sb, userId),
    ])
    setTools(t)
    setSubtypes(st)
    setAllTasks(tasks)
    if (t.length > 0 && !selectedToolId) setSelectedToolId(t[0].id)
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Load mappings when a subtype is expanded
  async function loadMappings(subtypeId: string) {
    const m = await fetchToolTaskMappings(sb, subtypeId)
    setMappings(prev => [...prev.filter(x => x.subtype_id !== subtypeId), ...m])
  }

  function toggleSubtype(id: string) {
    setExpandedSubtypes(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id); loadMappings(id) }
      return n
    })
  }

  // ── Tool CRUD ────────────────────────────────────────────────────────────────

  async function addTool() {
    const tool = await upsertTakeoffTool(sb, { user_id: userId, name: 'New Takeoff Tool', description: '', active: true, display_order: tools.length })
    if (tool) { setTools(prev => [...prev, tool]); setSelectedToolId(tool.id) }
  }

  async function updateTool(tool: BOTakeoffTool) {
    setTools(prev => prev.map(t => t.id === tool.id ? tool : t))
    await upsertTakeoffTool(sb, { ...tool, user_id: userId })
  }

  async function removeTool(id: string) {
    if (!confirm('Delete this tool and all its sub-types?')) return
    await deleteTakeoffTool(sb, id)
    setTools(prev => prev.filter(t => t.id !== id))
    setSubtypes(prev => prev.filter(st => st.tool_id !== id))
    if (selectedToolId === id) setSelectedToolId(tools.find(t => t.id !== id)?.id ?? null)
  }

  // ── Subtype CRUD ─────────────────────────────────────────────────────────────

  async function addSubtype(toolId: string) {
    const existing = subtypes.filter(st => st.tool_id === toolId)
    const st = await upsertTakeoffSubtype(sb, { user_id: userId, tool_id: toolId, name: 'New Sub-type', description: '', active: true, display_order: existing.length })
    if (st) setSubtypes(prev => [...prev, st])
  }

  async function updateSubtype(st: BOTakeoffSubtype) {
    setSubtypes(prev => prev.map(s => s.id === st.id ? st : s))
    await upsertTakeoffSubtype(sb, { ...st, user_id: userId })
  }

  async function removeSubtype(id: string) {
    if (!confirm('Delete this sub-type and its mappings?')) return
    await deleteTakeoffSubtype(sb, id)
    setSubtypes(prev => prev.filter(s => s.id !== id))
    setMappings(prev => prev.filter(m => m.subtype_id !== id))
  }

  // ── Mapping CRUD ─────────────────────────────────────────────────────────────

  async function addMapping(subtypeId: string) {
    const taskId = allTasks[0]?.id
    if (!taskId) { alert('No tasks available. Add tasks in Phases & Tasks first.'); return }
    const m = await upsertToolTaskMapping(sb, {
      user_id: userId, subtype_id: subtypeId, task_id: taskId,
      quantity_formula: 'measured_qty', waste_pct: 0, markup_pct: 0, active: true, display_order: 0,
    })
    if (m) setMappings(prev => [...prev, m])
  }

  async function updateMapping(m: BOToolTaskMapping) {
    setMappings(prev => prev.map(x => x.id === m.id ? m : x))
    await upsertToolTaskMapping(sb, { ...m, user_id: userId })
  }

  async function removeMapping(id: string) {
    await deleteToolTaskMapping(sb, id)
    setMappings(prev => prev.filter(m => m.id !== id))
  }

  const selectedTool = tools.find(t => t.id === selectedToolId)
  const toolSubtypes = subtypes.filter(st => st.tool_id === selectedToolId)

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 600 }}>

      {/* Tool list (left) */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #e2e8f0' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Takeoff Tools</span>
          <button onClick={addTool} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a90a4', padding: 2 }}>
            <Plus size={16} />
          </button>
        </div>
        {tools.map(tool => {
          const stCount = subtypes.filter(st => st.tool_id === tool.id).length
          const active = tool.id === selectedToolId
          return (
            <button key={tool.id} onClick={() => setSelectedToolId(tool.id)} style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, background: active ? '#e8f4f8' : 'transparent', color: active ? '#2a7090' : '#374151', borderLeft: active ? '3px solid #4a90a4' : '3px solid transparent' }}>
              <div>{tool.name}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{stCount} sub-type{stCount !== 1 ? 's' : ''}</div>
            </button>
          )
        })}
        {tools.length === 0 && <div style={{ padding: '16px 14px', color: '#94a3b8', fontSize: 12 }}>No tools yet</div>}
      </div>

      {/* Tool content (right) */}
      <div style={{ flex: 1, minWidth: 0, padding: '16px 20px' }}>
        {!selectedTool ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>Select a tool to configure its mappings</div>
        ) : (
          <>
            {/* Tool header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input value={selectedTool.name} onChange={e => updateTool({ ...selectedTool, name: e.target.value })} style={{ fontSize: 18, fontWeight: 700, border: 'none', background: 'transparent', outline: 'none', flex: 1 }} />
              <button onClick={() => addSubtype(selectedTool.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                <Plus size={13} /> Sub-type
              </button>
              <button onClick={() => removeTool(selectedTool.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </div>
            <input value={selectedTool.description} onChange={e => updateTool({ ...selectedTool, description: e.target.value })} placeholder="Tool description…" style={{ display: 'block', width: '100%', padding: '6px 0', border: 'none', borderBottom: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', background: 'transparent', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }} />

            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
              Each sub-type defines what happens when that measurement is taken in the Takeoff Tool.
              Map it to tasks that will be auto-generated in the quote.
            </div>

            {toolSubtypes.map(st => {
              const isOpen = expandedSubtypes.has(st.id)
              const stMappings = mappings.filter(m => m.subtype_id === st.id)
              return (
                <div key={st.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggleSubtype(st.id)}>
                    {isOpen ? <ChevronDown size={15} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                    <input value={st.name} onClick={e => e.stopPropagation()} onChange={e => updateSubtype({ ...st, name: e.target.value })}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, outline: 'none', minWidth: 0 }} />
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{stMappings.length} task{stMappings.length !== 1 ? 's' : ''} mapped</span>
                    <button onClick={e => { e.stopPropagation(); removeSubtype(st.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2, flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '10px 14px 14px' }}>
                      <input value={st.description} onChange={e => updateSubtype({ ...st, description: e.target.value })} placeholder="Sub-type description…" style={{ display: 'block', width: '100%', padding: '5px 0', border: 'none', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#64748b', background: 'transparent', outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />

                      {/* Mappings table */}
                      {stMappings.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>Task</th>
                              <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>Qty Formula</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 70 }}>Waste %</th>
                              <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, width: 70 }}>Markup %</th>
                              <th style={{ width: 36 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {stMappings.map(m => (
                              <tr key={m.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '5px 6px' }}>
                                  <select value={m.task_id} onChange={e => updateMapping({ ...m, task_id: e.target.value })}
                                    style={{ width: '100%', padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }}>
                                    {allTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: '5px 6px' }}>
                                  <input value={m.quantity_formula} onChange={e => updateMapping({ ...m, quantity_formula: e.target.value })}
                                    style={{ width: '100%', padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }} />
                                </td>
                                <td style={{ padding: '5px 6px' }}>
                                  <input type="number" min={0} value={m.waste_pct} onChange={e => updateMapping({ ...m, waste_pct: +e.target.value })}
                                    style={{ width: 60, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '5px 6px' }}>
                                  <input type="number" min={0} value={m.markup_pct} onChange={e => updateMapping({ ...m, markup_pct: +e.target.value })}
                                    style={{ width: 60, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                                  <button onClick={() => removeMapping(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2 }}>
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      <button onClick={() => addMapping(st.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, color: '#1d4ed8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        <Plus size={12} /> Map Task
                      </button>

                      {allTasks.length === 0 && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                          No tasks available. Add tasks in <strong>Phases & Tasks</strong> first.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {toolSubtypes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
                No sub-types yet. Click <strong>+ Sub-type</strong> to add measurement variations.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
