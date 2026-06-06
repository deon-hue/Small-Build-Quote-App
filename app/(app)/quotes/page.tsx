'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import { buildHtmlClientView } from '@/lib/quoteHtml'
import { buildGanttFromQuote } from '@/lib/gantt-utils'
import type { Quote } from '@/lib/types'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import SendQuoteModal from '@/components/SendQuoteModal'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractQuoteIntelligence } from '@/lib/quote-intelligence'

export default function SavedQuotesPage() {
  const { quotes, jobs, settings, updateQuote, deleteQuote, deleteJob, addJob, saveGanttState, loading } = useApp()
  const [previewQuote, setPreviewQuote]   = useState<Quote | null>(null)
  const [emailingQuote, setEmailingQuote] = useState<Quote | null>(null)
  const router = useRouter()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const open = quotes.filter(q => ['draft','pending','in-progress','review','sent'].includes(q.status))
  const pipeline = open.reduce((s, q) => s + quoteTotal(q), 0)

  async function handleStatusChange(quote: Quote, status: Quote['status']) {
    await updateQuote({ ...quote, status })
    if (status === 'accepted') {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          await extractQuoteIntelligence(
            sb, user.id, quote.phases ?? [],
            quote.jobType ?? '', quote.ref ?? quote.id,
            quote.markup ?? 20, 'won',
          )
        }
      } catch (e) {
        console.warn('[quote-intelligence] extraction failed:', e)
      }
    }
  }

  async function handleDelete(q: Quote) {
    const linkedJobs = jobs.filter(j => {
      if (j.quoteId === q.id) return true
      const jn = (j.client || '').toLowerCase()
      const qn = (q.customer.name || '').toLowerCase()
      return jn && qn && (jn === qn || jn.includes(qn) || qn.includes(jn))
    })

    let deleteLinkedJobs = false
    if (linkedJobs.length) {
      const jobList = linkedJobs.map(j => `• ${j.type} — ${j.address} (${STAGE_LABEL[j.stage] || j.stage})`).join('\n')
      const choice = confirm(
        `Deleting quote ${q.ref || q.id} for ${q.customer.name || 'this client'}.\n\n` +
        `Linked job${linkedJobs.length > 1 ? 's' : ''}:\n${jobList}\n\n` +
        `OK = delete quote AND linked jobs\nCancel = delete quote only`
      )
      if (choice === null) return
      deleteLinkedJobs = choice
    } else {
      if (!confirm(`Delete quote ${q.ref || ''}? This cannot be undone.`)) return
    }

    await deleteQuote(q.id)
    if (deleteLinkedJobs) {
      for (const j of linkedJobs) await deleteJob(j.id)
    }
  }

  async function handleConvert(q: Quote) {
    const total = quoteTotal(q)
    const estWeeks = Math.max(4, Math.floor(q.phases.length * 1.5))
    const today = new Date().toISOString().split('T')[0]
    const confirmed = confirm(
      `Convert quote ${q.ref} to a job?\n\nThis will create a new job:\n• Client: ${q.customer.name}\n• Type: ${q.jobType}\n• Value: ${fmt(total)}\n• Estimated duration: ${estWeeks} weeks`
    )
    if (!confirmed) return
    const newJob = await addJob({
      client: q.customer.name, type: q.jobType, address: q.customer.address,
      value: Math.round(total), stage: 'planning', start: today,
      weeks: estWeeks, done: 0,
      notes: `Converted from quote ${q.ref}. ${q.phases.length} phases.`,
      quoteId: q.id,
    })
    if (newJob?.id) {
      try {
        const ganttState = buildGanttFromQuote(q.phases, estWeeks)
        await saveGanttState(newJob.id, ganttState)
      } catch (err) {
        console.warn('Could not auto-generate Gantt chart:', err)
      }
    }
    await updateQuote({ ...q, convertedToJob: true })
    alert('Job created! Find it in the Jobs section.')
    router.push('/jobs')
  }

  function downloadQuote(q: Quote) {
    const html = buildHtmlClientView(q, settings)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Quote-${q.ref || 'Draft'}-${(q.customer.name || 'Client').replace(/[^a-z0-9]/gi, '_')}.html`
    a.click()
  }

  function quoteExpiry(savedDate: string) {
    if (!savedDate) return ''
    const parts = savedDate.split('/')
    if (parts.length !== 3) return ''
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function isExpired(savedDate: string) {
    if (!savedDate) return false
    const parts = savedDate.split('/')
    if (parts.length !== 3) return false
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    d.setDate(d.getDate() + 30)
    return d < new Date()
  }

  return (
    <>
      <div style={{ marginBottom: 18, fontSize: 13, color: 'var(--muted)' }}>
        {quotes.length
          ? `${open.length} open · ${fmt(pipeline)} pipeline · ${quotes.length} total`
          : 'No quotes saved yet'}
      </div>

      {!quotes.length
        ? <div className="empty-dashed">
            <div style={{ fontSize: 14, marginBottom: 6 }}>No quotes yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Create your first quote using New Quote.</div>
          </div>
        : [...quotes].reverse().map(q => {
            const alreadyJob = jobs.some(j => {
              const jn = (j.client || '').toLowerCase()
              const qn = (q.customer.name || '').toLowerCase()
              return jn === qn || jn.includes(qn) || qn.includes(jn)
            })

            return (
              <div key={q.id} className="sq-card" style={q.status === 'accepted' ? { borderLeft: '3px solid #7ab533' } : {}}>
                <div className="sq-ref">{q.ref || '—'}</div>
                <div className="sq-info">
                  <div className="sq-title">{q.jobType} — {q.customer.name || '—'}</div>
                  <div className="sq-sub">
                    {q.customer.address || ''} · Saved {q.savedDate || '—'}
                    {q.lastEdited ? ' · Edited ' + q.lastEdited : ''}
                    {quoteExpiry(q.savedDate) && (
                      <span style={{ marginLeft: 6, color: isExpired(q.savedDate) ? 'var(--terra)' : 'var(--muted)' }}>
                        · {isExpired(q.savedDate) ? '⚠ Expired' : 'Expires'} {quoteExpiry(q.savedDate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="sq-val">{fmt(quoteTotal(q))}</div>
                <div style={{ textAlign: 'center', minWidth: 200 }}>
                  <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>{Q_LABEL[q.status] || q.status}</span>
                  {q.clientApprovedBy && (
                    <div style={{ marginTop: 4 }} title={`Approved ${q.clientApprovedAt ? new Date(q.clientApprovedAt).toLocaleString('en-GB') : ''}`}>
                      <span style={{ fontSize: 10, background: '#f0f9e8', color: '#4a7c1f', border: '1px solid #b8e08a', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                        ✅ Signed by {q.clientApprovedBy}
                      </span>
                    </div>
                  )}
                  <div className="sq-actions" style={{ marginTop: 6 }}>
                    {q.status === 'accepted' ? (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 10px',
                        background: '#f0f9e8', color: '#4a7c1f',
                        border: '1px solid #b8e08a', borderRadius: 4,
                      }} title="Accepted quotes are locked and cannot be edited">
                        🔒 Locked
                      </span>
                    ) : (
                      <button className="btn-sm btn-primary" onClick={() => {
                        sessionStorage.setItem('sbc_edit_quote', q.id)
                        router.push('/new-quote')
                      }}>✎ Edit</button>
                    )}
                    <button className="btn-sm btn-outline" onClick={() => setPreviewQuote(q)}>View</button>
                    <button className="btn-sm btn-outline" onClick={() => downloadQuote(q)}>⬇ HTML</button>
                    <button
                      className="btn-sm"
                      style={{ background: '#2b3a2b', color: 'white', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                      onClick={() => setEmailingQuote(q)}
                    >
                      ✉ Email + PDF
                    </button>
                    {q.status === 'accepted' && !alreadyJob && (
                      <button className="btn-sm btn-gold" onClick={() => handleConvert(q)} style={{ whiteSpace: 'nowrap' }}>
                        ⬡ Convert to Job
                      </button>
                    )}
                    {q.status === 'accepted' && alreadyJob && (
                      <span style={{ fontSize: 10, color: 'var(--moss)', fontWeight: 500 }}>✓ Job created</span>
                    )}
                    <select
                      value={q.status}
                      onChange={e => handleStatusChange(q, e.target.value as Quote['status'])}
                      style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}
                    >
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                    </select>
                    <button className="btn-sm btn-danger" onClick={() => handleDelete(q)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })
      }

      {previewQuote && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setPreviewQuote(null)} />
      )}

      {emailingQuote && (
        <SendQuoteModal
          quote={emailingQuote}
          onClose={() => setEmailingQuote(null)}
          onSent={() => updateQuote({ ...emailingQuote, status: 'sent' })}
        />
      )}
    </>
  )
}
