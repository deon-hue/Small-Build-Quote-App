'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PortalGanttChart from '@/components/PortalGanttChart'
import type { GanttState, ClientPortalSettings } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import { fmt, Q_BADGE, Q_LABEL, STAGE_COLOR, STAGE_LABEL, calcPhaseSell, calcItemSell } from '@/lib/utils'
import type { QuotePhase, QuoteItem } from '@/lib/types'

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
  markup: number; vatIncluded: boolean; scope?: string
}
interface PreviewInvoice {
  id: string; ref: string; clientName: string; total: number
  status: string; issueDate: string; dueDate: string
}
interface PreviewSettings {
  name: string; tagline: string; email: string; phone: string; address: string; logo: string
}

type Tab = 'dashboard' | 'quotes' | 'jobs' | 'invoices'

// ── Status maps ──────────────────────────────────────────────
const QUOTE_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', sent: 'Sent — awaiting your approval',
  accepted: 'Approved', declined: 'Declined',
}
const QUOTE_STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#e67e22', accepted: '#7ab533', declined: '#c0392b',
}
const INV_STATUS_COLOR: Record<string, string> = {
  draft: '#aaa', sent: '#4a90a4', paid: '#7ab533', overdue: '#c0392b',
}
const INV_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
}

// ── Helpers ──────────────────────────────────────────────────
// Use the same calcPhaseSell / calcItemSell from utils as the real portal and
// QuoteWorkspace so totals are always consistent. The phases JSONB is stored
// with camelCase keys (plantHire, not plant) so the cast is safe.
function quoteTotal(q: PreviewQuote): number {
  const sub = (q.phases as unknown as QuotePhase[]).reduce(
    (s, p) => s + calcPhaseSell(p, q.markup || 0), 0)
  return sub * (q.vatIncluded ? 1.2 : 1)
}
function phaseNet(phase: AnyRecord, markup: number): number {
  return calcPhaseSell(phase as unknown as QuotePhase, markup)
}
function itemNet(item: AnyRecord, markup: number): number {
  return calcItemSell(item as unknown as QuoteItem, markup)
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
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [expandedGantt, setExpandedGantt] = useState<string | null>(null)
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null)
  const [clientSettings, setClientSettings] = useState<ClientPortalSettings>(DEFAULT_CLIENT_PORTAL_SETTINGS)

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
          scope: r.scope || '',
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
      if (d?.client_settings && typeof d.client_settings === 'object') {
        setClientSettings({ ...DEFAULT_CLIENT_PORTAL_SETTINGS, ...(d.client_settings as Partial<ClientPortalSettings>) })
      } else {
        setClientSettings(DEFAULT_CLIENT_PORTAL_SETTINGS)
      }
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

  const TAB_LABELS: Record<Tab, string> = {
    dashboard: 'Dashboard', quotes: 'Quotes', jobs: 'Jobs', invoices: 'Invoices',
  }

  return (
    <div className="portal-wrap" style={{ minHeight: '100vh', position: 'relative' }}>

      {/* ── Real portal header — exactly what the customer sees ── */}
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-logo">
            {settings?.logo
              ? <img src={settings.logo} alt="logo" style={{ height: 32, objectFit: 'contain' }} />
              : <span>🏗 {settings?.name || 'Client Portal'}</span>
            }
          </div>
          {/* inline display:flex overrides the @media(max-width:640px) display:none rule */}
          <nav className="portal-nav" style={{ display: 'flex' }}>
            {([
              'dashboard',
              ...(clientSettings.showQuotesTab   ? ['quotes']   : []),
              ...(clientSettings.showJobsTab     ? ['jobs']     : []),
              ...(clientSettings.showInvoicesTab ? ['invoices'] : []),
            ] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 700 : 500,
                  color: activeTab === tab ? '#7ab533' : 'rgba(245,240,232,0.6)',
                  background: activeTab === tab ? 'rgba(122,181,51,0.14)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Portal content — same layout as real portal ── */}
      <main className="portal-main">

        {/* ══════════════════════════════════════════════
            DASHBOARD TAB
        ══════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <>
            {/* Welcome strip */}
            <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 28 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Welcome, {clientName}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {quotes.length} quote{quotes.length !== 1 ? 's' : ''} · {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Jobs summary */}
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
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <button
                            onClick={() => setExpandedGantt(ganttOpen ? null : j.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
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

            {/* Quotes summary */}
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

            {/* Invoices summary */}
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
          </>
        )}

        {/* ══════════════════════════════════════════════
            QUOTES TAB
        ══════════════════════════════════════════════ */}
        {activeTab === 'quotes' && (
          <>
            <div className="portal-page-hd">
              <h1>Your Quotes</h1>
              <p>{quotes.length} quote{quotes.length !== 1 ? 's' : ''} on file</p>
            </div>

            {/* Preview-only notice */}
            <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              👁 Preview mode — approve/reject buttons are disabled
            </div>

            {!quotes.length ? (
              <div className="portal-notice">
                <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                <p>No quotes on file yet.</p>
              </div>
            ) : (
              quotes.map(q => {
                const subtotal = q.phases.reduce((s: number, p: AnyRecord) => s + phaseNet(p, q.markup), 0)
                const vatAmount = q.vatIncluded ? subtotal * 0.20 : 0
                const total = subtotal + vatAmount
                const canApprove = q.status === 'pending' || q.status === 'sent'
                const isOpen = expandedQuote === q.id
                const qv = clientSettings.quoteView

                return (
                  <div key={q.id} className="portal-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>

                    {/* ── Collapsed summary row — always visible ── */}
                    <button
                      onClick={() => setExpandedQuote(isOpen ? null : q.id)}
                      style={{
                        display: 'flex', alignItems: 'center', width: '100%',
                        padding: '16px 20px', gap: 14, background: 'none',
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        textAlign: 'left',
                        borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{q.ref || '—'}</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{q.jobType}</span>
                        </div>
                        {q.savedDate && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Issued {q.savedDate}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                          {fmt(total)}
                          {q.vatIncluded && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>inc. VAT</span>}
                        </span>
                        <span style={{ background: QUOTE_STATUS_COLOR[q.status] || '#888', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {QUOTE_STATUS_LABEL[q.status] || q.status}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {/* ── Expanded full detail ── */}
                    {isOpen && (
                      <>
                        {/* Company header */}
                        <div style={{ background: 'var(--moss)', color: '#fff', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                          <div>
                            {settings?.logo
                              ? <img src={settings.logo} alt="logo" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 6 }} />
                              : <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{settings?.name || 'Your Builder'}</div>
                            }
                            {settings?.tagline && <div style={{ fontSize: 12, opacity: 0.85 }}>{settings.tagline}</div>}
                            {settings?.phone   && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{settings.phone}</div>}
                            {settings?.email   && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.email}</div>}
                            {settings?.address && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.address}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Quotation</div>
                            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18 }}>{q.ref}</div>
                            {q.savedDate && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Issued {q.savedDate}</div>}
                          </div>
                        </div>

                        {/* Quote meta */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Prepared for</div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{q.customer.name}</div>
                            {q.customer.address && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{q.customer.address}</div>}
                            {q.customer.email   && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{q.customer.email}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Status</div>
                            <span style={{ background: QUOTE_STATUS_COLOR[q.status] || '#888', color: '#fff', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                              {QUOTE_STATUS_LABEL[q.status] || q.status}
                            </span>
                          </div>
                        </div>

                        <div style={{ padding: '0 24px 24px' }}>
                          {/* Job type */}
                          <div style={{ marginTop: 20, marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: 20 }}>{q.jobType}</div>
                          </div>

                          {/* Phases & line items */}
                          {q.phases.length > 0 && qv !== 'total_only' && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                              {q.phases.map((phase: AnyRecord, pi: number) => (
                                <div key={phase.id || pi}>
                                  <div style={{ background: pi % 2 === 0 ? '#f0f2ee' : '#e8ebe4', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: pi > 0 ? '2px solid var(--border)' : undefined }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{pi + 1}. {phase.phase}</div>
                                    {qv === 'full' && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--moss)' }}>{fmt(phaseNet(phase, q.markup))}</div>}
                                  </div>
                                  {qv === 'full' && (phase.items || []).map((item: AnyRecord, ii: number) => (
                                    <div key={item.id || ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 16px', gap: 12, borderTop: '1px solid var(--border)', background: ii % 2 === 0 ? '#fff' : '#fafaf8' }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{item.desc}</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.qty} {item.unit}</div>
                                        {item.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{item.notes}</div>}
                                      </div>
                                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                                        {fmt(itemNet(item, q.markup))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Financial summary */}
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
                            {qv !== 'total_only' && (
                              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(subtotal)}</span>
                              </div>
                            )}
                            {qv !== 'total_only' && q.vatIncluded && (
                              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                                <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(vatAmount)}</span>
                              </div>
                            )}
                            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--moss)' }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Total{q.vatIncluded ? ' (inc. VAT)' : ''}</span>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>{fmt(total)}</span>
                            </div>
                          </div>

                          {/* Scope of works */}
                          {clientSettings.showScope && q.scope && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Scope of Works</div>
                              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '14px 16px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 8 }}>
                                {q.scope}
                              </div>
                            </div>
                          )}

                          {/* Approve button (disabled in preview) */}
                          {canApprove && (
                            <button
                              disabled
                              title="Preview only — customer approves this from their portal"
                              style={{ width: '100%', fontSize: 14, padding: '12px 0', background: '#aaa', color: '#fff', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontFamily: 'inherit', fontWeight: 600 }}
                            >
                              ✍️ Review &amp; Approve This Quote
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            JOBS TAB
        ══════════════════════════════════════════════ */}
        {activeTab === 'jobs' && (
          <>
            <div className="portal-page-hd">
              <h1>Your Jobs</h1>
              <p>{jobs.length} job{jobs.length !== 1 ? 's' : ''} on file</p>
            </div>

            {/* Preview-only notice */}
            <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              👁 Preview mode — variation actions are disabled
            </div>

            {!jobs.length ? (
              <div className="portal-notice">
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏗</div>
                <p>No jobs on file yet.</p>
              </div>
            ) : (
              jobs.map(j => {
                const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
                const col = STAGE_COLOR[j.stage] || '#888'
                const ganttOpen = expandedGantt === j.id
                return (
                  <div key={j.id} className="portal-card">
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{j.type}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{j.address}</div>
                        {j.start && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            Started {new Date(j.start).toLocaleDateString('en-GB')}
                          </div>
                        )}
                      </div>
                      <span className="portal-badge" style={{ background: col }}>
                        {STAGE_LABEL[j.stage] || j.stage}
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="portal-progress">
                      <div className="portal-progress-bar" style={{ width: pct + '%', background: col }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 5, marginBottom: j.notes ? 12 : 14 }}>
                      <span>Week {j.done} of {j.weeks}</span>
                      <span style={{ fontWeight: 600 }}>{pct}% complete</span>
                    </div>

                    {j.notes && (
                      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--warm)', borderRadius: 6, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                        {j.notes}
                      </div>
                    )}

                    {/* Contract value */}
                    <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f0f4f8', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 2 }}>Contract Value</div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16 }}>{fmt(j.value)}</div>
                    </div>

                    {/* Programme toggle */}
                    {clientSettings.showProgramme && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <button
                          onClick={() => setExpandedGantt(ganttOpen ? null : j.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
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
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════
            INVOICES TAB
        ══════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (
          <>
            <div className="portal-page-hd">
              <h1>Your Invoices</h1>
              <p>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} on file</p>
            </div>

            {invoices.length > 0 && (
              <div className="portal-stats" style={{ marginBottom: 24 }}>
                <div className="portal-stat">
                  <div className="portal-stat-num">
                    {fmt(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0))}
                  </div>
                  <div className="portal-stat-label">Total Paid</div>
                </div>
                <div className="portal-stat">
                  <div className="portal-stat-num">
                    {fmt(invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0))}
                  </div>
                  <div className="portal-stat-label">Outstanding</div>
                </div>
              </div>
            )}

            {!invoices.length ? (
              <div className="portal-notice">
                <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
                <p>No invoices on file yet.</p>
              </div>
            ) : (
              invoices.map(inv => (
                <div key={inv.id} className="portal-card" style={{ borderLeft: `3px solid ${INV_STATUS_COLOR[inv.status] || '#aaa'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{inv.ref}</div>
                      <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'DM Mono, monospace' }}>{fmt(inv.total)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        Issued {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-GB') : '—'}
                        {' · '}
                        Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB') : '—'}
                      </div>
                    </div>
                    <span className="portal-badge" style={{ background: INV_STATUS_COLOR[inv.status] || '#aaa' }}>
                      {INV_STATUS_LABEL[inv.status] || inv.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}

      </main>

      {/* ── Floating admin chip — small, stays out of the way ── */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        background: '#1e2022', color: '#fff', borderRadius: 24,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)', fontSize: 12,
      }}>
        <span style={{ color: '#f0c040', fontWeight: 700 }}>👁 Preview</span>
        <span style={{ color: 'rgba(255,255,255,0.65)' }}>as <strong style={{ color: '#fff' }}>{clientName}</strong></span>
        <button
          onClick={() => router.back()}
          style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          ← Exit
        </button>
      </div>

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
