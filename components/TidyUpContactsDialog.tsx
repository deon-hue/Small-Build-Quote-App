'use client'

// "Tidy up contacts": find the contacts that are not used anywhere (or are half filled in), tick the ones to remove, and delete them in one go
// (with the same Xero "also archive" option as a single delete). Also lists contacts deleted before, with a Restore button. What each contact is used
// for comes from lib/contact-usage.ts; the parent works that out and passes it in.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { describeUsage, type UsageItem } from '@/lib/contact-usage'
import type { Client } from '@/lib/types'
import type { DeleteTarget } from './DeleteContactsDialog'

type View = 'unused' | 'incomplete' | 'all'
type TypeFilter = 'all' | 'client' | 'supplier' | 'subcontractor'
interface Gone { id: string; name: string | null; email: string | null; client_type: string | null; deleted_at: string }

const TYPE_LABEL: Record<string, string> = { client: 'Client', supplier: 'Supplier', subcontractor: 'Subcontractor' }
const TYPE_STYLE: Record<string, { bg: string; fg: string }> = { client: { bg: '#e0f2fe', fg: '#075985' }, supplier: { bg: '#fef3c7', fg: '#92400e' }, subcontractor: { bg: '#ecfccb', fg: '#3f6212' } }

export default function TidyUpContactsDialog({ rows, notice, onClose, onDelete }: {
  rows: { c: Client; usage: UsageItem[] }[]
  /** shown in amber at the top, e.g. when part of the usage check could not be done */
  notice?: string
  onClose: () => void
  onDelete: (targets: DeleteTarget[]) => void
}) {
  const [view, setView] = useState<View>('unused')
  const [type, setType] = useState<TypeFilter>('all')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showGone, setShowGone] = useState(false)
  const [gone, setGone] = useState<Gone[] | null>(null)
  const [restored, setRestored] = useState<string | null>(null)

  const isIncomplete = (c: Client) => !(c.email || '').trim() && !(c.phone || '').trim()
  const counts = useMemo(() => ({
    unused: rows.filter(r => r.usage.length === 0).length,
    incomplete: rows.filter(r => isIncomplete(r.c)).length,
    all: rows.length,
  }), [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (view === 'unused' && r.usage.length > 0) return false
      if (view === 'incomplete' && !isIncomplete(r.c)) return false
      if (type !== 'all' && r.c.clientType !== type) return false
      if (needle && !((r.c.name || '') + ' ' + (r.c.email || '') + ' ' + (r.c.phone || '')).toLowerCase().includes(needle)) return false
      return true
    }).sort((a, b) => (a.c.name || '').localeCompare(b.c.name || ''))
  }, [rows, view, type, q])

  function toggle(id: string) { setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const pickedRows = rows.filter(r => picked.has(r.c.id))

  useEffect(() => {
    if (!showGone || gone) return
    createClient().from('deleted_contacts').select('id, name, email, client_type, deleted_at').order('deleted_at', { ascending: false }).limit(300)
      .then(({ data, error }) => setGone(error ? [] : (data ?? []) as Gone[]))
  }, [showGone, gone])

  async function restore(g: Gone) {
    await createClient().from('deleted_contacts').delete().eq('id', g.id)
    setGone(prev => (prev ?? []).filter(x => x.id !== g.id))
    setRestored(g.name || g.email || 'That contact')
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 99, border: '1px solid var(--border)', background: on ? 'var(--slate)' : 'transparent', color: on ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <div className="modal-overlay" style={{ zIndex: 350 }} onClick={onClose}>
      <div className="modal-box" style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Tidy up contacts</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Tick the contacts you no longer need. They'll stay deleted and won't come back from Xero.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {notice && <div style={{ margin: '10px 22px 0', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>{notice}</div>}
        <div style={{ padding: '12px 22px 6px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button style={chip(view === 'unused')} onClick={() => setView('unused')}>Not used anywhere ({counts.unused})</button>
          <button style={chip(view === 'incomplete')} onClick={() => setView('incomplete')}>No email or phone ({counts.incomplete})</button>
          <button style={chip(view === 'all')} onClick={() => setView('all')}>Everything ({counts.all})</button>
          <select value={type} onChange={e => setType(e.target.value as TypeFilter)} style={{ marginLeft: 'auto', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
            <option value="all">All types</option><option value="client">Clients</option><option value="supplier">Suppliers</option><option value="subcontractor">Subcontractors</option>
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, width: 150 }} />
        </div>

        <div style={{ padding: '4px 22px', display: 'flex', gap: 12, fontSize: 12 }}>
          <button className="btn-sm btn-outline" onClick={() => setPicked(prev => { const n = new Set(prev); shown.forEach(r => n.add(r.c.id)); return n })} disabled={shown.length === 0}>Tick all shown ({shown.length})</button>
          <button className="btn-sm btn-outline" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear ticks</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 22px 10px', minHeight: 120 }}>
          {shown.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              {view === 'unused' ? 'Every contact is used somewhere in the app. Nothing to tidy here.' : 'No contacts match.'}
            </div>
          ) : shown.map(r => {
            const st = TYPE_STYLE[r.c.clientType] ?? TYPE_STYLE.client
            const used = r.usage.length > 0
            return (
              <label key={r.c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.has(r.c.id)} onChange={() => toggle(r.c.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {r.c.name || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(no name)</span>}
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: st.bg, color: st.fg }}>{TYPE_LABEL[r.c.clientType] ?? r.c.clientType}</span>
                    {r.c.xeroContactId && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>in Xero</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[r.c.email, r.c.phone].filter(Boolean).join(' · ') || 'No email or phone'}</div>
                </div>
                <div style={{ fontSize: 11.5, textAlign: 'right', maxWidth: 230, color: used ? '#92400e' : '#166534', fontWeight: used ? 500 : 600 }}>
                  {used ? 'Used: ' + describeUsage(r.usage) : 'Not used anywhere'}
                </div>
              </label>
            )
          })}
        </div>

        {showGone && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 22px', maxHeight: 190, overflowY: 'auto', fontSize: 12.5, background: 'var(--cream, #f7f5f0)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Deleted contacts (kept so they don't come back)</div>
            {gone === null ? 'Loading…' : gone.length === 0 ? 'None.' : gone.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{g.name || g.email || '(no name)'} <span style={{ color: 'var(--muted)' }}>· {TYPE_LABEL[g.client_type ?? ''] ?? 'Contact'} · deleted {new Date(g.deleted_at).toLocaleDateString('en-GB')}</span></span>
                <button className="btn-sm btn-outline" onClick={() => restore(g)}>Restore</button>
              </div>
            ))}
            {restored && <div style={{ marginTop: 8, color: '#166534' }}>✓ {restored} is no longer blocked. It comes back the next time Xero syncs (or add it again by hand).</div>}
          </div>
        )}

        <div style={{ padding: '12px 22px 16px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn-sm btn-outline" onClick={() => setShowGone(s => !s)}>{showGone ? 'Hide' : 'Show'} deleted contacts</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button className="btn btn-danger" disabled={pickedRows.length === 0} onClick={() => onDelete(pickedRows.map(r => ({ c: r.c, usage: r.usage })))}>
            Delete {pickedRows.length ? pickedRows.length + ' selected' : 'selected'}…
          </button>
        </div>
      </div>
    </div>
  )
}
