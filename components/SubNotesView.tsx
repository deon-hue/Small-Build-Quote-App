'use client'

// The subcontractor portal's Notes: add a note and photos against a job, and see the ones they have sent. What they send goes straight into that
// job's Activity Log for the builder. A plain display component used by BOTH the real subcontractor portal and the builder's preview of it
// (the preview passes no onAdd, so the form is replaced by a note and only the list shows). Built for a phone: big fields, big buttons.

import { useEffect, useRef, useState } from 'react'

export interface SubNote { id: string; jobId: string; note: string; createdAt: string; photos: { id: string; url: string }[] }
export interface SubNoteJob { id: string; label: string }

const MAX_PHOTOS = 6

/** The outcome of sending: `saved` once the note itself is in. If some photos did not go, `failed` holds them (and `noteId` the note) so they can be tried again on the same note. */
export interface AddResult { saved: boolean; message?: string; noteId?: string; failed?: File[] }

export default function SubNotesView({ notes, jobs, onAdd, onRetry, preview }: {
  notes: SubNote[]
  jobs: SubNoteJob[]
  /** Saves the note and uploads the photos. `saved` is true once the note itself is in (even if a photo failed, then `message` says so); false means nothing was saved. */
  onAdd?: (jobId: string, text: string, files: File[]) => Promise<AddResult>
  /** Tries photos again on a note that is already saved */
  onRetry?: (noteId: string, files: File[]) => Promise<AddResult>
  preview?: boolean
}) {
  const [jobId, setJobId] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [warn, setWarn] = useState('')
  // photos that did not go on a note that IS saved: kept here so they can be tried again without sending the note twice
  const [retry, setRetry] = useState<{ noteId: string; files: File[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const jobLabel = (id: string) => jobs.find(j => j.id === id)?.label ?? 'Job'

  // one job: no need to choose it
  useEffect(() => { if (!jobId && jobs.length === 1) setJobId(jobs[0].id) }, [jobs, jobId])
  // thumbnails for the chosen photos (and tidy up their temporary links)
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    e.target.value = ''
    setFiles(prev => [...prev, ...chosen].slice(0, MAX_PHOTOS))
  }

  async function submit() {
    if (!onAdd) return
    if (!jobId) { setError('Please choose the job.'); return }
    if (!text.trim()) { setError('Please write a note (you can add photos too).'); return }
    setBusy(true); setError(''); setWarn(''); setRetry(null)
    const r = await onAdd(jobId, text.trim(), files)
    setBusy(false)
    if (!r.saved) { setError(r.message || 'Could not send the note — please try again.'); return }
    // the note is in: clear the form (so it can't be sent twice). If a photo didn't make it, it stays here with a Try again button.
    setText(''); setFiles([])
    if (r.failed && r.failed.length && r.noteId) { setRetry({ noteId: r.noteId, files: r.failed }); setWarn(r.message || ''); return }
    setDone(true); setWarn(r.message || '')
    setTimeout(() => { setDone(false); setWarn('') }, 3500)
  }

  async function retryPhotos() {
    if (!onRetry || !retry) return
    setBusy(true); setError('')
    const r = await onRetry(retry.noteId, retry.files)
    setBusy(false)
    if (r.failed && r.failed.length) { setRetry({ noteId: retry.noteId, files: r.failed }); setWarn(r.message || ''); return }
    setRetry(null); setWarn(''); setDone(true)
    setTimeout(() => setDone(false), 3500)
  }

  const field: React.CSSProperties = { width: '100%', padding: '10px', minHeight: 42, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Job notes</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Add a note or photos about a job. Your office sees them in that job’s notes straight away.</p>
      </div>

      {preview ? (
        <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
          👁 Preview mode — this is where they pick the job, write a note and add photos. Their notes appear below and in the job’s Activity Log.
        </div>
      ) : (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>📝 New note</div>

          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Job *</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={{ ...field, marginBottom: 10 }}>
            <option value="">— choose the job —</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>

          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note *</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={4000}
            placeholder="What do you want the office to know? e.g. boards delivered, a problem found, work finished…"
            style={{ ...field, resize: 'vertical', lineHeight: 1.45 }} />

          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pick} style={{ display: 'none' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_PHOTOS}
              style={{ padding: '11px 16px', border: '1px solid #c8d0d8', borderRadius: 10, background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              📷 Add photos{files.length ? ` (${files.length})` : ''}
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Up to {MAX_PHOTOS}</span>
          </div>
          {previews.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {previews.map((u, i) => (
                <div key={u} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <button type="button" aria-label="Remove photo" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -7, right: -7, width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#1e2022', color: '#fff', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: '#dc2626', marginTop: 10 }}>⚠ {error}</div>}
          {warn && (
            <div style={{ fontSize: 13.5, color: '#92400e', marginTop: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px' }}>
              {warn}
              {retry && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={retryPhotos} disabled={busy} style={{ flex: 1, padding: '11px', background: '#7ab533', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? 'Trying…' : 'Try the photo again'}</button>
                  <button type="button" onClick={() => { setRetry(null); setWarn('') }} style={{ padding: '11px 14px', background: '#fff', color: '#334155', border: '1px solid #d9dee3', borderRadius: 10, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Skip</button>
                </div>
              )}
            </div>
          )}
          {done && <div style={{ fontSize: 14, color: '#166534', fontWeight: 600, marginTop: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '9px 12px' }}>✓ Sent — it is now in the job notes.</div>}

          <button type="button" onClick={submit} disabled={busy}
            style={{ width: '100%', marginTop: 14, padding: '14px', background: '#7ab533', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Sending…' : 'Send note'}
          </button>
        </div>
      )}

      <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>{preview ? 'Notes they have sent' : 'Notes you have sent'}</h2>
      {notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8', fontSize: 13 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📝</div>No notes yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                <strong style={{ color: '#0f172a' }}>{jobLabel(n.jobId)}</strong>
                <span style={{ whiteSpace: 'nowrap' }}>{new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.5, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{n.note}</div>
              {n.photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {n.photos.map(p => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
