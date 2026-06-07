'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { uploadJobDocumentFile, insertJobDocument } from '@/lib/job-costs'
import type { Job } from '@/lib/types'
import type { JobCostCategory } from '@/lib/types'

const CATEGORIES: { value: JobCostCategory; label: string; emoji: string }[] = [
  { value: 'labour',         label: 'Labour',         emoji: '🔨' },
  { value: 'materials',      label: 'Materials',      emoji: '📦' },
  { value: 'plant',          label: 'Plant Hire',     emoji: '🚜' },
  { value: 'subcontractors', label: 'Subcontractors', emoji: '👷' },
  { value: 'other',          label: 'Other',          emoji: '📋' },
]

type Step = 'job' | 'capture' | 'preview' | 'uploading' | 'done'

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
  const { jobs, loading } = useApp()
  const sb = useMemo(() => createClient(), [])

  const [step, setStep]               = useState<Step>('job')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [jobSearch, setJobSearch]     = useState('')
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory]       = useState<JobCostCategory>('materials')
  const [error, setError]             = useState<string | null>(null)
  const [userId, setUserId]           = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [sb])

  const candidateJobs = jobs
    .filter(j => j.stage === 'active' || j.stage === 'planning' || j.stage === 'onhold')
    .filter(j => {
      if (!jobSearch.trim()) return true
      const q = jobSearch.toLowerCase()
      return j.client.toLowerCase().includes(q) ||
        j.address.toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q)
    })

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setStep('preview')
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  async function handleUpload() {
    if (!capturedFile || !selectedJob || !userId) return
    setStep('uploading')
    setError(null)
    try {
      const storagePath = await uploadJobDocumentFile(sb, userId, selectedJob.id, capturedFile, capturedFile.name)
      if (!storagePath) throw new Error('File upload failed — check your connection and try again.')
      await insertJobDocument(sb, userId, {
        jobId: selectedJob.id,
        fileName: description.trim() || capturedFile.name,
        storagePath,
        mimeType: capturedFile.type || 'image/jpeg',
        fileSize: capturedFile.size,
        status: 'uploaded',
      })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('preview')
    }
  }

  function scanAnother() {
    setCapturedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setDescription('')
    setCategory('materials')
    setError(null)
    setStep('capture')
  }

  function changeJob() {
    scanAnother()
    setStep('job')
  }

  if (loading) {
    return (
      <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        {step !== 'job' && (
          <button
            onClick={changeJob}
            style={{ background: 'none', border: 'none', color: '#a8c484', fontSize: 22, cursor: 'pointer', padding: '0 4px 0 0', lineHeight: 1 }}
          >‹</button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>📷 Scan to Job</div>
          {selectedJob && step !== 'job' && (
            <div style={{ fontSize: 12, color: '#a8c484', marginTop: 1 }}>
              {selectedJob.type} — {selectedJob.client}
            </div>
          )}
        </div>
        {step !== 'job' && selectedJob && (
          <button
            onClick={changeJob}
            style={{ fontSize: 11, color: '#a8c484', background: 'none', border: '1px solid #a8c484', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
          >Change job</button>
        )}
      </div>

      <div style={S.body}>

        {/* ── Step: Pick a job ── */}
        {step === 'job' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Which job?</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>Select the job this document belongs to.</div>

            <div style={{ marginBottom: 16 }}>
              <input
                style={S.input}
                placeholder="🔍  Search by client, address or type…"
                value={jobSearch}
                onChange={e => setJobSearch(e.target.value)}
                autoFocus
              />
            </div>

            {candidateJobs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: 32 }}>
                No jobs found — try a different search
              </div>
            ) : (
              <div style={S.card}>
                {candidateJobs.map((j, idx) => (
                  <button
                    key={j.id}
                    onClick={() => { setSelectedJob(j); setStep('capture') }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '14px 16px', background: 'none', border: 'none',
                      borderBottom: idx < candidateJobs.length - 1 ? '1px solid #f1f5f9' : 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>
                      {j.client}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{j.type} · {j.address}</div>
                    <div style={{
                      display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 8,
                      background: j.stage === 'active' ? '#dcfce7' : '#f1f5f9',
                      color: j.stage === 'active' ? '#166534' : '#64748b',
                    }}>
                      {j.stage === 'active' ? 'On site' : j.stage === 'planning' ? 'Planning' : 'On hold'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step: Capture ── */}
        {step === 'capture' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Take a photo</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Photograph a receipt, delivery note, or invoice.
            </div>

            {/* Hidden file inputs */}
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
            <input ref={galleryRef} type="file" accept="image/*,application/pdf"        onChange={handleFile} style={{ display: 'none' }} />

            <button
              style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff', fontSize: 18 }}
              onClick={() => cameraRef.current?.click()}
            >
              📷 Open Camera
            </button>

            <button
              style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', fontSize: 15 }}
              onClick={() => galleryRef.current?.click()}
            >
              🖼 Choose from Gallery / PDF
            </button>

            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
              Supported: JPEG, PNG, HEIC, PDF · Max 15 MB
            </div>
          </>
        )}

        {/* ── Step: Preview + label ── */}
        {step === 'preview' && capturedFile && previewUrl && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Looks good?</div>

            {/* Image preview */}
            {capturedFile.type !== 'application/pdf' ? (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <img
                  src={previewUrl}
                  alt="Document preview"
                  style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' }}
                />
              </div>
            ) : (
              <div style={{ ...S.card, padding: '20px 16px', textAlign: 'center', marginBottom: 20, color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600 }}>{capturedFile.name}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{(capturedFile.size / 1024).toFixed(0)} KB</div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Description (optional)</label>
              <input
                style={S.input}
                placeholder="e.g. Screwfix delivery note 12 June"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 24 }}>
              <label style={S.label}>Cost category</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    style={{
                      padding: '10px 6px', borderRadius: 8, border: '1.5px solid',
                      borderColor: category === c.value ? '#2b3a2b' : '#e2e8f0',
                      background: category === c.value ? '#f0f4ec' : '#fff',
                      fontFamily: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      color: category === c.value ? '#2b3a2b' : '#475569',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 3 }}>{c.emoji}</div>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                ⚠ {error}
              </div>
            )}

            <button style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff' }} onClick={handleUpload}>
              ✓ Upload to Job
            </button>
            <button
              style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', marginBottom: 0 }}
              onClick={() => { setStep('capture'); setCapturedFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
            >
              ↩ Retake
            </button>
          </>
        )}

        {/* ── Step: Uploading ── */}
        {step === 'uploading' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Uploading…</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Saving to {selectedJob?.client}&apos;s job</div>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Uploaded!</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32, lineHeight: 1.6 }}>
              Document saved to <strong>{selectedJob?.client}</strong>.
              <br />Review and extract costs in the office via Jobs → Enter Costs.
            </div>

            <button
              style={{ ...S.bigBtn, background: '#2b3a2b', color: '#fff', marginBottom: 12 }}
              onClick={scanAnother}
            >
              📷 Scan Another Document
            </button>
            <button
              style={{ ...S.bigBtn, background: '#f1f5f9', color: '#475569', marginBottom: 0 }}
              onClick={changeJob}
            >
              Switch Job
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
