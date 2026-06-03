'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchJobCosts, insertJobCost, deleteJobCost,
  insertJobDocument, uploadJobDocumentFile, readAsBase64, compressImage,
} from '@/lib/job-costs'
import type { JobCost, JobCostCategory, PaymentStatus } from '@/lib/types'
import type { ExtractedDoc, ExtractedCostLine } from '@/lib/doc-extract/types'

interface Props { jobId: string; jobLabel: string; onClose: () => void }

const CATS: { value: JobCostCategory; label: string; emoji: string; color: string; bg: string }[] = [
  { value: 'labour',         label: 'Labour',         emoji: '🔨', color: '#1d4ed8', bg: '#eff6ff' },
  { value: 'materials',      label: 'Materials',      emoji: '📦', color: '#92400e', bg: '#fffbeb' },
  { value: 'plant',          label: 'Plant',          emoji: '🚜', color: '#15803d', bg: '#f0fdf4' },
  { value: 'subcontractors', label: 'Subcontractors', emoji: '👷', color: '#7c3aed', bg: '#faf5ff' },
  { value: 'other',          label: 'Other',          emoji: '📋', color: '#475569', bg: '#f8fafc' },
]
const catMeta = (c: JobCostCategory) => CATS.find(x => x.value === c) ?? CATS[1]
const PAYMENTS: PaymentStatus[] = ['unknown', 'unpaid', 'partial', 'paid']
const fmt = (n: number) => `£${(n || 0).toFixed(2)}`

interface ReviewState {
  file: File | null
  fileName: string
  supplier: string
  docDate: string
  docNumber: string
  paymentStatus: PaymentStatus
  confidence?: number
  lines: ExtractedCostLine[]
  raw: ExtractedDoc | null
}

export default function JobDocumentsModal({ jobId, jobLabel, onClose }: Props) {
  const sb = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [costs, setCosts] = useState<JobCost[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'extracting' | 'saving' | null>(null)
  const [error, setError] = useState('')
  const [review, setReview] = useState<ReviewState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (user) { setUserId(user.id); setCosts(await fetchJobCosts(sb, user.id, jobId)) }
    setLoading(false)
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleFile(file: File) {
    setError('')
    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    if (!isImage && !isPdf) { setError('Please upload an image or PDF.'); return }
    if (file.size > 15 * 1024 * 1024) { setError('File too large (max 15 MB).'); return }

    setBusy('extracting')
    let extracted: ExtractedDoc | null = null
    try {
      const base64 = isImage ? await compressImage(file) : await readAsBase64(file)
      const mimeType = isImage ? 'image/jpeg' : 'application/pdf'
      if (base64.length > 9_000_000) {
        setError('That file is too large to read automatically — you can still enter the details manually.')
      } else {
        const res = await fetch('/api/extract-document', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType, fileName: file.name }),
        })
        const data = await res.json()
        if (res.ok && data.extracted) extracted = data.extracted
        else setError(data.error || 'Could not read the document — please check the details below.')
      }
    } catch {
      setError('Could not read the document — please enter the details manually.')
    } finally {
      setBusy(null)
    }
    openReview(file, extracted)
  }

  function openReview(file: File | null, extracted: ExtractedDoc | null) {
    const lines: ExtractedCostLine[] = extracted?.lines?.length
      ? extracted.lines
      : [{
          description: extracted?.description ?? '',
          costCategory: extracted?.costCategory ?? 'materials',
          netAmount: extracted?.netAmount ?? 0,
          vatAmount: extracted?.vatAmount ?? 0,
          grossAmount: extracted?.grossAmount ?? 0,
        }]
    setReview({
      file,
      fileName: file?.name ?? '',
      supplier: extracted?.supplier ?? '',
      docDate: extracted?.docDate ?? '',
      docNumber: extracted?.docNumber ?? '',
      paymentStatus: extracted?.paymentStatus ?? 'unknown',
      confidence: extracted?.confidence,
      lines,
      raw: extracted,
    })
  }

  function updateLine(i: number, patch: Partial<ExtractedCostLine>) {
    setReview(r => {
      if (!r) return r
      const lines = r.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l)
      // auto-derive gross/net/vat sensibly when one changes
      const ln = lines[i]
      if (patch.netAmount !== undefined || patch.vatAmount !== undefined) ln.grossAmount = +(ln.netAmount + ln.vatAmount).toFixed(2)
      else if (patch.grossAmount !== undefined && ln.vatAmount === 0 && ln.netAmount === 0) {
        ln.vatAmount = +(ln.grossAmount - ln.grossAmount / 1.2).toFixed(2)
        ln.netAmount = +(ln.grossAmount - ln.vatAmount).toFixed(2)
      }
      return { ...r, lines }
    })
  }
  function addLine() { setReview(r => r ? { ...r, lines: [...r.lines, { description: '', costCategory: 'materials', netAmount: 0, vatAmount: 0, grossAmount: 0 }] } : r) }
  function removeLine(i: number) { setReview(r => r ? { ...r, lines: r.lines.filter((_, idx) => idx !== i) } : r) }

  async function saveReview() {
    if (!review || !userId) return
    setBusy('saving')
    try {
      let documentId: string | undefined
      if (review.file) {
        const path = await uploadJobDocumentFile(sb, userId, jobId, review.file, review.fileName)
        if (path) {
          documentId = (await insertJobDocument(sb, userId, {
            jobId, fileName: review.fileName, storagePath: path, mimeType: review.file.type,
            fileSize: review.file.size, status: 'reviewed', rawExtraction: review.raw,
          })) ?? undefined
        }
      }
      const created: JobCost[] = []
      for (const ln of review.lines) {
        const c = await insertJobCost(sb, userId, {
          jobId, documentId, supplier: review.supplier, docDate: review.docDate, docNumber: review.docNumber,
          description: ln.description, costCategory: ln.costCategory,
          netAmount: ln.netAmount, vatAmount: ln.vatAmount, grossAmount: ln.grossAmount,
          paymentStatus: review.paymentStatus, source: review.file ? 'document' : 'manual',
        })
        if (c) created.push(c)
      }
      setCosts(prev => [...created, ...prev])
      setReview(null)
      setError('')
    } finally {
      setBusy(null)
    }
  }

  async function removeCost(id: string) {
    if (!confirm('Delete this cost?')) return
    await deleteJobCost(sb, id)
    setCosts(prev => prev.filter(c => c.id !== id))
  }

  // Totals
  const totalNet = costs.reduce((s, c) => s + c.netAmount, 0)
  const totalGross = costs.reduce((s, c) => s + c.grossAmount, 0)
  const byCat = CATS.map(cat => ({ cat, total: costs.filter(c => c.costCategory === cat.value).reduce((s, c) => s + c.grossAmount, 0) })).filter(x => x.total > 0)

  const reviewTotal = review ? review.lines.reduce((s, l) => s + l.grossAmount, 0) : 0

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Documents &amp; Costs</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{jobLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy === 'extracting'}
              style={{ ...btn, background: '#4a90a4', color: '#fff', border: 'none' }}>
              {busy === 'extracting' ? 'Reading document…' : '📷 Scan / Upload document'}
            </button>
            <button onClick={() => openReview(null, null)} style={btn}>＋ Add cost manually</button>
          </div>

          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{error}</div>}

          {/* Review form */}
          {review && (
            <div style={{ border: '2px solid #4a90a4', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fcfd' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Review &amp; confirm{review.file ? ` — ${review.fileName}` : ''}</div>
                {review.confidence !== undefined && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: review.confidence >= 0.7 ? '#dcfce7' : '#fef3c7', color: review.confidence >= 0.7 ? '#166534' : '#92400e' }}>
                    {Math.round(review.confidence * 100)}% confident — please check
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="Supplier"><input style={inp} value={review.supplier} onChange={e => setReview(r => r && { ...r, supplier: e.target.value })} /></Field>
                <Field label="Date"><input type="date" style={inp} value={review.docDate} onChange={e => setReview(r => r && { ...r, docDate: e.target.value })} /></Field>
                <Field label="Invoice / receipt #"><input style={inp} value={review.docNumber} onChange={e => setReview(r => r && { ...r, docNumber: e.target.value })} /></Field>
                <Field label="Payment">
                  <select style={inp} value={review.paymentStatus} onChange={e => setReview(r => r && { ...r, paymentStatus: e.target.value as PaymentStatus })}>
                    {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>

              {/* Cost lines */}
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>Cost lines</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {review.lines.map((ln, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 80px 22px', gap: 6, alignItems: 'center' }}>
                    <input style={inp} placeholder="Description" value={ln.description} onChange={e => updateLine(i, { description: e.target.value })} />
                    <select style={inp} value={ln.costCategory} onChange={e => updateLine(i, { costCategory: e.target.value as JobCostCategory })}>
                      {CATS.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                    </select>
                    <NumInput value={ln.netAmount} onChange={v => updateLine(i, { netAmount: v })} placeholder="Net" />
                    <NumInput value={ln.vatAmount} onChange={v => updateLine(i, { vatAmount: v })} placeholder="VAT" />
                    <NumInput value={ln.grossAmount} onChange={v => updateLine(i, { grossAmount: v })} placeholder="Gross" />
                    <button onClick={() => removeLine(i)} title="Remove line" style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15 }}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={addLine} style={{ ...btn, marginTop: 6, fontSize: 11, padding: '4px 10px' }}>＋ Add line</button>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <span style={{ fontSize: 13 }}>Total gross: <strong style={{ fontFamily: 'monospace' }}>{fmt(reviewTotal)}</strong></span>
                <button onClick={() => setReview(null)} style={btn}>Cancel</button>
                <button onClick={saveReview} disabled={busy === 'saving'} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>
                  {busy === 'saving' ? 'Saving…' : 'Save to job'}
                </button>
              </div>
            </div>
          )}

          {/* Ledger */}
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>Loading…</div>
          ) : costs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, padding: 28 }}>
              No costs captured yet. Scan a receipt or add one manually.
            </div>
          ) : (
            <>
              {/* Category summary */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {byCat.map(({ cat, total }) => (
                  <span key={cat.value} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>
                    {cat.emoji} {cat.label} {fmt(total)}
                  </span>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Supplier / description', 'Date', 'Category', 'Net', 'VAT', 'Gross', 'Payment', ''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: ['Net', 'VAT', 'Gross'].includes(h) ? 'right' : 'left', fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costs.map(c => {
                    const cm = catMeta(c.costCategory)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 8px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.supplier || '—'}{c.docNumber ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {c.docNumber}</span> : null}</div>
                          {c.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.description}</div>}
                          {c.source === 'document' && <span style={{ fontSize: 9, color: '#0369a1' }}>📎 from document</span>}
                        </td>
                        <td style={{ padding: '7px 8px', color: '#64748b' }}>{c.docDate || '—'}</td>
                        <td style={{ padding: '7px 8px' }}><span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: cm.bg, color: cm.color, fontWeight: 600 }}>{cm.emoji} {cm.label}</span></td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.netAmount)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{fmt(c.vatAmount)}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(c.grossAmount)}</td>
                        <td style={{ padding: '7px 8px' }}><span style={{ fontSize: 10, color: c.paymentStatus === 'paid' ? '#16a34a' : c.paymentStatus === 'unpaid' ? '#dc2626' : '#94a3b8' }}>{c.paymentStatus}</span></td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <button onClick={() => removeCost(c.id)} title="Delete" style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }} colSpan={3}>Total actual cost</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(totalNet)}</td>
                    <td />
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(totalGross)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── small bits ────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}
function NumInput({ value, onChange, placeholder }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return <input type="number" min={0} step="0.01" value={value} placeholder={placeholder}
    onChange={e => onChange(Math.max(0, +e.target.value))}
    style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} />
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }
const panel: React.CSSProperties = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }
const btn: React.CSSProperties = { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }
