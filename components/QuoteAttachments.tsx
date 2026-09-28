'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadQuoteDocument, deleteQuoteDocument, fetchQuoteDocuments, signedQuoteDocumentUrl } from '@/lib/quote-documents'
import type { QuoteDocument, AttachmentCategory } from '@/lib/types'

type QuoteCategory = Exclude<AttachmentCategory, 'contract'>

const CATEGORY_LABEL: Record<QuoteCategory, string> = {
  document: '📄 Document', plan: '📐 Plan / Drawing', photo: '📷 Photo',
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  /** The quote's real id, or a per-session draft key the page generated for a quote that
   *  hasn't been saved yet — either way, always a concrete value the caller owns, never a
   *  shared literal like 'draft' (see lib/quote-documents.ts). Reassigned to the quote's
   *  real id the first time it's saved (see reassignQuoteDocuments in the page's own save
   *  handler). */
  quoteId: string
  attachments: QuoteDocument[]
  onAttachmentsChange: (docs: QuoteDocument[]) => void
}

export default function QuoteAttachments({ quoteId, attachments, onAttachmentsChange }: Props) {
  const sb = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [category, setCategory] = useState<QuoteCategory>('document')
  const [dragging, setDragging] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const loadedRef = useRef(false)

  // Load any files already attached (editing an existing saved quote, or files attached
  // earlier in this session before the quote had a real id yet — same 'draft' bucket).
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchQuoteDocuments(sb, quoteId).then(onAttachmentsChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadErr('')
    setUploading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setUploadErr('Not authenticated'); setUploading(false); return }

    let next = attachments
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { setUploadErr(`${file.name} exceeds 10 MB limit`); continue }
      const result = await uploadQuoteDocument(sb, user.id, quoteId, file, category, '')
      if ('document' in result) {
        next = [...next, result.document]
      } else {
        setUploadErr(`${file.name}: ${result.error}`)
      }
    }
    onAttachmentsChange(next)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(doc: QuoteDocument) {
    if (!confirm(`Remove ${doc.fileName}?`)) return
    await deleteQuoteDocument(sb, doc)
    onAttachmentsChange(attachments.filter(a => a.id !== doc.id))
  }

  async function openFile(doc: QuoteDocument) {
    let url = urls[doc.id]
    if (!url) {
      const signed = await signedQuoteDocumentUrl(sb, doc.storagePath)
      if (!signed) return
      url = signed
      setUrls(prev => ({ ...prev, [doc.id]: signed }))
    }
    window.open(url, '_blank')
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--moss)' : 'var(--border)'}`,
          borderRadius: 8, padding: '14px 16px', textAlign: 'center',
          background: dragging ? '#f0f7ee' : 'var(--warm)',
          cursor: uploading ? 'default' : 'pointer', marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          {uploading ? '⏳ Uploading…' : '⬆ Click or drag files here'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          Plans, drawings, photos, documents — max 10 MB each
        </div>
        <input
          ref={fileInputRef} type="file" multiple
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>New files are tagged as</label>
        <select value={category} onChange={e => setCategory(e.target.value as QuoteCategory)} style={{ padding: '4px 6px', fontSize: 12 }}>
          <option value="document">📄 Document</option>
          <option value="plan">📐 Plan / Drawing</option>
          <option value="photo">📷 Photo</option>
        </select>
      </div>

      {uploadErr && (
        <div style={{ fontSize: 12, color: '#c0392b', background: '#fdf0ef', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
          {uploadErr}
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {attachments.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: '#f8f9fa', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 15 }}>{doc.category === 'photo' ? '📷' : doc.category === 'plan' ? '📐' : '📄'}</span>
              <button type="button" onClick={() => openFile(doc)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fileName}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSize(doc.fileSize)}</div>
              </button>
              <button type="button" className="btn-sm btn-danger" onClick={() => handleDelete(doc)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
