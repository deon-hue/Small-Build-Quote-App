'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadInboxFile, createInboxDocument, compressImage, readAsBase64 } from '@/lib/job-costs'

type Step = 'capture' | 'preview' | 'pages' | 'uploading' | 'done'

interface CapturedPage {
  file: File
  previewUrl: string
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#f5f4f1',
    display: 'flex',
    flexDirection: 'column' as const,
    maxWidth: 560,
    margin: '0 auto',
  },
  header: {
    background: '#2b3a2b',
    color: '#fff',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  body: { flex: 1, padding: '20px 16px' },
  card: {
    background: '#fff',
    borderRadius: 12,
    border: '1.5px solid #e2e8f0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  bigBtn: {
    width: '100%',
    padding: '18px',
    fontSize: 16,
    fontWeight: 700,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#64748b',
    display: 'block',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    background: '#fff',
    color: '#1e293b',
  },
}

export default function ScanPage() {
  const sb = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('capture')

  // Multi-page state
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [sb])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setPendingUrl(URL.createObjectURL(file))
    setStep('preview')
    e.target.value = ''
  }

  function confirmPage() {
    if (!pendingFile || !pendingUrl) return
    setPages(prev => [...prev, { file: pendingFile, previewUrl: pendingUrl }])
    setPendingFile(null)
    setPendingUrl(null)
    setStep('pages')
  }

  function retakePage() {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
    setPendingFile(null)
    setPendingUrl(null)
    setStep(pages.length > 0 ? 'pages' : 'capture')
  }

  function removePage(i: number) {
    setPages(prev => {
      URL.revokeObjectURL(prev[i].previewUrl)
      const next = prev.filter((_, idx) => idx !== i)
      if (next.length === 0) setStep('capture')
      return next
    })
  }

  async function handleUpload() {
    if (!userId || pages.length === 0) return
    setStep('uploading')
    setError(null)
    try {
      // Upload all pages to storage; primary path = first page
      const primaryFile = pages[0].file
      const primaryPath = await uploadInboxFile(sb, userId, primaryFile, primaryFile.name)
      if (!primaryPath) throw new Error('Upload failed — check your connection and try again.')

      // Upload additional pages (best-effort, non-blocking)
      for (let i = 1; i < pages.length; i++) {
        const f = pages[i].file
        await uploadInboxFile(sb, userId, f, f.name).catch(() => {})
      }

      // AI extraction — send all pages together
      let extraction: unknown = null
      try {
        const pagePayloads: Array<{ base64: string; mimeType: string }> = []
        for (const pg of pages) {
          const isImage = pg.file.type.startsWith('image/')
          const b64 = isImage ? await compressImage(pg.file) : await readAsBase64(pg.file)
          if (b64.length <= 9_000_000) {
            pagePayloads.push({ base64: b64, mimeType: isImage ? 'image/jpeg' : pg.file.type })
          }
        }
        if (pagePayloads.length > 0) {
          const res = await fetch('/api/extract-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              pagePayloads.length === 1
                ? { base64: pagePayloads[0].base64, mimeType: pagePayloads[0].mimeType, fileName: primaryFile.name }
                : { pages: pagePayloads }
            ),
          })
          const data = await res.json() as { extracted?: unknown }
          if (res.ok && data.extracted) extraction = data.extracted
        }
      } catch { /* non-fatal */ }

      await createInboxDocument(sb, userId, {
        fileName: description.trim() || primaryFile.name,
        storagePath: primaryPath,
        mimeType: primaryFile.type,
        fileSize: primaryFile.size,
        rawExtraction: extraction,
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('pages')
    }
  }

  function reset() {
    pages.forEach(p => URL.revokeObjectURL(p.previewUrl))
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
    setPages([])
    setPendingFile(null)
    setPendingUrl(null)
    setDescription('')
    setError(null)
    setStep('capture')
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        {(step === 'preview' || step === 'pages') && (
          <button onClick={step === 'preview' ? retakePage : reset} style={{ background: 'none', border: 'none', color: '#a8c484', fontSize: 22, cursor: 'pointer', padding: '0 4px 0 0', lineHeight: 1 }}>‹</button>
        )}
        <div style={{ fontSize: 17, fontWeight: 700 }}>📷 Scan Document</div>
        {step === 'pages' && pages.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#a8c484', fontWeight: 600 }}>
            {pages.length} page{pages.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={S.body}>

        {/* ── Capture ── */}
        {step === 'capture' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              {pages.length > 0 ? `Scan page ${pages.length + 1}` : 'Scan a document'}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              {pages.length > 0
                ? 'Photograph the next page of the document.'
                : 'Photograph a receipt, delivery note, or invoice. It will go to your Document Inbox for review.'}
            </div>

            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
            <input ref={galleryRef} type="file" accept="image/*,application/pdf"        onChange={handleFile} style={{ display: 'none' }} />

            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff', fontSize: 18 }} onClick={() => cameraRef.current?.click()}>
              📷 Open Camera
            </button>
            <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', fontSize: 15 }} onClick={() => galleryRef.current?.click()}>
              🖼 Choose from Gallery / PDF
            </button>

            {pages.length > 0 && (
              <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', fontSize: 15, marginTop: 4 }} onClick={() => setStep('pages')}>
                ← Back to pages
              </button>
            )}

            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
              Supported: JPEG, PNG, HEIC, PDF · Max 15 MB
            </div>
          </>
        )}

        {/* ── Preview single page ── */}
        {step === 'preview' && pendingFile && pendingUrl && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              {pages.length > 0 ? `Page ${pages.length + 1} — looks good?` : 'Looks good?'}
            </div>

            {pendingFile.type !== 'application/pdf' ? (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <img src={pendingUrl} alt="Document preview" style={{ width: '100%', maxHeight: 380, objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <div style={{ ...S.card, padding: '20px 16px', textAlign: 'center', marginBottom: 20, color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600 }}>{pendingFile.name}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{(pendingFile.size / 1024).toFixed(0)} KB</div>
              </div>
            )}

            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff' }} onClick={confirmPage}>
              ✓ Add page
            </button>
            <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', marginBottom: 0 }} onClick={retakePage}>
              ↩ Retake
            </button>
          </>
        )}

        {/* ── Pages list ── */}
        {step === 'pages' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {pages.length === 1 ? '1 page scanned' : `${pages.length} pages scanned`}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
              {pages.length === 1 ? 'Add more pages if the invoice continues, or upload now.' : 'Upload when you have all pages.'}
            </div>

            {/* Thumbnails */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              {pages.map((pg, i) => (
                <div key={i} style={{ position: 'relative', width: 90, borderRadius: 8, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  {pg.file.type !== 'application/pdf'
                    ? <img src={pg.previewUrl} alt={`Page ${i + 1}`} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ height: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#64748b' }}>📄</div>
                  }
                  <div style={{ padding: '4px 6px', fontSize: 11, fontWeight: 600, color: '#475569', background: '#f1f5f9', textAlign: 'center' }}>
                    Page {i + 1}
                  </div>
                  <button
                    onClick={() => removePage(i)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Note (optional)</label>
              <input
                style={S.input}
                placeholder="e.g. Screwfix delivery note 12 June"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                ⚠ {error}
              </div>
            )}

            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff' }} onClick={handleUpload}>
              ✓ Upload & process {pages.length > 1 ? `(${pages.length} pages)` : ''}
            </button>
            <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569' }} onClick={() => setStep('capture')}>
              📷 Scan next page
            </button>
          </>
        )}

        {/* ── Uploading ── */}
        {step === 'uploading' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Saving…</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>
              {pages.length > 1
                ? `Reading ${pages.length} pages with AI, this takes a few seconds`
                : 'Running AI extraction, this takes a few seconds'}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Saved!</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
              Document saved to your inbox.<br />
              Open it in the app to review and allocate it to a job.
            </div>
            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff', marginBottom: 12 }} onClick={reset}>
              📷 Scan Another
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
