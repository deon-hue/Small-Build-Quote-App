'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useApp } from '@/contexts/AppContext'
import { fmt, resolveJobColor, JOB_COLORS, jobDisplayTitle, findLinkedQuote, jobNumber, STAGE_BADGE, STAGE_LABEL, JOB_TYPES, jobProgress } from '@/lib/utils'
import type { Job, Quote } from '@/lib/types'
import { quoteBudget } from '@/lib/job-costs'
import GanttModal from '@/components/GanttModal'
import { ContactPicker } from '@/components/ContactPicker'
import VariationModal from '@/components/VariationModal'
import JobDocumentsModal from '@/components/JobDocumentsModal'
import JobNotesModal from '@/components/JobNotesModal'
import JobAttachmentsModal from '@/components/JobAttachmentsModal'
import PaymentRequestsModal from '@/components/PaymentRequestsModal'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import QuoteCommentsModal from '@/components/QuoteCommentsModal'
import ContractBuilderModal from '@/components/ContractBuilderModal'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'

const BLANK_JOB: Omit<Job, 'id'> = {
  client: '', type: 'Rear Extension', title: '', address: '', value: 0,
  stage: 'planning', start: '', weeks: 8, done: 0, notes: '',
}

function JobsPageInner() {
  const { jobs, quotes, clients, jobNotes, jobPayments, variations, invoices, addJob, updateJob, deleteJob, updateQuote, loading } = useApp()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [form, setForm] = useState<Omit<Job, 'id'>>(BLANK_JOB)
  const [prefillQuoteId, setPrefillQuoteId] = useState('')
  const [ganttJob, setGanttJob] = useState<Job | null>(null)
  const [variationJob, setVariationJob] = useState<Job | null>(null)
  const [saving, setSaving] = useState(false)
  const [notesJob, setNotesJob] = useState<Job | null>(null)
  const [docsJob, setDocsJob] = useState<Job | null>(null)
  const [attachmentsJob, setAttachmentsJob] = useState<Job | null>(null)
  const [requestsJob, setRequestsJob] = useState<Job | null>(null)
  const [viewQuote, setViewQuote] = useState<Quote | null>(null)
  const [commentsQuote, setCommentsQuote] = useState<Quote | null>(null)
  const [contractJob, setContractJob] = useState<Job | null>(null)
  // Phones only: which job card has its action buttons expanded (CSS ignores this on desktop)
  const [openJobId, setOpenJobId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Set when arriving via a "?open=<jobId>" link (e.g. Calendar's "Open in Jobs" button) —
  // see the effect below, which also opens that job's Gantt chart and scrolls its card
  // into view with a brief highlight, so the link lands on the schedule itself rather
  // than just somewhere on the unfiltered list.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const jobFormModal = useDraggableModal()

  // Archived jobs are hidden from the main list and every filter, but nothing about them
  // is deleted — see handleArchive. They only ever reach here with stage 'complete'.
  const visibleJobs = jobs.filter(j => !j.archived)
  const archivedJobs = jobs.filter(j => j.archived)
  const filtered = filter === 'all' ? visibleJobs : visibleJobs.filter(j => j.stage === filter)

  useEffect(() => {
    const openId = searchParams.get('open')
    const openJob = jobs.find(j => j.id === openId)
    if (!openId || loading || !openJob) return
    if (openJob.archived) setArchiveOpen(true)
    setFilter('all')
    setOpenJobId(openId)
    setHighlightId(openId)
    setGanttJob(openJob)
    const scrollTimer = setTimeout(() => {
      document.getElementById(`job-${openId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    const clearTimer = setTimeout(() => setHighlightId(null), 2200)
    router.replace('/jobs')
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams])

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  function openNew() {
    setEditJob(null)
    setForm(BLANK_JOB)
    setPrefillQuoteId('')
    setShowModal(true)
  }

  function openEdit(job: Job) {
    setEditJob(job)
    setForm({ client: job.client, type: job.type, title: job.title, address: job.address, value: job.value,
      stage: job.stage, start: job.start, weeks: job.weeks, done: job.done, notes: job.notes, color: job.color })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.client && !confirm('No client name — save anyway?')) return
    setSaving(true)
    try {
      if (editJob) {
        // Archiving only ever happens from the "complete" stage (see handleArchive) — if the
        // stage is edited away from complete, an archived job must come back off the shelf
        // rather than stay hidden with a stage the archive rule no longer allows.
        const archived = editJob.archived && form.stage !== 'complete' ? false : editJob.archived
        await updateJob({ ...editJob, ...form, archived })
      } else {
        const newJob = await addJob({ ...form, quoteId: prefillQuoteId || undefined })
        // Mark quote as converted if we have a quoteId
        if (prefillQuoteId && newJob?.id) {
          const q = quotes.find(q => q.id === prefillQuoteId)
          if (q) await updateQuote({ ...q, convertedToJob: true })
          // Copy any plan attachments from the quote into the job's files section
          fetch('/api/copy-quote-plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId: prefillQuoteId, jobId: newJob.id }),
          }).catch(err => console.warn('Could not copy quote plans to job:', err))
        }
      }
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(job: Job) {
    const linkedQuote = job.quoteId ? quotes.find(q => q.id === job.quoteId) : null
    let msg = `Delete job: ${jobDisplayTitle(job)} — ${job.client}?`
    if (linkedQuote) msg += `\n\nThis will also unlink quote ${linkedQuote.ref}.`
    msg += '\n\nThis cannot be undone.'
    if (!confirm(msg)) return
    await deleteJob(job.id)
  }

  async function handleArchive(job: Job) {
    if (!confirm(
      `Archive job: ${jobDisplayTitle(job)} — ${job.client}?\n\n` +
      `It will move out of the Jobs list into Archived Jobs. Nothing is deleted — notes, ` +
      `files, costs, payments and variations all stay exactly as they are, and you can ` +
      `reinstate it any time.`
    )) return
    await updateJob({ ...job, archived: true })
  }

  async function handleReinstate(job: Job) {
    await updateJob({ ...job, archived: false })
  }

  function getLinkedQuotePhases(job: Job) {
    return findLinkedQuote(job, quotes)?.phases ?? []
  }

  const activeCount = jobs.filter(j => j.stage === 'active').length
  const planningCount = jobs.filter(j => j.stage === 'planning').length
  const heldCount = jobs.filter(j => j.stage === 'onhold').length
  const activeValue = jobs.filter(j => j.stage === 'active').reduce((s, j) => s + j.value, 0)

  // Shared by the main grid and the Archived Jobs section below — an archived job keeps
  // every one of these buttons (Notes, Files, Costs, Payments, Variations, Gantt) so nothing
  // it's linked to becomes harder to find; only the Edit/Delete row is swapped for Reinstate.
  function renderJobCard(j: Job) {
    const jobNum = jobNumber(jobs, j.id)
    const prog = jobProgress(j)
    const pct = prog.pct
    const col = resolveJobColor(j)
    const linkedQuote = findLinkedQuote(j, quotes)
    const quoteLocked = linkedQuote && (linkedQuote.status === 'accepted' || linkedQuote.status === 'approved')
    const jobVars = variations.filter(v => v.jobId === j.id)
    const approvedVarTotal = jobVars
      .filter(v => v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid')
      .reduce((s, v) => s + v.total, 0)
    const sentVarCount = jobVars.filter(v => v.status === 'sent').length
    const effectiveValue = j.value + approvedVarTotal
    return (
      <div
        key={j.id}
        id={`job-${j.id}`}
        className={`card job-card${openJobId === j.id ? ' open' : ''}${highlightId === j.id ? ' job-highlight' : ''}`}
        style={{ marginBottom: 12, '--job-color': col } as React.CSSProperties}
      >
        <div className="job-card-inner">
          <div className="job-card-main" onClick={() => setOpenJobId(id => id === j.id ? null : j.id)}>
            <div className="job-dot" style={{ background: col }} />
            <div className="job-info">
              <div className="job-namerow" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span className="mono job-code" style={{ fontSize: 10, fontWeight: 700, color: 'white', background: col, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.5px' }}>{jobNum}</span>
                <div className="job-name"><span className="jn-type">{jobDisplayTitle(j)}</span><span className="jn-sep"> — </span><span className="jn-client">{j.client}</span></div>
                <span className="job-card-toggle" aria-hidden="true">›</span>
              </div>
              <div className="job-meta"><span className="jm-type">{jobDisplayTitle(j)} · </span>{j.address}<span className="jm-started">{j.start ? ' · Started ' + new Date(j.start).toLocaleDateString('en-GB') : ''}</span></div>
              {linkedQuote && (
                <div style={{ fontSize: 11, marginTop: 3 }}>
                  {quoteLocked ? (
                    <button
                      onClick={e => { e.stopPropagation(); setViewQuote(linkedQuote) }}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--sky)', cursor: 'pointer', textDecoration: 'underline' }}
                      title="View the locked, client-accepted quote this job was created from"
                    >
                      🔒 View {linkedQuote.ref}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>📄 {linkedQuote.ref} (not yet accepted)</span>
                  )}
                </div>
              )}
              <div className="progress" style={{ maxWidth: 240, marginTop: 6 }}>
                <div className="progress-bar" style={{ width: pct + '%', background: col }} />
              </div>
              <div className="job-x-num">{jobNum}{j.start ? ' · Started ' + new Date(j.start).toLocaleDateString('en-GB') : ''}</div>
              <div className="job-progress-text" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {prog.started ? `Week ${prog.weekNo} of ${prog.weeks} · ${pct}% complete` : `Not started · ${prog.weeks} weeks planned`}
              </div>
            </div>
            <div className="job-value-col" style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmt(effectiveValue)}</div>
              {approvedVarTotal > 0 && (
                <div style={{ fontSize: 10, color: '#27ae60', marginTop: 1 }}>
                  Base {fmt(j.value)} +{fmt(approvedVarTotal)} variations
                </div>
              )}
              <span className={`badge ${STAGE_BADGE[j.stage] || 'b-planning'}`} style={{ marginTop: 4, display: 'block' }}>
                {STAGE_LABEL[j.stage] || j.stage}
              </span>
            </div>
          </div>
          <div className="job-card-actions">
            <button className="btn-sm btn-gold jb-gantt" onClick={() => setGanttJob(j)}>📋 Gantt</button>
            <button className="btn-sm btn-sky jb-notes" onClick={() => setNotesJob(j)}>
              📝 Notes {jobNotes.filter(n => n.jobId === j.id).length > 0 ? `(${jobNotes.filter(n => n.jobId === j.id).length})` : ''}
            </button>
            <button
              className={`${sentVarCount > 0 ? 'btn-sm btn-primary' : 'btn-sm btn-outline'} jb-var`}
              onClick={() => setVariationJob(j)}
              title="Variations / change orders for this job"
            >
              ±&nbsp;Variations{jobVars.length > 0 ? ` (${jobVars.length})` : ''}
              {sentVarCount > 0 ? ` · ${sentVarCount} pending` : ''}
            </button>
            <button className="btn-sm btn-outline jb-files" onClick={() => setAttachmentsJob(j)} title="Plans, photos and documents shared with the client">📎 Files</button>
            {linkedQuote && (
              <button className="btn-sm btn-outline jb-qa" onClick={() => setCommentsQuote(linkedQuote)} title="Questions and replies for this job's quote">💬 Quote Q&amp;A</button>
            )}
            <button className="btn-sm btn-outline jb-contract" onClick={() => setContractJob(j)} title="Fill, send and track the signed FMB contract for this job">📝 Contract</button>
            <button className="btn-sm btn-outline jb-costs" onClick={() => setDocsJob(j)} title="Scan/upload supplier docs and track costs">💷 Costs</button>
            <button className="btn-sm btn-outline jb-pay" onClick={() => setRequestsJob(j)} title="Payment requests and received payments">
              💳 Payments{jobPayments.filter(p => p.jobId === j.id).length > 0 ? ` (${jobPayments.filter(p => p.jobId === j.id).length})` : ''}
            </button>
            {j.archived ? (
              <button className="btn-sm btn-reinstate jb-archive" onClick={() => handleReinstate(j)} title="Bring this job back into the Jobs list">↩ Reinstate</button>
            ) : j.stage === 'complete' ? (
              <button className="btn-sm btn-archive jb-archive" onClick={() => handleArchive(j)} title="Move to Archived Jobs — keeps all notes, files and costs">📁 Archive</button>
            ) : null}
            <button className="btn-sm btn-outline jb-edit" onClick={() => openEdit(j)}>Edit</button>
            <button className="btn-sm btn-danger jb-del" onClick={() => handleDelete(j)}>✕<span className="mob-label"> Delete job</span></button>
          </div>
        </div>
        {j.notes && (
          <div className="job-note" style={{ padding: '8px 20px 14px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
            {j.notes}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Phone/tablet header + headline numbers (hidden on desktop by CSS) */}
      <div className="tp-head">
        <div>
          <div className="tp-kicker">Your work</div>
          <h1 className="tp-title">Jobs</h1>
        </div>
        <button className="tp-btn" onClick={openNew}>+ New job</button>
      </div>
      <div className="tp-stats">
        <div className="tp-stat"><span>On site</span><b>{activeCount}</b><em>{fmt(activeValue)} contract value</em></div>
        <div className="tp-stat"><span>Planning</span><b>{planningCount}</b><em>Not started yet</em></div>
        <div className="tp-stat"><span>On hold</span><b>{heldCount}</b><em>{heldCount ? 'Needs a decision' : 'None'}</em></div>
      </div>

      {/* Filter + Add button */}
      <div className="jobs-filter-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div className="jobs-chips" style={{ display: 'contents' }}>
          {['all','planning','active','onhold','complete'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={filter === f ? 'btn-sm btn-primary' : 'btn-sm btn-outline'}
              style={{ textTransform: 'capitalize' }}>
              {f === 'all' ? 'All' : STAGE_LABEL[f] || f}
            </button>
          ))}
        </div>
        <div className="jobs-spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary jobs-add tp-hide" onClick={openNew} aria-label="Add job"><span className="add-plus">+</span><span className="add-label"> Add Job</span></button>
      </div>

      {/* Jobs list */}
      {!filtered.length
        ? <div className="empty-dashed"><div style={{ fontSize: 14, marginBottom: 6 }}>No jobs yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Add your first job above.</div>
          </div>
        : <div className="jobs-grid">{filtered.map(renderJobCard)}</div>
      }

      {/* Archived jobs — completed jobs the estimator has archived. Collapsed by default so
          they stay out of the way; nothing here has been deleted, and Reinstate brings a job
          straight back into the list above. */}
      {archivedJobs.length > 0 && (
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
            📁 Archived Jobs ({archivedJobs.length})
            <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11 }}>
              {archiveOpen ? 'Hide' : 'Show'}
            </span>
          </button>
          {archiveOpen && <div className="jobs-grid">{archivedJobs.map(renderJobCard)}</div>}
        </div>
      )}

      {/* Job add/edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => jobFormModal.onOverlayClick(e, () => setShowModal(false))}>
          <div ref={jobFormModal.boxRef} className="form-modal" style={jobFormModal.draggableStyle}>
            <div className="form-modal-hd" onMouseDown={jobFormModal.onHeaderMouseDown}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editJob ? 'Edit Job' : 'New Job'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ModalMaximizeButton isMaximized={jobFormModal.isMaximized} onClick={jobFormModal.toggleMaximize} />
                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
              </div>
            </div>
            <div className="form-modal-bd">
              <div className="row2">
                <div className="fg">
                  <label>Customer</label>
                  <ContactPicker
                    value={clients.find(c => c.name.trim().toLowerCase() === form.client.trim().toLowerCase())?.id ?? ''}
                    onChange={id => {
                      const c = clients.find(cl => cl.id === id)
                      setForm(f => ({ ...f, client: c ? c.name : '' }))
                    }}
                    contacts={clients.map(c => ({ id: c.id, name: c.name }))}
                    placeholder="Search customer…"
                  />
                  {!clients.some(c => c.name.trim().toLowerCase() === form.client.trim().toLowerCase()) && (
                    <input
                      style={{ marginTop: 6 }}
                      value={form.client}
                      onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                      placeholder="Or type a name (won't link to a contact)"
                    />
                  )}
                </div>
                <div className="fg">
                  <label>Job Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="fg">
                <label>Job Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Give the job a name — shown everywhere instead of the Job Type"
                />
              </div>
              <div className="fg">
                <label>Colour</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: undefined }))}
                    title="Automatic — a stable colour based on the job, from the same 10"
                    style={{
                      width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', background: '#fff',
                      border: !form.color ? '2px solid #1e2022' : '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: 'var(--muted)', fontWeight: 700, padding: 0,
                    }}
                  >
                    Auto
                  </button>
                  {JOB_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      title={c}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', background: c, padding: 0,
                        border: form.color === c ? '2px solid #1e2022' : '2px solid transparent',
                        boxShadow: form.color === c ? 'none' : '0 0 0 1px var(--border)',
                        color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1,
                      }}
                    >
                      {form.color === c ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="14 Thornton Road, London" />
              </div>
              <div className="row2">
                <div className="fg">
                  <label>Contract Value (£)</label>
                  <input type="number" value={form.value || ''} onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))} placeholder="64000" />
                </div>
                <div className="fg">
                  <label>Stage</label>
                  <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value as Job['stage'] }))}>
                    <option value="planning">Planning</option>
                    <option value="active">On Site</option>
                    <option value="onhold">On Hold</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>
              </div>
              <div className="row2">
                <div className="fg">
                  <label>Start Date</label>
                  <input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
                </div>
                <div className="fg">
                  <label>Duration (weeks)</label>
                  <input type="number" value={form.weeks} onChange={e => setForm(f => ({ ...f, weeks: Number(e.target.value) }))} min={1} />
                </div>
              </div>
              <div className="fg">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Site notes, access info, etc." />
              </div>
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editJob ? 'Update Job' : 'Add Job'}
              </button>
            </div>
            {!jobFormModal.isMaximized && <ModalResizeHandle onMouseDown={jobFormModal.onResizeMouseDown} />}
          </div>
        </div>
      )}

      {/* Job notes modal */}
      {notesJob && <JobNotesModal job={notesJob} onClose={() => setNotesJob(null)} />}

      {/* Variations modal */}
      {variationJob && (
        <VariationModal
          job={variationJob}
          onClose={() => setVariationJob(null)}
        />
      )}

      {/* Gantt modal */}
      {ganttJob && (
        <GanttModal
          job={ganttJob}
          phases={getLinkedQuotePhases(ganttJob)}
          linkedQuotes={quotes.filter(q => {
            if (q.id === ganttJob.quoteId) return true
            const qn = (q.customer.name || '').toLowerCase()
            const jn = (ganttJob.client || '').toLowerCase()
            return qn === jn || qn.includes(jn) || jn.includes(qn)
          })}
          onClose={() => setGanttJob(null)}
        />
      )}

      {/* Attachments modal */}
      {attachmentsJob && (
        <JobAttachmentsModal job={attachmentsJob} onClose={() => setAttachmentsJob(null)} />
      )}

      {/* Payment Requests modal */}
      {requestsJob && (
        <PaymentRequestsModal job={requestsJob} onClose={() => setRequestsJob(null)} />
      )}

      {/* View the linked, client-locked quote — read-only, same preview used on the Quotes page */}
      {viewQuote && <QuotePreviewModal quote={viewQuote} onClose={() => setViewQuote(null)} />}

      {/* This job's quote Q&A — its own modal, not tacked onto the quote preview */}
      {commentsQuote && <QuoteCommentsModal quote={commentsQuote} onClose={() => setCommentsQuote(null)} />}

      {contractJob && (
        <ContractBuilderModal
          job={contractJob}
          quote={findLinkedQuote(contractJob, quotes)}
          onClose={() => setContractJob(null)}
        />
      )}


      {/* Documents & Costs modal */}
      {docsJob && (() => {
        const phases = getLinkedQuotePhases(docsJob)
        const budget = phases.length ? quoteBudget(phases) : null
        const approved = variations
          .filter(v => v.jobId === docsJob.id && (v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid'))
          .reduce((s, v) => s + v.total, 0)
        const jobInvoices = invoices.filter(i => i.jobId === docsJob.id)
        const invoicedTotal = jobInvoices.reduce((s, i) => s + i.total, 0)
        const paidTotal     = jobInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
        const cashReceived  = jobPayments.filter(p => p.jobId === docsJob.id).reduce((s, p) => s + p.amount, 0)
        return (
          <JobDocumentsModal
            jobId={docsJob.id}
            jobLabel={`${jobDisplayTitle(docsJob)} — ${docsJob.client}`}
            budget={budget}
            revenue={docsJob.value + approved}
            contractValue={docsJob.value}
            variationsTotal={approved}
            invoicedTotal={invoicedTotal}
            paidTotal={paidTotal}
            cashReceived={cashReceived}
            clientName={docsJob.client}
            jobType={jobDisplayTitle(docsJob)}
            jobAddress={docsJob.address}
            onClose={() => setDocsJob(null)}
          />
        )
      })()}
    </>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>}>
      <JobsPageInner />
    </Suspense>
  )
}

