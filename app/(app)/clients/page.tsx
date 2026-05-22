'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Client } from '@/lib/types'
import { useRouter } from 'next/navigation'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import type { Quote } from '@/lib/types'

export default function ClientsPage() {
  const { clients, quotes, jobs, deleteClient, loading } = useApp()
  const [selected, setSelected] = useState<Client | null>(null)
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const router = useRouter()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

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
                      <td><button className="btn-sm btn-danger" onClick={() => handleDelete(c)}>Delete</button></td>
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

      {previewQuote && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setPreviewQuote(null)} />
      )}
    </>
  )
}
