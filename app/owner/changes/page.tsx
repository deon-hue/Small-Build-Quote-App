'use client'

// Owner area > Phase changes: every change made to any company's Phases & Tasks (added, renamed, moved, re-worded, deleted, restored), with who, when and
// what it was before and after. Recorded by the database itself (supabase/bo-change-log.sql) so it can't be switched off or edited from the app.

import { useMemo, useState } from 'react'
import { useOwnerData, ErrorNote, PageTitle, TH, TD } from '@/components/OwnerUi'
import { fmtDateTime } from '@/lib/owner-api'
import { detailLines, whatText, type ChangeRow } from '@/lib/bo-change-text'

interface Row extends ChangeRow { id: number; at: string; by_email: string | null; company: string | null }

export default function OwnerChangesPage() {
  const { data, error, loading } = useOwnerData<Row[]>('owner_bo_change_log', { p_limit: 500 })
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!data) return []
    return !needle ? data : data.filter(r => (
      [r.item_name, r.parent_name, r.company, r.by_email, whatText(r), ...detailLines(r)].join(' ').toLowerCase().includes(needle)
    ))
  }, [data, q])

  return (
    <>
      <PageTitle sub="Every change to a company's Phases & Tasks, newest first (last 500). Recorded automatically; it can't be edited or switched off.">Phase changes</PageTitle>
      <ErrorNote message={error} />
      {error && /owner_bo_change_log|does not exist|function/i.test(error) && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
          This needs one database update: run <code>supabase/bo-change-log.sql</code> in Supabase (staging first, then live), then reload.
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by item, company, person or change…" style={{ padding: '7px 11px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 13, width: 320, maxWidth: '100%', marginBottom: 12 }} />
      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr><th style={TH}>When</th><th style={TH}>Company</th><th style={TH}>By</th><th style={TH}>What</th><th style={TH}>Item</th><th style={TH}>Detail</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} style={{ ...TD, color: 'var(--muted)' }}>{data.length === 0 ? 'Nothing recorded yet. Changes made from now on appear here.' : 'Nothing matches.'}</td></tr>}
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                  <td style={TD}>{r.company || '—'}</td>
                  <td style={TD}>{r.by_email || 'the system'}</td>
                  <td style={TD}>{whatText(r)}</td>
                  <td style={TD}>{r.item_name || '—'}{r.parent_name ? <span style={{ color: 'var(--muted)', fontSize: 12 }}> · in {r.parent_name}</span> : null}</td>
                  <td style={{ ...TD, fontSize: 12.5, color: 'var(--muted)' }}>{detailLines(r).map((l, i) => <div key={i}>{l}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
