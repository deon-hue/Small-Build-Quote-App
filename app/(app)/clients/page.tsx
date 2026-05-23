'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Client, PortalStatus } from '@/lib/types'
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
  const [selected, setSelected] = useState<Client | null>(null)
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [inviteClient, setInviteClient] = useState<Client | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const portalBase = (typeof window !== 'undefined' ? window.location.origin : '') + '/portal/login'

  function portalUrl(c: Client) {
    return c.email ? `${portalBase}?email=${encodeURIComponent(c.email)}` : portalBase
  }

  function openNew() {
    setEditingClient(null)
    setForm(BLANK_FORM)
    setShowForm(true)
  }

  function openEdit(c: Client) {
    setEditingClient(c)
    setForm({ name: c.name, first: c.first, last: c.last, email: c.email, phone: c.phone, address: c.address, notes: c.notes })
    setSelected(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingClient) {
        await updateClient({ ...editingClient, ...form })
      } else {
        await addClient({ ...form, addedFrom: 'manual' })
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  function openInvite(c: Client) {
    setInviteClient(c)
    setInviteSent(false)
    setCopiedId(null)
  }

  async function sendInvite(c: Client, method: 'email' | 'copy') {
    // Mark as invited in DB
    await markPortalInvite(c.id)
    setInviteSent(true)

    if (method === 'copy') {
      await navigator.clipboard.writeText(portalUrl(c))
      setCopiedId(c.id)
      setTimeout(() => setCopiedId(null), 3000)
    } else {
      const company = settings.name || 'Your Builder'
      const subject = encodeURIComponent(`Your private client portal — ${company}`)
      const body = encodeURIComponent(
`Hi ${c.first || c.name},

We've set up a private client portal for you where you can view your project information, quotes, documents and invoices online.

To access your portal, please register using this link:

${portalUrl(c)}

Important: please register using this email address (${c.email}) so the system can link you to your project automatically.

If you already have an account, simply sign in at the same link.

If you have any questions, please don't hesitate to get in touch.

Kind regards,
${company}`)
      window.open(`mailto:${c.email}?subject=${subject}&body=${body}`)
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
                          {/* Direct portal link */}
                          <button
                            className="btn-sm btn-sky"
                            title={c.email ? `Open portal for ${c.name}` : 'No email on file'}
                            onClick={() => window.open(portalUrl(c), '_blank')}
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
                <button className="btn-sm btn-sky" onClick={() => window.open(portalUrl(selected), '_blank')}>
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
                    {inviteClient.email} has been marked as invited.<br />
                    They can now register at their private portal link.
                  </div>
                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', textAlign: 'left' }}>{portalUrl(inviteClient)}</span>
                    <button
                      className={`btn-sm ${copiedId === inviteClient.id ? 'btn-gold' : 'btn-outline'}`}
                      onClick={() => sendInvite(inviteClient, 'copy')}
                      style={{ flexShrink: 0 }}
                    >
                      {copiedId === inviteClient.id ? '✓ Copied' : '📋 Copy'}
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
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>How the private portal works</div>
                    <div style={{ color: 'var(--muted)' }}>
                      <strong>{inviteClient.name}</strong> will receive a personal link. They register using <strong>{inviteClient.email || 'their email'}</strong> and are automatically connected to their own private portal — showing only their jobs, quotes and invoices.
                    </div>
                  </div>

                  {/* Portal link */}
                  <div className="fg">
                    <label>Their Private Portal Link</label>
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
                        onClick={() => sendInvite(inviteClient, 'copy')}
                        style={{ flexShrink: 0, minWidth: 90 }}
                      >
                        {copiedId === inviteClient.id ? '✓ Copied!' : '📋 Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Invite email preview */}
                  {inviteClient.email && (
                    <div className="fg">
                      <label>Email Preview</label>
                      <textarea
                        readOnly rows={9}
                        style={{ fontSize: 12, background: '#f8f9fa', color: 'var(--muted)', lineHeight: 1.7, resize: 'none' }}
                        value={`Hi ${inviteClient.first || inviteClient.name},

We've set up a private client portal for you where you can view your project information, quotes, documents and invoices online.

To access your portal, please register using this link:

${portalUrl(inviteClient)}

Important: please register using this email address (${inviteClient.email}) so the system can link you to your project automatically.

Kind regards,
${settings.name || 'Your Builder'}`}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setInviteClient(null)}>
                {inviteSent ? 'Close' : 'Cancel'}
              </button>
              {!inviteSent && (
                <>
                  <button
                    className="btn btn-outline"
                    disabled={!inviteClient.email}
                    onClick={() => window.open(portalUrl(inviteClient), '_blank')}
                  >
                    🌐 Open Portal
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!inviteClient.email}
                    onClick={() => sendInvite(inviteClient, 'email')}
                  >
                    📧 Send Invite Email
                  </button>
                </>
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
