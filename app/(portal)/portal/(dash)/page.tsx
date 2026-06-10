'use client'

import Link from 'next/link'
import { usePortal } from '@/contexts/PortalContext'
import { fmt, STAGE_COLOR, STAGE_LABEL } from '@/lib/utils'

function PortalError({ error, userEmail, reload }: { error: string; userEmail: string; reload: () => void }) {
  if (error === 'setup_required') {
    return (
      <div className="portal-notice">
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔧</div>
        <h2 style={{ marginBottom: 8 }}>Portal not set up yet</h2>
        <p>The admin needs to run the database setup (phase3.sql) before the portal can be used.</p>
        <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
          If you&apos;re the builder, please open Supabase → SQL Editor and run the phase3.sql migration.
        </p>
        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={reload}>Try again</button>
      </div>
    )
  }

  if (error === 'not_customer') {
    return (
      <div className="portal-notice">
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
        <h2 style={{ marginBottom: 8 }}>Admin account detected</h2>
        <p>This portal is for clients only. Your account is set up as an admin.</p>
        <p style={{ marginTop: 8 }}>
          <Link href="/dashboard" style={{ color: 'var(--moss)', fontWeight: 600 }}>
            Go to the admin dashboard →
          </Link>
        </p>
      </div>
    )
  }

  if (error === 'no_admin_linked') {
    return (
      <div className="portal-notice">
        <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
        <h2 style={{ marginBottom: 8 }}>Account not yet linked</h2>
        <p>
          Your account (<strong>{userEmail}</strong>) hasn&apos;t been matched to a client record yet.
        </p>
        <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>
          Please contact your builder and ask them to save <strong>{userEmail}</strong> as your email address in the Clients list.
          Once they do, your quotes, jobs and invoices will appear here automatically.
        </p>
        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={reload}>Check again</button>
      </div>
    )
  }

  // Generic / rpc_error / no_profile
  return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        We couldn&apos;t load your portal data.
        {error === 'rpc_error' && ' This may mean the database setup hasn\'t been run yet.'}
      </p>
      <button className="btn btn-primary" onClick={reload}>Try again</button>
    </div>
  )
}

export default function PortalDashboard() {
  const { quotes, jobs, invoices, variations, settings, userEmail, loading, error, reload } = usePortal()

  if (loading) {
    return (
      <div className="portal-loading">
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        Loading your portal…
      </div>
    )
  }

  if (error) {
    return <PortalError error={error} userEmail={userEmail} reload={reload} />
  }

  const openQuotes     = quotes.filter(q => q.status === 'pending' || q.status === 'sent')
  const activeJobs     = jobs.filter(j => j.stage === 'active' || j.stage === 'planning')
  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')

  // Financial summary
  const totalQuoteValue  = jobs.reduce((s, j) => s + (j.value || 0), 0)
  const totalVariations  = variations
    .filter(v => ['approved', 'invoiced', 'paid'].includes(v.status))
    .reduce((s, v) => s + v.total, 0)
  const totalInvoiced    = invoices.reduce((s, i) => s + i.total, 0)
  const totalPaid        = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const balanceDue       = (totalQuoteValue + totalVariations) - totalPaid

  return (
    <>
      <div className="portal-page-hd">
        <h1>Welcome back</h1>
        {settings.name && <p className="portal-company-name">{settings.name}</p>}
      </div>

      {/* Financial summary */}
      <div className="portal-stats">
        <div className="portal-stat">
          <div className="portal-stat-num">{fmt(totalQuoteValue)}</div>
          <div className="portal-stat-label">Quote Value</div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-num">{fmt(totalVariations)}</div>
          <div className="portal-stat-label">Variations</div>
        </div>
        <div className="portal-stat">
          <div className="portal-stat-num">{fmt(totalInvoiced)}</div>
          <div className="portal-stat-label">Invoiced</div>
        </div>
        <div className="portal-stat" style={{ borderTop: '2px solid var(--moss)' }}>
          <div className="portal-stat-num" style={{ color: balanceDue > 0 ? 'var(--moss)' : '#27ae60' }}>
            {fmt(balanceDue)}
          </div>
          <div className="portal-stat-label">Balance Due</div>
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
