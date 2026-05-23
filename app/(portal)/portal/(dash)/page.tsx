'use client'

import Link from 'next/link'
import { usePortal } from '@/contexts/PortalContext'
import { fmt, STAGE_COLOR, STAGE_LABEL } from '@/lib/utils'

export default function PortalDashboard() {
  const { quotes, jobs, invoices, settings, userEmail, loading, error } = usePortal()

  if (loading) {
    return <div className="portal-loading">Loading your portal…</div>
  }

  if (error === 'no_admin_linked') {
    return (
      <div className="portal-notice">
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h2 style={{ marginBottom: 8 }}>Account not yet linked</h2>
        <p style={{ marginBottom: 8 }}>
          Your account (<strong>{userEmail}</strong>) hasn&apos;t been matched to a client record yet.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Please contact your builder and ask them to add <strong>{userEmail}</strong> to your client record.
          Once they do, your quotes, jobs and invoices will appear here.
        </p>
      </div>
    )
  }

  if (error === 'not_customer') {
    return (
      <div className="portal-notice">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
        <h2 style={{ marginBottom: 8 }}>Admin account detected</h2>
        <p>This portal is for clients only.</p>
        <p style={{ marginTop: 8 }}>
          <Link href="/dashboard" style={{ color: 'var(--moss)', fontWeight: 600 }}>
            Go to the admin dashboard →
          </Link>
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="portal-notice">
        <p>Something went wrong loading your data. Please refresh the page.</p>
      </div>
    )
  }

  const openQuotes = quotes.filter(q => q.status === 'pending' || q.status === 'sent')
  const activeJobs = jobs.filter(j => j.stage === 'active' || j.stage === 'planning')
  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const totalOutstanding = unpaidInvoices.reduce((s, i) => s + i.total, 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)

  return (
    <>
      <div className="portal-page-hd">
        <h1>Welcome back</h1>
        {settings.name && <p className="portal-company-name">{settings.name}</p>}
      </div>

      {/* Summary stats */}
      <div className="portal-stats">
        <div className="portal-stat">
          <div className="portal-stat-num">{openQuotes.length}</div>
          <div className="portal-stat-label">Open Quote{openQuotes.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-num">{activeJobs.length}</div>
          <div className="portal-stat-label">Active Job{activeJobs.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-num">{fmt(totalOutstanding)}</div>
          <div className="portal-stat-label">Outstanding</div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-num">{fmt(totalPaid)}</div>
          <div className="portal-stat-label">Total Paid</div>
        </div>
      </div>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="portal-section">
          <div className="portal-section-title">
            Your Jobs
            <Link href="/portal/jobs" className="portal-section-link">View all →</Link>
          </div>
          {activeJobs.map(j => {
            const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
            const col = STAGE_COLOR[j.stage] || '#888'
            return (
              <div key={j.id} className="portal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{j.type}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{j.address}</div>
                  </div>
                  <span className="portal-badge" style={{ background: col }}>
                    {STAGE_LABEL[j.stage] || j.stage}
                  </span>
                </div>
                <div className="portal-progress">
                  <div className="portal-progress-bar" style={{ width: pct + '%', background: col }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  <span>Week {j.done} of {j.weeks}</span>
                  <span>{pct}% complete</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unpaid invoices */}
      {unpaidInvoices.length > 0 && (
        <div className="portal-section">
          <div className="portal-section-title">
            Awaiting Payment
            <Link href="/portal/invoices" className="portal-section-link">View all →</Link>
          </div>
          {unpaidInvoices.map(inv => (
            <div key={inv.id} className="portal-card" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderLeft: `3px solid ${inv.status === 'overdue' ? '#c0392b' : '#4a90a4'}`,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{inv.ref}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB') : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 17, fontFamily: 'DM Mono, monospace' }}>{fmt(inv.total)}</div>
                <span className="portal-badge" style={{
                  background: inv.status === 'overdue' ? '#c0392b' : '#4a90a4',
                  fontSize: 10,
                }}>
                  {inv.status === 'overdue' ? 'OVERDUE' : 'DUE'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open quotes */}
      {openQuotes.length > 0 && (
        <div className="portal-section">
          <div className="portal-section-title">
            Open Quotes
            <Link href="/portal/quotes" className="portal-section-link">View all →</Link>
          </div>
          {openQuotes.map(q => (
            <div key={q.id} className="portal-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{q.ref}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{q.jobType}</div>
              </div>
              <span className="portal-badge" style={{ background: q.status === 'sent' ? '#4a90a4' : '#888' }}>
                {q.status === 'sent' ? 'Awaiting response' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {!activeJobs.length && !unpaidInvoices.length && !openQuotes.length && (
        <div className="portal-notice">
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <h2 style={{ marginBottom: 6 }}>All up to date</h2>
          <p style={{ color: 'var(--muted)' }}>No outstanding quotes, jobs or invoices right now.</p>
        </div>
      )}
    </>
  )
}
