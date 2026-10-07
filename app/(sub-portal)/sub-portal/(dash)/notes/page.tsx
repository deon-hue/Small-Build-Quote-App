'use client'

// The subcontractor's Job notes: write a note and add photos against a job. The screen is components/SubNotesView.tsx (shared with the builder's
// preview). A note is saved by the database function add_sub_job_note (straight into the job's Activity Log for the builder); each photo is
// shrunk on the phone, then uploaded to /api/sub-portal/note-photo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSubPortal } from '@/contexts/SubPortalContext'
import SubNotesView, { type SubNote } from '@/components/SubNotesView'
import { shrinkImage } from '@/lib/image-resize'

export default function SubNotesPage() {
  const { jobs, loading, error } = useSubPortal()
  const [notes, setNotes] = useState<SubNote[]>([])
  const [problem, setProblem] = useState(false)

  const jobOptions = useMemo(() => jobs.map(j => ({
    id: j.id,
    label: [(j.address || '').split('\n')[0], j.type].filter(Boolean).join(' · ') || j.client || 'Job',
  })), [jobs])

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/sub-portal/job-notes', { cache: 'no-store' })
      const d = await res.json() as { rows?: SubNote[]; error?: string }
      if (!res.ok || !d.rows) { setProblem(true); return }
      setNotes(d.rows); setProblem(false)
    } catch { setProblem(true) }
  }, [])
  useEffect(() => { loadNotes() }, [loadNotes])

  async function addNote(jobId: string, text: string, files: File[]): Promise<{ saved: boolean; message?: string }> {
    const sb = createClient()
    const { data: noteId, error: err } = await sb.rpc('add_sub_job_note', { p_job_id: jobId, p_note: text })
    if (err || !noteId) {
      const m = err?.message || ''
      return { saved: false, message: /does not exist|schema cache/i.test(m) ? 'Notes are not switched on yet — please tell the office.' : (m || 'Could not send the note — please try again.') }
    }
    let failed = 0
    for (const f of files) {
      try {
        const small = await shrinkImage(f)
        const body = new FormData()
        body.append('noteId', String(noteId)); body.append('file', small)
        const res = await fetch('/api/sub-portal/note-photo', { method: 'POST', body })
        if (!res.ok) failed++
      } catch { failed++ }
    }
    await loadNotes()
    return failed ? { saved: true, message: `Your note was sent, but ${failed} photo${failed === 1 ? '' : 's'} could not be added. Try adding ${failed === 1 ? 'it' : 'them'} again in a new note.` } : { saved: true }
  }

  if (loading) return <div className="portal-loading"><div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Loading…</div>
  if (error) return <div className="portal-section"><p className="portal-empty">Unable to load your notes.</p></div>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      {problem && <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, marginBottom: 14 }}>Your earlier notes could not be loaded just now. You can still add a new one.</div>}
      <SubNotesView notes={notes} jobs={jobOptions} onAdd={addNote} />
    </div>
  )
}
