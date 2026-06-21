'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { GanttState, ClientPortalSettings } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import { fmt, Q_BADGE, Q_LABEL, calcPhaseSell, calcItemSell } from '@/lib/utils'
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
interface PreviewVariation {
  id: string; ref: string; title: string; status: string; total: number; description: string
}
interface PreviewSettings {
  name: string; tagline: string; email: string; phone: string; address: string; logo: string
}

type Tab = 'dashboard' | 'quotes' | 'variations' | 'invoices'

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
  const [variations, setVariations] = useState<PreviewVariation[]>([])
  const [settings, setSettings] = useState<PreviewSettings | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
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
      if (Array.isArray(d?.variations)) {
        setVariations(d.variations.map((r: AnyRecord) => ({
          id: r.id, ref: r.ref || '', title: r.title || '',
          status: r.status, total: Number(r.total), description: r.description || '',
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
    dashboard: 'Dashboard', quotes: 'Quotes', variations: 'Variations', invoices: 'Invoices',
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
              ...(clientSettings.showQuotesTab     ? ['quotes']     : []),
              ...(clientSettings.showVariationsTab ? ['variations'] : []),
              ...(clientSettings.showInvoicesTab   ? ['invoices']   : []),
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
        {activeTab === 'dashboard' && (() => {
          const totalQuoteValue = jobs.reduce((s, j) => s + (j.value || 0), 0)
          const approvedVars    = variations.filter(v => ['approved', 'invoiced', 'paid'].includes(v.status))
          const totalVariations = approvedVars.reduce((s, v) => s + v.total, 0)
          const paidInvoices    = invoices.filter(i => i.status === 'paid')
          const totalPaid       = paidInvoices.reduce((s, i) => s + i.total, 0)
          const balanceDue      = totalQuoteValue + totalVariations - totalPaid
          const allSettled      = balanceDue <= 0
          return (
          <>
            {/* Welcome strip */}
            <div style={{ background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Welcome, {clientName}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {quotes.length} quote{quotes.length !== 1 ? 's' : ''} · {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Financial snapshot */}
            <div className="fin-snapshot">
              <div className="fin-card" style={{ borderTop: '3px solid #4a90a4' }}>
                <div className="fin-card-label" style={{ color: '#4a90a4' }}>Original Quote</div>
                <div className="fin-card-value">{fmt(totalQuoteValue)}</div>
                <div className="fin-card-sub">
                  {jobs.length === 1 ? jobs[0].type : `${jobs.length} project${jobs.length !== 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="fin-card" style={{ borderTop: '3px solid #e67e22' }}>
                <div className="fin-card-label" style={{ color: '#e67e22' }}>Approved Variations</div>
                <div className="fin-card-value">{fmt(totalVariations)}</div>
                <div className="fin-card-sub">
                  {approvedVars.length === 0 ? 'No change orders' : `${approvedVars.length} change order${approvedVars.length !== 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="fin-card" style={{ borderTop: '3px solid #7ab533' }}>
                <div className="fin-card-label" style={{ color: '#7ab533' }}>Paid to Date</div>
                <div className="fin-card-value">{fmt(totalPaid)}</div>
                <div className="fin-card-sub">
                  {paidInvoices.length === 0 ? 'No payments yet' : `${paidInvoices.length} invoice${paidInvoices.length !== 1 ? 's' : ''} paid`}
                </div>
              </div>
              <div className="fin-card fin-card-due">
                <div className="fin-card-label" style={{ color: 'rgba(255,255,255,0.75)' }}>Balance Due</div>
                <div className="fin-card-value" style={{ color: 'white' }}>{fmt(Math.max(0, balanceDue))}</div>
                <div className="fin-card-sub" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  {allSettled ? 'All payments settled ✓' : 'Quote + variations − paid'}
                </div>
              </div>
            </div>


          </>
        )})()}

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
        {activeTab === 'variations' && (() => {
          const pending  = variations.filter(v => v.status === 'sent')
          const approved = variations.filter(v => ['approved', 'invoiced', 'paid'].includes(v.status))
          const other    = variations.filter(v => ['rejected', 'cancelled', 'draft'].includes(v.status))
          const VAR_SL: Record<string, string> = { draft: 'Draft', sent: 'Awaiting your approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', invoiced: 'Invoiced', paid: 'Paid' }
          const VAR_SC: Record<string, string> = { draft: '#888', sent: '#e67e22', approved: '#27ae60', rejected: '#c0392b', cancelled: '#9aa3ad', invoiced: '#4a90a4', paid: '#7ab533' }
          function VarCard({ v }: { v: (typeof variations)[0] }) {
            return (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 8, borderLeft: `3px solid ${VAR_SC[v.status]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{v.ref}</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{v.title}</span>
                    </div>
                    {v.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{v.description.slice(0, 100)}{v.description.length > 100 ? '…' : ''}</div>}
                    <span style={{ background: VAR_SC[v.status], color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{VAR_SL[v.status]}</span>
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{fmt(v.total)}</div>
                </div>
              </div>
            )
          }
          return (
            <>
              <div className="portal-page-hd"><h1>Variations</h1><p>{variations.length} variation{variations.length !== 1 ? 's' : ''} on file</p></div>
              <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                👁 Preview mode — approve/reject buttons are disabled
              </div>
              {!variations.length ? (
                <div className="portal-notice"><div style={{ fontSize: 36, marginBottom: 12 }}>📝</div><p>No variations on file yet.</p></div>
              ) : (
                <>
                  {pending.length > 0 && <section style={{ marginBottom: 24 }}><div style={{ background: '#fff8ee', border: '1px solid #f5c77a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontWeight: 700, fontSize: 13, color: '#856a00' }}>⏳ {pending.length} awaiting approval</div>{pending.map(v => <VarCard key={v.id} v={v} />)}</section>}
                  {approved.length > 0 && <section style={{ marginBottom: 24 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 8 }}>Approved</div>{approved.map(v => <VarCard key={v.id} v={v} />)}</section>}
                  {other.length > 0 && <section style={{ marginBottom: 24 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 8 }}>Other</div>{other.map(v => <VarCard key={v.id} v={v} />)}</section>}
                </>
              )}
            </>
          )
        })()}

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
