'use client'

/**
 * QuickNotesModal — the sidebar's "📝 Notes" shortcut. Notes are scoped to a job, so this
 * is a two-step box: pick a job, then it hands off to the exact same JobNotesModal used from
 * the Jobs page (dictate/type, photos, AI tagging) — no separate notes UI to maintain.
 */

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job } from '@/lib/types'
import { STAGE_BADGE, STAGE_LABEL } from '@/lib/utils'
import JobNotesModal from './JobNotesModal'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props { onClose: () => void }

export default function QuickNotesModal({ onClose }: Props) {
  const { jobs } = useApp()
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [query, setQuery] = useState('')
  const pickerModal = useDraggableModal()

  if (selectedJob) {
    return <JobNotesModal job={selectedJob} onClose={onClose} />
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? jobs.filter(j => j.client.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) || j.address.toLowerCase().includes(q))
    : jobs

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
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search jobs by client, type, or address…"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                {jobs.length === 0 ? 'No jobs yet' : 'No jobs match your search'}
              </div>
            ) : filtered.map(j => (
              <button
                key={j.id}
                onClick={() => setSelectedJob(j)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
                  background: '#fff', cursor: 'pointer', textAlign: 'left', font: 'inherit',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.client}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.type}{j.address ? ` — ${j.address}` : ''}</div>
                </div>
                <span className={`badge ${STAGE_BADGE[j.stage] || 'b-planning'}`} style={{ flexShrink: 0 }}>
                  {STAGE_LABEL[j.stage] || j.stage}
                </span>
              </button>
            ))}
          </div>
        </div>
        {!pickerModal.isMaximized && <ModalResizeHandle onMouseDown={pickerModal.onResizeMouseDown} />}
      </div>
    </div>
  )
}
