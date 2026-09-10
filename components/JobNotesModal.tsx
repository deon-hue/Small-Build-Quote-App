'use client'

/**
 * JobNotesModal — the "Activity Log" for a job, now AI-assisted: dictate or type a note,
 * attach photos, and it gets tidied/tagged/scanned for action items automatically (fire-and-
 * forget — the note saves immediately with the raw text, the AI pass fills in tag/cleaned
 * text/action items moments later via updateJobNote, and if it fails the note just stays as
 * typed/raw rather than breaking anything).
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import type { Job, JobNote, JobNotePhoto, NoteTag } from '@/lib/types'
import { uploadNotePhoto, fetchNotePhotosForJob, deleteNotePhoto, signedNotePhotoUrl } from '@/lib/job-note-photos'
import { useSpeechToText } from './useSpeechToText'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props { job: Job; onClose: () => void }

const TAG_LABEL: Record<NoteTag, string> = {
  snag: '⚠ Snag', instruction: '📋 Instruction', material: '📦 Material', safety: '🦺 Safety', general: '📝 General',
}
const TAG_COLOR: Record<NoteTag, { text: string; bg: string }> = {
  snag:        { text: '#c0392b', bg: '#fef2f2' },
  instruction: { text: '#1d4ed8', bg: '#eff6ff' },
  material:    { text: '#92400e', bg: '#fffbeb' },
  safety:      { text: '#7c3aed', bg: '#faf5ff' },
  general:     { text: '#475569', bg: '#f8fafc' },
}

let _actionItemSeq = 0
const newActionItemId = () => `ai-${Date.now().toString(36)}-${++_actionItemSeq}`

export default function JobNotesModal({ job, onClose }: Props) {
  const sb = createClient()
  const { jobNotes, addJobNote, updateJobNote, deleteJobNote } = useApp()
  const notesModal = useDraggableModal()

  const [newNote, setNewNote] = useState('')
  const [noteSource, setNoteSource] = useState<'typed' | 'voice'>('typed')
  const [addingNote, setAddingNote] = useState(false)
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { listening, toggleMic } = useSpeechToText(text => { setNewNote(text); setNoteSource('voice') })

  const localNotes = jobNotes.filter(n => n.jobId === job.id)

  // Photos for every note on this job, fetched once on open — simpler than per-note lazy
  // fetches, and there's never going to be a huge number of notes on one job.
  const [photosByNote, setPhotosByNote] = useState<Record<string, JobNotePhoto[]>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({}) // photo.id -> signed url

  const loadPhotos = useCallback(async () => {
    const all = await fetchNotePhotosForJob(sb, job.id)
    const byNote: Record<string, JobNotePhoto[]> = {}
    for (const p of all) { (byNote[p.noteId] ??= []).push(p) }
    setPhotosByNote(byNote)
    const entries = await Promise.all(all.map(async p => [p.id, await signedNotePhotoUrl(sb, p.storagePath)] as const))
    setPhotoUrls(Object.fromEntries(entries.filter((e): e is [string, string] => !!e[1])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setStagedPhotos(prev => [...prev, ...files])
    e.target.value = ''
  }

  async function handleAddNote() {
    const text = newNote.trim()
    if (!text) return
    setAddingNote(true)
    try {
      const created = await addJobNote(job.id, text, noteSource)

      if (stagedPhotos.length > 0) {
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          for (const file of stagedPhotos) {
            const result = await uploadNotePhoto(sb, user.id, job.id, created.id, file)
            if ('error' in result) console.error('[JobNotesModal] photo upload failed:', result.error)
          }
          await loadPhotos()
        }
      }

      // Best-effort AI pass — never blocks the save, never breaks it if it fails.
      fetch('/api/process-note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
        .then(r => r.ok ? r.json() : null)
        .then((result: { cleanedText: string; tag: NoteTag; actionItems: string[] } | null) => {
          if (!result) return
          updateJobNote({
            ...created,
            note: result.cleanedText,
            tag: result.tag,
            actionItems: result.actionItems.map(t => ({ id: newActionItemId(), text: t, done: false })),
          })
        })
        .catch(() => {})

      setNewNote('')
      setNoteSource('typed')
      setStagedPhotos([])
    } finally {
      setAddingNote(false)
    }
  }

  function toggleActionItem(note: JobNote, itemId: string) {
    const items = (note.actionItems ?? []).map(a => a.id === itemId ? { ...a, done: !a.done } : a)
    updateJobNote({ ...note, actionItems: items })
  }

  async function handleDeleteNote(note: JobNote) {
    if (!confirm('Delete this note?')) return
    const photos = photosByNote[note.id] ?? []
    for (const p of photos) await deleteNotePhoto(sb, p)
    await deleteJobNote(note.id)
    setPhotosByNote(prev => {
      const next = { ...prev }
      delete next[note.id]
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={e => notesModal.onOverlayClick(e, onClose)}>
      <div ref={notesModal.boxRef} className="form-modal" style={{ width: 'min(560px, 96vw)', maxHeight: '85vh', overflowY: 'auto', ...notesModal.draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={notesModal.onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Activity Log</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{job.type} — {job.client}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={notesModal.isMaximized} onClick={notesModal.toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="form-modal-bd">
          {/* Add note */}
          <div className="fg">
            <label>Add Note</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                value={newNote}
                onChange={e => { setNewNote(e.target.value) }}
                rows={3}
                placeholder="Site update, issue, milestone reached… or tap 🎤 to dictate"
                style={{ flex: 1 }}
              />
              <button
                onClick={toggleMic}
                title={listening ? 'Stop recording' : 'Dictate this note'}
                type="button"
                style={{
                  border: 'none', borderRadius: 8, width: 40, height: 40, flexShrink: 0,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, background: listening ? '#e74c3c' : '#f0f2ee', color: listening ? '#fff' : 'var(--ink)',
                }}
              >
                🎤
              </button>
            </div>
          </div>

          {/* Staged photos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple
              onChange={handlePhotoPick} style={{ display: 'none' }} />
            <button className="btn-sm btn-outline" type="button" onClick={() => fileInputRef.current?.click()}>
              📷 Add Photo{stagedPhotos.length > 0 ? ` (${stagedPhotos.length})` : ''}
            </button>
            {stagedPhotos.map((f, i) => (
              <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: '#f0f2ee', display: 'flex', alignItems: 'center', gap: 4 }}>
                {f.name.length > 18 ? f.name.slice(0, 15) + '…' : f.name}
                <button type="button" onClick={() => setStagedPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 12, padding: 0 }}>×</button>
              </span>
            ))}
          </div>

          <button className="btn btn-primary" disabled={!newNote.trim() || addingNote} style={{ marginTop: 10 }}
            onClick={handleAddNote}>
            {addingNote ? 'Adding…' : '+ Add Note'}
          </button>

          {/* Notes list */}
          <div style={{ marginTop: 20 }}>
            {localNotes.length === 0
              ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No notes yet</div>
              : [...localNotes].reverse().map(n => {
                  const photos = photosByNote[n.id] ?? []
                  const tagStyle = n.tag ? TAG_COLOR[n.tag] : null
                  return (
                    <div key={n.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {n.tag && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: tagStyle!.bg, color: tagStyle!.text, marginBottom: 5, display: 'inline-block' }}>
                            {TAG_LABEL[n.tag]}
                          </span>
                        )}
                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{n.note}</div>

                        {n.actionItems && n.actionItems.length > 0 && (
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {n.actionItems.map(item => (
                              <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                <input type="checkbox" checked={item.done} onChange={() => toggleActionItem(n, item.id)} style={{ marginTop: 2 }} />
                                <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--muted)' : 'inherit' }}>{item.text}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {photos.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {photos.map(p => photoUrls[p.id] && (
                              <a key={p.id} href={photoUrls[p.id]} target="_blank" rel="noreferrer">
                                <img src={photoUrls[p.id]} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                              </a>
                            ))}
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                          {n.source === 'voice' ? '🎤 ' : ''}
                          {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button className="rm-btn" onClick={() => handleDeleteNote(n)}>×</button>
                    </div>
                  )
                })
            }
          </div>
        </div>
        {!notesModal.isMaximized && <ModalResizeHandle onMouseDown={notesModal.onResizeMouseDown} />}
      </div>
    </div>
  )
}
