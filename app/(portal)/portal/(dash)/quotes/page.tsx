'use client'

import { usePortal } from '@/contexts/PortalContext'
import { calcPhaseSell } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', sent: 'Sent to you', accepted: 'Accepted', declined: 'Declined',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#4a90a4', accepted: '#7ab533', declined: '#c0392b',
}
const fmt = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PortalQuotesPage() {
  const { quotes, loading, error } = usePortal()

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load quotes.</p></div>
  }

  return (
    <>
      <div className="portal-page-hd">
        <h1>Your Quotes</h1>
        <p>{quotes.length} quote{quotes.length !== 1 ? 's' : ''} on file</p>
      </div>

      {!quotes.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <p>No quotes on file yet.</p>
        </div>
      ) : (
        quotes.map(q => {
          const total = q.phases.reduce((s, p) => s + calcPhaseSell(p, q.markup), 0)
          const vatTotal = q.vatIncluded ? total * 1.2 : total
          return (
            <div key={q.id} className="portal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{q.ref}</div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{q.jobType}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {q.savedDate ? `Issued ${q.savedDate}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'DM Mono, monospace' }}>{fmt(vatTotal)}</div>
                  {q.vatIncluded && <div style={{ fontSize: 11, color: 'var(--muted)' }}>inc. VAT</div>}
                  <span className="portal-badge" style={{ background: STATUS_COLOR[q.status] || '#888', marginTop: 6, display: 'inline-block' }}>
                    {STATUS_LABEL[q.status] || q.status}
                  </span>
                </div>
              </div>

              {/* Phases breakdown */}
              {q.phases.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                    Work Phases
                  </div>
                  {q.phases.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{p.phase}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--moss)', fontWeight: 600 }}>
                        {fmt(calcPhaseSell(p, q.markup))}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 8 }}>
                    <span>Total{q.vatIncluded ? ' (inc. 20% VAT)' : ''}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{fmt(vatTotal)}</span>
                  </div>
                </div>
              )}

              {/* Scope of works */}
              {q.scope && (
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Scope of Works</div>
                  {q.scope}
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}
