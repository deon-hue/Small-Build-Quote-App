'use client'

// The client portal's Selections page, as a plain display component. It is used by BOTH the real client portal (app/(portal)/portal/(dash)/selections/page.tsx) and the builder's
// "preview what the client sees" page (app/(app)/portal-preview/page.tsx), so the two cannot drift apart: change the screen here and both show it. The preview passes `preview`,
// which switches adding, changing and deleting off.

import { useMemo, useState } from 'react'
import {
  type Selection, SELECTION_STATUSES, STATUS_COLOR, STATUS_LABEL, CATEGORY_LABEL, categoryIcon, SUPPLIED_BY_LABEL,
  clientCanEdit, clientCanDelete, neededState, neededLabel, safeLink, linkHost,
} from '@/lib/selections'

const isImage = (m: string) => m.startsWith('image/')

function Photos({ item }: { item: Selection }) {
  const imgs = item.files.filter(f => isImage(f.mimeType) && f.url)
  const docs = item.files.filter(f => !isImage(f.mimeType))
  const cover = imgs[0]
  return (
    <div>
      {cover ? (
        <a href={cover.url!} target="_blank" rel="noreferrer" style={{ display: 'block', height: 150, background: `#f1f5f9 url("${cover.url}") center/cover no-repeat` }} aria-label={`Open the photo of ${item.title}`} />
      ) : (
        <div style={{ height: 90, background: '#f4f6ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>{categoryIcon(item.category)}</div>
      )}
      {(imgs.length > 1 || docs.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 12px 0' }}>
          {imgs.slice(1).map(f => (
            <a key={f.id} href={f.url!} target="_blank" rel="noreferrer" style={{ width: 44, height: 44, borderRadius: 6, background: `#f1f5f9 url("${f.url}") center/cover no-repeat`, border: '1px solid var(--border)' }} aria-label="Open photo" />
          ))}
          {docs.map(f => f.url
            ? <a key={f.id} href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, padding: '6px 9px', borderRadius: 6, background: 'var(--warm, #f4f6ef)', color: 'var(--ink)', textDecoration: 'none' }}>📄 {f.fileName || 'Document'}</a>
            : <span key={f.id} style={{ fontSize: 12, color: 'var(--muted)' }}>📄 {f.fileName}</span>)}
        </div>
      )}
    </div>
  )
}

export function StatusPill({ status }: { status: Selection['status'] }) {
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#fff', background: STATUS_COLOR[status], whiteSpace: 'nowrap' }}>{STATUS_LABEL[status]}</span>
}

export default function PortalSelectionsView({ items, jobs, jobId, onJobChange, loading, missing, error, onAdd, onEdit, onDelete, onSetStatus, preview, today, busyId, companyName }: {
  items: Selection[]
  jobs: { id: string; title?: string; type: string; address?: string }[]
  jobId: string
  onJobChange?: (id: string) => void
  loading?: boolean
  /** the database has not had supabase/job-selections.sql run yet */
  missing?: boolean
  error?: string
  onAdd?: () => void
  onEdit?: (s: Selection) => void
  onDelete?: (s: Selection) => void
  /** the client says "I have decided" (chosen) or "back to an idea" */
  onSetStatus?: (s: Selection, status: 'idea' | 'chosen') => void
  /** the builder's preview: nothing can be added or changed */
  preview?: boolean
  today: string
  busyId?: string | null
  companyName?: string
}) {
  const [room, setRoom] = useState('')
  const rooms = useMemo(() => { const seen: string[] = []; for (const s of items) { const r = s.room.trim() || 'Other'; if (!seen.includes(r)) seen.push(r) } return seen }, [items])
  const shown = items.filter(s => !room || (s.room.trim() || 'Other') === room)
  const urgent = items.filter(s => neededState(s, today) !== '').sort((a, b) => a.neededBy.localeCompare(b.neededBy)).slice(0, 3)
  const builder = companyName || 'your builder'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div className="portal-page-hd" style={{ marginBottom: 8 }}>
          <h1>Selections</h1>
          <p>Add the things you have chosen for your home: skirting, light fittings, tiles, taps. {companyName ? companyName : 'Your builder'} sees them straight away and can tell you if anything needs ordering early.</p>
        </div>
        {!preview && onAdd && !missing && <button className="btn btn-primary" onClick={onAdd}>＋ Add an item</button>}
      </div>

      {jobs.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Project</label>
          <select value={jobId} onChange={e => onJobChange?.(e.target.value)} style={{ padding: '8px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 14, maxWidth: '100%' }}>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title || j.type}{j.address ? ` · ${j.address}` : ''}</option>)}
          </select>
        </div>
      )}

      {missing && <div className="portal-notice"><h2>Selections are not switched on yet</h2><p>Please ask {builder} to switch them on for you.</p></div>}
      {error && <div className="portal-alert portal-alert-error">{error}</div>}
      {loading && !missing && <div className="portal-loading">Loading your selections…</div>}

      {!loading && !missing && urgent.length > 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '11px 14px', fontSize: 13, color: '#5d4037', marginBottom: 16, lineHeight: 1.6 }}>
          <strong>Needed soon:</strong>{' '}
          {urgent.map((s, i) => (
            <span key={s.id}>{i > 0 ? '; ' : ''}{s.title} (by {neededLabel(s.neededBy)}{neededState(s, today) === 'late' ? ', past date' : ''})</span>
          ))}
          . {builder === 'your builder' ? 'Your builder' : builder} needs these decided in time to avoid a delay.
        </div>
      )}

      {!loading && !missing && rooms.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 14px' }}>
          {['', ...rooms].map(r => (
            <button key={r || 'all'} onClick={() => setRoom(r)} style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 13px', borderRadius: 99, border: '1.5px solid ' + (room === r ? 'var(--ink)' : 'var(--border)'), background: room === r ? 'var(--ink)' : '#fff', color: room === r ? '#fff' : 'var(--muted)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
              {r || 'All'} ({r ? items.filter(s => (s.room.trim() || 'Other') === r).length : items.length})
            </button>
          ))}
        </div>
      )}

      {!loading && !missing && items.length === 0 && (
        <div className="portal-notice">
          <h2>Nothing here yet</h2>
          <p>{preview ? 'When this client adds the things they have chosen, they appear here.' : 'Add your first item: a photo of the skirting you like, the light fitting you have found, or the taps you want. You can come back and add more at any time.'}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {shown.map(s => {
          const need = neededState(s, today)
          const link = safeLink(s.link)
          return (
            <div key={s.id} className="portal-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
              <Photos item={s} />
              <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{[s.room.trim(), CATEGORY_LABEL[s.category] ?? ''].filter(Boolean).join(' · ')}</div>
                {s.details && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.details}</div>}
                {link && <div style={{ fontSize: 12, marginTop: 6 }}><a href={link} target="_blank" rel="noreferrer noopener" style={{ color: '#2563eb', overflowWrap: 'anywhere' }}>🔗 {linkHost(link) || 'Link'}</a></div>}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  <StatusPill status={s.status} />
                  {s.suppliedBy !== 'unsure' && <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--warm, #f4f6ef)', color: '#475569', padding: '3px 8px', borderRadius: 6 }}>{SUPPLIED_BY_LABEL[s.suppliedBy]}</span>}
                  {s.neededBy && <span style={{ fontSize: 12, fontWeight: 700, color: need ? '#b45309' : '#64748b' }}>Needed by {neededLabel(s.neededBy)}</span>}
                </div>
                {s.builderReply && (
                  <div style={{ marginTop: 10, background: '#f0f9ff', borderLeft: '3px solid #38bdf8', borderRadius: '0 6px 6px 0', padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5, color: '#0c4a6e', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <b style={{ display: 'block', fontSize: 11, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#0369a1', marginBottom: 2 }}>{companyName || 'Your builder'}</b>{s.builderReply}
                  </div>
                )}
                {!preview && (clientCanEdit(s) || clientCanDelete(s)) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 12 }}>
                    {clientCanEdit(s) && <button className="btn-sm btn-outline" disabled={busyId === s.id} onClick={() => onEdit?.(s)}>Edit</button>}
                    {s.status === 'idea' && <button className="btn-sm btn-outline" disabled={busyId === s.id} onClick={() => onSetStatus?.(s, 'chosen')} title="Tell your builder you have decided">✓ I have decided</button>}
                    {s.status === 'chosen' && <button className="btn-sm btn-outline" disabled={busyId === s.id} onClick={() => onSetStatus?.(s, 'idea')}>Back to an idea</button>}
                    {clientCanDelete(s) && <button className="btn-sm btn-outline" disabled={busyId === s.id} style={{ color: '#dc2626' }} onClick={() => onDelete?.(s)}>Delete</button>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!loading && !missing && items.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6 }}>
          Steps: {SELECTION_STATUSES.map(x => x.label).join(' → ')}. You can change an item until it is ordered.
        </p>
      )}
    </div>
  )
}
