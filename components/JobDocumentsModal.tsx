'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchJobCosts, insertJobCost, deleteJobCost } from '@/lib/job-costs'
import type { CategoryBudget } from '@/lib/job-costs'
import type { JobCost, JobCostCategory, PaymentStatus, VariationLineItem, JobPayment, PaymentMethod } from '@/lib/types'
import type { ExtractedCostLine } from '@/lib/doc-extract/types'
import { useApp } from '@/contexts/AppContext'

interface Props { jobId: string; jobLabel: string; budget?: CategoryBudget | null; revenue?: number; contractValue?: number; variationsTotal?: number; invoicedTotal?: number; paidTotal?: number; cashReceived?: number; onClose: () => void }

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
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

interface ManualState {
  supplier: string
  docDate: string
  docNumber: string
  paymentStatus: PaymentStatus
  lines: ExtractedCostLine[]
}
const blankManual = (): ManualState => ({
  supplier: '', docDate: '', docNumber: '', paymentStatus: 'unknown',
  lines: [{ description: '', costCategory: 'materials', netAmount: 0, vatAmount: 0, grossAmount: 0 }],
})

interface SubContract { id: string; contact_id: string | null; type: 'rate' | 'fixed'; description: string; rate_type: 'hourly' | 'daily' | null; rate_amount: number | null; quoted_amount: number | null; status: string }
interface SubEntry { id: string; sub_contract_id: string; entry_date: string; units: number }
interface SubStage { id: string; sub_contract_id: string; description: string; amount: number; paid_date: string | null }

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '💵 Cash', cheque: '📝 Cheque', bank_transfer: '🏦 Bank Transfer', other: '📋 Other',
}

export default function JobDocumentsModal({ jobId, jobLabel, budget, revenue, contractValue, variationsTotal, invoicedTotal = 0, paidTotal = 0, cashReceived = 0, onClose }: Props) {
  const sb = createClient()
  const { suppliers, clients, addVariation, jobPayments, invoices } = useApp()
  const localPayments = jobPayments.filter(p => p.jobId === jobId)
  const localInvoices = invoices.filter(i => i.jobId === jobId)
  const [showInvoices, setShowInvoices] = useState(true)
  const [showPayments, setShowPayments] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [costs, setCosts] = useState<JobCost[]>([])
  const [loading, setLoading] = useState(true)
  const [subContracts, setSubContracts] = useState<SubContract[]>([])
  const [subEntries, setSubEntries] = useState<SubEntry[]>([])
  const [subStages, setSubStages] = useState<SubStage[]>([])
  const [saving, setSaving] = useState(false)
  const [manual, setManual] = useState<ManualState | null>(null)
  const [supplierDrop, setSupplierDrop] = useState(false)
  const supplierRef = useRef<HTMLDivElement>(null)
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<'supplier' | 'date' | 'category' | 'payment' | 'gross'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function toggleWeek(key: string) {
    setExpandedWeeks(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function weekStartOf(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    const dow = d.getDay()
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
    return d.toISOString().slice(0, 10)
  }

  function fmtWeekRange(ws: string): string {
    const s = new Date(ws + 'T12:00:00')
    const e = new Date(ws + 'T12:00:00')
    e.setDate(e.getDate() + 6)
    return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  function toggleDoc(docId: string) {
    setExpandedDocs(prev => {
      const next = new Set(prev)
      next.has(docId) ? next.delete(docId) : next.add(docId)
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      setUserId(user.id)
      const [jobCosts, { data: scs }, { data: ses }, { data: sps }] = await Promise.all([
        fetchJobCosts(sb, user.id, jobId),
        sb.from('sub_contracts').select('id,contact_id,type,description,rate_type,rate_amount,quoted_amount,status').eq('user_id', user.id).eq('job_id', jobId),
        sb.from('sub_time_entries').select('id,sub_contract_id,entry_date,units').eq('user_id', user.id),
        sb.from('sub_payment_stages').select('id,sub_contract_id,description,amount,paid_date').eq('user_id', user.id),
      ])
      setCosts(jobCosts)
      const contracts = (scs ?? []) as SubContract[]
      setSubContracts(contracts)
      const cids = new Set(contracts.map(c => c.id))
      setSubEntries(((ses ?? []) as SubEntry[]).filter(e => cids.has(e.sub_contract_id)))
      setSubStages(((sps ?? []) as SubStage[]).filter(s => cids.has(s.sub_contract_id)))
      setLoading(false)
      // Background: sync Xero payment statuses, then quietly refresh costs if anything changed
      fetch('/api/xero/sync-payment-statuses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      }).then(r => r.ok ? r.json() : null).then((d: { updated?: number } | null) => {
        if ((d?.updated ?? 0) > 0) fetchJobCosts(sb, user.id, jobId).then(setCosts)
      }).catch(() => {})
    } else {
      setLoading(false)
    }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function updateLine(i: number, patch: Partial<ExtractedCostLine>) {
    setManual(m => {
      if (!m) return m
      const lines = m.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l)
      const ln = lines[i]
      if (patch.netAmount !== undefined || patch.vatAmount !== undefined) ln.grossAmount = +(ln.netAmount + ln.vatAmount).toFixed(2)
      else if (patch.grossAmount !== undefined && ln.netAmount === 0 && ln.vatAmount === 0) {
        ln.vatAmount = +(ln.grossAmount - ln.grossAmount / 1.2).toFixed(2)
        ln.netAmount = +(ln.grossAmount - ln.vatAmount).toFixed(2)
      }
      return { ...m, lines }
    })
  }
  const addLine = () => setManual(m => m ? { ...m, lines: [...m.lines, { description: '', costCategory: 'materials', netAmount: 0, vatAmount: 0, grossAmount: 0 }] } : m)
  const removeLine = (i: number) => setManual(m => m ? { ...m, lines: m.lines.filter((_, idx) => idx !== i) } : m)

  async function saveManual() {
    if (!manual || !userId) return
    setSaving(true)
    try {
      const created: JobCost[] = []
      for (const ln of manual.lines) {
        const c = await insertJobCost(sb, userId, {
          jobId, supplier: manual.supplier, docDate: manual.docDate, docNumber: manual.docNumber,
          description: ln.description, costCategory: ln.costCategory,
          netAmount: ln.netAmount, vatAmount: ln.vatAmount, grossAmount: ln.grossAmount,
          paymentStatus: manual.paymentStatus, source: 'manual',
        })
        if (c) created.push(c)
      }
      setCosts(prev => [...created, ...prev])
      setManual(null)
    } finally { setSaving(false) }
  }

  async function removeCost(id: string) {
    if (!confirm('Delete this cost?')) return
    await deleteJobCost(sb, id)
    setCosts(prev => prev.filter(c => c.id !== id))
  }

  const [raisingVar, setRaisingVar] = useState(false)
  const [varRaised, setVarRaised] = useState(false)

  async function raiseExpenseVariation() {
    const expenseLines = costs.filter(c => c.chargeToClient)
    if (!expenseLines.length) return
    setRaisingVar(true)
    try {
      const items: VariationLineItem[] = expenseLines.map((c, idx) => ({
        id: idx + 1,
        itemType: c.costCategory as VariationLineItem['itemType'],
        desc: [c.supplier, c.description].filter(Boolean).join(' — ') || 'Expense',
        qty: 1,
        unit: 'item',
        rate: c.grossAmount,   // pass-through at gross; markup = 0 so sell = gross
        notes: c.docNumber ? `Receipt: ${c.docNumber}` : '',
      }))
      const expGross = expenseLines.reduce((s, c) => s + c.grossAmount, 0)
      const suppliers = [...new Set(expenseLines.map(c => c.supplier).filter(Boolean))]
      await addVariation(jobId, {
        title: `Expenses — ${suppliers.join(', ') || 'receipts'}`,
        description: 'Rechargeable expenses — see attached receipts.',
        status: 'draft',
        items,
        markup: 0,
        vatIncluded: false,
        total: expGross,
        notes: '',
        locked: false,
        clientApprovedAt: null, clientApprovedBy: null,
        clientRejectedAt: null, clientRejectionReason: null,
        sentAt: null,
      })
      setVarRaised(true)
    } finally { setRaisingVar(false) }
  }

  async function removeDocGroup(documentId: string, lines: JobCost[]) {
    if (!confirm(`Delete all ${lines.length} line${lines.length > 1 ? 's' : ''} from this receipt?`)) return
    await Promise.all(lines.map(c => deleteJobCost(sb, c.id)))
    setCosts(prev => prev.filter(c => c.documentId !== documentId))
  }

  const totalNet = costs.reduce((s, c) => s + c.netAmount, 0)
  const totalGross = costs.reduce((s, c) => s + c.grossAmount, 0)
  const byCat = CATS.map(cat => ({ cat, total: costs.filter(c => c.costCategory === cat.value).reduce((s, c) => s + c.grossAmount, 0) })).filter(x => x.total > 0)
  const manualTotal = manual ? manual.lines.reduce((s, l) => s + l.grossAmount, 0) : 0

  // Budget vs actual (net, ex-VAT — matches the quote's cost basis)
  const actualNetByCat = (cat: JobCostCategory) => costs.filter(c => c.costCategory === cat).reduce((s, c) => s + c.netAmount, 0)
  const budgetFor = (cat: JobCostCategory) => budget ? (budget as unknown as Record<string, number>)[cat] ?? 0 : 0
  const margin = revenue !== undefined ? +(revenue - totalNet).toFixed(2) : null
  const marginPct = revenue ? Math.round((margin! / revenue) * 100) : null

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Job Costs</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{jobLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setManual(blankManual())} style={{ ...btn, background: '#4a90a4', color: '#fff', border: 'none' }}>＋ Add cost manually</button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>To scan a receipt or invoice, use the <strong>Document Inbox</strong> in Settings, then allocate it to this job.</span>
          </div>

          {/* Manual add form */}
          {manual && (
            <div style={{ border: '2px solid #4a90a4', borderRadius: 10, padding: 14, marginBottom: 16, background: '#f8fcfd' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Add cost</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="Supplier">
                  <div ref={supplierRef} style={{ position: 'relative' }}>
                    <input
                      style={inp}
                      value={manual.supplier}
                      placeholder="Search or type…"
                      autoComplete="off"
                      onChange={e => { setManual(m => m && { ...m, supplier: e.target.value }); setSupplierDrop(true) }}
                      onFocus={() => setSupplierDrop(true)}
                      onBlur={() => setTimeout(() => setSupplierDrop(false), 150)}
                    />
                    {supplierDrop && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #4a90a4', borderRadius: 6, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto' }}>
                        {suppliers
                          .filter(s => !manual.supplier || s.name.toLowerCase().includes(manual.supplier.toLowerCase()))
                          .map(s => (
                            <div
                              key={s.id}
                              onMouseDown={() => { setManual(m => m && { ...m, supplier: s.name }); setSupplierDrop(false) }}
                              style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                              onMouseLeave={e => (e.currentTarget.style.background = '')}
                            >
                              <div style={{ fontWeight: 600 }}>{s.name}</div>
                              {s.contactName && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.contactName}</div>}
                            </div>
                          ))
                        }
                        {suppliers.filter(s => !manual.supplier || s.name.toLowerCase().includes(manual.supplier.toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                            No match — &quot;{manual.supplier}&quot; will be saved as a new supplier name
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Field>
                <Field label="Date"><input type="date" style={inp} value={manual.docDate} onChange={e => setManual(m => m && { ...m, docDate: e.target.value })} /></Field>
                <Field label="Invoice / receipt #"><input style={inp} value={manual.docNumber} onChange={e => setManual(m => m && { ...m, docNumber: e.target.value })} /></Field>
                <Field label="Payment">
                  <select style={inp} value={manual.paymentStatus} onChange={e => setManual(m => m && { ...m, paymentStatus: e.target.value as PaymentStatus })}>
                    {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>Cost lines</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {manual.lines.map((ln, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 80px 80px 22px', gap: 6, alignItems: 'center' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <span style={{ fontSize: 13 }}>Total gross: <strong style={{ fontFamily: 'monospace' }}>{fmt(manualTotal)}</strong></span>
                <button onClick={() => setManual(null)} style={btn}>Cancel</button>
                <button onClick={saveManual} disabled={saving} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none' }}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}

          {/* Financial Summary */}
          {revenue !== undefined && !loading && (() => {
            const totalReceived = paidTotal + localPayments.reduce((s, p) => s + p.amount, 0)
            const outstanding = +(revenue - totalReceived).toFixed(2)
            const base = contractValue ?? revenue
            const varTotal = variationsTotal ?? 0
            return (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16, background: '#fafbff' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1e293b' }}>📊 Financial Summary</div>
                <div style={{ fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <span>Original contract</span>
                    <span style={{ fontFamily: 'monospace', color: '#1e293b', fontWeight: 600 }}>{fmt(base)}</span>
                  </div>
                  {varTotal !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                      <span>Approved variations</span>
                      <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>{varTotal > 0 ? '+' : ''}{fmt(varTotal)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '2px solid #e2e8f0', fontWeight: 700, color: '#1e293b' }}>
                    <span>Total contract value</span>
                    <span style={{ fontFamily: 'monospace' }}>{fmt(revenue)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 6, borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <span>Actual costs (ex-VAT)</span>
                    <span style={{ fontFamily: 'monospace', color: '#1e293b', fontWeight: 600 }}>{fmt(totalNet)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                    <span>Gross margin</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: margin !== null && margin >= 0 ? '#16a34a' : '#dc2626' }}>
                      {fmt(margin ?? 0)}{marginPct !== null ? ` (${marginPct}%)` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', marginTop: 6, borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <span>Invoiced to date</span>
                    <span style={{ fontFamily: 'monospace', color: '#1e293b', fontWeight: 600 }}>{fmt(invoicedTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                    <span>Payments received</span>
                    <span style={{ fontFamily: 'monospace', color: '#16a34a', fontWeight: 600 }}>{fmt(totalReceived)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontWeight: 700 }}>
                    <span style={{ color: outstanding > 0 ? '#d97706' : '#16a34a' }}>Outstanding balance</span>
                    <span style={{ fontFamily: 'monospace', color: outstanding > 0 ? '#d97706' : '#16a34a' }}>{fmt(outstanding)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Budget vs actual */}
          {budget && !loading && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16, background: '#fbfdff' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Quoted vs Actual <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(ex-VAT)</span></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, textTransform: 'uppercase' }}>Quoted</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, textTransform: 'uppercase' }}>Actual</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, textTransform: 'uppercase' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(cat => {
                    const q = budgetFor(cat.value), a = actualNetByCat(cat.value), v = +(a - q).toFixed(2)
                    if (q === 0 && a === 0) return null
                    return (
                      <tr key={cat.value} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '5px 6px' }}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.emoji} {cat.label}</span></td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(q)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(a)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: v > 0 ? '#dc2626' : '#16a34a' }}>{v > 0 ? '+' : ''}{fmt(v)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td style={{ padding: '6px' }}>Total cost</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(budget.total)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(totalNet)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace', color: totalNet - budget.total > 0 ? '#dc2626' : '#16a34a' }}>{totalNet - budget.total > 0 ? '+' : ''}{fmt(+(totalNet - budget.total).toFixed(2))}</td>
                  </tr>
                </tfoot>
              </table>
              {/* Invoices */}
              {localInvoices.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                  <div onClick={() => setShowInvoices(v => !v)}
                    style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: showInvoices ? 8 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                    <span style={{ fontSize: 10 }}>{showInvoices ? '▾' : '▸'}</span>
                    Invoices — <span style={{ fontFamily: 'monospace', color: '#111827' }}>{fmt(localInvoices.reduce((s, i) => s + i.total, 0))}</span>
                  </div>
                  {showInvoices && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[...localInvoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate)).map(inv => {
                        const statusStyle: Record<string, { bg: string; color: string }> = {
                          draft:   { bg: '#f3f4f6', color: '#6b7280' },
                          sent:    { bg: '#fef9c3', color: '#92400e' },
                          paid:    { bg: '#dcfce7', color: '#15803d' },
                          overdue: { bg: '#fee2e2', color: '#dc2626' },
                        }
                        const ss = statusStyle[inv.status] ?? statusStyle.draft
                        return (
                          <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: inv.status === 'paid' ? '#f0fdf4' : '#f8fafc', borderRadius: 7, border: `1px solid ${inv.status === 'paid' ? '#bbf7d0' : '#e2e8f0'}`, fontSize: 13 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(inv.total)}</span>
                              <span style={{ color: '#64748b' }}> · {inv.ref}</span>
                              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ss.bg, color: ss.color, fontWeight: 600, marginLeft: 8 }}>{inv.status}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>Issued: {fmtDate(inv.issueDate)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Payments received from client */}
              {localPayments.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                  <div onClick={() => setShowPayments(v => !v)}
                    style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: showPayments ? 8 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                    <span style={{ fontSize: 10 }}>{showPayments ? '▾' : '▸'}</span>
                    Payments Received — <span style={{ color: '#16a34a', fontFamily: 'monospace' }}>{fmt(localPayments.reduce((s, p) => s + p.amount, 0))}</span>
                  </div>
                  {showPayments && <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[...localPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 7, border: '1px solid #bbf7d0', fontSize: 13 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(p.amount)}</span>
                            <span style={{ color: '#64748b' }}> · {PAYMENT_METHOD_LABELS[p.method]}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtDate(p.paymentDate)}{p.notes ? ` · ${p.notes}` : ''}</div>
                        </div>
                      ))}
                    </div>
                    {revenue !== undefined && (paidTotal + localPayments.reduce((s, p) => s + p.amount, 0)) < revenue && (
                      <div style={{ fontSize: 13, color: '#d97706', fontWeight: 600, marginTop: 8 }}>
                        Outstanding: <span style={{ fontFamily: 'monospace' }}>{fmt(revenue - paidTotal - localPayments.reduce((s, p) => s + p.amount, 0))}</span>
                      </div>
                    )}
                  </>}
                </div>
              )}
              {margin !== null && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
                  <span>Contract value: <strong style={{ fontFamily: 'monospace' }}>{fmt(revenue!)}</strong></span>
                  <span>Actual cost: <strong style={{ fontFamily: 'monospace' }}>{fmt(totalNet)}</strong></span>
                  <span>Margin: <strong style={{ fontFamily: 'monospace', color: margin >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(margin)}{marginPct !== null ? ` (${marginPct}%)` : ''}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Sub Contracts */}
          {!loading && subContracts.length > 0 && (() => {
            const subTotalCommitted = subContracts.reduce((sum, c) => {
              if (c.type === 'fixed') return sum + (c.quoted_amount ?? 0)
              return sum + subEntries.filter(e => e.sub_contract_id === c.id).reduce((s, e) => s + (Number(e.units) * (c.rate_amount ?? 0)), 0)
            }, 0)
            const subTotalPaid = subContracts.reduce((sum, c) => {
              if (c.type === 'fixed') return sum + subStages.filter(s => s.sub_contract_id === c.id && s.paid_date).reduce((s2, s) => s2 + Number(s.amount), 0)
              return sum
            }, 0)
            return (
              <div style={{ border: '1px solid #ede9fe', borderRadius: 10, padding: 14, marginBottom: 16, background: '#faf5ff' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#7c3aed' }}>👷 Sub Contracts</div>
                {subContracts.map(c => {
                  const name = clients.find(cl => cl.id === c.contact_id)?.name ?? '—'
                  const entries = subEntries.filter(e => e.sub_contract_id === c.id)
                  const stages = subStages.filter(s => s.sub_contract_id === c.id)
                  const rateTotal = entries.reduce((s, e) => s + (Number(e.units) * (c.rate_amount ?? 0)), 0)
                  const stagePaid = stages.filter(s => s.paid_date).reduce((s, st) => s + Number(st.amount), 0)
                  return (
                    <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #ede9fe' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{name}</span>
                          {c.description && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{c.description}</span>}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12, flexShrink: 0 }}>
                          {c.type === 'rate' ? (
                            <>
                              <strong style={{ color: '#7c3aed', fontFamily: 'monospace' }}>{fmt(rateTotal)}</strong>
                              <span style={{ color: '#94a3b8', marginLeft: 6 }}>({entries.reduce((s, e) => s + Number(e.units), 0)} {c.rate_type ?? 'day'}s @ {fmt(c.rate_amount ?? 0)})</span>
                            </>
                          ) : (
                            <>
                              <strong style={{ color: '#16a34a', fontFamily: 'monospace' }}>{fmt(stagePaid)}</strong>
                              <span style={{ color: '#94a3b8', marginLeft: 4 }}>paid of</span>
                              <strong style={{ color: '#7c3aed', fontFamily: 'monospace', marginLeft: 4 }}>{fmt(c.quoted_amount ?? 0)}</strong>
                            </>
                          )}
                        </div>
                      </div>
                      {c.type === 'fixed' && stages.length > 0 && (
                        <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {stages.map(s => (
                            <span key={s.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: s.paid_date ? '#dcfce7' : '#f1f5f9', color: s.paid_date ? '#16a34a' : '#64748b' }}>
                              {s.paid_date ? '✓' : '○'} {s.description}: {fmt(Number(s.amount))}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
                  <span>Committed: <strong style={{ fontFamily: 'monospace', color: '#7c3aed' }}>{fmt(subTotalCommitted)}</strong></span>
                  <span>Paid: <strong style={{ fontFamily: 'monospace', color: '#16a34a' }}>{fmt(subTotalPaid)}</strong></span>
                  <span>Outstanding: <strong style={{ fontFamily: 'monospace', color: subTotalCommitted - subTotalPaid > 0 ? '#dc2626' : '#16a34a' }}>{fmt(subTotalCommitted - subTotalPaid)}</strong></span>
                </div>
              </div>
            )
          })()}

          {/* Ledger */}
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>Loading…</div>
          ) : costs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, padding: 28 }}>
              No costs yet. Add one manually, or scan a document in the Settings inbox and allocate it here.
            </div>
          ) : (() => {
            // Three buckets: timesheet (grouped by week), document-sourced, other manual
            const docGroups = new Map<string, JobCost[]>()
            const timesheetWeeks = new Map<string, { ws: string; supplier: string; costs: JobCost[] }>()
            const manualCosts: JobCost[] = []
            costs.forEach(c => {
              if (c.documentId) {
                if (!docGroups.has(c.documentId)) docGroups.set(c.documentId, [])
                docGroups.get(c.documentId)!.push(c)
              } else if (c.source === 'timesheet') {
                const ws = c.docDate ? weekStartOf(c.docDate) : (c.createdAt ? weekStartOf(c.createdAt.slice(0, 10)) : '0000-00-00')
                const key = `${c.supplier}_${ws}`
                if (!timesheetWeeks.has(key)) timesheetWeeks.set(key, { ws, supplier: c.supplier || '', costs: [] })
                timesheetWeeks.get(key)!.costs.push(c)
              } else {
                manualCosts.push(c)
              }
            })

            function cmp<T>(a: T, b: T) {
              if (a < b) return sortDir === 'asc' ? -1 : 1
              if (a > b) return sortDir === 'asc' ? 1 : -1
              return 0
            }

            // Sort key helpers
            function twSortKey(tw: { ws: string; supplier: string; costs: JobCost[] }): string | number {
              const total = tw.costs.reduce((s, c) => s + c.grossAmount, 0)
              const paid = tw.costs.every(c => c.paymentStatus === 'paid')
              if (sortCol === 'date') return tw.ws
              if (sortCol === 'supplier') return tw.supplier.toLowerCase()
              if (sortCol === 'category') return tw.costs[0]?.costCategory ?? ''
              if (sortCol === 'payment') return paid ? 'paid' : 'unpaid'
              if (sortCol === 'gross') return total
              return ''
            }
            function costSortKey(c: JobCost): string | number {
              if (sortCol === 'date') return c.docDate || ''
              if (sortCol === 'supplier') return (c.supplier || '').toLowerCase()
              if (sortCol === 'category') return c.costCategory
              if (sortCol === 'payment') return c.paymentStatus
              if (sortCol === 'gross') return c.grossAmount
              return ''
            }

            const sortedTimesheetWeeks = Array.from(timesheetWeeks.values())
              .map(tw => ({ ...tw, costs: [...tw.costs].sort((a, b) => a.docDate.localeCompare(b.docDate)) }))
              .sort((a, b) => cmp(twSortKey(a), twSortKey(b)))
            const sortedDocEntries = Array.from(docGroups.entries())
              .sort(([, a], [, b]) => cmp(costSortKey(a[0]), costSortKey(b[0])))
            const sortedManual = [...manualCosts].sort((a, b) => cmp(costSortKey(a), costSortKey(b)))

            return (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {byCat.map(({ cat, total }) => (
                    <span key={cat.value} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: cat.bg, color: cat.color, fontWeight: 600 }}>{cat.emoji} {cat.label} {fmt(total)}</span>
                  ))}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {([
                        { label: 'Supplier / receipt', col: 'supplier' as const },
                        { label: 'Date', col: 'date' as const },
                        { label: 'Category', col: 'category' as const },
                        { label: 'Net', col: null },
                        { label: 'VAT', col: null },
                        { label: 'Gross', col: 'gross' as const },
                        { label: 'Payment', col: 'payment' as const },
                        { label: '', col: null },
                      ] as { label: string; col: typeof sortCol | null }[]).map(({ label, col }) => (
                        <th
                          key={label || 'action'}
                          onClick={col ? () => toggleSort(col) : undefined}
                          style={{
                            padding: '6px 8px',
                            textAlign: ['Net', 'VAT', 'Gross'].includes(label) ? 'right' : 'left',
                            fontSize: 10, color: col ? '#1d4ed8' : '#475569',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            cursor: col ? 'pointer' : 'default',
                            userSelect: 'none', whiteSpace: 'nowrap',
                          }}
                        >
                          {label}{col && sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : col ? ' ⇅' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Timesheet week groups */}
                    {sortedTimesheetWeeks.map(tw => {
                      const key = `${tw.supplier}_${tw.ws}`
                      const isOpen = expandedWeeks.has(key)
                      const groupGross = tw.costs.reduce((s, c) => s + c.grossAmount, 0)
                      const groupNet   = tw.costs.reduce((s, c) => s + c.netAmount, 0)
                      const allPaid = tw.costs.every(c => c.paymentStatus === 'paid')
                      const anyPaid = tw.costs.some(c => c.paymentStatus === 'paid')
                      const cm = catMeta(tw.costs[0]?.costCategory ?? 'labour')
                      const payStatus = allPaid ? 'paid' : anyPaid ? 'partial' : 'unpaid'
                      return (
                        <>
                          <tr
                            key={`tw-${key}`}
                            onClick={() => toggleWeek(key)}
                            style={{ borderBottom: isOpen ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', background: isOpen ? '#f0fdf4' : '#f9fffe' }}
                          >
                            <td style={{ padding: '8px 8px' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
                                <span>⏱</span>
                                {tw.supplier || 'Subcontractor'}
                              </div>
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{tw.costs.length} day{tw.costs.length !== 1 ? 's' : ''} · click to {isOpen ? 'hide' : 'expand'}</div>
                            </td>
                            <td style={{ padding: '8px 8px', color: '#374151', fontWeight: 500 }}>{fmtWeekRange(tw.ws)}</td>
                            <td style={{ padding: '8px 8px' }}>
                              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: cm.bg, color: cm.color, fontWeight: 600 }}>{cm.emoji} {cm.label}</span>
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(groupNet)}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>—</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(groupGross)}</td>
                            <td style={{ padding: '8px 8px' }}>
                              <span style={{ fontSize: 10, color: payStatus === 'paid' ? '#16a34a' : payStatus === 'partial' ? '#d97706' : '#dc2626' }}>{payStatus}</span>
                            </td>
                            <td />
                          </tr>
                          {isOpen && tw.costs.map((c, i) => {
                            const dow = new Date(c.docDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                            return (
                              <tr key={c.id} style={{ borderBottom: i === tw.costs.length - 1 ? '1px solid #f1f5f9' : '1px solid #f0fdf4', background: '#f9fffe' }}>
                                <td style={{ padding: '5px 8px 5px 28px', color: '#475569' }}>
                                  {c.description || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>no notes</span>}
                                </td>
                                <td style={{ padding: '5px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>{dow}</td>
                                <td />
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{fmt(c.netAmount)}</td>
                                <td />
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.grossAmount)}</td>
                                <td style={{ padding: '5px 8px' }}>
                                  <span style={{ fontSize: 10, color: c.paymentStatus === 'paid' ? '#16a34a' : '#dc2626' }}>{c.paymentStatus}</span>
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                  <button onClick={e => { e.stopPropagation(); removeCost(c.id) }} title="Delete" style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}

                    {/* Document-grouped rows */}
                    {sortedDocEntries.map(([docId, lines]) => {
                      const first = lines[0]
                      const isOpen = expandedDocs.has(docId)
                      const groupNet   = lines.reduce((s, c) => s + c.netAmount, 0)
                      const groupVat   = lines.reduce((s, c) => s + c.vatAmount, 0)
                      const groupGross = lines.reduce((s, c) => s + c.grossAmount, 0)
                      const cats = [...new Set(lines.map(c => c.costCategory))]
                      return (
                        <>
                          {/* Summary row — clickable */}
                          <tr
                            key={`doc-${docId}`}
                            onClick={() => toggleDoc(docId)}
                            style={{ borderBottom: isOpen ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', background: isOpen ? '#f8fafc' : undefined }}
                          >
                            <td style={{ padding: '8px 8px' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#64748b' }}>{isOpen ? '▲' : '▼'}</span>
                                {first.supplier || '—'}
                                {first.docNumber ? <span style={{ color: '#94a3b8', fontWeight: 400 }}>#{first.docNumber}</span> : null}
                              </div>
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{lines.length} line{lines.length > 1 ? 's' : ''} · click to {isOpen ? 'hide' : 'expand'}</div>
                            </td>
                            <td style={{ padding: '8px 8px', color: '#64748b' }}>{first.docDate || '—'}</td>
                            <td style={{ padding: '8px 8px' }}>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                {cats.map(cat => { const cm = catMeta(cat); return <span key={cat} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: cm.bg, color: cm.color, fontWeight: 600 }}>{cm.emoji}</span> })}
                              </div>
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(groupNet)}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{fmt(groupVat)}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(groupGross)}</td>
                            <td style={{ padding: '8px 8px' }}><span style={{ fontSize: 10, color: first.paymentStatus === 'paid' ? '#16a34a' : first.paymentStatus === 'unpaid' ? '#dc2626' : '#94a3b8' }}>{first.paymentStatus}</span></td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => removeDocGroup(docId, lines)} title="Delete all lines" style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
                            </td>
                          </tr>
                          {/* Expanded line items */}
                          {isOpen && lines.map((c, i) => {
                            const cm = catMeta(c.costCategory)
                            return (
                              <tr key={c.id} style={{ borderBottom: i === lines.length - 1 ? '1px solid #f1f5f9' : '1px solid #f8fafc', background: '#fafbff' }}>
                                <td style={{ padding: '5px 8px 5px 28px', color: '#475569' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {c.description || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>no description</span>}
                                    {c.chargeToClient && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: '#fef3c7', color: '#d97706' }}>💸 Expense</span>}
                                  </span>
                                </td>
                                <td />
                                <td style={{ padding: '5px 8px' }}><span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: cm.bg, color: cm.color, fontWeight: 600 }}>{cm.emoji} {cm.label}</span></td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{fmt(c.netAmount)}</td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{fmt(c.vatAmount)}</td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.grossAmount)}</td>
                                <td />
                                <td />
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}

                    {/* Manual cost rows */}
                    {sortedManual.map(c => {
                      const cm = catMeta(c.costCategory)
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 8px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.supplier || '—'}{c.docNumber ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {c.docNumber}</span> : null}</div>
                            {c.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.description}</div>}
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
                    {costs.some(c => c.chargeToClient) && (() => {
                      const expGross = costs.filter(c => c.chargeToClient).reduce((s, c) => s + c.grossAmount, 0)
                      return (
                        <tr style={{ background: '#fffbeb', borderTop: '1px dashed #fbbf24' }}>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: '#92400e' }} colSpan={3}>
                            💸 Chargeable expenses
                          </td>
                          <td colSpan={2} />
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#d97706' }}>{fmt(expGross)}</td>
                          <td colSpan={2} style={{ padding: '4px 8px', textAlign: 'right' }}>
                            {varRaised
                              ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ Variation raised</span>
                              : <button
                                  onClick={raiseExpenseVariation}
                                  disabled={raisingVar}
                                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 5, cursor: raisingVar ? 'not-allowed' : 'pointer', opacity: raisingVar ? 0.7 : 1, whiteSpace: 'nowrap' }}
                                >
                                  {raisingVar ? 'Raising…' : '↗ Raise variation'}
                                </button>
                            }
                          </td>
                        </tr>
                      )
                    })()}
                  </tfoot>
                </table>
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>{label}</label>{children}</div>
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }
const panel: React.CSSProperties = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }
const btn: React.CSSProperties = { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }
