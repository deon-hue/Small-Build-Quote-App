'use client'

import { useRouter } from 'next/navigation'
import { useSubPortal } from '@/contexts/SubPortalContext'

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function ErrorScreen({ error, subName, reload }: { error: string; subName: string; reload: () => void }) {
  if (error === 'unauthenticated') return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
      <h2>Please sign in</h2>
      <a href="/sub-portal/login" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>Go to sign-in</a>
    </div>
  )
  if (error === 'is_admin') return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>🏗</div>
      <h2>Admin account detected</h2>
      <p>This portal is for subcontractors. <a href="/dashboard" style={{ color: 'var(--moss)' }}>Go to admin dashboard →</a></p>
    </div>
  )
  if (error === 'no_sub_linked' || error === 'not_subcontractor') return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
      <h2>Account not linked</h2>
      <p>Your email hasn&apos;t been matched to a subcontractor record yet. Please contact the office and ask them to save your email address in the system.</p>
      <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={reload}>Check again</button>
    </div>
  )
  if (error === 'no_admin_linked') return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
      <h2>Account not set up</h2>
      <p>Please contact the office to get your portal access set up.</p>
    </div>
  )
  return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h2>Something went wrong</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>We couldn&apos;t load your portal. Please try again.</p>
      <button className="btn btn-primary" onClick={reload}>Try again</button>
    </div>
  )
}

export default function SubPortalDashboard() {
  const router = useRouter()
  const { contracts, timeEntries, paymentStages, subName, loading, error, reload } = useSubPortal()

  if (loading) return (
    <div className="portal-loading">
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      Loading your portal…
    </div>
  )

  if (error) return <ErrorScreen error={error} subName={subName} reload={reload} />

  // ── Derived stats ──────────────────────────────────────────────────────────
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const hoursThisMonth = timeEntries
    .filter(e => e.entry_date.startsWith(thisMonth) && e.status !== 'rejected')
    .reduce((s, e) => s + (e.units || 0), 0)

  // For rate subs (no payment stages), sum from admin time log amounts instead
  const paidFromStages = paymentStages.filter(p => !!p.paid_date).reduce((s, p) => s + (p.amount || 0), 0)
  const outstandingFromStages = paymentStages.filter(p => !p.paid_date).reduce((s, p) => s + (p.amount || 0), 0)
  const paidFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && e.payment_method != null)
    .reduce((s, e) => s + Number(e.amount), 0)
  const outstandingFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && e.payment_method == null && e.status !== 'rejected')
    .reduce((s, e) => s + Number(e.amount), 0)
  const totalPaid = paymentStages.length > 0 ? paidFromStages : paidFromEntries
  const totalOutstanding = paymentStages.length > 0 ? outstandingFromStages : outstandingFromEntries

  const recentEntries = timeEntries.slice(0, 5)

  const statusColour: Record<string, string> = {
    approved: '#16a34a', submitted: '#d97706', queried: '#d97706',
    rejected: '#dc2626', paid: '#2563eb',
  }

  const greetHour = now.getHours()
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

      {/* Welcome */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
          {greet}{subName ? `, ${subName.split(' ')[0]}` : ''} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {contracts.length} active job{contracts.length !== 1 ? 's' : ''} · Here&apos;s your overview
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Active Jobs',       value: contracts.length,              mono: false, color: '#6366f1' },
          { label: 'Hours This Month',  value: `${hoursThisMonth.toFixed(1)}h`, mono: true,  color: '#0ea5e9' },
          { label: 'Total Paid',        value: fmt(totalPaid),                mono: true,  color: '#10b981' },
          { label: 'Outstanding',       value: fmt(totalOutstanding),         mono: true,  color: totalOutstanding > 0 ? '#f59e0b' : '#94a3b8' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.color, fontFamily: card.mono ? 'monospace' : undefined }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: contracts.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* Active Jobs */}
        {contracts.length > 0 && (
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Active Jobs</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {contracts.map(c => (
                <div key={c.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', flex: 1 }}>{c.job_type || c.description || 'Contract'}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.type === 'fixed' ? '#ede9fe' : '#e0f2fe', color: c.type === 'fixed' ? '#6d28d9' : '#0369a1', flexShrink: 0 }}>
                      {c.type === 'fixed' ? 'Fixed price' : c.rate_type === 'daily' ? 'Day rate' : 'Hourly rate'}
                    </span>
                  </div>
                  {c.job_address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>📍 {c.job_address}</div>}
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                    {c.start_date && <span>Start: {fmtDate(c.start_date)}</span>}
                    {c.end_date   && <span>Due: {fmtDate(c.end_date)}</span>}
                  </div>
                  {c.type === 'rate' && c.rate_amount && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
                      {fmt(c.rate_amount)} / {c.rate_type === 'daily' ? 'day' : 'hour'}
                    </div>
                  )}
                  {c.type === 'fixed' && c.quoted_amount && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6d28d9', fontWeight: 600 }}>
                      Agreed: {fmt(c.quoted_amount)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right column: recent time + payments preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Recent time entries */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Recent Timesheets</h2>
              <button onClick={() => router.push('/sub-portal/timesheets')} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                View all →
              </button>
            </div>
            {recentEntries.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>No timesheets logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentEntries.map(e => (
                  <div key={e.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{fmtDate(e.entry_date)}</div>
                      {e.notes && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{e.units}h</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#f1f5f9', color: statusColour[e.status] || '#64748b' }}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments preview */}
          {paymentStages.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Payments</h2>
                <button onClick={() => router.push('/sub-portal/payments')} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  View all →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {paymentStages.slice(0, 4).map(p => (
                  <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{p.description || 'Payment'}</div>
                      {p.due_date && !p.paid_date && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Due {fmtDate(p.due_date)}</div>}
                      {p.paid_date && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>✓ Paid {fmtDate(p.paid_date)}</div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: p.paid_date ? '#16a34a' : '#0f172a' }}>
                      {fmt(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
