'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchDocuments, uploadInboxFile, createInboxDocument, deleteDocument,
  readAsBase64, compressImage,
} from '@/lib/job-costs'
import DocumentReviewModal from './DocumentReviewModal'
import type { InboxDocument, Job } from '@/lib/types'
import { useApp } from '@/contexts/AppContext'

interface Props { jobs: Job[] }

const fmt = (n: number) => `£${(n || 0).toFixed(2)}`

function summary(doc: InboxDocument) {
  const ex = (doc.extraction ?? {}) as Record<string, unknown>
  const lines = Array.isArray(ex.lines) ? ex.lines as Record<string, unknown>[] : []
  const gross = Number(ex.grossAmount) || lines.reduce((s, l) => s + (Number(l.grossAmount) || 0), 0)
  return {
    supplier: String(ex.supplier || '') || doc.fileName,
    date: String(ex.docDate || ''),
    gross,
  }
}

export default function DocumentInbox({ jobs }: Props) {
  const sb = createClient()
  const { bills } = useApp()
  const billedDocIds = new Set(bills.filter(b => b.documentId).map(b => b.documentId!))
  const [userId, setUserId] = useState<string | null>(null)
  const [docs, setDocs] = useState<InboxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(0)
  const [filter, setFilter] = useState<'all' | 'unallocated' | 'allocated' | 'archived'>('all')
  const [search, setSearch] = useState('')
  const [openDoc, setOpenDoc] = useState<InboxDocument | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const jobOptions = jobs.map(j => ({ id: j.id, label: `${j.type} — ${j.client}` }))
  const jobLabel = (id?: string) => id ? (jobOptions.find(j => j.id === id)?.label ?? 'job') : ''

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (user) { setUserId(user.id); setDocs(await fetchDocuments(sb, user.id)) }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleFiles(files: File[]) {
    setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('Not signed in — please refresh and try again.'); return }
    for (const file of files) {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isPdf) { setError(`${file.name}: unsupported type (image or PDF only).`); continue }
      if (file.size > 15 * 1024 * 1024) { setError(`${file.name}: too large (max 15 MB).`); continue }

      setUploading(n => n + 1)
      try {
        const path = await uploadInboxFile(sb, user.id, file, file.name)
        if (!path) { setError(`${file.name}: upload failed — check the "job-documents" storage bucket exists (run supabase/phase17.sql).`); continue }

        let extraction: unknown = null
        try {
          const base64 = isImage ? await compressImage(file) : await readAsBase64(file)
          if (base64.length <= 9_000_000) {
            const res = await fetch('/api/extract-document', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64, mimeType: isImage ? 'image/jpeg' : 'application/pdf', fileName: file.name }),
            })
            const data = await res.json() as { extracted?: unknown; error?: string }
            if (res.ok && data.extracted) {
              extraction = data.extracted
            } else {
              const reason = data.error || `HTTP ${res.status}`
              setError(`${file.name}: AI extraction failed (${reason}). File saved — open it to fill in details manually.`)
            }
          }
        } catch (extractErr) {
          setError(`${file.name}: AI extraction failed (${extractErr instanceof Error ? extractErr.message : 'network error'}). File saved — open it to fill in details manually.`)
        }

        const doc = await createInboxDocument(sb, user.id, {
          fileName: file.name, storagePath: path, mimeType: file.type, fileSize: file.size, rawExtraction: extraction,
        })
        if (doc) setDocs(prev => [doc, ...prev])
        else setError(`${file.name}: file uploaded but couldn't be saved to the inbox — has supabase/phase17.sql been run?`)
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  async function remove(doc: InboxDocument) {
    if (!confirm('Delete this document? Any costs created from it stay on the job.')) return
    await deleteDocument(sb, doc)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  const shown = docs.filter(d => {
    if (filter === 'all' ? d.status === 'archived' : d.status !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const s = summary(d)
      const job = jobLabel(d.jobId ?? undefined)
      if (!s.supplier.toLowerCase().includes(q) && !s.date.includes(q) && !job.toLowerCase().includes(q) && !d.fileName.toLowerCase().includes(q)) return false
    }
    return true
  })
  const unallocatedCount = docs.filter(d => d.status === 'unallocated').length

  return (
    <div className="card">
      <div className="card-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>📥 Document Inbox{unallocatedCount > 0 ? ` · ${unallocatedCount} to allocate` : ''}</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
          Scan or upload supplier invoices, receipts and delivery notes here. Open each one to check the details and allocate it to a job.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
            onChange={e => { const fs = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (fs.length) handleFiles(fs) }} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
            {uploading > 0 ? `Uploading ${uploading}…` : '📷 Scan / Upload'}
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier, date, job…"
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
          />
          {(['all', 'unallocated', 'allocated', 'archived'] as const).map(fk => (
            <button key={fk} onClick={() => setFilter(fk)} className={filter === fk ? 'btn-sm btn-primary' : 'btn-sm btn-outline'} style={{ textTransform: 'capitalize' }}>{fk}</button>
          ))}
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '2px dashed var(--border)', borderRadius: 8, padding: 28 }}>
            No documents{filter !== 'all' ? ` (${filter})` : ''} yet. Scan or upload one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map(doc => {
              const s = summary(doc)
              const isPdf = doc.mimeType === 'application/pdf'
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}>
                  <span style={{ fontSize: 20 }}>{isPdf ? '📄' : '🧾'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.supplier}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.date || '—'}{s.gross ? ` · ${fmt(s.gross)}` : ''}</div>
                  </div>
                  {doc.status === 'allocated'
                    ? doc.jobId
                      ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>✓ {jobLabel(doc.jobId)}</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>✓ Xero</span>
                    : doc.status === 'archived'
                    ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#f1f5f9', color: '#64748b' }}>🗄 Archived</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>Unallocated</span>}
                  {billedDocIds.has(doc.id) && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f3e8ff', color: '#6b21a8' }}>📋 Bill created</span>}
                  {doc.jobId && doc.xeroBillId && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#ede9fe', color: '#5b21b6' }}>✓ Xero</span>}
                  <button className="btn-sm btn-outline" onClick={() => setOpenDoc(doc)}>Open</button>
                  <button className="btn-sm btn-danger" onClick={() => remove(doc)}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {openDoc && userId && (
        <DocumentReviewModal
          doc={openDoc}
          jobs={jobOptions}
          userId={userId}
          onClose={() => setOpenDoc(null)}
          onSaved={() => { setOpenDoc(null); load() }}
        />
      )}
    </div>
  )
}
