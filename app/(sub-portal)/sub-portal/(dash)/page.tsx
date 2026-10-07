'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useSubPortal } from '@/contexts/SubPortalContext'
import { SubNextDaysCard } from '@/components/SubScheduleView'
import SubHomeTiles, { type SubTileKey } from '@/components/SubHomeTiles'
import { useSubLook } from '@/contexts/SubLookContext'
import { expandSchedule } from '@/lib/task-days'

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// Shown under a sign-in problem: which email this phone is signed in as, and a way to sign out and use the right one. The usual cause of "not linked"
// is signing in with a different email address from the one the office saved for the person.
function SignedInAs() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')).catch(() => {})
  }, [])
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/sub-portal/login')
    router.refresh()
  }
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0', fontSize: 12.5, color: 'var(--muted)' }}>
      {email && <div style={{ marginBottom: 8 }}>You are signed in as <strong style={{ color: '#0f172a' }}>{email}</strong>. If that is not the email address the office has saved for you, sign out and sign in with the right one.</div>}
      <button className="btn btn-outline" onClick={signOut}>Sign out</button>
    </div>
  )
}

const TILE_ROUTES: Record<SubTileKey, string> = {
  time: '/sub-portal/timesheets', notes: '/sub-portal/notes', schedule: '/sub-portal/schedule',
  calendar: '/sub-portal/calendar', timesheets: '/sub-portal/timesheets', payments: '/sub-portal/payments',
}

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
  if (error === 'no_sub_linked' || error === 'not_subcontractor' || error === 'no_profile') return (
    <div className="portal-notice">
      <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
      <h2>Account not linked</h2>
      <p>Your email hasn&apos;t been matched to a subcontractor record yet. Please contact the office and ask them to save your email address in the system.</p>
      <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={reload}>Check again</button>
      <SignedInAs />
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
      <SignedInAs />
    </div>
  )
}

export default function SubPortalDashboard() {
  const router = useRouter()
  const { contracts, timeEntries, paymentStages, subName, schedule, companyCalendarStatus, loading, error, reload } = useSubPortal()
  const { look } = useSubLook()

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

  // For rate subs (no payment stages), sum from admin time log amounts instead.
  // status='paid' = cash handed over; 'approved' = billed but not yet received by sub.
  const paidFromStages = paymentStages.filter(p => !!p.paid_date).reduce((s, p) => s + (p.amount || 0), 0)
  const outstandingFromStages = paymentStages.filter(p => !p.paid_date).reduce((s, p) => s + (p.amount || 0), 0)
  const paidFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && (e.status === 'paid' || e.payment_method != null))
    .reduce((s, e) => s + Number(e.amount), 0)
  const outstandingFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && e.status !== 'paid' && e.payment_method == null && e.status !== 'rejected')
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
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a' }}>
          {greet}{subName ? `, ${subName.split(' ')[0]}` : ''} 👋
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', marginTop: 4 }}>
          {contracts.length} active job{contracts.length !== 1 ? 's' : ''} · Here&apos;s your overview
        </p>
      </div>

      {/* The big tiles: each opens its own page (Add my time is the one they use most) */}
      <SubHomeTiles style={look.style} calendarLabel={companyCalendarStatus === 'off' ? 'Calendar' : 'Company calendar'} onSelect={k => router.push(TILE_ROUTES[k])} />

      {/* The days they are booked on site */}
      <div style={{ marginTop: 20 }}>
        <SubNextDaysCard days={expandSchedule(schedule, new Date())} onSeeAll={() => router.push('/sub-portal/schedule')} />
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 18 }}>
        {[
          { label: 'Active Jobs',       value: contracts.length,              mono: false, color: '#6366f1' },
          { label: 'Hours This Month',  value: `${hoursThisMonth.toFixed(1)}h`, mono: true,  color: '#0ea5e9' },
          { label: 'Total Paid',        value: fmt(totalPaid),                mono: true,  color: '#10b981' },
          { label: 'Outstanding',       value: fmt(totalOutstanding),         mono: true,  color: totalOutstanding > 0 ? '#f59e0b' : '#94a3b8' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: card.mono ? 'monospace' : undefined }}>{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
