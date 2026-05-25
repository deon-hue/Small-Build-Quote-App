'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PortalGanttChart from '@/components/PortalGanttChart'
import type { GanttState } from '@/lib/types'
import { fmt, Q_BADGE, Q_LABEL, STAGE_COLOR, STAGE_LABEL } from '@/lib/utils'

// ── Types mirroring what the RPC returns ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

interface PreviewJob {
  id: string; client: string; type: string; address: string
  value: number; stage: string; start: string; weeks: number
  done: number; notes: string; ganttState: GanttState | null
}
interface PreviewQuote {
  id: string; ref: string; savedDate: string; status: string
  jobType: string; customer: AnyRecord; phases: AnyRecord[]
  markup: number; vatIncluded: boolean
}
interface PreviewInvoice {
  id: string; ref: string; clientName: string; total: number
  status: string; issueDate: string; dueDate: string
}
interface PreviewSettings {
  name: string; tagline: string; email: string; phone: string; address: string; logo: string
}

function quoteTotal(q: PreviewQuote): number {
  const net = q.phases.reduce((s: number, p: AnyRecord) =>
    s + (p.items || []).reduce((ps: number, i: AnyRecord) =>
      ps + (Number(i.labour) || 0) + (Number(i.materials) || 0)
        + (Number(i.plant) || 0) + (Number(i.subcontractors) || 0) + (Number(i.other) || 0),
      0), 0)
  const sub = net * (1 + (q.markup || 0) / 100)
  return sub + (q.vatIncluded ? sub * 0.2 : 0)
}

// ── Main preview component ───────────────────────────────────
function PortalPreviewInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientName, setClientName] = useState('')
  const [jobs, setJobs] = useState<PreviewJob[]>([])
  const [quotes, setQuotes] = useState<PreviewQuote[]>([])
  const [invoices, setInvoices] = useState<PreviewInvoice[]>([])
  const [settings, setSettings] = useState<PreviewSettings | null>(null)
  const [expandedGantt, setExpandedGantt] = useState<string | null>(null)

  useEffect(() => {
    if (!email) { setError('No client email specified.'); setLoading(false); return }

    async function load() {
      setLoading(true)
      setError('')
      const { data, error: rpcErr } = await supabase.rpc(
        'get_portal_preview_for_admin',
        { p_client_email: email }
      )
      if (rpcErr) {
        setError('Could not load preview. Make sure you have run supabase/phase7.sql in your Supabase dashboard.')
        setLoading(false)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any
      setClientName(d?.client_name || email)

      if (Array.isArray(d?.jobs)) {
        setJobs(d.jobs.map((r: AnyRecord) => ({
          id: r.id, client: r.client, type: r.type, address: r.address || '',
          value: Number(r.value), stage: r.stage,
          start: r.start_date || '', weeks: r.weeks, done: r.done, notes: r.notes || '',
          ganttState: r.gantt_state || null,
        })))
      }
      if (Array.isArray(d?.quotes)) {
        setQuotes(d.quotes.map((r: AnyRecord) => ({
          id: r.id, ref: r.ref, savedDate: r.saved_date || '',
          status: r.status, jobType: r.job_type,
          customer: r.customer || {}, phases: r.phases || [],
          markup: Number(r.markup), vatIncluded: r.vat_included,
        })))
      }
      if (Array.isArray(d?.invoices)) {
        setInvoices(d.invoices.map((r: AnyRecord) => ({
          id: r.id, ref: r.ref, clientName: r.client_name,
          total: Number(r.total), status: r.status,
          issueDate: r.issue_date || '', dueDate: r.due_date || '',
        })))
      }
      if (d?.settings) setSettings(d.settings)
      setLoading(false)
    }
    load()
  }, [email]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ padding: 40, color: 'var(--muted)', fontSize: 14 }}>Loading preview…</div>
  )
  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ background: '#fff0ef', border: '1px solid #f5a0a0', borderRadius: 8, padding: '16px 20px', color: '#c0392b', fontSize: 13, marginBottom: 16 }}>
        ⚠ {error}
      </div>
      <button className="btn btn-outline" onClick={() => router.back()}>← Back</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 60px' }}>

      {/* Admin preview banner */}
      <div style={{
        background: '#fff8dc', border: '1px solid #e6c84a', borderRadius: 8,
        padding: '10px 16px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#856a00' }}>
          👁 Admin Preview
        </span>
        <span style={{ fontSize: 12, color: '#856a00', flex: 1 }}>
          You are viewing the portal as <strong>{clientName}</strong> ({email}).
          This is read-only — changes made here are not saved.
        </span>
        <button className="btn-sm btn-outline" onClick={() => router.back()} style={{ whiteSpace: 'nowrap' }}>
          ← Back to Clients
        </button>
      </div>

      {/* Company header (mirrors portal header) */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        {settings?.logo
          ? <img src={settings.logo} alt="logo" style={{ height: 40, objectFit: 'contain', marginBottom: 8 }} />
          : <div style={{ fontSize: 28, marginBottom: 6 }}>🏗</div>
        }
        <div style={{ fontWeight: 700, fontSize: 18 }}>{settings?.name || 'Client Portal'}</div>
        {settings?.tagline && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{settings.tagline}</div>}
      </div>

      {/* Welcome strip */}
      <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Welcome, {clientName}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {quotes.length} quote{quotes.length !== 1 ? 's' : ''} · {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Jobs ───────────────────────────────────────────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 12 }}>
          Jobs
        </h2>
        {!jobs.length
          ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No jobs on file.</div>
          : jobs.map(j => {
              const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
              const col = STAGE_COLOR[j.stage] || '#888'
              const ganttOpen = expandedGantt === j.id
              return (
                <div key={j.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{j.type}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{j.address}</div>
                      {j.start && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          Started {new Date(j.start).toLocaleDateString('en-GB')}
                        </div>
                      )}
                    </div>
                    <span style={{ background: col, color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                      {STAGE_LABEL[j.stage] || j.stage}
                    </span>
                  </div>
                  {/* Progress */}
                  <div style={{ height: 6, background: '#e8eaec', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', width: pct + '%', background: col, borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    <span>Week {j.done} of {j.weeks}</span>
                    <span style={{ fontWeight: 600 }}>{pct}% complete</span>
                  </div>
                  {j.notes && (
                    <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
                      {j.notes}
                    </div>
                  )}
                  {/* Programme toggle */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button
                      onClick={() => setExpandedGantt(ganttOpen ? null : j.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                        border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px',
                        fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      📋 {ganttOpen ? 'Hide Programme ▲' : 'View Programme ▼'}
                    </button>
                    {ganttOpen && (
                      <PortalGanttChart
                        job={{ ...j, quoteId: undefined, stage: j.stage as 'active' | 'planning' | 'onhold' | 'complete' }}
                        phases={[]}
                        ganttState={j.ganttState}
                      />
                    )}
                  </div>
                </div>
              )
            })
        }
      </section>

      {/* ── Quotes ──────────────────────────────────────────── */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 12 }}>
          Quotes
        </h2>
        {!quotes.length
          ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No quotes on file.</div>
          : quotes.map(q => (
              <div key={q.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', minWidth: 60 }}>{q.ref || '—'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{q.jobType}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Saved {q.savedDate}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(quoteTotal(q))}</div>
                <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>
                  {Q_LABEL[q.status] || q.status}
                </span>
              </div>
            ))
        }
      </section>

      {/* ── Invoices ────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 12 }}>
          Invoices
        </h2>
        {!invoices.length
          ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No invoices on file.</div>
          : invoices.map(inv => (
              <div key={inv.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', minWidth: 70 }}>{inv.ref}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.clientName}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Issued {inv.issueDate} · Due {inv.dueDate}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(inv.total)}</div>
                <span className={`badge ${inv.status === 'paid' ? 'b-active' : inv.status === 'overdue' ? 'b-danger' : 'b-pending'}`}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
              </div>
            ))
        }
      </section>
    </div>
  )
}

export default function PortalPreviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>}>
      <PortalPreviewInner />
    </Suspense>
  )
}
