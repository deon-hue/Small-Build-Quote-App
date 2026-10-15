'use client'

// A job's Selections, for the builder: what the client has chosen for their home (skirting, lights, taps…), grouped by room, with the client's photos, link and notes.
// Set where each one has got to (idea → chosen → checked → ordered → delivered → installed) and reply on it; the client sees both on their portal.
// See lib/selections.ts and supabase/job-selections.sql. Opening this window marks everything as seen.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type Selection, type SelectionFile, type SelectionStatus, SELECTION_STATUSES, STATUS_COLOR, CATEGORY_LABEL, categoryIcon, SUPPLIED_BY_BUILDER_LABEL,
  rowToSelection, groupByRoom, neededState, neededLabel, safeLink, linkHost,
} from '@/lib/selections'

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function JobSelectionsModal({ jobId, jobLabel, zIndex = 1100, onChanged, onClose }: {
  jobId: string
  jobLabel: string
  zIndex?: number
  /** told when the "new" marks have been cleared, so the button behind can update */
  onChanged?: () => void
  onClose: () => void
}) {
  const sb = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Selection[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [room, setRoom] = useState('')
  const today = todayYmd()

  const load = useCallback(async () => {
    const { data: rows, error } = await sb.from('job_selections').select('*').eq('job_id', jobId).order('created_at', { ascending: false })
    if (error) { setMissing(/does not exist|schema cache|PGRST205|42P01/i.test(error.message)); setItems([]); setLoading(false); return }
    setMissing(false)
    let files: Record<string, SelectionFile[]> = {}
    try { const r = await fetch('/api/selections/urls?jobIds=' + encodeURIComponent(jobId)); const j = await r.json(); files = j.files ?? {} } catch { /* photos just do not show */ }
    const list = (rows ?? []).map(r => rowToSelection(r as Record<string, unknown>, files[r.id as string] ?? [], !r.builder_seen_at))
    setItems(list)
    setLoading(false)
    // looking at them counts as seeing them (the "new" marks stay on screen until this window is closed)
    if (list.some(s => s.isNew)) {
      const { error: e2 } = await sb.from('job_selections').update({ builder_seen_at: new Date().toISOString() }).eq('job_id', jobId).is('builder_seen_at', null)
      if (!e2) onChanged?.()
    }
  }, [sb, jobId, onChanged])
  useEffect(() => { void load() }, [load])  // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(s: Selection, status: SelectionStatus) {
    setBusy(s.id); setNotice(null)
    const { error } = await sb.from('job_selections').update({ status, updated_at: new Date().toISOString() }).eq('id', s.id)
    setBusy(null)
    if (error) { setNotice({ ok: false, text: 'Could not change the status. Try again.' }); return }
    setItems(list => list.map(x => (x.id === s.id ? { ...x, status } : x)))
  }

  async function saveReply(s: Selection) {
    const text = (drafts[s.id] ?? s.builderReply).trim().slice(0, 2000)
    if (text === s.builderReply.trim()) return
    setBusy(s.id); setNotice(null)
    const at = new Date().toISOString()
    const { error } = await sb.from('job_selections').update({ builder_reply: text, builder_replied_at: text ? at : null, updated_at: at }).eq('id', s.id)
    setBusy(null)
    if (error) { setNotice({ ok: false, text: 'Could not save your reply. Try again.' }); return }
    setItems(list => list.map(x => (x.id === s.id ? { ...x, builderReply: text, builderRepliedAt: text ? at : undefined } : x)))
    setDrafts(d => { const n = { ...d }; delete n[s.id]; return n })
    setNotice({ ok: true, text: text ? 'Reply saved. Your client sees it on their portal.' : 'Reply removed.' })
  }

  async function remove(s: Selection) {
    if (!confirm(`Delete "${s.title}"? Its photos are deleted too. This cannot be undone.`)) return
    setBusy(s.id)
    const res = await fetch('/api/selections/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
    setBusy(null)
    if (!res.ok) { setNotice({ ok: false, text: 'Could not delete it. Try again.' }); return }
    setItems(list => list.filter(x => x.id !== s.id))
  }

  const rooms = useMemo(() => groupByRoom(items).map(g => g.room), [items])
  const shown = items.filter(s => !room || (s.room.trim() || 'Other') === room)
  const groups = groupByRoom(shown)
  const counts = {
    all: items.length, isNew: items.filter(s => s.isNew).length, due: items.filter(s => neededState(s, today) !== '').length,
    ordered: items.filter(s => s.status === 'ordered' || s.status === 'delivered').length, installed: items.filter(s => s.status === 'installed').length,
  }

  const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const stat = (n: number, label: string, warn = false) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', minWidth: 96 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: warn && n > 0 ? '#b45309' : '#0f172a' }}>{n}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
    </div>
  )

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 14px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 940, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🎨 Selections</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{jobLabel}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>}
          {!loading && missing && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              Selections need a small database update first. Run <strong>supabase/job-selections.sql</strong> in the Supabase SQL editor, then reopen this window.
            </div>
          )}

          {!loading && !missing && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {stat(counts.all, 'Items')}{stat(counts.isNew, 'New from client', true)}{stat(counts.due, 'Needed soon', true)}{stat(counts.ordered, 'Ordered / on site')}{stat(counts.installed, 'Installed')}
              </div>
              {notice && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 7, fontSize: 13, background: notice.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${notice.ok ? '#bbf7d0' : '#fecaca'}`, color: notice.ok ? '#166534' : '#991b1b' }}>{notice.text}</div>
              )}
              {rooms.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {['', ...rooms].map(r => (
                    <button key={r || 'all'} onClick={() => setRoom(r)} style={{ ...btn, borderRadius: 99, background: room === r ? '#0f172a' : '#fff', color: room === r ? '#fff' : '#374151', borderColor: room === r ? '#0f172a' : '#d1d5db' }}>{r || 'All rooms'}</button>
                  ))}
                </div>
              )}
              {items.length === 0 && (
                <div style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 14, border: '1px dashed #d1d5db', borderRadius: 8 }}>
                  Nothing yet. When your client adds the things they have chosen on their portal (the Selections tab), they appear here, and you are told.
                </div>
              )}
              {groups.map(g => (
                <div key={g.room} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: '#475569', padding: '6px 2px', borderBottom: '2px solid #e2e8f0', marginBottom: 8 }}>{g.room}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {g.items.map(s => {
                      const imgs = s.files.filter(f => f.mimeType.startsWith('image/') && f.url)
                      const docs = s.files.filter(f => !f.mimeType.startsWith('image/'))
                      const link = safeLink(s.link)
                      const need = neededState(s, today)
                      const draft = drafts[s.id] ?? s.builderReply
                      return (
                        <div key={s.id} style={{ border: `1px solid ${s.isNew ? '#86efac' : '#e2e8f0'}`, background: s.isNew ? '#f7fef9' : '#fff', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <div style={{ width: 120, flexShrink: 0 }}>
                            {imgs[0]
                              ? <a href={imgs[0].url!} target="_blank" rel="noreferrer" style={{ display: 'block', width: 120, height: 100, borderRadius: 8, background: `#f1f5f9 url("${imgs[0].url}") center/cover` }} aria-label="Open photo" />
                              : <div style={{ width: 120, height: 100, borderRadius: 8, background: '#f4f6ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{categoryIcon(s.category)}</div>}
                            {(imgs.length > 1 || docs.length > 0) && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                {imgs.slice(1).map(f => <a key={f.id} href={f.url!} target="_blank" rel="noreferrer" style={{ width: 36, height: 36, borderRadius: 5, background: `#f1f5f9 url("${f.url}") center/cover`, border: '1px solid #e2e8f0' }} aria-label="Open photo" />)}
                                {docs.map(f => f.url && <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.fileName} style={{ fontSize: 11, fontWeight: 600, padding: '4px 6px', borderRadius: 5, background: '#f4f6ef', color: '#334155', textDecoration: 'none' }}>📄 PDF</a>)}
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 240 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{s.title}</strong>
                              {s.isNew && <span style={{ fontSize: 10, fontWeight: 800, background: '#16a34a', color: '#fff', padding: '2px 7px', borderRadius: 99, letterSpacing: 0.5 }}>NEW</span>}
                              <span style={{ fontSize: 12, color: '#64748b' }}>{CATEGORY_LABEL[s.category] ?? ''}</span>
                            </div>
                            {s.details && <div style={{ fontSize: 13, color: '#334155', marginTop: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.details}</div>}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 7, fontSize: 12 }}>
                              {link && <a href={link} target="_blank" rel="noreferrer noopener" style={{ color: '#2563eb', fontWeight: 600 }}>🔗 {linkHost(link) || 'Link'}</a>}
                              <span style={{ background: '#f4f6ef', color: '#475569', fontWeight: 600, padding: '2px 8px', borderRadius: 6 }}>{SUPPLIED_BY_BUILDER_LABEL[s.suppliedBy]}</span>
                              {s.neededBy && <span style={{ fontWeight: 700, color: need ? '#b45309' : '#64748b' }}>Needed by {neededLabel(s.neededBy)}{need === 'late' ? ' (past)' : ''}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                              <select value={s.status} disabled={busy === s.id} onChange={e => setStatus(s, e.target.value as SelectionStatus)}
                                style={{ padding: '5px 8px', border: `1.5px solid ${STATUS_COLOR[s.status]}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: STATUS_COLOR[s.status], background: '#fff' }}>
                                {SELECTION_STATUSES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                              </select>
                              <button onClick={() => remove(s)} disabled={busy === s.id} style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }}>Delete</button>
                            </div>
                            <div style={{ marginTop: 10 }}>
                              <textarea value={draft} rows={2} maxLength={2000} placeholder="Reply to your client (they see this on their portal): e.g. Fine to go ahead, or Lead time is 6 weeks, please confirm by…"
                                onChange={e => setDrafts(d => ({ ...d, [s.id]: e.target.value }))}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
                              {(drafts[s.id] ?? s.builderReply).trim() !== s.builderReply.trim() && (
                                <button onClick={() => saveReply(s)} disabled={busy === s.id} style={{ ...btn, background: '#0369a1', borderColor: '#0369a1', color: '#fff', marginTop: 6 }}>{busy === s.id ? 'Saving…' : 'Save reply'}</button>
                              )}
                              {s.builderRepliedAt && (drafts[s.id] ?? s.builderReply).trim() === s.builderReply.trim() && s.builderReply && (
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Replied {new Date(s.builderRepliedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                Steps: {SELECTION_STATUSES.map(x => x.label).join(' → ')}. A client can change an item until you mark it Ordered. Your client does not get an email when you reply yet: they see it the next time they open their portal.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
