'use client'

import { useOwnerData, ErrorNote, PageTitle, TH, TD } from '@/components/OwnerUi'
import { fmtDateTime } from '@/lib/owner-api'

interface AuditRow { id: number; at: string; admin_email: string; action: string; target_company: string | null; details: Record<string, unknown> }

const LABELS: Record<string, string> = {
  set_limits: 'Changed limits', pause: 'Paused account', resume: 'Re-opened account', create_invite: 'Made invite code',
  delete_invite: 'Deleted invite code', update_feedback: 'Updated feedback',
}

export default function OwnerAuditPage() {
  const { data, error, loading } = useOwnerData<AuditRow[]>('owner_audit_list')
  return (
    <>
      <PageTitle sub="Everything changed from the owner area, newest first (last 200).">Audit log</PageTitle>
      <ErrorNote message={error} />
      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr><th style={TH}>When</th><th style={TH}>Who</th><th style={TH}>What</th><th style={TH}>Company</th><th style={TH}>Details</th></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={5} style={{ ...TD, color: 'var(--muted)' }}>Nothing yet.</td></tr>}
              {data.map(a => (
                <tr key={a.id}>
                  <td style={TD}>{fmtDateTime(a.at)}</td><td style={TD}>{a.admin_email}</td>
                  <td style={TD}>{LABELS[a.action] || a.action}</td><td style={TD}>{a.target_company || '—'}</td>
                  <td style={{ ...TD, fontSize: 12.5, color: 'var(--muted)' }}>{Object.keys(a.details || {}).length ? JSON.stringify(a.details) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
