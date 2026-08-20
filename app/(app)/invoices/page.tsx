'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { ContactPicker } from '@/components/ContactPicker'
import { fmt, fmtK, calcPhaseSell } from '@/lib/utils'
import { stripPhasePrefix } from '@/lib/gantt-utils'
import { buildInvoiceHtml } from '@/lib/invoiceHtml'
import type { Invoice, InvoiceLineItem, PaymentMilestone } from '@/lib/types'

let lineCounter = 0
let milestoneCounter = 0

const BLANK_LINE = (): InvoiceLineItem => ({ id: ++lineCounter, desc: '', qty: 1, unitPrice: 0, total: 0 })
const BLANK_MILESTONE = (): PaymentMilestone => ({
  id: ++milestoneCounter, description: '', amount: 0, dueDate: '', paid: false, paidDate: '',
})

const INV_BADGE: Record<string, string> = {
  draft: 'b-complete', sent: 'b-sent', paid: 'b-accepted', overdue: 'b-onhold',
}
const INV_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function due30Str() {
  const d = new Date(); d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

export default function InvoicesPage() {
  const { invoices, jobs, quotes, clients, settings, addInvoice, updateInvoice, deleteInvoice, loading, getGanttState } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)

  // Form state
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([BLANK_LINE()])
  const [vatOn, setVatOn] = useState(true)
  const [issueDate, setIssueDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState(due30Str())
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<Invoice['status']>('draft')
  const [fromJobId, setFromJobId] = useState('')
  const [saving, setSaving] = useState(false)

  // Payment plan state
  const [payPlanOn, setPayPlanOn] = useState(false)
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<Set<number>>(new Set())
  const [milestoneInvMsg, setMilestoneInvMsg] = useState('')

  // Xero sync state
  const [syncToXero, setSyncToXero] = useState(false)
  const [xeroInvoiceId, setXeroInvoiceId] = useState('')
  const [xeroConnected, setXeroConnected] = useState(false)
  const [xeroTenantName, setXeroTenantName] = useState('')
  const [xeroError, setXeroError] = useState<string | null>(null)
  const [xeroPushing, setXeroPushing] = useState(false)
  const [xeroPulling, setXeroPulling] = useState<string | null>(null) // invoice id being pulled
  const [xeroAutoSyncing, setXeroAutoSyncing] = useState(false)
  const hasAutoSynced = useRef(false)

  useEffect(() => {
    fetch('/api/xero/status')
      .then(r => r.json())
      .then((d: { connected?: boolean; tenantName?: string }) => {
        setXeroConnected(d.connected ?? false)
        setXeroTenantName(d.tenantName ?? '')
      })
      .catch(() => {})
  }, [])

  // Auto-pull all Xero-linked invoices once on page load
  useEffect(() => {
    if (!xeroConnected || loading || hasAutoSynced.current) return
    const linked = invoices.filter(i => !!i.xeroInvoiceId)
    if (!linked.length) return
    hasAutoSynced.current = true
    setXeroAutoSyncing(true)
    Promise.allSettled(
      linked.map(inv =>
        fetch('/api/xero/pull-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xeroInvoiceId: inv.xeroInvoiceId, invoiceId: inv.id }),
        })
          .then(r => r.json() as Promise<{ status?: string }>)
          .then(result => { if (result.status) return updateInvoice({ ...inv, status: result.status as Invoice['status'] }) })
          .catch(() => {})
      )
    ).finally(() => setXeroAutoSyncing(false))
  }, [xeroConnected, loading, invoices, updateInvoice])

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  // Stats
  const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const outstanding = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0)

  function openNew() {
    const days = settings.invoicePaymentDays ?? 30
    const dueDefault = new Date()
    dueDefault.setDate(dueDefault.getDate() + days)
    const dueStr = dueDefault.toISOString().slice(0, 10)

    setEditing(null)
    setClientName(''); setClientAddress(''); setClientEmail('')
    setLineItems([BLANK_LINE()])
    setVatOn(settings.invoiceVatDefault ?? true)
    setIssueDate(todayStr())
    setDueDate(dueStr)
    setNotes(settings.invoiceDefaultNotes ?? '')
    setStatus('draft'); setFromJobId('')
    setPayPlanOn(false); setMilestones([]); setSelectedMilestoneIds(new Set()); setMilestoneInvMsg('')
    setSyncToXero(false); setXeroInvoiceId(''); setXeroError(null)
    setShowModal(true)
  }

  function openEdit(inv: Invoice) {
    setEditing(inv)
    setClientName(inv.clientName); setClientAddress(inv.clientAddress); setClientEmail(inv.clientEmail)
    setLineItems(inv.lineItems.map(l => ({ ...l, id: ++lineCounter })))
    setVatOn(inv.vatIncluded); setIssueDate(inv.issueDate); setDueDate(inv.dueDate)
    setNotes(inv.notes); setStatus(inv.status); setFromJobId(inv.jobId || '')
    const pp = inv.paymentPlan || []
    setPayPlanOn(pp.length > 0)
    setMilestones(pp.map(m => ({ ...m, id: ++milestoneCounter })))
    setSelectedMilestoneIds(new Set()); setMilestoneInvMsg('')
    setSyncToXero(inv.syncToXero ?? false); setXeroInvoiceId(inv.xeroInvoiceId ?? ''); setXeroError(null)
    setShowModal(true)
  }

  function loadFromJob(jobId: string) {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    setClientName(job.client)
    setClientAddress(job.address)
    const linked = quotes.find(q => q.id === job.quoteId) ||
      quotes.find(q => {
        const qn = (q.customer.name || '').toLowerCase()
        const jn = (job.client || '').toLowerCase()
        return qn === jn || qn.includes(jn) || jn.includes(qn)
      })
    if (linked) {
      setClientEmail(linked.customer.email || '')
      const items: InvoiceLineItem[] = linked.phases.map(p => {
        const sell = calcPhaseSell(p, linked.markup)
        return { id: ++lineCounter, desc: p.phase, qty: 1, unitPrice: Math.round(sell * 100) / 100, total: Math.round(sell * 100) / 100 }
      })
      setLineItems(items.length ? items : [BLANK_LINE()])
    } else {
      setLineItems([{ id: ++lineCounter, desc: job.type + ' works', qty: 1, unitPrice: job.value, total: job.value }])
    }
    setFromJobId(jobId)
  }

  function loadMilestonesFromPhases() {
    // Use line items as milestone basis
    const newMilestones: PaymentMilestone[] = lineItems
      .filter(l => l.total > 0)
      .map(l => ({
        id: ++milestoneCounter,
        description: l.desc || 'Payment milestone',
        amount: l.total,
        dueDate: '',
        paid: false,
        paidDate: '',
      }))
    setMilestones(newMilestones.length ? newMilestones : [BLANK_MILESTONE()])
  }

  function buildFromGantt() {
    if (!fromJobId) {
      alert('Please link this invoice to a job first using the "Fill from Job" picker.')
      return
    }
    const job = jobs.find(j => j.id === fromJobId)
    if (!job) return

    const gantt = getGanttState(fromJobId)
    if (!gantt || !gantt.phases.length) {
      alert('No Gantt chart found for this job. Build the schedule on the Jobs page first.')
      return
    }

    const quote = quotes.find(q => q.id === job.quoteId) ||
      quotes.find(q => {
        const qn = (q.customer.name || '').toLowerCase()
        const jn = (job.client || '').toLowerCase()
        return qn === jn || qn.includes(jn) || jn.includes(qn)
      })

    const mkp = quote?.markup ?? 0
    const vatMult = vatOn ? 1.2 : 1
    const jobStart = job.start || issueDate

    const result: PaymentMilestone[] = []

    // Parent-phase rows only (level 0)
    const parentRows = gantt.phases.filter(gp => gp.level === 0)

    for (const gp of parentRows) {
      const phaseStart = addDays(jobStart, gp.startDay)
      const phaseEnd = addDays(jobStart, gp.startDay + gp.durDays)

      let matsSell = 0   // excl VAT
      let restSell = 0   // excl VAT

      if (quote) {
        // Match quote phases by stripping "Phase N – " prefix from both sides
        const strippedLabel = stripPhasePrefix(gp.label)
        const qPhases = quote.phases.filter(qp =>
          stripPhasePrefix(qp.parentPhase?.trim() || qp.phase.trim()) === strippedLabel
        )

        for (const qp of qPhases) {
          const hasLabourTrades = (qp.labourTrades?.length ?? 0) > 0
          for (const item of qp.items) {
            const m = Number(item.materials) || 0
            const l = Number(item.labour) || 0
            const pl = Number(item.plantHire) || 0
            const s = Number(item.subcontractors) || 0
            const o = Number(item.other) || 0

            matsSell += m * (1 + mkp / 100)

            if (item.itemType === 'labour' && hasLabourTrades) {
              restSell += l  // already at sell price — no double markup
            } else {
              restSell += l * (1 + mkp / 100)
            }
            restSell += (pl + s + o) * (1 + mkp / 100)
          }
          // Catalogue products → materials category
          for (const pr of qp.products ?? []) {
            if (pr.enabled !== false) matsSell += pr.sellPrice * pr.qty
          }
          // Plant hire catalogue → rest (plant)
          for (const pl of qp.plantItems ?? []) {
            if (pl.enabled !== false) restSell += pl.sellPrice * pl.qty
          }
        }
      }

      const matsTotal = Math.round(matsSell * vatMult * 100) / 100
      const restTotal = Math.round(restSell * vatMult * 100) / 100

      if (matsTotal > 0) {
        result.push({
          id: ++milestoneCounter,
          description: `${gp.label} — Materials`,
          amount: matsTotal,
          dueDate: phaseStart,
          paid: false,
          paidDate: '',
        })
      }
      if (restTotal > 0) {
        result.push({
          id: ++milestoneCounter,
          description: `${gp.label} — Labour & Costs`,
          amount: restTotal,
          dueDate: phaseEnd,
          paid: false,
          paidDate: '',
        })
      }
    }

    if (result.length === 0) {
      alert('Could not generate milestones. Make sure the job has a linked quote and a Gantt chart.')
      return
    }

    setMilestones(result)
    setPayPlanOn(true)
  }

  async function createInvoiceFromMilestones() {
    const selected = milestones.filter(m => selectedMilestoneIds.has(m.id))
    if (!selected.length) return

    // Milestone amounts from buildFromGantt include VAT when vatOn=true.
    // Strip VAT back out so the new invoice can display net + VAT correctly.
    const subItems: InvoiceLineItem[] = selected.map(m => {
      const unitP = vatOn
        ? Math.round((m.amount / 1.2) * 100) / 100
        : m.amount
      return { id: ++lineCounter, desc: m.description || 'Payment milestone', qty: 1, unitPrice: unitP, total: unitP }
    })

    const subTotal = Math.round(subItems.reduce((s, l) => s + l.total, 0) * 100) / 100
    const vatAmt   = vatOn ? Math.round(subTotal * 0.2 * 100) / 100 : 0
    const invTotal = Math.round((subTotal + vatAmt) * 100) / 100

    // Use earliest due date from selected milestones
    const dueDates = selected.map(m => m.dueDate).filter(Boolean).sort()
    const invDue   = dueDates[0] || dueDate

    const newInv = await addInvoice({
      jobId: fromJobId, quoteId: '',
      clientName, clientAddress, clientEmail,
      lineItems: subItems,
      subtotal: subTotal, vatIncluded: vatOn, vatAmount: vatAmt, total: invTotal,
      status: 'draft',
      issueDate: todayStr(), dueDate: invDue,
      notes: settings.invoiceDefaultNotes ?? '',
      paymentPlan: null, syncToXero: xeroConnected,
    })

    setSelectedMilestoneIds(new Set())

    // Push to Xero immediately if connected — mirrors what handleSave does
    if (xeroConnected) {
      try {
        const res = await fetch('/api/xero/push-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice: newInv }),
        })
        const result = await res.json() as { xeroInvoiceId?: string; error?: string }
        if (result.xeroInvoiceId) {
          await updateInvoice({ ...newInv, xeroInvoiceId: result.xeroInvoiceId })
          setMilestoneInvMsg(`✓ ${newInv.ref} created and synced to Xero`)
        } else {
          setMilestoneInvMsg(`✓ ${newInv.ref} created — Xero sync failed: ${result.error ?? 'unknown error'}`)
        }
      } catch {
        setMilestoneInvMsg(`✓ ${newInv.ref} created — could not reach Xero`)
      }
    } else {
      setMilestoneInvMsg(`✓ ${newInv.ref} created — find it in the invoices list to send to the client`)
    }

    setTimeout(() => setMilestoneInvMsg(''), 7000)
  }

  function updateLine(id: number, key: keyof InvoiceLineItem, val: string | number) {
    setLineItems(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [key]: val }
      updated.total = Math.round(updated.qty * updated.unitPrice * 100) / 100
      return updated
    }))
  }

  function updateMilestone(id: number, key: keyof PaymentMilestone, val: string | number | boolean) {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, [key]: val } : m))
  }

  const subtotal = lineItems.reduce((s, l) => s + (l.total || 0), 0)
  const vatAmount = vatOn ? Math.round(subtotal * 0.2 * 100) / 100 : 0
  const total = subtotal + vatAmount
  const milestonesTotal = milestones.reduce((s, m) => s + (m.amount || 0), 0)
  const milestoneDiff = Math.round((total - milestonesTotal) * 100) / 100

  async function handleSave() {
    setSaving(true)
    setXeroError(null)
    try {
      const paymentPlan = payPlanOn && milestones.length > 0 ? milestones : null
      // Calculate prior invoice totals for the contract account summary on the printed invoice
      const priorInvs = fromJobId && !editing
        ? invoices.filter(i => i.jobId === fromJobId)
        : []
      const priorInvoicedTotal = priorInvs.length > 0
        ? priorInvs.reduce((s, i) => s + (i.total || 0), 0)
        : undefined
      const priorPaidTotal = priorInvs.length > 0
        ? priorInvs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
        : undefined
      const invData = {
        jobId: fromJobId, quoteId: '', clientName, clientAddress, clientEmail,
        lineItems, subtotal, vatIncluded: vatOn, vatAmount, total,
        status, issueDate, dueDate, notes, paymentPlan,
        syncToXero, xeroInvoiceId: xeroInvoiceId || undefined,
        priorInvoicedTotal, priorPaidTotal,
      }

      let savedInv: Invoice
      if (editing) {
        const merged: Invoice = { ...editing, ...invData }
        await updateInvoice(merged)
        savedInv = merged
      } else {
        savedInv = await addInvoice(invData)
      }

      // Push to Xero if toggle is ON, Xero is connected, and not already pushed
      if (syncToXero && xeroConnected && !xeroInvoiceId) {
        setXeroPushing(true)
        try {
          const res = await fetch('/api/xero/push-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice: savedInv }),
          })
          const result = await res.json() as { xeroInvoiceId?: string; error?: string }
          if (result.xeroInvoiceId) {
            setXeroInvoiceId(result.xeroInvoiceId)
            await updateInvoice({ ...savedInv, xeroInvoiceId: result.xeroInvoiceId })
          } else {
            setXeroError(result.error ?? 'Xero push failed — invoice saved locally, you can retry from the card.')
            setXeroPushing(false)
            setSaving(false)
            return // stay in modal so user can see the error
          }
        } catch {
          setXeroError('Could not reach Xero — invoice saved locally.')
          setXeroPushing(false)
          setSaving(false)
          return
        }
        setXeroPushing(false)
      }

      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleXeroPush(inv: Invoice) {
    setXeroError(null)
    setXeroPushing(true)
    try {
      const res = await fetch('/api/xero/push-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice: inv }),
      })
      const result = await res.json() as { xeroInvoiceId?: string; error?: string }
      if (result.xeroInvoiceId) {
        await updateInvoice({ ...inv, xeroInvoiceId: result.xeroInvoiceId })
      } else {
        alert(result.error ?? 'Xero push failed')
      }
    } catch {
      alert('Could not reach Xero')
    } finally {
      setXeroPushing(false)
    }
  }

  async function handleXeroPull(inv: Invoice) {
    if (!inv.xeroInvoiceId) return
    setXeroPulling(inv.id)
    try {
      const res = await fetch('/api/xero/pull-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xeroInvoiceId: inv.xeroInvoiceId, invoiceId: inv.id }),
      })
      const result = await res.json() as { status?: string; xeroStatus?: string; error?: string }
      if (result.status) {
        await updateInvoice({ ...inv, status: result.status as Invoice['status'] })
      } else {
        alert(result.error ?? 'Could not fetch status from Xero')
      }
    } catch {
      alert('Could not reach Xero')
    } finally {
      setXeroPulling(null)
    }
  }

  function handlePrint(inv: Invoice) {
    const html = buildInvoiceHtml(inv, settings)
    const w = window.open('', '_blank')
    if (!w) { alert('Pop-up blocked — please allow pop-ups.'); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  function handleDownload(inv: Invoice) {
    const html = buildInvoiceHtml(inv, settings)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Invoice-${inv.ref}-${inv.clientName.replace(/[^a-z0-9]/gi, '_')}.html`
    a.click()
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Delete invoice ${inv.ref}? This cannot be undone.`)) return
    await deleteInvoice(inv.id)
  }

  return (
    <>
      {xeroAutoSyncing && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          ⟳ Syncing invoice statuses with Xero…
        </div>
      )}
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat green">
          <div className="stat-label">Total Invoiced</div>
          <div className="stat-val">{fmtK(totalInvoiced)}</div>
          <div className="stat-sub">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">Paid</div>
          <div className="stat-val">{fmtK(paid)}</div>
          <div className="stat-sub">{invoices.filter(i => i.status === 'paid').length} invoices</div>
        </div>
        <div className="stat sky">
          <div className="stat-label">Outstanding</div>
          <div className="stat-val">{fmtK(outstanding)}</div>
          <div className="stat-sub">Awaiting payment</div>
        </div>
        <div className="stat terra">
          <div className="stat-label">Overdue</div>
          <div className="stat-val">{fmtK(overdue)}</div>
          <div className="stat-sub">{invoices.filter(i => i.status === 'overdue').length} overdue</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
      </div>

      {!invoices.length
        ? <div className="empty-dashed">
            <div style={{ fontSize: 14, marginBottom: 6 }}>No invoices yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Create your first invoice from a job or from scratch.</div>
            <button className="btn btn-primary" onClick={openNew}>+ New Invoice</button>
          </div>
        : invoices.map(inv => (
            <div key={inv.id} className="sq-card" style={
              inv.status === 'paid' ? { borderLeft: '3px solid #7ab533' } :
              inv.status === 'overdue' ? { borderLeft: '3px solid #c0392b' } : {}
            }>
              <div className="sq-ref" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)', minWidth: 72 }}>{inv.ref}</div>
              <div className="sq-info">
                <div className="sq-title">{inv.clientName || '—'}</div>
                <div className="sq-sub">
                  Issued {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-GB') : '—'}
                  {' · '}Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB') : '—'}
                  {inv.paymentPlan && inv.paymentPlan.length > 0 && (
                    <span style={{ marginLeft: 6, color: 'var(--sky)', fontWeight: 600 }}>
                      · {inv.paymentPlan.filter(m => m.paid).length}/{inv.paymentPlan.length} milestones paid
                    </span>
                  )}
                </div>
              </div>
              <div className="sq-val">{fmt(inv.total)}</div>
              <div style={{ textAlign: 'center', minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${INV_BADGE[inv.status] || 'b-complete'}`}>{INV_LABEL[inv.status] || inv.status}</span>
                  {inv.syncToXero && (
                    inv.xeroInvoiceId
                      ? <button
                          onClick={() => handleXeroPull(inv)}
                          disabled={xeroPulling === inv.id}
                          title="Refresh status from Xero"
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', cursor: 'pointer' }}
                        >
                          {xeroPulling === inv.id ? '⟳' : '🔗 Xero ↻'}
                        </button>
                      : <button
                          onClick={() => handleXeroPush(inv)}
                          disabled={xeroPushing}
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fff8e1', color: '#795548', border: '1px solid #ffe082', cursor: 'pointer' }}
                        >
                          {xeroPushing ? '⟳' : '⟳ Xero Push'}
                        </button>
                  )}
                </div>
                <div className="sq-actions" style={{ marginTop: 6 }}>
                  <button className="btn-sm btn-primary" onClick={() => openEdit(inv)}>✎ Edit</button>
                  <button className="btn-sm btn-outline" onClick={() => handlePrint(inv)}>🖨 Print</button>
                  <button className="btn-sm btn-outline" onClick={() => handleDownload(inv)}>⬇ PDF</button>
                  <select value={inv.status} onChange={e => updateInvoice({ ...inv, status: e.target.value as Invoice['status'] })}
                    style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(inv)}>✕</button>
                </div>
              </div>
            </div>
          ))
      }

      {/* Invoice modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="form-modal" style={{ width: 'min(700px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editing ? 'Edit Invoice ' + editing.ref : 'New Invoice'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-modal-bd">

              {/* From job picker */}
              {!editing && (
                <div className="fg">
                  <label>Fill from Job (optional)</label>
                  <select value={fromJobId} onChange={e => { setFromJobId(e.target.value); if (e.target.value) loadFromJob(e.target.value) }}>
                    <option value="">— Select a job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.type} — {j.client}</option>)}
                  </select>
                </div>
              )}

              {/* Previously invoiced summary */}
              {fromJobId && (() => {
                const priorInvs = invoices.filter(i => i.jobId === fromJobId && i.id !== editing?.id)
                if (priorInvs.length === 0) return null
                const priorTotal = priorInvs.reduce((s, i) => s + (i.total || 0), 0)
                const priorPaid  = priorInvs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
                const priorUnpaid = priorTotal - priorPaid
                return (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: '#f8f5f0', border: '1px solid var(--border)', fontSize: 12, marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: 'var(--ink)' }}>Previously invoiced on this job</div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--muted)' }}>Invoiced to date: <strong style={{ color: 'var(--ink)', fontFamily: 'DM Mono, monospace' }}>{fmt(priorTotal)}</strong></span>
                      <span style={{ color: 'var(--muted)' }}>Paid: <strong style={{ color: '#7ab533', fontFamily: 'DM Mono, monospace' }}>{fmt(priorPaid)}</strong></span>
                      {priorUnpaid > 0 && <span style={{ color: 'var(--muted)' }}>Outstanding: <strong style={{ color: '#d97706', fontFamily: 'DM Mono, monospace' }}>{fmt(priorUnpaid)}</strong></span>}
                    </div>
                  </div>
                )
              })()}

              <div className="row2">
                <div className="fg">
                  <label>Customer</label>
                  <ContactPicker
                    value={clients.find(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase())?.id ?? ''}
                    onChange={id => {
                      const c = clients.find(cl => cl.id === id)
                      if (c) {
                        setClientName(c.name)
                        if (c.email) setClientEmail(c.email)
                        if (c.address) setClientAddress(c.address)
                      } else {
                        setClientName('')
                      }
                    }}
                    contacts={clients.map(c => ({ id: c.id, name: c.name }))}
                    placeholder="Search customer…"
                  />
                  {!clients.some(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase()) && (
                    <input
                      style={{ marginTop: 6 }}
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Or type a name (won't link to a contact)"
                    />
                  )}
                </div>
                <div className="fg">
                  <label>Client Email</label>
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" />
                </div>
              </div>
              <div className="fg">
                <label>Client Address</label>
                <textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} rows={2} />
              </div>

              <div className="row2">
                <div className="fg">
                  <label>Issue Date</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
                </div>
                <div className="fg">
                  <label>Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {/* Line items */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)' }}>Line Items</label>
                  <button className="btn-sm btn-outline" onClick={() => setLineItems(p => [...p, BLANK_LINE()])}>+ Add Line</button>
                </div>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 28px', gap: 0, background: '#f0f2f4', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)' }}>
                    <span>Description</span><span style={{ textAlign: 'center' }}>Qty</span><span style={{ textAlign: 'right' }}>Unit Price</span><span style={{ textAlign: 'right' }}>Total</span><span />
                  </div>
                  {lineItems.map(l => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 28px', gap: 0, borderTop: '1px solid var(--border)', padding: '4px 6px', alignItems: 'center' }}>
                      <input value={l.desc} onChange={e => updateLine(l.id, 'desc', e.target.value)} placeholder="Description" style={{ border: 'none', outline: 'none', fontSize: 13, padding: '4px 4px' }} />
                      <input type="number" value={l.qty} onChange={e => updateLine(l.id, 'qty', Number(e.target.value))} style={{ border: 'none', outline: 'none', fontSize: 13, textAlign: 'center', padding: '4px 2px' }} />
                      <input type="number" value={l.unitPrice} onChange={e => updateLine(l.id, 'unitPrice', Number(e.target.value))} style={{ border: 'none', outline: 'none', fontSize: 13, textAlign: 'right', padding: '4px 4px' }} />
                      <span style={{ fontSize: 13, textAlign: 'right', fontFamily: 'DM Mono, monospace', padding: '0 4px' }}>{fmt(l.total)}</span>
                      <button className="rm-btn" onClick={() => setLineItems(p => p.filter(x => x.id !== l.id))}>×</button>
                    </div>
                  ))}
                  <div style={{ borderTop: '1.5px solid var(--border)', padding: '10px 14px', background: '#f8f9fa' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>Subtotal</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right' }}>{fmt(subtotal)}</span>
                    </div>
                    {vatOn && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--muted)' }}>VAT (20%)</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right' }}>{fmt(vatAmount)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 15, fontWeight: 700 }}>
                      <span>Total</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', minWidth: 80, textAlign: 'right', color: '#7ab533' }}>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 8 }}>
                  <input type="checkbox" checked={vatOn} onChange={e => setVatOn(e.target.checked)} style={{ width: 'auto' }} />
                  Include VAT (20%)
                </label>
              </div>

              {/* ── Payment Plan ── */}
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: payPlanOn ? 14 : 0 }}>
                  <input
                    type="checkbox"
                    checked={payPlanOn}
                    onChange={e => {
                      setPayPlanOn(e.target.checked)
                      if (e.target.checked && milestones.length === 0) setMilestones([BLANK_MILESTONE()])
                    }}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Payment Plan</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Split this invoice into milestone payments</div>
                  </div>
                </label>

                {payPlanOn && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="btn-sm btn-sky" onClick={loadMilestonesFromPhases}>
                        ↓ Load from line items
                      </button>
                      {fromJobId && (
                        <button className="btn-sm btn-sky" onClick={buildFromGantt} title="Materials at phase start, labour & costs at phase end">
                          📅 Build from Gantt
                        </button>
                      )}
                      <button className="btn-sm btn-outline" onClick={() => setMilestones(p => [...p, BLANK_MILESTONE()])}>
                        + Add milestone
                      </button>
                      {selectedMilestoneIds.size > 0 && (
                        <button className="btn-sm btn-primary" onClick={createInvoiceFromMilestones} style={{ marginLeft: 'auto' }}>
                          📄 Invoice {selectedMilestoneIds.size} selected
                        </button>
                      )}
                    </div>

                    {milestoneInvMsg && (
                      <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0f7e6', border: '1px solid #b7dfa0', borderRadius: 6, fontSize: 12, color: '#2e6b1a', fontWeight: 600 }}>
                        {milestoneInvMsg}
                      </div>
                    )}

                    {/* Milestones table */}
                    <div style={{ border: '1.5px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 100px 110px 80px 28px', gap: 0, background: '#f0f2f4', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto', cursor: 'pointer' }}
                          checked={milestones.length > 0 && milestones.every(m => selectedMilestoneIds.has(m.id))}
                          onChange={e => setSelectedMilestoneIds(e.target.checked ? new Set(milestones.map(m => m.id)) : new Set())}
                        />
                        <span>Description</span><span style={{ textAlign: 'right' }}>Amount</span><span style={{ textAlign: 'center' }}>Due Date</span><span style={{ textAlign: 'center' }}>Paid</span><span />
                      </div>
                      {/* Read-only rows for prior invoices on the same job */}
                      {fromJobId && invoices
                        .filter(i => i.jobId === fromJobId && i.id !== editing?.id)
                        .map(i => (
                          <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 100px 110px 80px 28px', gap: 0, borderTop: '1px solid var(--border)', padding: '4px 6px', alignItems: 'center', background: i.status === 'paid' ? '#f0f7e6' : '#fffbf0', opacity: 0.85 }}>
                            <span />
                            <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                              {i.ref} — {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                            </span>
                            <span style={{ textAlign: 'right', fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--muted)', paddingRight: 4 }}>{fmt(i.total)}</span>
                            <span style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{i.dueDate || '—'}</span>
                            <span style={{ textAlign: 'center', fontSize: 13 }}>{i.status === 'paid' ? <span style={{ color: '#7ab533', fontWeight: 700 }}>✓</span> : '—'}</span>
                            <span />
                          </div>
                        ))
                      }
                      {milestones.map(m => (
                        <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 100px 110px 80px 28px', gap: 0, borderTop: '1px solid var(--border)', padding: '4px 6px', alignItems: 'center', background: selectedMilestoneIds.has(m.id) ? '#f0f7e6' : undefined }}>
                          <input
                            type="checkbox"
                            checked={selectedMilestoneIds.has(m.id)}
                            onChange={e => setSelectedMilestoneIds(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.add(m.id) : next.delete(m.id)
                              return next
                            })}
                            style={{ width: 'auto', cursor: 'pointer' }}
                          />
                          <input
                            value={m.description}
                            onChange={e => updateMilestone(m.id, 'description', e.target.value)}
                            placeholder="e.g. Site Establishment — Materials"
                            style={{ border: 'none', outline: 'none', fontSize: 13, padding: '4px 4px' }}
                          />
                          <input
                            type="number"
                            value={m.amount || ''}
                            onChange={e => updateMilestone(m.id, 'amount', Number(e.target.value))}
                            placeholder="0.00"
                            style={{ border: 'none', outline: 'none', fontSize: 13, textAlign: 'right', padding: '4px 4px', fontFamily: 'DM Mono, monospace' }}
                          />
                          <input
                            type="date"
                            value={m.dueDate}
                            onChange={e => updateMilestone(m.id, 'dueDate', e.target.value)}
                            style={{ border: 'none', outline: 'none', fontSize: 12, padding: '4px 4px' }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <input
                              type="checkbox"
                              checked={m.paid}
                              onChange={e => {
                                updateMilestone(m.id, 'paid', e.target.checked)
                                if (e.target.checked) updateMilestone(m.id, 'paidDate', new Date().toISOString().split('T')[0])
                                else updateMilestone(m.id, 'paidDate', '')
                              }}
                              style={{ width: 'auto', cursor: 'pointer' }}
                            />
                            {m.paid && <span style={{ fontSize: 11, color: '#7ab533', fontWeight: 700 }}>✓</span>}
                          </div>
                          <button className="rm-btn" onClick={() => setMilestones(p => p.filter(x => x.id !== m.id))}>×</button>
                        </div>
                      ))}
                    </div>

                    {/* Running total check */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', borderRadius: 6, background: Math.abs(milestoneDiff) > 0.01 ? '#fff3cd' : '#f0f7e6' }}>
                      <span style={{ color: 'var(--muted)' }}>
                        Milestones total: <strong style={{ fontFamily: 'DM Mono, monospace' }}>{fmt(milestonesTotal)}</strong>
                        {' · '}Invoice total: <strong style={{ fontFamily: 'DM Mono, monospace' }}>{fmt(total)}</strong>
                      </span>
                      {Math.abs(milestoneDiff) > 0.01
                        ? <span style={{ color: '#856404', fontWeight: 600 }}>⚠ {fmt(Math.abs(milestoneDiff))} {milestoneDiff > 0 ? 'under' : 'over'}</span>
                        : <span style={{ color: '#7ab533', fontWeight: 600 }}>✓ Balanced</span>
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* ── Xero Sync ── */}
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: syncToXero ? 12 : 0 }}>
                  <input
                    type="checkbox"
                    checked={syncToXero}
                    onChange={e => { setSyncToXero(e.target.checked); setXeroError(null) }}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>🔗 Sync to Xero Accounting</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Push this invoice to Xero as a sales invoice — cost is always tracked here regardless</div>
                  </div>
                </label>

                {syncToXero && (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: '#f8f9fa', border: '1px solid var(--border)', fontSize: 13 }}>
                    {xeroConnected ? (
                      xeroInvoiceId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ color: '#2e7d32', fontWeight: 600 }}>✓ Synced to Xero</span>
                          <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>{xeroInvoiceId.slice(0, 8)}…</span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!editing) return
                              setXeroError(null); setXeroPushing(true)
                              try {
                                const res = await fetch('/api/xero/push-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice: { ...editing, xeroInvoiceId } }) })
                                const r = await res.json() as { xeroInvoiceId?: string; error?: string }
                                if (r.xeroInvoiceId) setXeroInvoiceId(r.xeroInvoiceId)
                                else setXeroError(r.error ?? 'Re-sync failed')
                              } catch { setXeroError('Could not reach Xero') }
                              setXeroPushing(false)
                            }}
                            disabled={xeroPushing}
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #a5d6a7', background: '#e8f5e9', color: '#2e7d32', cursor: 'pointer' }}
                          >{xeroPushing ? 'Syncing…' : '↻ Re-sync'}</button>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--muted)' }}>
                          Connected: <strong>{xeroTenantName}</strong>
                          <span style={{ marginLeft: 8, fontSize: 12 }}>— invoice will be pushed to Xero when saved</span>
                        </div>
                      )
                    ) : (
                      <div style={{ color: '#856404', background: '#fff3cd', borderRadius: 4, padding: '8px 10px', fontSize: 12 }}>
                        ⚠ Xero not connected. Go to <strong>Settings → Integrations</strong> to connect your Xero account.
                      </div>
                    )}
                    {xeroError && (
                      <div style={{ marginTop: 8, color: '#c0392b', fontSize: 12, background: '#fdf2f2', borderRadius: 4, padding: '6px 10px' }}>
                        ⚠ {xeroError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="fg">
                <label>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Payment details, bank info, etc." />
              </div>

              <div className="fg">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as Invoice['status'])}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || xeroPushing}>
                {xeroPushing ? '🔗 Syncing to Xero…' : saving ? 'Saving…' : editing ? 'Update Invoice' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
