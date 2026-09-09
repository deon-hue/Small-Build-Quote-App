'use client'

/**
 * Assemblies — one card per real Back Office sub-phase, live from bo_phases/bo_sub_phases.
 *
 * This is the roadmap for the calculation-engine project: most cards say "Not built yet"
 * and that's expected — plenty of tasks are already correctly served by a flat quantity.
 * A card is "built" when its sub-phase's canonical_id has an entry in BUILT_ASSEMBLIES below;
 * everything else is a placeholder showing where it sits and how many tasks it already has.
 *
 * Deleting a card deletes the real sub-phase (and its tasks, task-first to avoid orphaning —
 * same fix as deleteSubPhase's own comment explains). "+ New Assembly" creates a real one.
 * For a sub-phase with a built assembly, editing happens here, not in Phases & Tasks — see
 * the matching lock there (SectionPhasesTasks.tsx checks the same BUILT_ASSEMBLY_CANON_IDS).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPhases, fetchSubPhases, upsertSubPhase, deleteSubPhase, fetchTasks, fetchLabourTrades } from '@/lib/back-office-queries'
import type { BOPhase, BOSubPhase, BOLabourTrade } from '@/lib/back-office-types'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { BUILT_ASSEMBLY_CANON_IDS, AssemblyIconGlyph } from '@/lib/built-assemblies'

interface Props {
  userId: string
  /** Deep-link from Phases & Tasks' "Edit via Assemblies →" — opens this sub-phase's
   * calculator (and expands its phase group) as soon as the data has loaded. */
  openSubPhaseId?: string | null
}

export default function SectionAssemblies({ userId, openSubPhaseId }: Props) {
  const sb = createClient()
  const [phases, setPhases] = useState<BOPhase[]>([])
  const [subPhases, setSubPhases] = useState<BOSubPhase[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [labourTrades, setLabourTrades] = useState<BOLabourTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null) // null = not yet defaulted
  const [openAssembly, setOpenAssembly] = useState<string | null>(null) // sub-phase id
  const [busyPhaseId, setBusyPhaseId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [ph, sp, tasks, trades] = await Promise.all([
      fetchPhases(sb, userId),
      fetchSubPhases(sb, userId),
      fetchTasks(sb, userId),
      fetchLabourTrades(sb, userId),
    ])
    setPhases(ph)
    setSubPhases(sp)
    setLabourTrades(trades.filter(t => t.active))
    const counts: Record<string, number> = {}
    for (const t of tasks) { if (t.sub_phase_id) counts[t.sub_phase_id] = (counts[t.sub_phase_id] ?? 0) + 1 }
    setTaskCounts(counts)
    // Default-collapse every phase except ones containing a built assembly — only on first
    // load, so refetching after an add/delete doesn't undo the user's own toggling.
    setCollapsed(prev => {
      if (prev !== null) return prev
      const builtPhaseIds = new Set(
        sp.filter(s => s.canonical_id && BUILT_ASSEMBLY_CANON_IDS[s.canonical_id]).map(s => s.phase_id)
      )
      return new Set(ph.filter(p => !builtPhaseIds.has(p.id)).map(p => p.id))
    })
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Deep-link from Phases & Tasks — open this sub-phase's calculator (and expand its
  // phase group) as soon as the data has loaded. Handled once per id, via a ref rather
  // than putting `collapsed` in the effect's own deps, to avoid re-opening it if the
  // user closes the modal afterwards.
  const handledDeepLinkRef = useRef<string | null>(null)
  useEffect(() => {
    if (!openSubPhaseId || loading || collapsed === null) return
    if (handledDeepLinkRef.current === openSubPhaseId) return
    const sub = subPhases.find(s => s.id === openSubPhaseId)
    if (!sub) return
    handledDeepLinkRef.current = openSubPhaseId
    setOpenAssembly(sub.id)
    setCollapsed(prev => {
      const next = new Set(prev ?? [])
      next.delete(sub.phase_id)
      return next
    })
  }, [openSubPhaseId, loading, collapsed, subPhases])

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev ?? [])
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function addAssembly(phaseId: string) {
    const name = prompt('Name for the new assembly (sub-phase)?', '')
    if (!name || !name.trim()) return
    setBusyPhaseId(phaseId)
    try {
      const existing = subPhases.filter(s => s.phase_id === phaseId)
      const sp = await upsertSubPhase(sb, {
        user_id: userId, phase_id: phaseId, name: name.trim(),
        display_order: existing.length, markup_pct: 0, active: true,
      })
      if (sp) setSubPhases(prev => [...prev, sp])
      else alert('Could not create the assembly — please try again.')
    } finally { setBusyPhaseId(null) }
  }

  async function removeAssembly(sub: BOSubPhase) {
    const taskCount = taskCounts[sub.id] ?? 0
    if (!confirm(
      `Delete "${sub.name}"?` +
      (taskCount > 0 ? `\n\nThis also deletes its ${taskCount} task${taskCount !== 1 ? 's' : ''}.` : '') +
      `\n\nThis cannot be undone.`
    )) return
    try {
      await deleteSubPhase(sb, sub.id)
      setSubPhases(prev => prev.filter(s => s.id !== sub.id))
      if (openAssembly === sub.id) setOpenAssembly(null)
    } catch (err) {
      console.error(err)
      alert(`Couldn't delete "${sub.name}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (loading || collapsed === null) {
    return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading assemblies…</div>
  }

  const openSub = openAssembly ? subPhases.find(s => s.id === openAssembly) : null
  const openBuilt = openSub?.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[openSub.canonical_id] : undefined
  const openPhase = openSub ? phases.find(p => p.id === openSub.phase_id) : null

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Assemblies</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', maxWidth: 640, lineHeight: 1.5 }}>
        One card per real sub-phase from Phases &amp; Tasks — this is the full roadmap, filled in one
        engine at a time. Most cards say "Not built yet" and that's fine; plenty of tasks are already
        correctly served by a flat quantity and won't need one. Built ones (marked 🧪 Preview) still run
        on sample rates, not your real products/labour/plant records, and nothing here saves to a quote
        yet — that's a later stage. Delete removes the real sub-phase (and its tasks) from Phases &amp;
        Tasks; "+ New Assembly" creates one.
      </p>

      {phases.map(phase => {
        const subs = subPhases.filter(s => s.phase_id === phase.id)
        const isCollapsed = collapsed.has(phase.id)
        return (
          <div key={phase.id} style={{ marginBottom: 6, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggle(phase.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '9px 14px', border: 'none', background: '#f8fafc', cursor: 'pointer', textAlign: 'left',
            }}>
              {isCollapsed ? <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{phase.name}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                background: subs.length ? '#ede9fe' : '#f1f5f9',
                color: subs.length ? '#7c3aed' : '#94a3b8',
              }}>
                {subs.length} {subs.length === 1 ? 'assembly' : 'assemblies'}
              </span>
            </button>
            {!isCollapsed && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
                {subs.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>No sub-phases for this phase yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 10 }}>
                    {subs.map(sub => {
                      const built = sub.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[sub.canonical_id] : undefined
                      const taskCount = taskCounts[sub.id] ?? 0
                      return (
                        <div key={sub.id} style={{ position: 'relative' }}>
                          <button onClick={() => setOpenAssembly(sub.id)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, width: '100%',
                            padding: '16px 18px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
                            border: built ? '1px solid #e9d5ff' : '1px dashed #d1d5db',
                            background: built ? '#fdfaff' : '#fafafa',
                          }}>
                            {built ? <AssemblyIconGlyph icon={built.icon} size={26} /> : <span style={{ fontSize: 22, opacity: 0.4 }}>🔧</span>}
                            <span style={{ fontWeight: 700, fontSize: 14, color: built ? '#1e293b' : '#64748b', paddingRight: 18 }}>{sub.name}</span>
                            {built ? (
                              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>🧪 Preview</span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>Not built yet · {taskCount} task{taskCount !== 1 ? 's' : ''} today</span>
                            )}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); removeAssembly(sub) }}
                            title="Delete this assembly"
                            style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4, lineHeight: 1 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => addAssembly(phase.id)}
                  disabled={busyPhaseId === phase.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                    border: '1px dashed #94a3b8', borderRadius: 6, background: 'transparent',
                    color: '#64748b', fontSize: 12, cursor: busyPhaseId === phase.id ? 'wait' : 'pointer',
                  }}
                >
                  <Plus size={13} /> {busyPhaseId === phase.id ? 'Creating…' : 'New Assembly'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {openSub && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setOpenAssembly(null) }}>
          <div style={{
            background: 'var(--cream, #fff)', borderRadius: 8,
            width: '96vw', height: '92vh', maxWidth: 1400,
            display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          }}>
            <div className="form-modal-hd">
              <span className="serif" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
                {openBuilt ? <AssemblyIconGlyph icon={openBuilt.icon} size={18} /> : <span style={{ fontSize: 16 }}>🔧</span>} {openSub.name} — Assembly Calculator
              </span>
              <button className="modal-close" onClick={() => setOpenAssembly(null)}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {openBuilt ? openBuilt.render({ labourTrades }) : (
                <div style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔧</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 6 }}>No calculator built yet</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    "{openSub.name}" is a real sub-phase under <strong>{openPhase?.name ?? '—'}</strong> in Phases &amp; Tasks
                    {(taskCounts[openSub.id] ?? 0) > 0
                      ? `, with ${taskCounts[openSub.id]} task${taskCounts[openSub.id] !== 1 ? 's' : ''} already priced there`
                      : ', with no tasks priced there yet'}.
                    It doesn't have a calculation engine yet — that gets built when we get to this phase.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
