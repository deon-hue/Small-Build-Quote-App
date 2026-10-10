'use client'

// Owner area > Change log: everything that changed, in one list, newest first. Two kinds:
//   • Software releases: what was put live and when, in plain English (lib/release-notes.ts)
//   • Phase and task changes: every change to a company's Phases & Tasks, with who, when and before/after. Recorded by the database itself
//     (supabase/bo-change-log.sql), so it can't be switched off or edited from the app.

import { useMemo, useState } from 'react'
import { useOwnerData, ErrorNote, PageTitle, TH, TD } from '@/components/OwnerUi'
import { fmtDateTime } from '@/lib/owner-api'
import { detailLines, whatText, type ChangeRow } from '@/lib/bo-change-text'
import { RELEASE_NOTES } from '@/lib/release-notes'

interface DataRow extends ChangeRow { id: number; at: string; by_email: string | null; company: string | null }
type Filter = 'all' | 'software' | 'phases'

interface Line { key: string; at: string; kind: 'software' | 'phases'; company: string; by: string; what: string; item: React.ReactNode; detail: string[]; search: string }

export default function OwnerChangeLogPage() {
  const { data, error, loading } = useOwnerData<DataRow[]>('owner_bo_change_log', { p_limit: 500 })
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const lines = useMemo<Line[]>(() => {
    const software: Line[] = RELEASE_NOTES.map((r, i) => ({
      key: 'r' + i, at: r.at, kind: 'software', company: 'Everyone', by: '—', what: 'Software update',
      item: <><strong style={{ fontWeight: 600 }}>{r.title}</strong></>, detail: [r.detail], search: `${r.title} ${r.detail} software update`,
    }))
    const phases: Line[] = (data ?? []).map(r => {
      const detail = detailLines(r)
      return {
        key: 'p' + r.id, at: r.at, kind: 'phases', company: r.company || '—', by: r.by_email || 'the system', what: whatText(r),
        item: <>{r.item_name || '—'}{r.parent_name ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · in {r.parent_name}</span> : null}</>,
        detail, search: [r.item_name, r.parent_name, r.company, r.by_email, whatText(r), ...detail].join(' '),
      }
    })
    return [...software, ...phases].sort((a, b) => b.at.localeCompare(a.at))
  }, [data])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return lines.filter(l => (filter === 'all' || l.kind === filter) && (!needle || l.search.toLowerCase().includes(needle)))
  }, [lines, filter, q])

  const chip = (on: boolean): React.CSSProperties => ({ padding: '5px 13px', borderRadius: 99, border: '1px solid var(--border, #d1d5db)', background: on ? '#334155' : 'transparent', color: on ? '#fff' : 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })

  return (
    <>
      <PageTitle sub="Everything that has changed, newest first: software updates we put live, and changes to Phases & Tasks.">Change log</PageTitle>
      <ErrorNote message={error} />
      {error && /owner_bo_change_log|does not exist|function/i.test(error) && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
          The Phases &amp; Tasks changes need one database update: run <code>supabase/bo-change-log.sql</code> in Supabase (staging first, then live), then reload. Software updates show below regardless.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button style={chip(filter === 'all')} onClick={() => setFilter('all')}>Everything</button>
        <button style={chip(filter === 'software')} onClick={() => setFilter('software')}>Software updates</button>
        <button style={chip(filter === 'phases')} onClick={() => setFilter('phases')}>Phases &amp; Tasks changes</button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ marginLeft: 'auto', padding: '6px 11px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 13, width: 240, maxWidth: '100%' }} />
      </div>
      {loading && !data && !error && <div style={{ color: 'var(--muted)', marginBottom: 8 }}>Loading Phases &amp; Tasks changes…</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr><th style={TH}>When</th><th style={TH}>Company</th><th style={TH}>By</th><th style={TH}>What</th><th style={TH}>Item</th><th style={TH}>Detail</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} style={{ ...TD, color: 'var(--muted)' }}>Nothing matches.</td></tr>}
            {shown.map(l => (
              <tr key={l.key}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDateTime(l.at)}</td>
                <td style={TD}>{l.company}</td>
                <td style={TD}>{l.by}</td>
                <td style={TD}>{l.what}</td>
                <td style={TD}>{l.item}</td>
                <td style={{ ...TD, fontSize: 12.5, color: 'var(--muted)' }}>{l.detail.map((d, i) => <div key={i}>{d}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
