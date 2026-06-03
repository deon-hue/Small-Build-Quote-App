'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signedDocUrl, allocateDocument } from '@/lib/job-costs'
import type { InboxDocument, JobCostCategory, PaymentStatus } from '@/lib/types'
import type { ExtractedCostLine } from '@/lib/doc-extract/types'

interface JobOption { id: string; label: string }
interface Props { doc: InboxDocument; jobs: JobOption[]; userId: string; onClose: () => void; onSaved: () => void }

const CATS: { value: JobCostCategory; label: string; emoji: string }[] = [
  { value: 'labour', label: 'Labour', emoji: '🔨' },
  { value: 'materials', label: 'Materials', emoji: '📦' },
  { value: 'plant', label: 'Plant', emoji: '🚜' },
  { value: 'subcontractors', label: 'Subcontractors', emoji: '👷' },
  { value: 'other', label: 'Other', emoji: '📋' },
]
const PAYMENTS: PaymentStatus[] = ['unknown', 'unpaid', 'partial', 'paid']
const fmt = (n: number) => `£${(n || 0).toFixed(2)}`

function initialLines(ex: Record<string, unknown> | null | undefined): ExtractedCostLine[] {
  const raw = ex as Record<string, unknown> | null
  const arr = raw && Array.isArray(raw.lines) ? raw.lines as Record<string, unknown>[] : []
  if (arr.length) {
    return arr.map(l => ({
      description: String(l.description ?? ''),
      costCategory: (CATS.some(c => c.value === l.costCategory) ? l.costCategory : 'materials') as JobCostCategory,
      netAmount: Number(l.netAmount) || 0,
      vatAmount: Number(l.vatAmount) || 0,
      grossAmount: Number(l.grossAmount) || 0,
    }))
  }
  // single line from totals, if any
  const gross = Number(raw?.grossAmount) || 0
  const vat = Number(raw?.vatAmount) || 0
  const net = Number(raw?.netAmount) || (gross ? +(gross - vat).toFixed(2) : 0)
  return [{ description: String(raw?.description ?? ''), costCategory: (raw?.costCategory as JobCostCategory) || 'materials', netAmount: net, vatAmount: vat, grossAmount: gross }]
}

export default function DocumentReviewModal({ doc, jobs, userId, onClose, onSaved }: Props) {
  const sb = createClient()
  const ex = doc.extraction ?? {}
  const [url, setUrl] = useState<string | null>(null)
  const [supplier, setSupplier] = useState(String((ex as Record<string, unknown>).supplier ?? ''))
  const [docDate, setDocDate] = useState(String((ex as Record<string, unknown>).docDate ?? ''))
  const [docNumber, setDocNumber] = useState(String((ex as Record<string, unknown>).docNumber ?? ''))
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(((ex as Record<string, unknown>).paymentStatus as PaymentStatus) || 'unknown')
  const [lines, setLines] = useState<ExtractedCostLine[]>(() => initialLines(ex))
  const [jobId, setJobId] = useState(doc.jobId ?? '')
  const [busy, setBusy] = useState(false)

  const isPdf = doc.mimeType === 'application/pdf'

  useEffect(() => {
    signedDocUrl(sb, doc.storagePath).then(setUrl)
  }, [doc.storagePath]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateLine(i: number, patch: Partial<ExtractedCostLine>) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const ln = { ...l, ...patch }
      if (patch.netAmount !== undefined || patch.vatAmount !== undefined) ln.grossAmount = +(ln.netAmount + ln.vatAmount).toFixed(2)
      else if (patch.grossAmount !== undefined && ln.netAmount === 0 && ln.vatAmount === 0) {
        ln.vatAmount = +(ln.grossAmount - ln.grossAmount / 1.2).toFixed(2)
        ln.netAmount = +(ln.grossAmount - ln.vatAmount).toFixed(2)
      }
      return ln
    }))
  }
  const addLine = () => setLines(p => [...p, { description: '', costCategory: 'materials', netAmount: 0, vatAmount: 0, grossAmount: 0 }])
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i))
  const total = lines.reduce((s, l) => s + l.grossAmount, 0)

  async function allocate() {
    if (!jobId) return
    setBusy(true)
    try {
      await allocateDocument(sb, userId, doc, jobId, { supplier, docDate, docNumber, paymentStatus }, lines)
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Review document{doc.status === 'allocated' ? ' (allocated)' : ''}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Preview */}
          <div style={{ flex: '1 1 45%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 10 }}>
            {!url ? <span style={{ color: '#94a3b8', fontSize: 13 }}>Loading preview…</span>
              : isPdf ? <iframe src={url} title="document" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
              : <img src={url} alt={doc.fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
          </div>

          {/* Details */}
          <div style={{ flex: '1 1 55%', padding: 16, overflowY: 'auto', borderLeft: '1px solid #e2e8f0' }}>
            {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#2a7090' }}>↗ Open original in new tab</a>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
              <Field label="Supplier"><input style={inp} value={supplier} onChange={e => setSupplier(e.target.value)} /></Field>
              <Field label="Date"><input type="date" style={inp} value={docDate} onChange={e => setDocDate(e.target.value)} /></Field>
              <Field label="Invoice / receipt #"><input style={inp} value={docNumber} onChange={e => setDocNumber(e.target.value)} /></Field>
              <Field label="Payment">
                <select style={inp} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as PaymentStatus)}>
                  {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>Cost lines</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {lines.map((ln, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 72px 72px 72px 20px', gap: 5, alignItems: 'center' }}>
                  <input style={inp} placeholder="Description" value={ln.description} onChange={e => updateLine(i, { description: e.target.value })} />
                  <select style={inp} value={ln.costCategory} onChange={e => updateLine(i, { costCategory: e.target.value as JobCostCategory })}>
                    {CATS.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                  </select>
                  <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.netAmount} onChange={e => updateLine(i, { netAmount: Math.max(0, +e.target.value) })} title="Net" />
                  <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.vatAmount} onChange={e => updateLine(i, { vatAmount: Math.max(0, +e.target.value) })} title="VAT" />
                  <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.grossAmount} onChange={e => updateLine(i, { grossAmount: Math.max(0, +e.target.value) })} title="Gross" />
                  <button onClick={() => removeLine(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={addLine} style={{ ...btn, marginTop: 6, fontSize: 11, padding: '4px 10px' }}>＋ Add line</button>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <Field label="Allocate to job">
                <select style={inp} value={jobId} onChange={e => setJobId(e.target.value)}>
                  <option value="">— select a job —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                </select>
              </Field>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ fontSize: 13 }}>Total gross: <strong style={{ fontFamily: 'monospace' }}>{fmt(total)}</strong></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onClose} style={btn}>Cancel</button>
                  <button onClick={allocate} disabled={!jobId || busy} style={{ ...btn, background: jobId ? '#16a34a' : '#cbd5e1', color: '#fff', border: 'none', cursor: jobId ? 'pointer' : 'not-allowed' }}>
                    {busy ? 'Saving…' : doc.status === 'allocated' ? 'Update allocation' : 'Allocate to job'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>{label}</label>{children}</div>
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: React.CSSProperties = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1000, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }
const btn: React.CSSProperties = { padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }
