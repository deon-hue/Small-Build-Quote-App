'use client'

/**
 * QuickNotesModal — the sidebar's "📝 Notes" shortcut. Notes are scoped to a job, so this
 * is a two-step box: pick a job, then it hands off to the exact same JobNotesModal used from
 * the Jobs page (dictate/type, photos, AI tagging) — no separate notes UI to maintain.
 *
 * The picker itself: rows show just the customer and the job title (no address, no status
 * badge) with a coloured edge matching the Jobs page's own per-job colour. On-site jobs are
 * the ones most likely to get a note, so they're listed open; everything else (planning,
 * on hold, complete) collapses into one "Other jobs" row. Archived jobs are left out —
 * they're already put away on purpose, and their notes are reachable from Archived Jobs.
 */

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job } from '@/lib/types'
import { jobColor } from '@/lib/utils'
import JobNotesModal from './JobNotesModal'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props { onClose: () => void }

function JobRow({ job, onPick }: { job: Job; onPick: (j: Job) => void }) {
  return (
    <button
      className="qn-job"
      onClick={() => onPick(job)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 2px', border: 'none', borderTop: '1px solid var(--border)',
        background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit',
      }}
    >
      <span style={{ width: 6, height: 28, borderRadius: 3, background: jobColor(job.id), flexShrink: 0 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.client}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.type}</span>
      </span>
      <span style={{ color: 'var(--muted)', fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  )
}

export default function QuickNotesModal({ onClose }: Props) {
  const { jobs } = useApp()
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [query, setQuery] = useState('')
  const [otherOpen, setOtherOpen] = useState(false)
  const pickerModal = useDraggableModal()

  if (selectedJob) {
    return <JobNotesModal job={selectedJob} onClose={onClose} />
  }

  const q = query.trim().toLowerCase()
  const openJobs = jobs.filter(j => !j.archived)
  const filtered = q
    ? openJobs.filter(j => j.client.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) || j.address.toLowerCase().includes(q))
    : openJobs
  const activeJobs = filtered.filter(j => j.stage === 'active')
  const otherJobs = filtered.filter(j => j.stage !== 'active')

  return (
    <div className="modal-overlay" onClick={e => pickerModal.onOverlayClick(e, onClose)}>
      <div ref={pickerModal.boxRef} className="form-modal" style={{ width: 'min(440px, 96vw)', maxHeight: '80vh', overflowY: 'auto', ...pickerModal.draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={pickerModal.onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>📝 Notes</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Which job is this note for?</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={pickerModal.isMaximized} onClick={pickerModal.toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="form-modal-bd">
          <div className="fg">
            <input
              autoFocus
              className="qn-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search jobs…"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              {openJobs.length === 0 ? 'No jobs yet' : 'No jobs match your search'}
            </div>
          ) : q ? (
            // While searching, show every match in one flat list — grouping only matters
            // when browsing, not once you already know what you're looking for.
            <div style={{ marginTop: 4 }}>
              {filtered.map(j => <JobRow key={j.id} job={j} onPick={setSelectedJob} />)}
            </div>
          ) : (
            <>
              {activeJobs.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--moss)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '14px 0 2px' }}>
                    On site
                  </div>
                  {activeJobs.map(j => <JobRow key={j.id} job={j} onPick={setSelectedJob} />)}
                </>
              )}
              {otherJobs.length > 0 && (
                activeJobs.length === 0 ? (
                  // Nothing on site to separate these from — just list them.
                  <div style={{ marginTop: 4 }}>{otherJobs.map(j => <JobRow key={j.id} job={j} onPick={setSelectedJob} />)}</div>
                ) : (
                  <>
                    <button
                      onClick={() => setOtherOpen(o => !o)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                        background: 'none', border: 'none', borderTop: '1px solid var(--border)',
                        marginTop: 8, padding: '10px 2px 4px', font: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Other jobs ({otherJobs.length})</span>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{otherOpen ? '▾ Hide' : '▸ Show'}</span>
                    </button>
                    {otherOpen && otherJobs.map(j => <JobRow key={j.id} job={j} onPick={setSelectedJob} />)}
                  </>
                )
              )}
            </>
          )}
        </div>
        {!pickerModal.isMaximized && <ModalResizeHandle onMouseDown={pickerModal.onResizeMouseDown} />}
      </div>
    </div>
  )
}
