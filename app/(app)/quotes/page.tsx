'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import { buildHtmlClientView } from '@/lib/quoteHtml'
import { buildGanttFromQuote } from '@/lib/gantt-utils'
import type { Quote } from '@/lib/types'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import SendQuoteModal from '@/components/SendQuoteModal'
import QuoteCommentsSection from '@/components/QuoteCommentsSection'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { extractQuoteIntelligence } from '@/lib/quote-intelligence'

export default function SavedQuotesPage() {
  const { quotes, jobs, variations, settings, updateQuote, deleteQuote, deleteJob, addJob, addVariation, saveGanttState, loading } = useApp()
  const [previewQuote, setPreviewQuote]   = useState<Quote | null>(null)
  const [emailingQuote, setEmailingQuote] = useState<Quote | null>(null)
  const [archiveOpen, setArchiveOpen]     = useState(false)
  const [pushVarQuote, setPushVarQuote]   = useState<Quote | null>(null)
  const [pushVarJobId, setPushVarJobId]   = useState('')
  const [pushingVar, setPushingVar]       = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const router = useRouter()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const open     = quotes.filter(q => ['draft','pending','in-progress','review','sent'].includes(q.status))
  const active   = quotes.filter(q => q.status !== 'archived')
  const archived = quotes.filter(q => q.status === 'archived')
  const pipeline = open.reduce((s, q) => s + quoteTotal(q), 0)

  // Group quotes by version: root quotes + their versions
  const groupedQuotes = (() => {
    const groups: Record<string, Quote[]> = {}
    for (const q of active) {
      const groupId = q.parentQuoteId || q.id
      if (!groups[groupId]) groups[groupId] = []
      groups[groupId].push(q)
    }
    // Sort each group by versionNumber, then return groups in reverse order
    Object.values(groups).forEach(g => g.sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1)))
    return Object.entries(groups)
      .map(([id, quoteGroup]) => ({ groupId: id, quotes: quoteGroup }))
      .reverse()
  })()

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

  async function handleArchive(q: Quote) {
    if (!confirm(`Archive quote ${q.ref || ''}?\n\nIt will move to the Archived section and can be reinstated at any time.`)) return
    await updateQuote({ ...q, status: 'archived' })
  }

  async function handleReinstate(q: Quote) {
    if (!confirm(`Reinstate quote ${q.ref || ''}?\n\nIt will move back to Saved Quotes with Accepted status.`)) return
    await updateQuote({ ...q, status: 'accepted' })
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
      // Copy any plan attachments from the quote into the job's files section
      fetch('/api/copy-quote-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: q.id, jobId: newJob.id }),
      }).catch(err => console.warn('Could not copy quote plans to job:', err))
    }
    await updateQuote({ ...q, convertedToJob: true })
    alert('Job created! Find it in the Jobs section.')
    router.push('/jobs')
  }

  async function handlePushToVariation(q: Quote, jobId: string) {
    const total = quoteTotal(q)
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    if (!confirm(`Add "${q.ref}" as an approved variation on "${job.type} — ${job.client}"?\n\nAmount: ${fmt(total)}\n\nThis will immediately update that job's contract value.`)) return
    setPushingVar(true)
    try {
      await addVariation(jobId, {
        title: `${q.ref}${q.customer.name ? ` — ${q.customer.name}` : ''}`,
        description: q.scope || '',
        status: 'approved',
        items: [],
        markup: 0,
        vatIncluded: q.vatIncluded,
        total,
        notes: `Added from quote ${q.ref}`,
        locked: true,
        clientApprovedAt: new Date().toISOString(),
        clientApprovedBy: q.customer.name || '(Client)',
        clientRejectedAt: null,
        clientRejectionReason: null,
        sentAt: null,
      })
      await updateQuote({ ...q, convertedToJob: true })
      setPushVarQuote(null)
      setPushVarJobId('')
      alert(`Done — variation added to "${job.type} — ${job.client}". The contract value has been updated.`)
    } finally {
      setPushingVar(false)
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {active.length
            ? `${open.length} open · ${fmt(pipeline)} pipeline · ${active.length} total${archived.length ? ` · ${archived.length} archived` : ''}`
            : 'No quotes saved yet'}
        </div>
        <button
          onClick={() => router.push('/quick-quote')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6,
            border: '1.5px solid #7c3aed', background: '#fdf4ff', color: '#7c3aed',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#7c3aed'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fdf4ff'; e.currentTarget.style.color = '#7c3aed' }}
        >
          ⚡ Quick Quote
        </button>
      </div>

      {!active.length
        ? <div className="empty-dashed">
            <div style={{ fontSize: 14, marginBottom: 6 }}>No quotes yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Create your first quote using New Quote.</div>
          </div>
        : groupedQuotes.map(group => {
            const isMultiVersion = group.quotes.length > 1
            const isExpanded = expandedGroups[group.groupId]
            const rootQuote = group.quotes[0] // First in sorted order (v1)

            return (
              <div key={group.groupId}>
                {isMultiVersion && (
                  <button
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group.groupId]: !prev[group.groupId] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: isExpanded ? 8 : 10,
                      background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text)',
                      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{isExpanded ? '▾' : '▸'}</span>
                    <span>{rootQuote.ref || '—'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, background: '#f0f9e8', color: '#4a7c1f', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                      {group.quotes.length} versions
                    </span>
                  </button>
                )}

                {(!isMultiVersion || isExpanded) && group.quotes.map((q, idx) => {
            const hasLinkedJob = jobs.some(j => j.quoteId === q.id)
            const pushedAsVariation = !!q.ref && variations.some(v => v.notes === `Added from quote ${q.ref}`)
            const alreadyJob = q.convertedToJob || hasLinkedJob || pushedAsVariation || jobs.some(j => {
              const jn = (j.client || '').toLowerCase()
              const qn = (q.customer.name || '').toLowerCase()
              return jn === qn || jn.includes(qn) || qn.includes(jn)
            })
            const isConverted = q.status === 'accepted' && alreadyJob
            // Only hide the variation button when explicitly actioned — not just name-matched
            const isActioned = q.status === 'accepted' && (hasLinkedJob || pushedAsVariation || q.convertedToJob)

            return (
              <div key={q.id} className="sq-card" style={q.status === 'accepted' ? { borderLeft: '3px solid #7ab533' } : {}, q.versionNumber && isMultiVersion ? { marginLeft: 20, borderRadius: '4px 4px 4px 4px' } : {}}>
                <div className="sq-ref" style={q.versionNumber && isMultiVersion ? { display: 'flex', alignItems: 'center', gap: 8 } : {}}>
                  {q.ref || '—'}
                  {q.versionNumber && isMultiVersion && (
                    <span style={{ fontSize: 10, background: '#e0e7ff', color: '#4c1d95', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                      v{q.versionNumber}
                    </span>
                  )}
                </div>
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
                      <button
                        className="btn-sm"
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 10px',
                          background: '#f0f9e8', color: '#4a7c1f',
                          border: '1px solid #b8e08a', borderRadius: 4, cursor: 'pointer',
                        }}
                        title="Locked — prices can't change, but you can fix the linked customer"
                        onClick={() => {
                          sessionStorage.setItem('sbc_edit_quote', q.id)
                          router.push('/new-quote')
                        }}
                      >
                        🔒 Locked
                      </button>
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
                      <span style={{ fontSize: 10, color: 'var(--moss)', fontWeight: 500 }}>
                        {pushedAsVariation && !hasLinkedJob ? '✓ Added as variation' : '✓ Job created'}
                      </span>
                    )}
                    {q.status === 'accepted' && !isActioned && (
                      pushVarQuote?.id === q.id ? (
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={pushVarJobId}
                            onChange={e => setPushVarJobId(e.target.value)}
                            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 }}
                          >
                            <option value="">Select job…</option>
                            {jobs.map(j => <option key={j.id} value={j.id}>{j.type} — {j.client}</option>)}
                          </select>
                          <button
                            className="btn-sm btn-primary"
                            disabled={!pushVarJobId || pushingVar}
                            onClick={() => handlePushToVariation(q, pushVarJobId)}
                          >
                            {pushingVar ? '…' : '✓ Add'}
                          </button>
                          <button className="btn-sm btn-outline" onClick={() => { setPushVarQuote(null); setPushVarJobId('') }}>✕</button>
                        </div>
                      ) : (
                        <button
                          className="btn-sm btn-outline"
                          onClick={() => { setPushVarQuote(q); setPushVarJobId('') }}
                          style={{ whiteSpace: 'nowrap', color: '#7c3aed', borderColor: '#c4b5fd' }}
                        >
                          ↗ Add to Job as Variation
                        </button>
                      )
                    )}
                    {!isConverted && (
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
                    )}
                    {isConverted ? (
                      <button
                        className="btn-sm"
                        style={{ background: '#64748b', color: 'white', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                        onClick={() => handleArchive(q)}
                        title="Move to archive — quote is locked and job already created"
                      >
                        📁 Archive
                      </button>
                    ) : (
                      <button className="btn-sm btn-danger" onClick={() => handleDelete(q)}>✕</button>
                    )}
                  </div>
                </div>
              </div>
            )
                })}
              </div>
            )
          })
      }

      {/* ── Archived Quotes ────────────────────────────────────── */}
      {archived.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setArchiveOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '8px 14px', fontSize: 12, fontWeight: 600,
              color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
              width: '100%', marginBottom: archiveOpen ? 10 : 0,
            }}
          >
            <span style={{ fontSize: 14 }}>{archiveOpen ? '▾' : '▸'}</span>
            📁 Archived Quotes ({archived.length})
            <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11 }}>
              {archiveOpen ? 'Hide' : 'Show'}
            </span>
          </button>

          {archiveOpen && [...archived].reverse().map(q => (
            <div key={q.id} className="sq-card" style={{ borderLeft: '3px solid #94a3b8', opacity: 0.85 }}>
              <div className="sq-ref" style={{ color: 'var(--muted)' }}>{q.ref || '—'}</div>
              <div className="sq-info">
                <div className="sq-title" style={{ color: 'var(--muted)' }}>{q.jobType} — {q.customer.name || '—'}</div>
                <div className="sq-sub">{q.customer.address || ''} · Saved {q.savedDate || '—'}</div>
              </div>
              <div className="sq-val" style={{ color: 'var(--muted)' }}>{fmt(quoteTotal(q))}</div>
              <div style={{ textAlign: 'center', minWidth: 200 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>
                  ARCHIVED
                </span>
                <div className="sq-actions" style={{ marginTop: 6 }}>
                  <button className="btn-sm btn-outline" onClick={() => setPreviewQuote(q)}>View</button>
                  <button className="btn-sm btn-outline" onClick={() => downloadQuote(q)}>⬇ HTML</button>
                  <button
                    className="btn-sm"
                    style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                    onClick={() => handleReinstate(q)}
                    title="Restore to Saved Quotes with Accepted status"
                  >
                    ↩ Reinstate
                  </button>
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => {
                      if (confirm(
                        `Permanently delete archived quote ${q.ref || q.id}?\n\n` +
                        `Client: ${q.customer.name || '—'}\n` +
                        `Value: ${fmt(quoteTotal(q))}\n\n` +
                        `⚠ This cannot be undone.`
                      )) handleDelete(q)
                    }}
                    title="Permanently delete this archived quote"
                  >
                    ✕ Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
