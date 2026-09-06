'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  uploadAttachment, fetchAttachments, deleteAttachment, signedAttachmentUrl,
} from '@/lib/job-attachments'
import type { Job, JobAttachment, AttachmentCategory } from '@/lib/types'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'

const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  photo:    '📷 Photo',
  plan:     '📐 Plan',
  document: '📄 Document',
}
const CATEGORY_COLOR: Record<AttachmentCategory, string> = {
  photo:    '#4a90a4',
  plan:     '#7c3aed',
  document: '#e67e22',
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(mime: string) { return mime.startsWith('image/') }

interface Props { job: Job; onClose: () => void }

export default function JobAttachmentsModal({ job, onClose }: Props) {
  const sb = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef      = useRef<HTMLDivElement>(null)

  const [attachments, setAttachments] = useState<JobAttachment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [uploadErr,   setUploadErr]   = useState('')
  const [category,    setCategory]    = useState<AttachmentCategory>('document')
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown } = useDraggableModal()
  const [label,       setLabel]       = useState('')
  const [dragging,    setDragging]    = useState(false)
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null)
  const [previewMime, setPreviewMime] = useState('')

  useEffect(() => {
    fetchAttachments(sb, job.id).then(rows => { setAttachments(rows); setLoading(false) })
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadErr('')
    setUploading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setUploadErr('Not authenticated'); setUploading(false); return }

    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) { setUploadErr(`${file.name} exceeds 50 MB limit`); continue }
      const result = await uploadAttachment(sb, user.id, job.id, file, category, label)
      if ('attachment' in result) {
        setAttachments(prev => [...prev, result.attachment])
      } else {
        setUploadErr(`${file.name}: ${result.error}`)
      }
    }
    setLabel('')
    setUploading(false)
  }

  async function handleDelete(att: JobAttachment) {
    if (!confirm(`Delete "${att.label || att.fileName}"?`)) return
    await deleteAttachment(sb, att)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  async function handlePreview(att: JobAttachment) {
    const url = await signedAttachmentUrl(sb, att.storagePath)
    if (!url) return
    if (isImage(att.mimeType)) {
      setPreviewMime(att.mimeType)
      setPreviewUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function onDragLeave()                  { setDragging(false) }
  function onDrop(e: React.DragEvent)     { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }

  const grouped = {
    photo:    attachments.filter(a => a.category === 'photo'),
    plan:     attachments.filter(a => a.category === 'plan'),
    document: attachments.filter(a => a.category === 'document'),
  }

  return (
    <>
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div ref={boxRef} className="form-modal" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', ...draggableStyle }}>
          <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>📎 Job Attachments</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {job.type} — {job.client} · {job.address}
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1 }}>
            {/* Upload area */}
            <div
              ref={dropRef}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--moss)' : 'var(--border)'}`,
                borderRadius: 10, padding: '22px 20px', textAlign: 'center',
                background: dragging ? '#f0f7ee' : 'var(--warm)',
                cursor: uploading ? 'default' : 'pointer', marginBottom: 16,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>
                {uploading ? '⏳' : '⬆'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                {uploading ? 'Uploading…' : 'Click or drag files here'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Photos, plans (PDF), documents — max 50 MB each
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.dwg,.dxf"
                style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            {/* Category + label row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
              <div className="fg" style={{ margin: 0, flex: '0 0 auto' }}>
                <label style={{ fontSize: 11 }}>Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as AttachmentCategory)}
                  style={{ padding: '6px 8px', fontSize: 12 }}
                >
                  <option value="document">📄 Document</option>
                  <option value="plan">📐 Plan / Drawing</option>
                  <option value="photo">📷 Photo</option>
                </select>
              </div>
              <div className="fg" style={{ margin: 0, flex: 1 }}>
                <label style={{ fontSize: 11 }}>Label (optional)</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={category === 'photo' ? 'e.g. Foundation complete' : category === 'plan' ? 'e.g. Ground floor plan rev B' : 'e.g. Building regs approval'}
                  style={{ fontSize: 12, padding: '6px 10px' }}
                />
              </div>
            </div>

            {uploadErr && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                ⚠ {uploadErr}
              </div>
            )}

            {/* Attachment list */}
            {loading ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>Loading…</div>
            ) : attachments.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                No attachments yet. Upload files above.
              </div>
            ) : (
              (Object.entries(grouped) as [AttachmentCategory, JobAttachment[]][])
                .filter(([, list]) => list.length > 0)
                .map(([cat, list]) => (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px',
                      color: CATEGORY_COLOR[cat], marginBottom: 8,
                    }}>
                      {CATEGORY_LABEL[cat]} ({list.length})
                    </div>

                    {/* Photo grid */}
                    {cat === 'photo' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {list.map(att => (
                          <PhotoThumb key={att.id} att={att} sb={sb} onDelete={() => handleDelete(att)} onClick={() => handlePreview(att)} />
                        ))}
                      </div>
                    ) : (
                      /* Plan / Document rows */
                      list.map(att => (
                        <div key={att.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 6, marginBottom: 4,
                          background: '#f8f9fa', border: '1px solid var(--border)',
                        }}>
                          <span style={{ fontSize: 18 }}>{cat === 'plan' ? '📐' : '📄'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {att.label || att.fileName}
                            </div>
                            {att.label && (
                              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.fileName}</div>
                            )}
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSize(att.fileSize)}</div>
                          </div>
                          <button
                            className="btn-sm btn-outline"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => handlePreview(att)}
                          >
                            Open
                          </button>
                          <button
                            className="btn-sm btn-danger"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => handleDelete(att)}
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                ))
            )}
          </div>

          <div className="form-modal-ft">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {attachments.length} file{attachments.length !== 1 ? 's' : ''} · visible to client in their portal
            </div>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
          </div>
          <ModalResizeHandle onMouseDown={onResizeMouseDown} />
        </div>
      </div>

      {/* Image lightbox */}
      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="Preview" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 4 }} />
        </div>
      )}
    </>
  )
}

function PhotoThumb({ att, sb, onDelete, onClick }: {
  att: JobAttachment
  sb: ReturnType<typeof createClient>
  onDelete: () => void
  onClick: () => void
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    signedAttachmentUrl(sb, att.storagePath, 300).then(setThumbUrl)
  }, [att.storagePath]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', aspectRatio: '1', background: '#f0f2f4', cursor: 'pointer' }} onClick={onClick}>
      {thumbUrl
        ? <img src={thumbUrl} alt={att.label || att.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📷</div>
      }
      {att.label && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '3px 6px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {att.label}
        </div>
      )}
      <button
        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Delete"
      >
        ✕
      </button>
    </div>
  )
}
