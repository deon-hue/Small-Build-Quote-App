'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadInboxFile, createInboxDocument, compressImage, readAsBase64 } from '@/lib/job-costs'

type Step = 'capture' | 'preview' | 'uploading' | 'done'

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
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
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
    setCapturedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setStep('preview')
    e.target.value = ''
  }

  async function handleUpload() {
    if (!capturedFile || !userId) return
    setStep('uploading')
    setError(null)
    try {
      const path = await uploadInboxFile(sb, userId, capturedFile, capturedFile.name)
      if (!path) throw new Error('Upload failed — check your connection and try again.')

      // Run AI extraction in the background (best-effort)
      let extraction: unknown = null
      try {
        const isImage = capturedFile.type.startsWith('image/')
        const base64 = isImage ? await compressImage(capturedFile) : await readAsBase64(capturedFile)
        if (base64.length <= 9_000_000) {
          const res = await fetch('/api/extract-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64, mimeType: isImage ? 'image/jpeg' : 'application/pdf', fileName: capturedFile.name }),
          })
          const data = await res.json() as { extracted?: unknown }
          if (res.ok && data.extracted) extraction = data.extracted
        }
      } catch { /* non-fatal — user can fill in manually */ }

      await createInboxDocument(sb, userId, {
        fileName: description.trim() || capturedFile.name,
        storagePath: path,
        mimeType: capturedFile.type,
        fileSize: capturedFile.size,
        rawExtraction: extraction,
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('preview')
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setCapturedFile(null)
    setPreviewUrl(null)
    setDescription('')
    setError(null)
    setStep('capture')
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        {step === 'preview' && (
          <button onClick={reset} style={{ background: 'none', border: 'none', color: '#a8c484', fontSize: 22, cursor: 'pointer', padding: '0 4px 0 0', lineHeight: 1 }}>‹</button>
        )}
        <div style={{ fontSize: 17, fontWeight: 700 }}>📷 Scan Document</div>
      </div>

      <div style={S.body}>

        {/* ── Capture ── */}
        {step === 'capture' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Scan a document</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Photograph a receipt, delivery note, or invoice. It will go to your Document Inbox for review.
            </div>

            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
            <input ref={galleryRef} type="file" accept="image/*,application/pdf"        onChange={handleFile} style={{ display: 'none' }} />

            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff', fontSize: 18 }} onClick={() => cameraRef.current?.click()}>
              📷 Open Camera
            </button>
            <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', fontSize: 15 }} onClick={() => galleryRef.current?.click()}>
              🖼 Choose from Gallery / PDF
            </button>

            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
              Supported: JPEG, PNG, HEIC, PDF · Max 15 MB
            </div>
          </>
        )}

        {/* ── Preview ── */}
        {step === 'preview' && capturedFile && previewUrl && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Looks good?</div>

            {capturedFile.type !== 'application/pdf' ? (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <img src={previewUrl} alt="Document preview" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }} />
              </div>
            ) : (
              <div style={{ ...S.card, padding: '20px 16px', textAlign: 'center', marginBottom: 20, color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600 }}>{capturedFile.name}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{(capturedFile.size / 1024).toFixed(0)} KB</div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
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
              ✓ Save to Inbox
            </button>
            <button style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', marginBottom: 0 }} onClick={reset}>
              ↩ Retake
            </button>
          </>
        )}

        {/* ── Uploading ── */}
        {step === 'uploading' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Saving…</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Running AI extraction, this takes a few seconds</div>
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
