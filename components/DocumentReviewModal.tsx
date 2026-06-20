'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedDocUrl, allocateDocument } from '@/lib/job-costs'
import { useApp } from '@/contexts/AppContext'
import type { InboxDocument, JobCostCategory, PaymentStatus, BillLineItem } from '@/lib/types'
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
  const gross = Number(raw?.grossAmount) || 0
  const vat = Number(raw?.vatAmount) || 0
  const net = Number(raw?.netAmount) || (gross ? +(gross - vat).toFixed(2) : 0)
  return [{ description: String(raw?.description ?? ''), costCategory: (raw?.costCategory as JobCostCategory) || 'materials', netAmount: net, vatAmount: vat, grossAmount: gross }]
}

export default function DocumentReviewModal({ doc, jobs, userId, onClose, onSaved }: Props) {
  const sb = createClient()
  const { addBill } = useApp()
  const ex = doc.extraction ?? {}
  const [url, setUrl] = useState<string | null>(null)
  const [supplier, setSupplier] = useState(String((ex as Record<string, unknown>).supplier ?? ''))
  const [docDate, setDocDate] = useState(String((ex as Record<string, unknown>).docDate ?? ''))
  const [docNumber, setDocNumber] = useState(String((ex as Record<string, unknown>).docNumber ?? ''))
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(((ex as Record<string, unknown>).paymentStatus as PaymentStatus) || 'unknown')
  const [lines, setLines] = useState<ExtractedCostLine[]>(() => initialLines(ex))
  const [jobId, setJobId] = useState(doc.jobId ?? '')
  const [busy, setBusy] = useState(false)
  const [xeroBusy, setXeroBusy] = useState(false)
  const [xeroError, setXeroError] = useState<string | null>(null)
  const [billBusy, setBillBusy] = useState(false)
  const [billCreated, setBillCreated] = useState(false)

  const [xeroAccounts, setXeroAccounts] = useState<Array<{ code: string; name: string; type: string }>>([])
  const [xeroAccount, setXeroAccount] = useState('')
  const [duplicates, setDuplicates] = useState<Array<{ label: string; detail: string; confidence: string; storagePath?: string; mimeType?: string }>>([])
  const [dupDismissed, setDupDismissed] = useState(false)
  const [zoom, setZoom] = useState(1)

  const isAllocated = doc.status === 'allocated'
  const isPdf = doc.mimeType === 'application/pdf'

  useEffect(() => {
    signedDocUrl(sb, doc.storagePath).then(setUrl)

    // Load Xero chart of accounts silently
    fetch('/api/xero/accounts')
      .then(r => r.ok ? r.json() : null)
      .then((d: { accounts?: Array<{ code: string; name: string; type: string }> } | null) => {
        if (d?.accounts?.length) setXeroAccounts(d.accounts)
      })
      .catch(() => {})

    // Check for duplicate invoices / receipts
    const ex = doc.extraction as Record<string, unknown> | null
    const docNum = String(ex?.docNumber ?? '').trim()
    const sup    = String(ex?.supplier ?? '').trim()
    const date   = String(ex?.docDate ?? '').trim()
    // Compute gross from top-level OR sum of lines (AI sometimes omits top-level grossAmount)
    const rawLines = Array.isArray(ex?.lines) ? ex.lines as Record<string, unknown>[] : []
    const computedGross = Number(ex?.grossAmount) || rawLines.reduce((s, l) => s + (Number(l.grossAmount) || 0), 0)
    const gross = computedGross ? String(computedGross) : ''
    if (sup || docNum) {
      const qs = new URLSearchParams({ excludeDocId: doc.id })
      if (docNum)  qs.set('docNumber', docNum)
      if (sup)     qs.set('supplier', sup)
      if (gross)   qs.set('grossAmount', gross)
      if (date)    qs.set('docDate', date)
      fetch(`/api/check-duplicate?${qs}`)
        .then(r => r.json())
        .then((d: { matches?: Array<{ label: string; detail: string; confidence: string; storagePath?: string; mimeType?: string }> }) => {
          if (d.matches?.length) setDuplicates(d.matches)
        })
        .catch(() => {})
    }
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
  const addLine = () => setLines(p => [...p, { description: '', costCategory: 'materials', netAmount: 0, vatAmount: 0, grossAmount: 0, chargeToClient: false }])
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i))
  const total = lines.reduce((s, l) => s + l.grossAmount, 0)

  async function createBill() {
    setBillBusy(true)
    try {
      // Map cost category to bill category (bills don't have 'subcontractors' — treat as labour for CIS)
      const catMap: Record<JobCostCategory, BillLineItem['category']> = {
        labour: 'labour', materials: 'materials', plant: 'plant',
        subcontractors: 'labour', other: 'other',
      }
      let lineCounter = 0
      const billLines: BillLineItem[] = lines.map(ln => ({
        id: ++lineCounter,
        desc: ln.description || supplier || 'Subcontractor work',
        category: catMap[ln.costCategory] ?? 'labour',
        amount: ln.grossAmount,
      }))
      const labour    = billLines.filter(l => l.category === 'labour').reduce((s, l) => s + l.amount, 0)
      const materials = billLines.filter(l => l.category === 'materials').reduce((s, l) => s + l.amount, 0)
      const plant     = billLines.filter(l => l.category === 'plant').reduce((s, l) => s + l.amount, 0)
      const other     = billLines.filter(l => l.category === 'other').reduce((s, l) => s + l.amount, 0)
      const subtotal  = labour + materials + plant + other
      await addBill({
        supplierId: '', supplierName: supplier || doc.fileName,
        jobId: jobId || '',
        billDate: docDate || new Date().toISOString().split('T')[0],
        dueDate: '',
        description: docNumber ? `Invoice ${docNumber}` : supplier || 'Subcontractor invoice',
        lineItems: billLines,
        labourAmount: labour, materialsAmount: materials, plantAmount: plant, otherAmount: other,
        subtotal, cisRate: 0, cisDeduction: 0, totalPayable: subtotal,
        status: 'draft', notes: docNumber ? `Receipt / invoice #${docNumber}` : '',
        syncToXero: false,
        documentId: doc.id,
      })
      setBillCreated(true)
    } finally { setBillBusy(false) }
  }

  // Allocation is valid when every line can resolve to a job
  const allLinesHaveJob = lines.every(l => l.jobId || jobId)

  async function allocate(publishToXero = false) {
    if (!publishToXero && !allLinesHaveJob) return
    setBusy(true)
    setXeroError(null)
    try {
      // Save job costs when every line resolves to a job
      if (allLinesHaveJob) {
        await allocateDocument(sb, userId, doc, jobId, { supplier, docDate, docNumber, paymentStatus }, lines)
      }

      if (!publishToXero) { onSaved(); return }

      setXeroBusy(true)
      try {
        const res = await fetch('/api/xero/push-doc-bill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: doc.id, supplier, docDate, docNumber, lines,
            fileName: doc.fileName, storagePath: doc.storagePath, mimeType: doc.mimeType,
            xeroAccountCode: xeroAccount || undefined,
          }),
        })
        const d = await res.json() as { xeroBillId?: string; error?: string }
        if (!res.ok || d.error) {
          setXeroError(d.error || 'Failed to publish to Xero')
          if (allLinesHaveJob) onSaved()  // costs saved — reload even on Xero error
        } else {
          onSaved()
        }
      } finally { setXeroBusy(false) }
    } finally { setBusy(false) }
  }

  async function archive() {
    setBusy(true)
    try {
      await sb.from('job_documents').update({ status: 'archived' }).eq('id', doc.id)
      onSaved()
    } finally { setBusy(false) }
  }

  const isBusy = busy || xeroBusy

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Review document{isAllocated ? ' (allocated)' : ''}
            {doc.xeroBillId && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>✓ Xero</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Preview */}
          <div style={{ flex: '1 1 45%', background: '#1e293b', overflow: 'auto', padding: 10, position: 'relative', display: zoom > 1 ? 'block' : 'flex', alignItems: zoom > 1 ? undefined : 'center', justifyContent: zoom > 1 ? undefined : 'center' }}>
            {url && !isPdf && (
              <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 4 }}>
                <button onClick={() => setZoom(z => Math.min(+(z + 0.5).toFixed(1), 4))} style={zoomBtn} title="Zoom in">＋</button>
                {zoom !== 1 && <button onClick={() => setZoom(1)} style={zoomBtn} title="Reset">↺</button>}
                <button onClick={() => setZoom(z => Math.max(+(z - 0.5).toFixed(1), 1))} style={zoomBtn} disabled={zoom <= 1} title="Zoom out">－</button>
              </div>
            )}
            {!url ? <span style={{ color: '#94a3b8', fontSize: 13 }}>Loading preview…</span>
              : isPdf ? <iframe src={url} title="document" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
              : <img
                  src={url}
                  alt={doc.fileName}
                  onClick={() => setZoom(z => z >= 4 ? 1 : +(z + 0.5).toFixed(1))}
                  style={{ maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? '100%' : 'none', objectFit: zoom === 1 ? 'contain' : undefined, zoom: zoom, display: 'block', cursor: zoom < 4 ? 'zoom-in' : 'zoom-out' }}
                />}
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

            {duplicates.length > 0 && !dupDismissed && (
              <div style={{ margin: '8px 0 12px', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e', marginBottom: 4 }}>⚠ Possible duplicate</div>
                    {duplicates.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 12, color: '#78350f', flex: 1 }}>
                          {m.confidence === 'high' ? '🔴' : '🟡'} {m.label}
                          {m.detail && <span style={{ color: '#a16207', marginLeft: 6 }}>{m.detail}</span>}
                        </div>
                        {m.storagePath && (
                          <ViewDupButton sb={sb} storagePath={m.storagePath} mimeType={m.mimeType} />
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setDupDismissed(true)} style={{ border: 'none', background: 'none', color: '#a16207', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8' }}>Cost lines</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>Net · VAT · Gross · Expense?</div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {lines.map((ln, i) => (
                <div key={i} style={{ border: '1px solid #f1f5f9', borderRadius: 6, padding: '6px 8px', background: ln.jobId ? '#f0f9ff' : undefined }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 72px 72px 72px auto 20px', gap: 5, alignItems: 'center' }}>
                    <input style={inp} placeholder="Description" value={ln.description} onChange={e => updateLine(i, { description: e.target.value })} />
                    <select style={inp} value={ln.costCategory} onChange={e => updateLine(i, { costCategory: e.target.value as JobCostCategory })}>
                      {CATS.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                    </select>
                    <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.netAmount} onChange={e => updateLine(i, { netAmount: Math.max(0, +e.target.value) })} title="Net" />
                    <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.vatAmount} onChange={e => updateLine(i, { vatAmount: Math.max(0, +e.target.value) })} title="VAT" />
                    <input type="number" min={0} step="0.01" style={{ ...inp, textAlign: 'right', fontFamily: 'monospace' }} value={ln.grossAmount} onChange={e => updateLine(i, { grossAmount: Math.max(0, +e.target.value) })} title="Gross" />
                    <label
                      title="Charge to client as an expense"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: 1 }}
                    >
                      <input
                        type="checkbox"
                        checked={!!ln.chargeToClient}
                        onChange={e => updateLine(i, { chargeToClient: e.target.checked })}
                        style={{ cursor: 'pointer', accentColor: '#d97706', width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 8, fontWeight: 700, color: ln.chargeToClient ? '#d97706' : '#cbd5e1', letterSpacing: '0.02em' }}>EXP</span>
                    </label>
                    <button onClick={() => removeLine(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15 }}>×</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>→ Job</span>
                    <select
                      style={{ ...inp, fontSize: 11, padding: '3px 6px', color: ln.jobId ? '#0369a1' : '#94a3b8' }}
                      value={ln.jobId ?? ''}
                      onChange={e => updateLine(i, { jobId: e.target.value || undefined })}
                    >
                      <option value="">— use default job —</option>
                      {jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addLine} style={{ ...btn, marginTop: 6, fontSize: 11, padding: '4px 10px' }}>＋ Add line</button>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Default job (for lines without an override)">
                  <select style={inp} value={jobId} onChange={e => setJobId(e.target.value)}>
                    <option value="">— select a job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                  </select>
                </Field>
                {xeroAccounts.length > 0 && (
                  <Field label="Xero account">
                    <select style={inp} value={xeroAccount} onChange={e => setXeroAccount(e.target.value)}>
                      <option value="">— use category defaults —</option>
                      {xeroAccounts.map(a => (
                        <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {xeroError && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#b91c1c' }}>
                  ⚠ {xeroError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Total gross: <strong style={{ fontFamily: 'monospace' }}>{fmt(total)}</strong></span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={onClose} style={btn} disabled={isBusy || billBusy}>Cancel</button>
                  <button
                    onClick={archive}
                    disabled={isBusy}
                    style={{ ...btn, color: '#64748b' }}
                    title="Mark as filed — no job cost entry"
                  >
                    {busy && !xeroBusy && !jobId ? 'Archiving…' : '🗄 Archive'}
                  </button>
                  {allLinesHaveJob && (
                    <button
                      onClick={() => allocate(false)}
                      disabled={isBusy}
                      style={{ ...btn, background: '#1e40af', color: '#fff', border: 'none' }}
                    >
                      {busy && !xeroBusy ? 'Saving…' : isAllocated ? 'Update allocation' : 'Allocate to job'}
                    </button>
                  )}
                  {billCreated
                    ? <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ Bill created — see Bills page</span>
                    : <button
                        onClick={createBill}
                        disabled={isBusy || billBusy}
                        title="Create a subcontractor bill from this invoice and link it to the document"
                        style={{ ...btn, background: '#7c3aed', color: '#fff', border: 'none', opacity: billBusy ? 0.7 : 1 }}
                      >
                        {billBusy ? '📋 Creating…' : '📋 Create Bill'}
                      </button>
                  }
                  <button
                    onClick={() => allocate(true)}
                    disabled={isBusy || billBusy}
                    style={{ ...btn, background: '#0d6b3b', color: '#fff', border: 'none', opacity: isBusy ? 0.7 : 1 }}
                  >
                    {xeroBusy ? '📤 Publishing…' : jobId ? (isAllocated ? '📤 Update & Publish to Xero' : '📤 Save & Publish to Xero') : '📤 Publish to Xero'}
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

function ViewDupButton({ sb, storagePath, mimeType }: { sb: SupabaseClient; storagePath: string; mimeType?: string }) {
  const [loading, setLoading] = useState(false)
  async function open() {
    setLoading(true)
    try {
      const url = await signedDocUrl(sb, storagePath)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } finally { setLoading(false) }
  }
  const isPdf = (mimeType ?? '').includes('pdf')
  return (
    <button
      onClick={open}
      disabled={loading}
      style={{ flexShrink: 0, fontSize: 11, padding: '2px 8px', border: '1px solid #d97706', borderRadius: 5, background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontWeight: 600 }}
    >
      {loading ? '…' : isPdf ? '📄 View' : '🖼 View'}
    </button>
  )
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: React.CSSProperties = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 1000, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }
const btn: React.CSSProperties = { padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }
const zoomBtn: React.CSSProperties = { background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 5, width: 30, height: 30, cursor: 'pointer', fontSize: 17, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
