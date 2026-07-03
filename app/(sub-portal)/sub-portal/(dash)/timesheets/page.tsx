'use client'

import { useSubPortal } from '@/contexts/SubPortalContext'

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_COLOUR: Record<string, { bg: string; text: string }> = {
  approved:  { bg: '#dcfce7', text: '#166534' },
  submitted: { bg: '#fef9c3', text: '#854d0e' },
  queried:   { bg: '#ffedd5', text: '#9a3412' },
  rejected:  { bg: '#fee2e2', text: '#991b1b' },
  paid:      { bg: '#dbeafe', text: '#1e40af' },
}

export default function SubPortalTimesheets() {
  const { timeEntries, contracts, loading } = useSubPortal()

  const contractById = Object.fromEntries(contracts.map(c => [c.id, c]))

  if (loading) return <div className="portal-loading">Loading timesheets…</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Timesheets</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Your logged hours and their approval status</p>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', background: '#f1f5f9', padding: '6px 12px', borderRadius: 8 }}>
          AI timesheet entry coming soon
        </div>
      </div>

      {timeEntries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14 }}>No timesheets logged yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timeEntries.map(e => {
            const contract = contractById[e.sub_contract_id]
            const sc = STATUS_COLOUR[e.status] ?? { bg: '#f1f5f9', text: '#64748b' }
            return (
              <div key={e.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmtDate(e.entry_date)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: sc.bg, color: sc.text }}>
                        {e.status}
                      </span>
                    </div>
                    {contract && (
                      <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                        {contract.job_type || contract.description}
                        {contract.job_address ? ` · ${contract.job_address}` : ''}
                      </div>
                    )}
                    {e.notes && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{e.notes}</div>}
                    {e.start_time && e.finish_time && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                        {e.start_time.slice(0, 5)} – {e.finish_time.slice(0, 5)}
                        {e.break_mins > 0 ? ` (${e.break_mins}min break)` : ''}
                      </div>
                    )}
                    {e.admin_notes && (
                      <div style={{ marginTop: 6, fontSize: 11, padding: '5px 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, color: '#92400e' }}>
                        💬 {e.admin_notes}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', flexShrink: 0 }}>
                    {e.units}h
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
