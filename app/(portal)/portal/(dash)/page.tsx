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

  // Financial snapshot
  const totalQuoteValue   = jobs.reduce((s, j) => s + (j.value || 0), 0)
  const approvedVars      = variations.filter(v => ['approved', 'invoiced', 'paid'].includes(v.status))
  const totalVariations   = approvedVars.reduce((s, v) => s + v.total, 0)
  const paidInvoices      = invoices.filter(i => i.status === 'paid')
  const totalPaid         = paidInvoices.reduce((s, i) => s + i.total, 0)
  const balanceDue        = totalQuoteValue + totalVariations - totalPaid
  const allSettled        = balanceDue <= 0

  return (
    <>
      <div className="portal-page-hd">
        <h1>Welcome back</h1>
        {settings.name && <p className="portal-company-name">{settings.name}</p>}
      </div>

      {/* ── Financial snapshot ── */}
      <div className="fin-snapshot">

        {/* Original Quote */}
        <div className="fin-card" style={{ borderTop: '3px solid #4a90a4' }}>
          <div className="fin-card-label" style={{ color: '#4a90a4' }}>Original Quote</div>
          <div className="fin-card-value">{fmt(totalQuoteValue)}</div>
          <div className="fin-card-sub">
            {jobs.length === 1 ? jobs[0].type : `${jobs.length} project${jobs.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Approved Variations */}
        <div className="fin-card" style={{ borderTop: '3px solid #e67e22' }}>
          <div className="fin-card-label" style={{ color: '#e67e22' }}>Approved Variations</div>
          <div className="fin-card-value">{fmt(totalVariations)}</div>
          <div className="fin-card-sub">
            {approvedVars.length === 0
              ? 'No change orders'
              : `${approvedVars.length} change order${approvedVars.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* Paid to Date */}
        <div className="fin-card" style={{ borderTop: '3px solid #7ab533' }}>
          <div className="fin-card-label" style={{ color: '#7ab533' }}>Paid to Date</div>
          <div className="fin-card-value">{fmt(totalPaid)}</div>
          <div className="fin-card-sub">
            {paidInvoices.length === 0
              ? 'No payments yet'
              : `${paidInvoices.length} invoice${paidInvoices.length !== 1 ? 's' : ''} paid`}
          </div>
        </div>

        {/* Balance Due */}
        <div className="fin-card fin-card-due">
          <div className="fin-card-label" style={{ color: 'rgba(255,255,255,0.75)' }}>Balance Due</div>
          <div className="fin-card-value" style={{ color: 'white' }}>
            {fmt(Math.max(0, balanceDue))}
          </div>
          <div className="fin-card-sub" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {allSettled ? 'All payments settled ✓' : 'Quote + variations − paid'}
          </div>
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

      {!activeJobs.length && !openQuotes.length && (
        <div className="portal-notice">
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <h2 style={{ marginBottom: 6 }}>All up to date</h2>
          <p style={{ color: 'var(--muted)' }}>No outstanding quotes, jobs or invoices right now.</p>
        </div>
      )}
    </>
  )
}
