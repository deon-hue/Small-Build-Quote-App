'use client'

import { useState } from 'react'
import { useOwnerData, ErrorNote, PageTitle, Badge } from '@/components/OwnerUi'
import { ownerRpc, fmtDateTime } from '@/lib/owner-api'

interface Feedback {
  id: string; created_at: string; company_name: string; email: string; page: string; message: string; status: 'new' | 'seen' | 'done'; note: string
}

function FeedbackCard({ f, onSaved }: { f: Feedback; onSaved: () => void }) {
  const [note, setNote] = useState(f.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function setStatus(status: Feedback['status']) {
    setBusy(true); setErr('')
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_update_feedback', { p_id: f.id, p_status: status, p_note: note })
      if (!r.ok) throw new Error(r.error || 'Could not save')
      onSaved()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ opacity: f.status === 'done' ? 0.7 : 1 }}>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <strong>{f.company_name || '(unknown company)'}</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{f.email}</span>
          <Badge tone={f.status === 'new' ? 'amber' : f.status === 'seen' ? 'grey' : 'green'}>{f.status}</Badge>
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{fmtDateTime(f.created_at)}</span>
        </div>
        {f.page && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>On page: <code>{f.page}</code></div>}
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{f.message}</div>
        <div style={{ marginTop: 12 }}>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Your note (only you see this)" style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {(['new', 'seen', 'done'] as const).map(s => (
              <button key={s} className={f.status === s ? 'btn btn-primary' : 'btn btn-outline'} style={{ padding: '4px 12px', fontSize: 12.5 }} disabled={busy} onClick={() => setStatus(s)}>
                {s === 'new' ? 'Mark new' : s === 'seen' ? 'Mark seen' : 'Mark done'}
              </button>
            ))}
          </div>
          <ErrorNote message={err} />
        </div>
      </div>
    </div>
  )
}

export default function OwnerFeedbackPage() {
  const { data, error, loading, reload } = useOwnerData<Feedback[]>('owner_list_feedback')
  return (
    <>
      <PageTitle sub="What your friends send from the “Report a problem” button inside the app, tagged with their company and the page they were on.">Feedback</PageTitle>
      <ErrorNote message={error} />
      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && data.length === 0 && <div style={{ color: 'var(--muted)' }}>Nothing yet.</div>}
      {data?.map(f => <FeedbackCard key={f.id} f={f} onSaved={reload} />)}
    </>
  )
}
