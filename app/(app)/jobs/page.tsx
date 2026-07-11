'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, jobColor, STAGE_BADGE, STAGE_LABEL, JOB_TYPES } from '@/lib/utils'
import type { Job } from '@/lib/types'
import { quoteBudget } from '@/lib/job-costs'
import GanttModal from '@/components/GanttModal'
import { ContactPicker } from '@/components/ContactPicker'
import VariationModal from '@/components/VariationModal'
import JobDocumentsModal from '@/components/JobDocumentsModal'
import JobAttachmentsModal from '@/components/JobAttachmentsModal'
import PaymentRequestsModal from '@/components/PaymentRequestsModal'

const BLANK_JOB: Omit<Job, 'id'> = {
  client: '', type: 'Rear Extension', address: '', value: 0,
  stage: 'planning', start: '', weeks: 8, done: 0, notes: '',
}

export default function JobsPage() {
  const { jobs, quotes, clients, jobNotes, jobPayments, variations, invoices, addJob, updateJob, deleteJob, updateQuote, addJobNote, deleteJobNote, loading } = useApp()
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
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.stage === filter)

  function openNew() {
    setEditJob(null)
    setForm(BLANK_JOB)
    setPrefillQuoteId('')
    setShowModal(true)
  }

  function openEdit(job: Job) {
    setEditJob(job)
    setForm({ client: job.client, type: job.type, address: job.address, value: job.value,
      stage: job.stage, start: job.start, weeks: job.weeks, done: job.done, notes: job.notes })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.client && !confirm('No client name — save anyway?')) return
    setSaving(true)
    try {
      if (editJob) {
        await updateJob({ ...editJob, ...form })
      } else {
        const newJob = await addJob({ ...form, quoteId: prefillQuoteId || undefined })
        // Mark quote as converted if we have a quoteId
        if (prefillQuoteId) {
          const q = quotes.find(q => q.id === prefillQuoteId)
          if (q) await updateQuote({ ...q, convertedToJob: true })
        }
      }
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(job: Job) {
    const linkedQuote = job.quoteId ? quotes.find(q => q.id === job.quoteId) : null
    let msg = `Delete job: ${job.type} — ${job.client}?`
    if (linkedQuote) msg += `\n\nThis will also unlink quote ${linkedQuote.ref}.`
    msg += '\n\nThis cannot be undone.'
    if (!confirm(msg)) return
    await deleteJob(job.id)
  }

  function getLinkedQuotePhases(job: Job) {
    const linked = job.quoteId
      ? quotes.filter(q => q.id === job.quoteId)
      : quotes.filter(q => {
          const qn = (q.customer.name || '').toLowerCase()
          const jn = (job.client || '').toLowerCase()
          return qn === jn || qn.includes(jn) || jn.includes(qn)
        })
    const best = linked.find(q => q.status === 'accepted') || linked.find(q => q.status === 'sent') || linked[0]
    return best ? best.phases : []
  }

  return (
    <>
      {/* Filter + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        {['all','planning','active','onhold','complete'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={filter === f ? 'btn-sm btn-primary' : 'btn-sm btn-outline'}
            style={{ textTransform: 'capitalize' }}>
            {f === 'all' ? 'All' : STAGE_LABEL[f] || f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}>+ Add Job</button>
      </div>

      {/* Jobs list */}
      {!filtered.length
        ? <div className="empty-dashed"><div style={{ fontSize: 14, marginBottom: 6 }}>No jobs yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Add your first job above.</div>
          </div>
        : filtered.map(j => {
            const jobNum = (() => { const idx = jobs.findIndex(x => x.id === j.id); return idx >= 0 ? `JOB-${String(idx + 1).padStart(3, '0')}` : '' })()
            const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
            const col = jobColor(j.id)
            const jobVars = variations.filter(v => v.jobId === j.id)
            const approvedVarTotal = jobVars
              .filter(v => v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid')
              .reduce((s, v) => s + v.total, 0)
            const sentVarCount = jobVars.filter(v => v.status === 'sent').length
            const effectiveValue = j.value + approvedVarTotal
            return (
              <div key={j.id} className="card" style={{ marginBottom: 12 }}>
                <div className="job-card-inner">
                  <div className="job-card-main">
                    <div className="job-dot" style={{ background: col }} />
                    <div className="job-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'white', background: col, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.5px' }}>{jobNum}</span>
                        <div className="job-name">{j.type} — {j.client}</div>
                      </div>
                      <div className="job-meta">{j.address}{j.start ? ' · Started ' + new Date(j.start).toLocaleDateString('en-GB') : ''}</div>
                      <div className="progress" style={{ maxWidth: 240, marginTop: 6 }}>
                        <div className="progress-bar" style={{ width: pct + '%', background: col }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                        Week {j.done} of {j.weeks} · {pct}% complete
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
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
                    <button className="btn-sm btn-gold" onClick={() => setGanttJob(j)}>📋 Gantt</button>
                    <button className="btn-sm btn-sky" onClick={() => { setNotesJob(j); setNewNote('') }}>
                      📝 Notes {jobNotes.filter(n => n.jobId === j.id).length > 0 ? `(${jobNotes.filter(n => n.jobId === j.id).length})` : ''}
                    </button>
                    <button
                      className={sentVarCount > 0 ? 'btn-sm btn-primary' : 'btn-sm btn-outline'}
                      onClick={() => setVariationJob(j)}
                      title="Variations / change orders for this job"
                    >
                      ±&nbsp;Variations{jobVars.length > 0 ? ` (${jobVars.length})` : ''}
                      {sentVarCount > 0 ? ` · ${sentVarCount} pending` : ''}
                    </button>
                    <button className="btn-sm btn-outline" onClick={() => setAttachmentsJob(j)} title="Plans, photos and documents shared with the client">📎 Files</button>
                    <button className="btn-sm btn-outline" onClick={() => setDocsJob(j)} title="Scan/upload supplier docs and track costs">💷 Costs</button>
                    <button className="btn-sm btn-outline" onClick={() => setRequestsJob(j)} title="Payment requests and received payments">
                      💳 Payments{jobPayments.filter(p => p.jobId === j.id).length > 0 ? ` (${jobPayments.filter(p => p.jobId === j.id).length})` : ''}
                    </button>
                    <button className="btn-sm btn-outline" onClick={() => openEdit(j)}>Edit</button>
                    <button className="btn-sm btn-danger" onClick={() => handleDelete(j)}>✕</button>
                  </div>
                </div>
                {j.notes && (
                  <div style={{ padding: '8px 20px 14px', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
                    {j.notes}
                  </div>
                )}
              </div>
            )
          })
      }

      {/* Job add/edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="form-modal">
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editJob ? 'Edit Job' : 'New Job'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
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
                <label>Weeks Done</label>
                <input type="number" value={form.done} onChange={e => setForm(f => ({ ...f, done: Number(e.target.value) }))} min={0} max={form.weeks} />
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
          </div>
        </div>
      )}

      {/* Job notes modal */}
      {notesJob && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNotesJob(null) }}>
          <div className="form-modal" style={{ width: 'min(520px, 96vw)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Activity Log</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{notesJob.type} — {notesJob.client}</div>
              </div>
              <button className="modal-close" onClick={() => setNotesJob(null)}>×</button>
            </div>
            <div className="form-modal-bd">
              {/* Add note */}
              <div className="fg">
                <label>Add Note</label>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3} placeholder="Site update, issue, milestone reached…" />
              </div>
              <button className="btn btn-primary" disabled={!newNote.trim() || addingNote}
                onClick={async () => {
                  if (!newNote.trim()) return
                  setAddingNote(true)
                  await addJobNote(notesJob.id, newNote.trim())
                  setNewNote('')
                  setAddingNote(false)
                }}>
                {addingNote ? 'Adding…' : '+ Add Note'}
              </button>

              {/* Notes list */}
              <div style={{ marginTop: 20 }}>
                {jobNotes.filter(n => n.jobId === notesJob.id).length === 0
                  ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No notes yet</div>
                  : [...jobNotes.filter(n => n.jobId === notesJob.id)].reverse().map(n => (
                      <div key={n.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{n.note}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                            {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <button className="rm-btn" onClick={() => deleteJobNote(n.id)}>×</button>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        </div>
      )}

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
            jobLabel={`${docsJob.type} — ${docsJob.client}`}
            budget={budget}
            revenue={docsJob.value + approved}
            invoicedTotal={invoicedTotal}
            paidTotal={paidTotal}
            cashReceived={cashReceived}
            onClose={() => setDocsJob(null)}
          />
        )
      })()}
    </>
  )
}

