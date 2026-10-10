'use client'

// Back Office > Job Templates: named templates built from the sub-phases in Phases & Tasks (e.g. "Rear Extension – Lean-to roof").
// A template only remembers which sub-phases are in it; prices, tasks and calculators always come from Phases & Tasks (see lib/quote-templates.ts).
// This is the screen itself: it is given the Phases & Tasks list and the templates, and calls back to save. SectionTemplates loads and saves the data.

import { useEffect, useMemo, useRef, useState } from 'react'
import { cleanIds, pickTemplateRows, toggleGroup, toggleOne, type QuoteTemplate } from '@/lib/quote-templates'

export interface TplPhase { id: string; name: string }
export interface TplSubPhase { id: string; name: string; phase_id: string }

interface Props {
  /** active main phases, in Phases & Tasks order */
  phases: TplPhase[]
  /** active sub-phases, in Phases & Tasks order */
  subPhases: TplSubPhase[]
  taskCounts: Record<string, number>
  templates: QuoteTemplate[]
  jobTypes: string[]
  /** the SQL file has not been run yet */
  missingTable?: boolean
  onCreate: (t: { name: string; baseJobType: string; subPhaseIds: string[] }) => Promise<QuoteTemplate | null>
  onSave: (t: QuoteTemplate) => Promise<string | null>
  onDelete: (id: string) => Promise<string | null>
}

const btn: React.CSSProperties = { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }
const field: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' }

export default function LinkedTemplatesView({ phases, subPhases, taskCounts, templates, jobTypes, missingTable, onCreate, onSave, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<QuoteTemplate | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const [onlyPicked, setOnlyPicked] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())   // main phases are collapsed until opened
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBase, setNewBase] = useState(jobTypes[0] ?? 'Other')
  const [newFrom, setNewFrom] = useState('')

  // open a template: copy it into a draft to edit
  useEffect(() => {
    const t = templates.find(x => x.id === selectedId) ?? null
    setDraft(t ? { ...t, subPhaseIds: [...t.subPhaseIds] } : null)
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])
  // if the selected template disappears (deleted), clear the selection
  useEffect(() => { if (selectedId && !templates.some(t => t.id === selectedId)) setSelectedId(null) }, [templates, selectedId])

  const subsByPhase = useMemo(() => {
    const m = new Map<string, TplSubPhase[]>()
    for (const sp of subPhases) { const a = m.get(sp.phase_id) ?? []; a.push(sp); m.set(sp.phase_id, a) }
    return m
  }, [subPhases])

  const picked = useMemo(() => new Set(draft?.subPhaseIds ?? []), [draft])
  const { missingIds } = useMemo(() => pickTemplateRows(subPhases.map(s => ({ subPhaseId: s.id })), draft?.subPhaseIds ?? []), [subPhases, draft])
  const mainPhasesUsed = phases.filter(p => (subsByPhase.get(p.id) ?? []).some(s => picked.has(s.id))).length
  const pickedCount = subPhases.filter(s => picked.has(s.id)).length

  const needle = search.trim().toLowerCase()
  const visibleSubs = (p: TplPhase) => (subsByPhase.get(p.id) ?? []).filter(s =>
    (!onlyPicked || picked.has(s.id)) && (!needle || s.name.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)))

  function edit(next: Partial<QuoteTemplate>) { setDraft(d => d ? { ...d, ...next } : d); setDirty(true); setMessage(null) }
  function togglePhaseOpen(id: string) { setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const searching = needle.length > 0 || onlyPicked

  function pick(id: string) {
    if (dirty && !confirm('You have unsaved changes to this template. Discard them?')) return
    setSelectedId(id); setSearch(''); setOnlyPicked(false); setOpen(new Set()); setMessage(null)
  }

  async function create() {
    if (!newName.trim()) { setMessage({ text: 'Give the template a name first.', ok: false }); return }
    if (dirty && !confirm('You have unsaved changes to this template. Discard them?')) return
    setBusy(true)
    const from = templates.find(t => t.id === newFrom)
    const t = await onCreate({ name: newName.trim(), baseJobType: from?.baseJobType ?? newBase, subPhaseIds: from?.subPhaseIds ?? [] })
    setBusy(false)
    if (!t) { setMessage({ text: 'Could not create the template. Please try again.', ok: false }); return }
    setCreating(false); setNewName(''); setNewFrom(''); setSelectedId(t.id); setOpen(new Set()); setSearch('')
    setMessage({ text: from ? `Created "${t.name}" as a copy of "${from.name}".` : `Created "${t.name}". Open a main phase below and tick the sub-phases it needs.`, ok: true })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    const err = await onSave(draft)
    setBusy(false)
    if (err) setMessage({ text: 'Could not save: ' + err, ok: false })
    else { setDirty(false); setMessage({ text: 'Saved.', ok: true }) }
  }

  async function remove() {
    if (!draft) return
    if (!confirm(`Delete the template "${draft.name}"? Quotes already made from it are not affected.`)) return
    setBusy(true)
    const err = await onDelete(draft.id)
    setBusy(false)
    if (err) setMessage({ text: 'Could not delete: ' + err, ok: false })
    else { setDirty(false); setSelectedId(null); setMessage({ text: 'Deleted.', ok: true }) }
  }

  const checkRef = useRef<Record<string, HTMLInputElement | null>>({})
  useEffect(() => {
    for (const p of phases) {
      const el = checkRef.current[p.id]; if (!el) continue
      const subs = subsByPhase.get(p.id) ?? []
      const n = subs.filter(s => picked.has(s.id)).length
      el.indeterminate = n > 0 && n < subs.length
    }
  })

  if (missingTable) {
    return (
      <div className="card" style={{ padding: 20, fontSize: 14, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d' }}>
        <strong>One database update is needed before templates can be saved.</strong>
        <div style={{ marginTop: 6 }}>Run <code>supabase/quote-templates.sql</code> in the Supabase SQL editor (staging first, then live), then reload this page.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* ── The list of templates ── */}
      <div style={{ width: 230, flexShrink: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My templates</div>
          {templates.length === 0 && !creating && <div style={{ padding: '14px', fontSize: 12.5, color: '#64748b' }}>No templates yet. Make one from the sub-phases in Phases & Tasks.</div>}
          {templates.map(t => {
            const on = t.id === selectedId
            const n = pickTemplateRows(subPhases.map(s => ({ subPhaseId: s.id })), t.subPhaseIds).rows.length
            return (
              <div key={t.id} onClick={() => pick(t.id)} style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: on ? '#e8f4f8' : '#fff', borderLeft: on ? '3px solid #4a90a4' : '3px solid transparent' }}>
                <div style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#1a5f7a' : '#1e293b' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.baseJobType} · {n} sub-phase{n === 1 ? '' : 's'}</div>
              </div>
            )
          })}
          <div style={{ padding: 10 }}>
            {!creating ? (
              <button style={{ ...btn, width: '100%', borderStyle: 'dashed', color: '#64748b' }} onClick={() => { setCreating(true); setMessage(null) }}>+ New template</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input autoFocus style={field} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Rear extension – lean-to roof" />
                <select style={field} value={newFrom} onChange={e => setNewFrom(e.target.value)}>
                  <option value="">Start empty</option>
                  {templates.map(t => <option key={t.id} value={t.id}>Copy of “{t.name}”</option>)}
                </select>
                {!newFrom && (
                  <select style={field} value={newBase} onChange={e => setNewBase(e.target.value)} title="The kind of job this is for">
                    {jobTypes.map(j => <option key={j}>{j}</option>)}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btn, flex: 1, background: '#4a90a4', color: '#fff', border: 'none', fontWeight: 600 }} disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create'}</button>
                  <button style={btn} onClick={() => { setCreating(false); setNewName(''); setNewFrom('') }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── The template being edited ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {message && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: message.ok ? '#f0fdf4' : '#fef2f2', color: message.ok ? '#166534' : '#b91c1c', border: '1px solid ' + (message.ok ? '#bbf7d0' : '#fecaca') }}>{message.text}</div>}

        {!draft ? (
          <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48, fontSize: 14 }}>
            {templates.length ? 'Pick a template on the left to edit it, or make a new one.' : 'A template is a ready-made set of sub-phases for one kind of job. Make your first one on the left.'}
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={draft.name} onChange={e => edit({ name: e.target.value })} style={{ ...field, flex: 1, minWidth: 200, fontSize: 16, fontWeight: 700 }} />
                <select value={draft.baseJobType} onChange={e => edit({ baseJobType: e.target.value })} style={field} title="The kind of job this template is for">
                  {Array.from(new Set([...jobTypes, draft.baseJobType])).map(j => <option key={j}>{j}</option>)}
                </select>
                <button style={{ ...btn, background: dirty ? '#4a90a4' : '#cbd5e1', color: '#fff', border: 'none', fontWeight: 600, cursor: dirty && !busy ? 'pointer' : 'not-allowed' }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save template'}</button>
                <button style={{ ...btn, color: '#dc2626', borderColor: '#fca5a5' }} disabled={busy} onClick={remove}>Delete</button>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                {pickedCount} sub-phase{pickedCount === 1 ? '' : 's'} in {mainPhasesUsed} main phase{mainPhasesUsed === 1 ? '' : 's'}. Prices, tasks and calculators come from Phases & Tasks, so changing them there updates this template.
              </div>
              {dirty && <div style={{ marginTop: 6, fontSize: 12, color: '#b85c00', fontWeight: 500 }}>● Unsaved changes — click Save template to keep them</div>}
            </div>

            {missingIds.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}><strong>{missingIds.length} sub-phase{missingIds.length === 1 ? '' : 's'} in this template no longer exist{missingIds.length === 1 ? 's' : ''} in Phases & Tasks</strong> (deleted or switched off). New quotes simply skip {missingIds.length === 1 ? 'it' : 'them'}.</span>
                <button style={btn} onClick={() => edit({ subPhaseIds: cleanIds(draft.subPhaseIds.filter(id => !missingIds.includes(id))) })}>Remove {missingIds.length === 1 ? 'it' : 'them'}</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sub-phases…" style={{ ...field, width: 220 }} />
              <label style={{ fontSize: 12.5, color: '#475569', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyPicked} onChange={e => setOnlyPicked(e.target.checked)} /> Only the ones in this template
              </label>
              <span style={{ flex: 1 }} />
              <button style={btn} onClick={() => setOpen(new Set(phases.map(p => p.id)))}>▾▾ Expand all</button>
              <button style={btn} onClick={() => setOpen(new Set())}>▸▸ Collapse all</button>
            </div>

            {phases.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Phases & Tasks has no phases yet. Open Back Office once so they are set up.</div>
            ) : phases.map(p => {
              const all = subsByPhase.get(p.id) ?? []
              const subs = visibleSubs(p)
              if (searching && subs.length === 0) return null
              const nPicked = all.filter(s => picked.has(s.id)).length
              const isOpen = searching || open.has(p.id)
              return (
                <div key={p.id} style={{ marginBottom: 10 }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: isOpen ? '8px 8px 0 0' : 8, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" ref={el => { checkRef.current[p.id] = el }} checked={all.length > 0 && nPicked === all.length} disabled={all.length === 0}
                      onChange={() => edit({ subPhaseIds: toggleGroup(draft.subPhaseIds, all.map(s => s.id)) })} title="Tick or untick every sub-phase in this main phase" style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <button onClick={() => togglePhaseOpen(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                      <span style={{ color: '#94a3b8', fontSize: 12, width: 12 }}>{isOpen ? '▾' : '▸'}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{p.name}</span>
                    </button>
                    <span style={{ fontSize: 11.5, color: nPicked ? '#166534' : '#94a3b8', fontWeight: nPicked ? 600 : 400, whiteSpace: 'nowrap' }}>{nPicked} of {all.length}</span>
                  </div>
                  {isOpen && (
                    <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff' }}>
                      {subs.length === 0 ? <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#94a3b8' }}>No sub-phases here.</div> : subs.map((s, i) => {
                        const n = taskCounts[s.id] ?? 0
                        return (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', borderBottom: i < subs.length - 1 ? '1px solid #f1f5f9' : 'none', background: picked.has(s.id) ? '#f7fbef' : '#fff' }}>
                            <input type="checkbox" checked={picked.has(s.id)} onChange={() => edit({ subPhaseIds: toggleOne(draft.subPhaseIds, s.id) })} style={{ width: 16, height: 16, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, fontWeight: picked.has(s.id) ? 600 : 400 }}>{s.name}</span>
                            <span style={{ fontSize: 11.5, color: n ? '#64748b' : '#b45309' }}>{n ? `${n} task${n === 1 ? '' : 's'}` : 'no tasks yet'}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
