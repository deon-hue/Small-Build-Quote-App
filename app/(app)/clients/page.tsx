'use client'

import { useState, useEffect, Suspense } from 'react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { fmt, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Client, PortalStatus, ClientPortalSettings } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS, PAYMENT_TERMS_OPTIONS } from '@/lib/types'
import { useRouter } from 'next/navigation'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import type { Quote } from '@/lib/types'

const BLANK_FORM = { name: '', first: '', last: '', email: '', phone: '', address: '', notes: '', paymentTerms: 'Payment on receipt', clientType: 'client' as 'client' | 'supplier' | 'subcontractor' }

// ── Portal status helpers ───────────────────────────────────
const STATUS_LABEL: Record<PortalStatus, string> = {
  no_email:    'No email',
  not_invited: 'Not invited',
  invited:     'Invite sent',
  active:      'Portal active',
}
const STATUS_COLOR: Record<PortalStatus, string> = {
  no_email:    '#aaa',
  not_invited: '#aaa',
  invited:     '#e67e22',
  active:      '#27ae60',
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function ClientsPageInner() {
  const { clients, quotes, jobs, settings, bills, addClient, updateClient, deleteClient, markPortalInvite, loading } = useApp()
  const supabase = createClient()
  const [selected, setSelected] = useState<Client | null>(null)
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [inviteClient, setInviteClient] = useState<Client | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [appLinkSentId, setAppLinkSentId] = useState<string | null>(null)
  const [appLinkSendingId, setAppLinkSendingId] = useState<string | null>(null)
  const [appLinkError, setAppLinkError] = useState('')
  const [subInviteSentId, setSubInviteSentId] = useState<string | null>(null)
  const [subInviteSendingId, setSubInviteSendingId] = useState<string | null>(null)
  const [subInviteErrors, setSubInviteErrors] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [formPortalSettings, setFormPortalSettings] = useState<ClientPortalSettings>(DEFAULT_CLIENT_PORTAL_SETTINGS)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'client' | 'supplier' | 'subcontractor'>('all')
  const BLANK_SUB_RATES = { subHourlyRate: '', subDayRate: '', subHalfDayRate: '', cisRegistered: false, cisPercentage: '', subPaymentType: 'invoice', isPaye: false }
  const [formSubRates, setFormSubRates] = useState(BLANK_SUB_RATES)

  interface ActivityLog { id: string; event_type: string; details: string | null; created_at: string }
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!selected?.email) { setActivityLogs([]); return }
    setActivityLoading(true)
    supabase
      .from('portal_activity_logs')
      .select('id, event_type, details, created_at')
      .ilike('client_email', selected.email)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setActivityLogs((data ?? []) as ActivityLog[]); setActivityLoading(false) })
  }, [selected?.email])

  // ── Subcontractor history ────────────────────────────────────
  interface SubTimeLog {
    id: string; contact_id: string; job_id: string | null; entry_date: string; week_start: string
    rate_type: string; rate_amount: number; amount: number; notes: string; status: string
    entry_type: string
  }
  interface SubContract {
    id: string; description: string; type: string; quoted_amount: number | null
    rate_type: string | null; rate_amount: number | null; status: string; job_id: string | null
    created_at: string
    stages: { id: string; description: string; amount: number; paid_date: string | null }[]
  }
  const [subTimeLogs, setSubTimeLogs] = useState<SubTimeLog[]>([])
  const [subContracts, setSubContracts] = useState<SubContract[]>([])
  const [subHistoryLoading, setSubHistoryLoading] = useState(false)
  const [subHistoryTab, setSubHistoryTab] = useState<'logs' | 'bills' | 'quotes'>('logs')

  useEffect(() => {
    if (!selected || selected.clientType !== 'subcontractor') {
      setSubTimeLogs([]); setSubContracts([]); return
    }
    setSubHistoryLoading(true)
    Promise.all([
      supabase.from('sub_admin_time_logs')
        .select('id, contact_id, job_id, entry_date, week_start, rate_type, rate_amount, amount, notes, status, entry_type')
        .eq('contact_id', selected.id)
        .order('entry_date', { ascending: false })
        .limit(100),
      supabase.from('sub_contracts')
        .select('id, description, type, quoted_amount, rate_type, rate_amount, status, job_id, created_at, sub_payment_stages(id, description, amount, paid_date)')
        .eq('contact_id', selected.id)
        .order('created_at', { ascending: false }),
    ]).then(([logsRes, contractsRes]) => {
      setSubTimeLogs((logsRes.data ?? []) as SubTimeLog[])
      const raw = (contractsRes.data ?? []) as (Omit<SubContract, 'stages'> & { sub_payment_stages: SubContract['stages'] })[]
      setSubContracts(raw.map(c => ({ ...c, stages: c.sub_payment_stages ?? [] })))
      setSubHistoryLoading(false)
    })
  }, [selected?.id, selected?.clientType])

  const subBills = bills.filter(b => b.supplierId === selected?.id)

  const portalBase = (typeof window !== 'undefined' ? window.location.origin : '') + '/portal/login'

  // URL for sending to the client (magic-link target / copy link)
  function portalUrl(c: Client) {
    return c.email ? `${portalBase}?email=${encodeURIComponent(c.email)}` : portalBase
  }

  function toIntlDigits(phone: string): string {
    const d = phone.replace(/\D/g, '')
    if (d.startsWith('07') || d.startsWith('01') || d.startsWith('02')) return '44' + d.slice(1)
    if (d.startsWith('00')) return d.slice(2)
    return d
  }

  function smsHref(c: Client): string {
    const num = toIntlDigits(c.phone || '')
    const url = portalUrl(c)
    const firstName = (c.name || '').split(' ')[0] || c.name
    const company = settings.name || 'Small Build Co'
    const body = `Hi ${firstName}, ${company} has set up your project portal where you can view your quotes, approve change orders and check invoices — all in one place.\n\nOpen it here: ${url}\n\nTo install as an app:\niPhone: Tap Share → "Add to Home Screen"\nAndroid: Tap ⋮ → "Add to Home Screen"`
    return `sms:+${num}?body=${encodeURIComponent(body)}`
  }

  function waHref(c: Client): string {
    const num = toIntlDigits(c.phone || '')
    const url = portalUrl(c)
    const firstName = (c.name || '').split(' ')[0] || c.name
    const company = settings.name || 'Small Build Co'
    const body = `Hi ${firstName} 👋\n\n${company} has set up your project portal — a private space where you can:\n• View your project quotes\n• Approve or reject change orders\n• Check and track your invoices\n• Follow your build progress\n\nOpen your portal here:\n${url}\n\nTo install it as an app on your phone:\n*iPhone*: Tap Share ↑ → "Add to Home Screen"\n*Android*: Tap ⋮ menu → "Add to Home Screen"`
    return `https://wa.me/${num}?text=${encodeURIComponent(body)}`
  }

  function adminPreviewUrl(c: Client) {
    if (c.clientType === 'subcontractor') return `/sub-portal-preview?contactId=${encodeURIComponent(c.id)}`
    return `/portal-preview?clientId=${encodeURIComponent(c.id)}`
  }

  function openNew() {
    setEditingClient(null)
    setForm({ ...BLANK_FORM, clientType: filter === 'all' ? 'client' : filter })
    setFormPortalSettings(DEFAULT_CLIENT_PORTAL_SETTINGS)
    setFormSubRates(BLANK_SUB_RATES)
    setShowForm(true)
  }

  function openEdit(c: Client) {
    setEditingClient(c)
    setForm({ name: c.name, first: c.first, last: c.last, email: c.email, phone: c.phone, address: c.address, notes: c.notes, paymentTerms: c.paymentTerms || 'Payment on receipt', clientType: c.clientType || 'client' })
    setFormPortalSettings({ ...DEFAULT_CLIENT_PORTAL_SETTINGS, ...(c.portalSettings || {}) })
    setFormSubRates({
      subHourlyRate: c.subHourlyRate?.toString() ?? '',
      subDayRate: c.subDayRate?.toString() ?? '',
      subHalfDayRate: c.subHalfDayRate?.toString() ?? '',
      cisRegistered: c.cisRegistered ?? false,
      cisPercentage: c.cisPercentage?.toString() ?? '',
      subPaymentType: c.subPaymentType || 'invoice',
      isPaye: c.isPaye ?? false,
    })
    setSelected(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const subRateFields = form.clientType === 'subcontractor' ? {
        subHourlyRate: formSubRates.subHourlyRate ? Number(formSubRates.subHourlyRate) : null,
        subDayRate: formSubRates.subDayRate ? Number(formSubRates.subDayRate) : null,
        subHalfDayRate: formSubRates.subHalfDayRate ? Number(formSubRates.subHalfDayRate) : null,
        cisRegistered: formSubRates.cisRegistered,
        cisPercentage: formSubRates.cisPercentage ? Number(formSubRates.cisPercentage) : null,
        subPaymentType: formSubRates.subPaymentType,
        isPaye: formSubRates.isPaye,
      } : {}
      if (editingClient) {
        await updateClient({ ...editingClient, ...form, portalSettings: formPortalSettings, ...subRateFields })
      } else {
        await addClient({ ...form, addedFrom: 'manual', portalSettings: formPortalSettings,
          portalInvitedAt: null, portalStatus: 'not_invited', portalLastLogin: null, ...subRateFields })
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  function openInvite(c: Client) {
    setInviteClient(c)
    setInviteSent(false)
    setInviteError('')
    setCopiedId(null)
  }

  async function sendMagicLinkInvite(c: Client) {
    if (!c.email) return
    setInviteSending(true)
    setInviteError('')
    try {
      // Send a Supabase magic link — proper HTML email with a real clickable button.
      // This does NOT affect the admin's current session.
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: c.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal`,
        },
      })
      if (otpErr) {
        const msg = otpErr.message || ''
        if (!msg || msg === '{}' || msg.trim() === '') {
          setInviteError('Email failed to send — your Supabase Custom SMTP may be misconfigured. Disable it in Supabase → Project Settings → Authentication → SMTP Settings, or use the Copy Link option below.')
        } else if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('email rate') || msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('sending magic link')) {
          setInviteError('Supabase email rate limit hit — free tier allows ~4 emails/hour. Use the Copy Link option below to share the portal link directly, or wait an hour and try again.')
        } else {
          setInviteError(msg)
        }
        return
      }
      await markPortalInvite(c.id)
      setInviteSent(true)
    } finally {
      setInviteSending(false)
    }
  }

  async function copyInviteLink(c: Client) {
    await navigator.clipboard.writeText(portalUrl(c))
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(null), 3000)
  }

  async function sendSubPortalInvite(c: Client) {
    if (!c.email || subInviteSendingId) return
    setSubInviteSendingId(c.id)
    setSubInviteErrors(prev => { const n = { ...prev }; delete n[c.id]; return n })
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: c.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/sub-portal`,
        },
      })
      if (otpErr) {
        const msg = otpErr.message || ''
        const friendly = msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('sending magic link')
          ? 'Email rate limit — wait a minute and try again.'
          : msg || 'Failed to send invite'
        setSubInviteErrors(prev => ({ ...prev, [c.id]: friendly }))
        return
      }
      setSubInviteSentId(c.id)
      setTimeout(() => setSubInviteSentId(null), 4000)
    } finally {
      setSubInviteSendingId(null)
    }
  }

  async function sendAppLink(c: Client) {
    if (!c.email || appLinkSendingId) return
    setAppLinkSendingId(c.id)
    setAppLinkError('')
    try {
      const res = await fetch('/api/portal/send-app-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: c.name, clientEmail: c.email, clientPhone: c.phone, companyName: settings.name }),
      })
      if (res.ok) {
        setAppLinkSentId(c.id)
        setTimeout(() => setAppLinkSentId(null), 3000)
      } else {
        const data = await res.json().catch(() => ({}))
        setAppLinkError(data.error || 'Failed to send — check Resend is configured in Netlify environment variables')
      }
    } catch {
      setAppLinkError('Network error — could not send app link')
    } finally {
      setAppLinkSendingId(null)
    }
  }

  function getClientQuotes(c: Client) {
    const n = (c.name || '').toLowerCase()
    return quotes.filter(q => {
      const qn = (q.customer.name || '').toLowerCase()
      return qn === n || qn.includes(n) || n.includes(qn)
    })
  }

  function getClientJobs(c: Client) {
    const n = (c.name || '').toLowerCase()
    return jobs.filter(j => {
      const jn = (j.client || '').toLowerCase()
      return jn === n || jn.includes(n) || n.includes(jn)
    })
  }

  async function handleDelete(c: Client) {
    const cQuotes = getClientQuotes(c)
    const cJobs = getClientJobs(c)
    let msg = `Delete client: ${c.name}?`
    if (cQuotes.length || cJobs.length) {
      msg += `\n\nThis client has:${cQuotes.length ? '\n  ' + cQuotes.length + ' quote' + (cQuotes.length !== 1 ? 's' : '') : ''}${cJobs.length ? '\n  ' + cJobs.length + ' job' + (cJobs.length !== 1 ? 's' : '') : ''}\n\nDeleting the client will NOT delete their quotes or jobs.`
    }
    msg += '\n\nThis cannot be undone.'
    if (!confirm(msg)) return
    await deleteClient(c.id)
    if (selected?.id === c.id) setSelected(null)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const selQuotes = selected ? getClientQuotes(selected) : []
  const selJobs = selected ? getClientJobs(selected) : []
  const acceptedValue = selQuotes.filter(q => q.status === 'accepted').reduce((s, q) => s + quoteTotal(q), 0)

  const TYPE_LABEL: Record<string, string> = { client: 'Client', supplier: 'Supplier', subcontractor: 'Sub' }
  const TYPE_COLOR: Record<string, string> = { client: '#2563eb', supplier: '#7c3aed', subcontractor: '#b45309' }

  const filtered = filter === 'all' ? clients : clients.filter(c => (c.clientType || 'client') === filter)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'client', 'supplier', 'subcontractor'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === f ? 'var(--slate)' : 'var(--border)'}`,
              background: filter === f ? 'var(--slate)' : 'transparent',
              color: filter === f ? 'white' : 'var(--muted)',
            }}>
              {f === 'all' ? 'All' : f === 'client' ? 'Clients' : f === 'supplier' ? 'Suppliers' : 'Sub Contractors'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Contact</button>
      </div>

      {appLinkError && (
        <div style={{ background: '#fff0f0', border: '1px solid #e88', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#c00', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ App link not sent: {appLinkError}</span>
          <button onClick={() => setAppLinkError('')} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div className="card">
        <table className="tbl tbl-responsive">
          <thead>
            <tr>
              <th className="col-hide-mobile">Type</th>
              <th>Contact</th>
              <th>Email</th>
              <th className="col-hide-mobile">Phone</th>
              <th className="col-hide-mobile">Jobs</th>
              <th className="col-hide-mobile"></th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No contacts yet</td></tr>
              : filtered.sort((a, b) => a.name.localeCompare(b.name)).map(c => {
                  const ini = (c.name[0] || '').toUpperCase() + ((c.name.split(' ').pop() || '')[0] || '').toUpperCase()
                  const cJ = getClientJobs(c)
                  const cType = c.clientType || 'client'
                  const status = c.portalStatus || (c.email ? 'not_invited' : 'no_email')
                  return (
                    <tr key={c.id}>
                      <td className="col-hide-mobile">
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 700,
                          background: (TYPE_COLOR[cType] || '#64748b') + '18',
                          color: TYPE_COLOR[cType] || '#64748b',
                          border: `1px solid ${(TYPE_COLOR[cType] || '#64748b')}33`,
                        }}>
                          {TYPE_LABEL[cType] || cType}
                        </span>
                      </td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--slate)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, marginRight: 8, verticalAlign: 'middle', flexShrink: 0 }}>{ini}</span>
                        <strong>{c.name}</strong>
                      </td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13, color: c.email ? 'var(--ink)' : 'var(--muted)' }}>
                        {c.email || '—'}
                      </td>
                      <td className="col-hide-mobile" onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13 }}>{c.phone || '—'}</td>
                      <td className="col-hide-mobile" onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13 }}>{cJ.length} job{cJ.length !== 1 ? 's' : ''}</td>
                      <td className="col-hide-mobile">
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {cType === 'subcontractor' && c.email && (<div className="btn-mob-hide" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className={`btn-sm ${subInviteSentId === c.id ? 'btn-gold' : 'btn-outline'}`}
                                disabled={subInviteSendingId === c.id}
                                onClick={() => sendSubPortalInvite(c)}
                                title="Email a sign-in link to this subcontractor"
                              >
                                {subInviteSentId === c.id ? '✓ Sent' : subInviteSendingId === c.id ? '…' : '📧 Invite'}
                              </button>
                              <button
                                className={`btn-sm ${copiedId === c.id ? 'btn-gold' : 'btn-outline'}`}
                                onClick={async () => {
                                  const link = `${window.location.origin}/sub-portal/login?email=${encodeURIComponent(c.email)}`
                                  await navigator.clipboard.writeText(link)
                                  setCopiedId(c.id)
                                  setTimeout(() => setCopiedId(null), 3000)
                                }}
                                title="Copy the sub-portal login link — paste into WhatsApp or SMS"
                              >
                                {copiedId === c.id ? '✓ Copied' : '📋 Copy Link'}
                              </button>
                            </div>
                            {subInviteErrors[c.id] && (
                              <span style={{ fontSize: 10, color: '#dc2626', maxWidth: 220, textAlign: 'right', lineHeight: 1.3 }}>
                                ⚠ {subInviteErrors[c.id]} — use Copy Link instead
                              </span>
                            )}
                          </div>)}
                          {cType === 'client' && (<div className="btn-mob-hide">
                          {status === 'no_email' ? (
                            <button className="btn-sm btn-outline" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Add an email address first">
                              📧 Invite
                            </button>
                          ) : status === 'not_invited' ? (
                            <button className="btn-sm btn-primary" onClick={() => openInvite(c)} title="Send portal invitation">
                              📧 Invite to Portal
                            </button>
                          ) : (
                            <button className="btn-sm btn-outline" onClick={() => openInvite(c)} title="Resend portal invitation">
                              🔄 Resend Invite
                            </button>
                          )}
                          {c.email && (
                            <button
                              className={`btn-sm ${appLinkSentId === c.id ? 'btn-gold' : 'btn-outline'}`}
                              title="Send app install instructions by email"
                              disabled={appLinkSendingId === c.id}
                              onClick={() => sendAppLink(c)}
                            >
                              {appLinkSentId === c.id ? '✓ App Link Sent' : appLinkSendingId === c.id ? '...' : '📲 App Link'}
                            </button>
                          )}
                          {c.phone && (
                            <>
                              <a className="btn-sm btn-outline" href={smsHref(c)} title="Send portal link via SMS">💬 SMS</a>
                              <a className="btn-sm btn-outline" href={waHref(c)} target="_blank" rel="noreferrer" title="Send portal link via WhatsApp">🟢 WhatsApp</a>
                            </>
                          )}
                          <button
                            className="btn-sm btn-sky"
                            title={`View everything in ${c.name}'s portal`}
                            onClick={() => router.push(adminPreviewUrl(c))}
                          >
                            👁 View Portal
                          </button>
                          </div>)}
                          <button className="btn-sm btn-outline" onClick={() => openEdit(c)}>Edit</button>
                          <button className="btn-sm btn-danger" onClick={() => handleDelete(c)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>

      {/* ── Client detail modal ────────────────────────────── */}
      {selected && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="modal-box" style={{ width: 'min(760px,96vw)' }}>
            <div className="modal-hd">
              <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {selected.email && (
                  <button className="btn-sm btn-primary" onClick={() => { openInvite(selected); setSelected(null) }}>
                    📧 Invite to Portal
                  </button>
                )}
                {selected.email && (
                  <button
                    className={`btn-sm ${appLinkSentId === selected.id ? 'btn-gold' : 'btn-outline'}`}
                    title="Send app install instructions by email"
                    disabled={appLinkSendingId === selected.id}
                    onClick={() => sendAppLink(selected)}
                  >
                    {appLinkSentId === selected.id ? '✓ App Link Sent' : '📲 App Link'}
                  </button>
                )}
                {selected.phone && (
                  <a className="btn-sm btn-outline" href={smsHref(selected)} title="Send portal link via SMS">💬 SMS</a>
                )}
                {selected.phone && (
                  <a className="btn-sm btn-outline" href={waHref(selected)} target="_blank" rel="noreferrer" title="Send portal link via WhatsApp">🟢 WhatsApp</a>
                )}
                <button className="btn-sm btn-sky" onClick={() => { setSelected(null); router.push(adminPreviewUrl(selected)) }} title={`View everything in ${selected.name}'s portal`}>
                  👁 View Portal
                </button>
                <button className="btn-sm btn-outline" onClick={() => openEdit(selected)}>✎ Edit</button>
                <button className="btn-sm btn-gold" onClick={() => {
                  sessionStorage.setItem('sbc_prefill_client', selected.id)
                  setSelected(null)
                  router.push('/new-quote')
                }}>+ Quote</button>
                <button className="modal-close" onClick={() => setSelected(null)}>×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Portal status */}
              <div className="card" style={{ margin: '0 0 16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 4 }}>Portal Status</div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 4,
                    background: STATUS_COLOR[selected.portalStatus || 'not_invited'] + '18',
                    color: STATUS_COLOR[selected.portalStatus || 'not_invited'],
                    border: `1px solid ${STATUS_COLOR[selected.portalStatus || 'not_invited']}44`,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[selected.portalStatus || 'not_invited'], display: 'inline-block' }} />
                    {STATUS_LABEL[selected.portalStatus || (selected.email ? 'not_invited' : 'no_email')]}
                  </span>
                  {selected.portalStatus === 'active' && selected.portalLastLogin && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Last login: {fmtDateTime(selected.portalLastLogin)}</div>
                  )}
                  {selected.portalStatus === 'invited' && selected.portalInvitedAt && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Invite sent: {fmtDateTime(selected.portalInvitedAt)}</div>
                  )}
                </div>
              </div>

              {/* Contact + Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="card" style={{ margin: 0 }}>
                  <div className="card-hd" style={{ fontSize: 11 }}>Contact</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.9 }}>
                    <div>{selected.email || '—'}</div>
                    <div>{selected.phone || '—'}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{selected.address || '—'}</div>
                  </div>
                </div>
                <div className="card" style={{ margin: 0 }}>
                  <div className="card-hd" style={{ fontSize: 11 }}>Summary</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, lineHeight: 2 }}>
                    <div><span style={{ color: 'var(--muted)' }}>Quotes:</span> {selQuotes.length}</div>
                    <div><span style={{ color: 'var(--muted)' }}>Jobs:</span> {selJobs.length}</div>
                    <div><span style={{ color: 'var(--muted)' }}>Accepted value:</span> <span className="mono">{fmt(acceptedValue)}</span></div>
                  </div>
                </div>
              </div>

              {/* Quotes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Quotes</div>
                {!selQuotes.length
                  ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '16px 0' }}>No quotes yet.</div>
                  : selQuotes.map(q => (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70 }}>{q.ref || '—'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{q.jobType}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{q.savedDate}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="serif" style={{ fontSize: 17 }}>{fmt(quoteTotal(q))}</div>
                          <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>{Q_LABEL[q.status] || q.status}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-sm btn-primary" onClick={() => {
                            sessionStorage.setItem('sbc_edit_quote', q.id)
                            setSelected(null)
                            router.push('/new-quote')
                          }}>✎ Edit</button>
                          <button className="btn-sm btn-outline" onClick={() => setPreviewQuote(q)}>View</button>
                        </div>
                      </div>
                    ))
                }
              </div>

              {/* Jobs */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Jobs</div>
                {!selJobs.length
                  ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '16px 0' }}>No jobs yet.</div>
                  : selJobs.map(j => {
                      const pct = j.weeks ? Math.round((j.done / j.weeks) * 100) : 0
                      const col = STAGE_COLOR[j.stage] || 'var(--muted)'
                      return (
                        <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{j.type} — {j.address}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{STAGE_LABEL[j.stage] || j.stage}{j.weeks ? ` · Week ${j.done} of ${j.weeks}` : ''}</div>
                            <div style={{ height: 3, background: 'var(--warm)', borderRadius: 2, marginTop: 4, maxWidth: 180, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: col, borderRadius: 2 }} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="serif" style={{ fontSize: 17 }}>{fmt(j.value)}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{pct}% done</div>
                          </div>
                          <button className="btn-sm btn-outline" onClick={() => { setSelected(null); router.push('/jobs') }}>View in Jobs</button>
                        </div>
                      )
                    })
                }
              </div>

              {/* ── Subcontractor History ───────────────────────── */}
              {selected.clientType === 'subcontractor' && (
                <div style={{ marginTop: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Subcontractor History</div>

                  {/* Tab bar */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid var(--border)' }}>
                    {([
                      { key: 'logs',   label: `Time Logs (${subTimeLogs.length})` },
                      { key: 'bills',  label: `Bills (${subBills.length})` },
                      { key: 'quotes', label: `Fixed Quotes (${subContracts.length})` },
                    ] as const).map(t => (
                      <button key={t.key} onClick={() => setSubHistoryTab(t.key)} style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                        color: subHistoryTab === t.key ? 'var(--slate)' : 'var(--muted)',
                        borderBottom: subHistoryTab === t.key ? '2px solid var(--slate)' : '2px solid transparent',
                        marginBottom: -2,
                      }}>{t.label}</button>
                    ))}
                  </div>

                  {subHistoryLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>Loading…</div>
                  ) : subHistoryTab === 'logs' ? (
                    // ── Time Logs ──────────────────────────────────
                    !subTimeLogs.length ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>No time logs recorded yet.</div>
                    ) : (
                      <div>
                        {/* Group by week */}
                        {Object.entries(
                          subTimeLogs.reduce<Record<string, SubTimeLog[]>>((acc, log) => {
                            const wk = log.week_start || log.entry_date
                            ;(acc[wk] = acc[wk] || []).push(log)
                            return acc
                          }, {})
                        ).map(([wk, logs]) => {
                          const weekTotal = logs.reduce((s, l) => s + l.amount, 0)
                          const allPaid = logs.every(l => l.status === 'paid')
                          const allPending = logs.every(l => l.status === 'pending')
                          const weekDate = new Date(wk + 'T12:00:00')
                          const weekEnd = new Date(weekDate); weekEnd.setDate(weekEnd.getDate() + 6)
                          const fmtWk = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          return (
                            <div key={wk} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>Week of {fmtWk(weekDate)} – {fmtWk(weekEnd)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {logs.length} day{logs.length !== 1 ? 's' : ''}{' · '}
                                    {logs.filter(l => l.status === 'paid').length} cash, {logs.filter(l => l.status !== 'paid').length} bill
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(weekTotal)}</div>
                                  <span style={{
                                    fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                                    background: allPaid ? '#dcfce7' : allPending ? '#fef3c7' : '#ede9fe',
                                    color: allPaid ? '#166534' : allPending ? '#92400e' : '#5b21b6',
                                  }}>
                                    {allPaid ? '✓ Cash paid' : allPending ? '⏳ Pending' : '↗ To bills'}
                                  </span>
                                </div>
                              </div>
                              <div style={{ marginTop: 6, paddingLeft: 8 }}>
                                {logs.map(l => {
                                  const jobLabel = jobs.find(j => j.id === l.job_id)
                                  return (
                                    <div key={l.id} style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', padding: '2px 0' }}>
                                      <span style={{ minWidth: 72 }}>{fmtDate(l.entry_date)}</span>
                                      <span style={{ flex: 1 }}>{jobLabel ? (jobLabel.client || jobLabel.address) : '—'}</span>
                                      <span>{l.notes || '—'}</span>
                                      <span className="mono">{fmt(l.amount)}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 13, fontWeight: 700 }}>
                          <span>Total logged</span>
                          <span className="mono">{fmt(subTimeLogs.reduce((s, l) => s + l.amount, 0))}</span>
                        </div>
                      </div>
                    )
                  ) : subHistoryTab === 'bills' ? (
                    // ── Bills ──────────────────────────────────────
                    !subBills.length ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>No bills recorded yet.</div>
                    ) : (
                      <div>
                        {subBills.map(b => (
                          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.ref || 'Draft bill'}</div>
                              {b.notes && <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>⏳ {b.notes}</div>}
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(b.billDate)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(b.lineItems.reduce((s, li) => s + (li.amount || 0), 0))}</div>
                              <span style={{
                                fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                                background: b.status === 'paid' ? '#dcfce7' : b.status === 'approved' ? '#dbeafe' : '#f3f4f6',
                                color: b.status === 'paid' ? '#166534' : b.status === 'approved' ? '#1e40af' : '#374151',
                              }}>{b.status}</span>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 13, fontWeight: 700 }}>
                          <span>Total billed</span>
                          <span className="mono">{fmt(subBills.reduce((s, b) => s + b.lineItems.reduce((ls, li) => ls + (li.amount || 0), 0), 0))}</span>
                        </div>
                      </div>
                    )
                  ) : (
                    // ── Fixed Quotes ────────────────────────────────
                    !subContracts.length ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>No fixed quotes recorded yet.</div>
                    ) : (
                      <div>
                        {subContracts.map(c => {
                          const jobLabel = jobs.find(j => j.id === c.job_id)
                          const stagesPaid = c.stages.reduce((s, st) => s + (st.paid_date ? Number(st.amount) : 0), 0)
                          const stagesTotal = c.stages.reduce((s, st) => s + Number(st.amount), 0)
                          return (
                            <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.description}</div>
                                  {jobLabel && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{jobLabel.client || jobLabel.address}</div>}
                                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(c.created_at)}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(c.quoted_amount ?? 0)}</div>
                                  <span style={{
                                    fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                                    background: c.status === 'completed' ? '#dcfce7' : c.status === 'cancelled' ? '#fee2e2' : '#f3f4f6',
                                    color: c.status === 'completed' ? '#166534' : c.status === 'cancelled' ? '#991b1b' : '#374151',
                                  }}>{c.status}</span>
                                </div>
                              </div>
                              {c.stages.length > 0 && (
                                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                                  {c.stages.map(st => (
                                    <div key={st.id} style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', padding: '3px 0' }}>
                                      <span style={{ flex: 1 }}>{st.description}</span>
                                      <span className="mono">{fmt(Number(st.amount))}</span>
                                      <span style={{ minWidth: 60, textAlign: 'right', color: st.paid_date ? '#166534' : '#92400e' }}>
                                        {st.paid_date ? `✓ ${fmtDate(st.paid_date)}` : '⏳ Unpaid'}
                                      </span>
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                                    <span>Paid {fmt(stagesPaid)} of {fmt(stagesTotal)}</span>
                                    <span style={{ color: stagesPaid >= stagesTotal ? '#166534' : '#92400e' }}>
                                      {stagesPaid >= stagesTotal ? '✓ Fully paid' : `${fmt(stagesTotal - stagesPaid)} outstanding`}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Portal Activity Log */}
              {selected.email && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Portal Activity</div>
                  {activityLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>Loading…</div>
                  ) : activityLogs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>No activity recorded yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {activityLogs.map(log => {
                        const EVENT: Record<string, { label: string; color: string; bg: string }> = {
                          sign_in:               { label: 'Signed in',           color: '#166534', bg: '#dcfce7' },
                          sign_in_failed:        { label: 'Sign-in failed',       color: '#991b1b', bg: '#fee2e2' },
                          magic_link_sent:       { label: 'Magic link requested', color: '#1e40af', bg: '#dbeafe' },
                          magic_link_rate_limit: { label: 'Rate limit hit',       color: '#92400e', bg: '#fef3c7' },
                        }
                        const ev = EVENT[log.event_type] ?? { label: log.event_type, color: '#374151', bg: '#f3f4f6' }
                        return (
                          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: ev.bg, color: ev.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {ev.label}
                            </span>
                            {log.details && (
                              <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.details}>
                                {log.details}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                              {fmtDateTime(log.created_at)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit client modal ────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="form-modal" style={{ width: 'min(520px, 96vw)' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editingClient ? 'Edit' : 'New'} Contact</div>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="form-modal-bd">
              <div className="fg">
                <label>Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['client', 'supplier', 'subcontractor'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, clientType: t }))} style={{
                      flex: 1, padding: '7px 0', border: `2px solid ${form.clientType === t ? 'var(--slate)' : 'var(--border)'}`,
                      borderRadius: 6, background: form.clientType === t ? 'var(--slate)' : 'transparent',
                      color: form.clientType === t ? 'white' : 'var(--muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    }}>
                      {t === 'client' ? 'Client' : t === 'supplier' ? 'Supplier' : 'Subcontractor'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label>Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mr & Mrs Davies" autoFocus />
              </div>
              <div className="row2">
                <div className="fg">
                  <label>First Name</label>
                  <input value={form.first} onChange={e => setForm(f => ({ ...f, first: e.target.value }))} placeholder="John" />
                </div>
                <div className="fg">
                  <label>Last Name</label>
                  <input value={form.last} onChange={e => setForm(f => ({ ...f, last: e.target.value }))} placeholder="Davies" />
                </div>
              </div>
              <div className="row2">
                <div className="fg">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@email.com" />
                </div>
                <div className="fg">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07700 900000" />
                </div>
              </div>
              <div className="fg">
                <label>Address</label>
                <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} placeholder="14 Thornton Road, London" />
              </div>
              <div className="fg">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any extra info…" />
              </div>
              <div className="fg">
                <label>Payment Terms</label>
                <select value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}>
                  {PAYMENT_TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  {!PAYMENT_TERMS_OPTIONS.includes(form.paymentTerms as typeof PAYMENT_TERMS_OPTIONS[number]) && (
                    <option value={form.paymentTerms}>{form.paymentTerms}</option>
                  )}
                </select>
              </div>

              {/* ── Portal & Quote Settings ───────────────────────── */}
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 14 }}>
                  Portal &amp; Quote Settings
                </div>

                {/* Quote display level */}
                <div className="fg" style={{ marginBottom: 12 }}>
                  <label>Quote Display (Portal, HTML email &amp; PDF)</label>
                  <select
                    value={formPortalSettings.quoteView}
                    onChange={e => setFormPortalSettings(s => ({ ...s, quoteView: e.target.value as ClientPortalSettings['quoteView'] }))}
                  >
                    <option value="full">Full — all phases with costs</option>
                    <option value="phases">Phases only — list of phases, no amounts</option>
                    <option value="total_only">Total only — grand total, no breakdown</option>
                  </select>
                </div>

                {/* Quote toggles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 14 }}>
                  {(
                    [
                      { key: 'showScope',            label: 'Show Scope of Works' },
                      { key: 'showPaymentTerms',      label: 'Show Payment Terms' },
                      { key: 'allowOnlineApproval',   label: 'Online Quote Approval' },
                    ] as { key: keyof ClientPortalSettings; label: string }[]
                  ).map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={formPortalSettings[key] as boolean}
                        onChange={e => setFormPortalSettings(s => ({ ...s, [key]: e.target.checked }))}
                        style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Portal tabs — only for clients */}
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 8 }}>
                  Portal Tabs
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                  {(
                    [
                      { key: 'showQuotesTab',    label: 'Quotes tab' },
                      { key: 'showJobsTab',      label: 'Jobs tab' },
                      { key: 'showInvoicesTab',  label: 'Invoices tab' },
                      { key: 'showProgramme',    label: 'Programme / Gantt' },
                    ] as { key: keyof ClientPortalSettings; label: string }[]
                  ).map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={formPortalSettings[key] as boolean}
                        onChange={e => setFormPortalSettings(s => ({ ...s, [key]: e.target.checked }))}
                        style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Sub Rate Profile ─────────────────────────────── */}
            {form.clientType === 'subcontractor' && (
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 14 }}>
                  Sub Rate Profile
                </div>
                <div className="row2" style={{ marginBottom: 10 }}>
                  <div className="fg">
                    <label>Day Rate (£)</label>
                    <input type="number" value={formSubRates.subDayRate} onChange={e => setFormSubRates(s => ({ ...s, subDayRate: e.target.value }))} placeholder="e.g. 250.00" min="0" step="5" />
                  </div>
                  <div className="fg">
                    <label>Half Day Rate (£)</label>
                    <input type="number" value={formSubRates.subHalfDayRate} onChange={e => setFormSubRates(s => ({ ...s, subHalfDayRate: e.target.value }))} placeholder="e.g. 140.00" min="0" step="5" />
                  </div>
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Hourly Rate (£)</label>
                  <input type="number" value={formSubRates.subHourlyRate} onChange={e => setFormSubRates(s => ({ ...s, subHourlyRate: e.target.value }))} placeholder="e.g. 35.00" min="0" step="0.50" />
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Payment Type</label>
                  <select value={formSubRates.subPaymentType} onChange={e => setFormSubRates(s => ({ ...s, subPaymentType: e.target.value }))}>
                    <option value="invoice">Invoice (self-billed)</option>
                    <option value="cis">CIS</option>
                    <option value="payroll">PAYE Payroll</option>
                    <option value="bacs">BACS Direct</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={formSubRates.isPaye}
                      onChange={e => setFormSubRates(s => ({ ...s, isPaye: e.target.checked }))}
                      style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                    />
                    Direct Labour
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={formSubRates.cisRegistered}
                      onChange={e => setFormSubRates(s => ({ ...s, cisRegistered: e.target.checked }))}
                      style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                    />
                    CIS Registered
                  </label>
                  {formSubRates.cisRegistered && (
                    <div className="fg" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                      <label>CIS Deduction %</label>
                      <input type="number" value={formSubRates.cisPercentage} onChange={e => setFormSubRates(s => ({ ...s, cisPercentage: e.target.value }))} placeholder="20" min="0" max="30" step="1" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : editingClient ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Portal invite modal ────────────────────────────── */}
      {inviteClient && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setInviteClient(null) }}>
          <div className="form-modal" style={{ width: 'min(500px, 96vw)' }}>
            <div className="form-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>
                  {inviteSent ? '✅ Invite Sent' : '📧 Invite to Portal'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{inviteClient.name}</div>
              </div>
              <button className="modal-close" onClick={() => setInviteClient(null)}>×</button>
            </div>
            <div className="form-modal-bd">

              {inviteSent ? (
                /* Success state */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Invite sent to {inviteClient.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
                    A sign-in email has been sent to <strong>{inviteClient.email}</strong>.<br />
                    They just need to click the link in that email to access their private portal.
                  </div>
                  <div style={{ background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#4a7c1f', marginBottom: 16 }}>
                    💡 The link in the email expires after 24 hours. Use &quot;Resend Invite&quot; to send a fresh one.
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button
                      className={`btn-sm ${copiedId === inviteClient.id ? 'btn-gold' : 'btn-outline'}`}
                      onClick={() => copyInviteLink(inviteClient)}
                    >
                      {copiedId === inviteClient.id ? '✓ Link Copied' : '📋 Copy Portal Link'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* No email warning */}
                  {!inviteClient.email && (
                    <div style={{ background: '#fff5e0', border: '1px solid #f0c060', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#8a5a00' }}>
                      ⚠️ <strong>{inviteClient.name}</strong> has no email address on file. Please edit the client and add an email before sending an invite.
                    </div>
                  )}

                  {/* Explanation */}
                  <div style={{ background: 'var(--warm)', borderRadius: 8, padding: '14px 16px', marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>How it works</div>
                    <div style={{ color: 'var(--muted)' }}>
                      <strong>{inviteClient.name}</strong> will receive an email with a secure sign-in button. One click and they&apos;re straight into their private portal — showing only their jobs, quotes and invoices. No password needed.
                    </div>
                  </div>

                  {/* Sending to */}
                  {inviteClient.email && (
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20 }}>📧</span>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Sending to</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{inviteClient.email}</div>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {inviteError && (
                    <div style={{ background: '#fdf0ef', border: '1px solid #f0b8b8', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#c0392b' }}>
                      ⚠️ {inviteError}
                    </div>
                  )}

                  {/* Copy link fallback */}
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label>Or copy the portal link manually</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        readOnly
                        value={inviteClient.email ? portalUrl(inviteClient) : 'Add an email address first'}
                        style={{ flex: 1, background: '#f8f9fa', color: 'var(--muted)', fontSize: 12 }}
                        onFocus={e => e.target.select()}
                      />
                      <button
                        className="btn-sm btn-outline"
                        disabled={!inviteClient.email}
                        onClick={() => copyInviteLink(inviteClient)}
                        style={{ flexShrink: 0, minWidth: 90 }}
                      >
                        {copiedId === inviteClient.id ? '✓ Copied!' : '📋 Copy'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setInviteClient(null)}>
                {inviteSent ? 'Close' : 'Cancel'}
              </button>
              {!inviteSent && (
                <button
                  className="btn btn-primary"
                  disabled={!inviteClient.email || inviteSending}
                  onClick={() => sendMagicLinkInvite(inviteClient)}
                  style={{ minWidth: 160 }}
                >
                  {inviteSending ? 'Sending…' : '📧 Send Invite Email'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {previewQuote && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setPreviewQuote(null)} />
      )}
    </>
  )
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsPageInner />
    </Suspense>
  )
}
