'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { fmt, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Client, PortalStatus, ClientPortalSettings } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import { useRouter } from 'next/navigation'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import type { Quote } from '@/lib/types'

const BLANK_FORM = { name: '', first: '', last: '', email: '', phone: '', address: '', notes: '' }

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

export default function ClientsPage() {
  const { clients, quotes, jobs, settings, addClient, updateClient, deleteClient, markPortalInvite, loading } = useApp()
  const supabase = createClient()
  const [selected, setSelected] = useState<Client | null>(null)
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [inviteClient, setInviteClient] = useState<Client | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [formPortalSettings, setFormPortalSettings] = useState<ClientPortalSettings>(DEFAULT_CLIENT_PORTAL_SETTINGS)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const portalBase = origin + '/portal/login'

  // URL for sending to the client (magic-link target / copy link)
  function portalUrl(c: Client) {
    return c.email ? `${portalBase}?email=${encodeURIComponent(c.email)}` : portalBase
  }

  // URL for admin to preview what the client sees (no sign-in required)
  function adminPreviewUrl(c: Client) {
    return c.email
      ? `${origin}/portal-preview?email=${encodeURIComponent(c.email)}`
      : `${origin}/portal-preview`
  }

  function openNew() {
    setEditingClient(null)
    setForm(BLANK_FORM)
    setFormPortalSettings(DEFAULT_CLIENT_PORTAL_SETTINGS)
    setShowForm(true)
  }

  function openEdit(c: Client) {
    setEditingClient(c)
    setForm({ name: c.name, first: c.first, last: c.last, email: c.email, phone: c.phone, address: c.address, notes: c.notes })
    setFormPortalSettings({ ...DEFAULT_CLIENT_PORTAL_SETTINGS, ...(c.portalSettings || {}) })
    setSelected(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingClient) {
        await updateClient({ ...editingClient, ...form, portalSettings: formPortalSettings })
      } else {
        await addClient({ ...form, addedFrom: 'manual', portalSettings: formPortalSettings })
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
        const msg = otpErr.message
        if (!msg || msg === '{}' || msg.trim() === '') {
          setInviteError('Email failed to send — your Supabase Custom SMTP may be misconfigured. Disable it in Supabase → Project Settings → Authentication → SMTP Settings, or use the Copy Link option below.')
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openNew}>+ New Client</button>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Client</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Jobs</th>
              <th>Portal Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!clients.length
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No clients yet — add one above or save a quote to create one automatically</td></tr>
              : clients.map(c => {
                  const ini = (c.name[0] || '').toUpperCase() + ((c.name.split(' ').pop() || '')[0] || '').toUpperCase()
                  const cJ = getClientJobs(c)
                  const status = c.portalStatus || (c.email ? 'not_invited' : 'no_email')
                  return (
                    <tr key={c.id}>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--slate)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, marginRight: 8, verticalAlign: 'middle', flexShrink: 0 }}>{ini}</span>
                        <strong>{c.name}</strong>
                      </td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13, color: c.email ? 'var(--ink)' : 'var(--muted)' }}>
                        {c.email || '—'}
                      </td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13 }}>{c.phone || '—'}</td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer', fontSize: 13 }}>{cJ.length} job{cJ.length !== 1 ? 's' : ''}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                            background: STATUS_COLOR[status] + '18',
                            color: STATUS_COLOR[status],
                            border: `1px solid ${STATUS_COLOR[status]}44`,
                            width: 'fit-content',
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block' }} />
                            {STATUS_LABEL[status]}
                          </span>
                          {status === 'active' && c.portalLastLogin && (
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Last login {fmtDate(c.portalLastLogin)}</span>
                          )}
                          {status === 'invited' && c.portalInvitedAt && (
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Sent {fmtDate(c.portalInvitedAt)}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {/* Invite / Resend button */}
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
                          {/* Admin preview of client portal */}
                          <button
                            className="btn-sm btn-sky"
                            title={c.email ? `Preview portal as ${c.name}` : 'No email on file'}
                            onClick={() => window.open(adminPreviewUrl(c), '_blank')}
                          >
                            🌐 Portal
                          </button>
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
                <button className="btn-sm btn-sky" onClick={() => window.open(adminPreviewUrl(selected), '_blank')} title="Preview portal as this client">
                  🌐 Portal
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
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit client modal ────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="form-modal" style={{ width: 'min(520px, 96vw)' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editingClient ? 'Edit Client' : 'New Client'}</div>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="form-modal-bd">
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

              {/* ── Portal & Quote Settings ───────────────────────── */}
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 14 }}>
                  Portal &amp; Quote Settings
                </div>

                {/* Quote display level */}
                <div className="fg" style={{ marginBottom: 12 }}>
                  <label>Quote Display (Portal &amp; HTML email)</label>
                  <select
                    value={formPortalSettings.quoteView}
                    onChange={e => setFormPortalSettings(s => ({ ...s, quoteView: e.target.value as ClientPortalSettings['quoteView'] }))}
                  >
                    <option value="full">Full — all phases with costs</option>
                    <option value="phases">Phases only — list of phases, no amounts</option>
                    <option value="total_only">Total only — grand total, no breakdown</option>
                  </select>
                </div>

                {/* Default PDF type */}
                <div className="fg" style={{ marginBottom: 14 }}>
                  <label>Default PDF Type</label>
                  <select
                    value={formPortalSettings.defaultPdfType}
                    onChange={e => setFormPortalSettings(s => ({ ...s, defaultPdfType: e.target.value as ClientPortalSettings['defaultPdfType'] }))}
                  >
                    <option value="customer">Client view — scope &amp; items, no prices</option>
                    <option value="detailed">Detailed — full breakdown with prices</option>
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

                {/* Portal tabs */}
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
