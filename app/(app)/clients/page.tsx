'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Client } from '@/lib/types'
import { useRouter } from 'next/navigation'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import type { Quote } from '@/lib/types'

export default function ClientsPage() {
  const { clients, quotes, jobs, settings, deleteClient, loading } = useApp()
  const [selected, setSelected] = useState<Client | null>(null)
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inviteClient, setInviteClient] = useState<Client | null>(null)
  const router = useRouter()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const portalUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/portal/login'

  function copyLink(clientId: string) {
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopiedId(clientId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function openEmailInvite(c: Client) {
    const company = settings.name || 'Your Builder'
    const subject = encodeURIComponent(`Your client portal — ${company}`)
    const body = encodeURIComponent(
`Hi ${c.first || c.name},

We've set up a secure client portal where you can view your quotes, track your project and see your invoices online.

To get started, click the link below and register using this email address (${c.email}):

${portalUrl}

If you have any questions, please don't hesitate to get in touch.

Kind regards,
${company}`)
    window.open(`mailto:${c.email}?subject=${subject}&body=${body}`)
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

  const selQuotes = selected ? getClientQuotes(selected) : []
  const selJobs = selected ? getClientJobs(selected) : []
  const acceptedValue = selQuotes.filter(q => q.status === 'accepted').reduce((s, q) => s + quoteTotal(q), 0)

  return (
    <>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Client</th><th>Phone</th><th>Email</th><th>Jobs</th><th>Quotes</th><th>Accepted Value</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!clients.length
              ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No clients yet — they appear automatically when you save a quote</td></tr>
              : clients.map(c => {
                  const ini = (c.name[0] || '').toUpperCase() + ((c.name.split(' ').pop() || '')[0] || '').toUpperCase()
                  const cQ = getClientQuotes(c)
                  const cJ = getClientJobs(c)
                  const val = cQ.filter(q => q.status === 'accepted').reduce((s, q) => s + quoteTotal(q), 0)
                  return (
                    <tr key={c.id}>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--slate)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, marginRight: 8, verticalAlign: 'middle' }}>{ini}</span>
                        {c.name}
                      </td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>{c.phone || '—'}</td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>{c.email || '—'}</td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>{cJ.length} job{cJ.length !== 1 ? 's' : ''}</td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>{cQ.length} quote{cQ.length !== 1 ? 's' : ''}</td>
                      <td onClick={() => setSelected(c)} style={{ cursor: 'pointer' }} className="mono">{val > 0 ? fmt(val) : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {c.email
                            ? <button
                                className="btn-sm btn-sky"
                                title="Send portal invite"
                                onClick={() => setInviteClient(c)}
                              >
                                🔗 Invite
                              </button>
                            : <button className="btn-sm btn-outline" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }} title="No email on file">🔗 Invite</button>
                          }
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

      {/* Client detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="modal-box" style={{ width: 'min(760px,96vw)' }}>
            <div className="modal-hd">
              <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selected.email && (
                  <button className="btn-sm btn-sky" onClick={() => { setInviteClient(selected); setSelected(null) }}>
                    🔗 Send Portal Invite
                  </button>
                )}
                <button className="btn-sm btn-gold" onClick={() => {
                  sessionStorage.setItem('sbc_prefill_client', selected.id)
                  setSelected(null)
                  router.push('/new-quote')
                }}>+ New Quote for {selected.name.split(' ').pop()}</button>
                <button className="modal-close" onClick={() => setSelected(null)}>×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
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
                          <button className="btn-sm btn-outline" onClick={() => {
                            setSelected(null)
                            router.push('/jobs')
                          }}>View in Jobs</button>
                        </div>
                      )
                    })
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Portal invite modal */}
      {inviteClient && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setInviteClient(null) }}>
          <div className="form-modal" style={{ width: 'min(480px, 96vw)' }}>
            <div className="form-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Send Portal Invite</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{inviteClient.name}</div>
              </div>
              <button className="modal-close" onClick={() => setInviteClient(null)}>×</button>
            </div>
            <div className="form-modal-bd">

              {/* Explanation */}
              <div style={{ background: 'var(--warm)', borderRadius: 8, padding: '14px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>How it works</div>
                <div style={{ color: 'var(--muted)' }}>
                  Send <strong>{inviteClient.name}</strong> the link below. They register with{' '}
                  <strong>{inviteClient.email}</strong> and are automatically linked to their quotes, jobs and invoices.
                </div>
              </div>

              {/* Portal link */}
              <div className="fg">
                <label>Portal Link</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    readOnly
                    value={portalUrl}
                    style={{ flex: 1, background: '#f8f9fa', color: 'var(--muted)', fontSize: 13 }}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className={`btn-sm ${copiedId === inviteClient.id ? 'btn-gold' : 'btn-outline'}`}
                    onClick={() => copyLink(inviteClient.id)}
                    style={{ flexShrink: 0, minWidth: 80 }}
                  >
                    {copiedId === inviteClient.id ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>
              </div>

              {/* Pre-written email */}
              <div className="fg">
                <label>Preview — Email Message</label>
                <textarea
                  readOnly
                  rows={9}
                  style={{ fontSize: 12, background: '#f8f9fa', color: 'var(--muted)', lineHeight: 1.7, resize: 'none' }}
                  value={`Hi ${inviteClient.first || inviteClient.name},

We've set up a secure client portal where you can view your quotes, track your project and see your invoices online.

To get started, click the link below and register using this email address (${inviteClient.email}):

${portalUrl}

If you have any questions, please don't hesitate to get in touch.

Kind regards,
${settings.name || 'Your Builder'}`}
                />
              </div>

            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setInviteClient(null)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={() => openEmailInvite(inviteClient)}
              >
                📧 Open in Email App
              </button>
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
