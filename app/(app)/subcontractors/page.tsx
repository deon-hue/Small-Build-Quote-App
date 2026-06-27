'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { ContactPicker } from '@/components/ContactPicker'
import { signedDocUrl } from '@/lib/job-costs'

interface Contract {
  id: string
  job_id: string | null
  contact_id: string | null
  type: 'rate' | 'fixed'
  description: string
  rate_type: 'hourly' | 'daily' | null
  rate_amount: number | null
  quoted_amount: number | null
  status: 'active' | 'completed' | 'cancelled'
  notes: string
  quote_document_id: string | null
  created_at: string
}

interface TimeEntry {
  id: string
  sub_contract_id: string
  entry_date: string
  units: number
  notes: string
  created_at: string
}

interface PaymentStage {
  id: string
  sub_contract_id: string
  description: string
  amount: number
  due_date: string | null
  paid_date: string | null
  xero_bill_id: string | null
  created_at: string
}

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)

export default function SubcontractorsPage() {
  const sb = createClient()
  const { jobs, clients } = useApp()
  const subs = clients.filter(c => c.clientType === 'subcontractor' || c.clientType === 'supplier')

  const [contracts, setContracts] = useState<Contract[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [stages, setStages] = useState<PaymentStage[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [xeroPushing, setXeroPushing] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  // Contract modal
  const emptyForm = { contactId: '', jobId: '', type: 'rate' as 'rate' | 'fixed', description: '', rateType: 'daily' as 'hourly' | 'daily', rateAmount: '', quotedAmount: '', notes: '', status: 'active' as 'active' | 'completed' | 'cancelled' }
  const [contractModal, setContractModal] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Time entry modal
  const emptyEntry = { entryDate: today(), units: '', notes: '' }
  const [entryModal, setEntryModal] = useState(false)
  const [entryContractId, setEntryContractId] = useState('')
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [entryForm, setEntryForm] = useState(emptyEntry)

  // Payment stage modal
  const emptyStage = { description: '', amount: '', dueDate: '', paidDate: '' }
  const [stageModal, setStageModal] = useState(false)
  const [stageContractId, setStageContractId] = useState('')
  const [editingStage, setEditingStage] = useState<PaymentStage | null>(null)
  const [stageForm, setStageForm] = useState(emptyStage)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: cs }, { data: es }, { data: ps }] = await Promise.all([
      sb.from('sub_contracts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      sb.from('sub_time_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: true }),
      sb.from('sub_payment_stages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    setContracts((cs ?? []) as Contract[])
    setTimeEntries((es ?? []) as TimeEntry[])
    setStages((ps ?? []) as PaymentStage[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Derived helpers
  const contactName = (id: string | null) => id ? (clients.find(c => c.id === id)?.name ?? '—') : '—'
  const jobName = (id: string | null) => id ? (jobs.find(j => j.id === id)?.client ?? jobs.find(j => j.id === id)?.address ?? '—') : '—'
  const contractEntries = (cid: string) => timeEntries.filter(e => e.sub_contract_id === cid)
  const contractStages = (cid: string) => stages.filter(s => s.sub_contract_id === cid)

  const rateTotal = (c: Contract) => {
    const entries = contractEntries(c.id)
    return entries.reduce((sum, e) => sum + (Number(e.units) * (c.rate_amount ?? 0)), 0)
  }
  const stagePaid = (cid: string) => contractStages(cid).filter(s => s.paid_date).reduce((sum, s) => sum + Number(s.amount), 0)
  const stageTotal = (cid: string) => contractStages(cid).reduce((sum, s) => sum + Number(s.amount), 0)

  // Summary totals
  const activeContracts = contracts.filter(c => c.status === 'active')
  const totalFixedContracted = activeContracts.filter(c => c.type === 'fixed').reduce((sum, c) => sum + (c.quoted_amount ?? 0), 0)
  const totalFixedPaid = activeContracts.filter(c => c.type === 'fixed').reduce((sum, c) => sum + stagePaid(c.id), 0)
  const totalRateLogged = activeContracts.filter(c => c.type === 'rate').reduce((sum, c) => sum + rateTotal(c), 0)

  // Filtered list
  const filtered = contracts.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (typeFilter && c.type !== typeFilter) return false
    if (jobFilter && c.job_id !== jobFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = contactName(c.contact_id).toLowerCase()
      const job = jobName(c.job_id).toLowerCase()
      const desc = c.description.toLowerCase()
      if (!name.includes(q) && !job.includes(q) && !desc.includes(q)) return false
    }
    return true
  })

  // Toggle expand
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Contract save
  async function saveContract() {
    if (!form.contactId) { setError('Select a subcontractor'); return }
    if (!form.description.trim()) { setError('Enter a description'); return }
    if (form.type === 'rate' && !form.rateAmount) { setError('Enter a rate amount'); return }
    if (form.type === 'fixed' && !form.quotedAmount) { setError('Enter a quoted amount'); return }

    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      user_id: user.id,
      contact_id: form.contactId,
      job_id: form.jobId || null,
      type: form.type,
      description: form.description.trim(),
      rate_type: form.type === 'rate' ? form.rateType : null,
      rate_amount: form.type === 'rate' ? Number(form.rateAmount) : null,
      quoted_amount: form.type === 'fixed' ? Number(form.quotedAmount) : null,
      notes: form.notes.trim(),
      status: form.status,
    }

    if (editingContract) {
      await sb.from('sub_contracts').update(payload).eq('id', editingContract.id)
    } else {
      await sb.from('sub_contracts').insert(payload)
    }
    setContractModal(false)
    await load()
    setSaving(false)
  }

  function openNewContract() {
    setEditingContract(null)
    setForm(emptyForm)
    setError('')
    setContractModal(true)
  }

  function openEditContract(c: Contract) {
    setEditingContract(c)
    setForm({
      contactId: c.contact_id ?? '',
      jobId: c.job_id ?? '',
      type: c.type,
      description: c.description,
      rateType: c.rate_type ?? 'daily',
      rateAmount: c.rate_amount?.toString() ?? '',
      quotedAmount: c.quoted_amount?.toString() ?? '',
      notes: c.notes,
      status: c.status,
    })
    setError('')
    setContractModal(true)
  }

  async function deleteContract(id: string) {
    if (!confirm('Delete this sub contract and all its entries/stages?')) return
    await sb.from('sub_contracts').delete().eq('id', id)
    await load()
  }

  // Time entry save
  async function saveEntry() {
    if (!entryForm.units || Number(entryForm.units) <= 0) { setError('Enter units'); return }
    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      user_id: user.id,
      sub_contract_id: entryContractId,
      entry_date: entryForm.entryDate,
      units: Number(entryForm.units),
      notes: entryForm.notes.trim(),
    }

    if (editingEntry) {
      await sb.from('sub_time_entries').update(payload).eq('id', editingEntry.id)
    } else {
      await sb.from('sub_time_entries').insert(payload)
    }
    setEntryModal(false)
    await load()
    setSaving(false)
  }

  function openNewEntry(contractId: string) {
    setEntryContractId(contractId)
    setEditingEntry(null)
    setEntryForm(emptyEntry)
    setError('')
    setEntryModal(true)
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this time entry?')) return
    await sb.from('sub_time_entries').delete().eq('id', id)
    await load()
  }

  // Stage save
  async function saveStage() {
    if (!stageForm.description.trim()) { setError('Enter a description'); return }
    if (!stageForm.amount || Number(stageForm.amount) <= 0) { setError('Enter an amount'); return }
    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      user_id: user.id,
      sub_contract_id: stageContractId,
      description: stageForm.description.trim(),
      amount: Number(stageForm.amount),
      due_date: stageForm.dueDate || null,
      paid_date: stageForm.paidDate || null,
    }

    if (editingStage) {
      await sb.from('sub_payment_stages').update(payload).eq('id', editingStage.id)
    } else {
      await sb.from('sub_payment_stages').insert(payload)
    }
    setStageModal(false)
    await load()
    setSaving(false)
  }

  function openNewStage(contractId: string) {
    setStageContractId(contractId)
    setEditingStage(null)
    setStageForm(emptyStage)
    setError('')
    setStageModal(true)
  }

  function openEditStage(stage: PaymentStage) {
    setStageContractId(stage.sub_contract_id)
    setEditingStage(stage)
    setStageForm({ description: stage.description, amount: stage.amount.toString(), dueDate: stage.due_date ?? '', paidDate: stage.paid_date ?? '' })
    setError('')
    setStageModal(true)
  }

  async function deleteStage(id: string) {
    if (!confirm('Delete this payment stage?')) return
    await sb.from('sub_payment_stages').delete().eq('id', id)
    await load()
  }

  async function pushStageToXero(stage: PaymentStage) {
    setXeroPushing(stage.id)
    setError('')
    try {
      const res = await fetch('/api/xero/push-sub-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageId: stage.id }) })
      const data = await res.json() as { xeroBillId?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'Xero push failed'); return }
      await load()
    } catch {
      setError('Network error — could not push to Xero')
    } finally {
      setXeroPushing(null)
    }
  }

  async function viewQuoteDoc(docId: string) {
    const { data: doc } = await sb.from('job_documents').select('storage_path, mime_type').eq('id', docId).single()
    if (!doc) return
    const url = await signedDocUrl(sb, doc.storage_path as string)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function unlinkQuoteDoc(contractId: string) {
    await sb.from('sub_contracts').update({ quote_document_id: null }).eq('id', contractId)
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, quote_document_id: null } : c))
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 32, textAlign: 'center', opacity: 0.5 }}>Loading subcontractors…</div>

  const card = (label: string, value: string, sub?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', minWidth: 150 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const btn = (label: string, onClick: () => void, variant: 'primary' | 'ghost' | 'danger' = 'ghost', small = false) => (
    <button onClick={onClick} style={{
      fontSize: small ? 11 : 13, padding: small ? '3px 8px' : '7px 14px',
      background: variant === 'primary' ? '#111827' : variant === 'danger' ? '#fee2e2' : '#f9fafb',
      color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#dc2626' : '#374151',
      border: `1px solid ${variant === 'primary' ? '#111827' : variant === 'danger' ? '#fca5a5' : '#d1d5db'}`,
      borderRadius: 5, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <div style={{ padding: '24px 24px 80px' }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {card('Active Contracts', String(activeContracts.length), 'sub contracts')}
        {card('Fixed — Contracted', fmt(totalFixedContracted), `${fmt(totalFixedPaid)} paid`)}
        {card('Fixed — Outstanding', fmt(totalFixedContracted - totalFixedPaid), 'unpaid stages')}
        {card('Rate — Logged', fmt(totalRateLogged), 'from time entries')}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subcontractor / job…"
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />

        <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.client || j.address}</option>)}
        </select>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="">All Types</option>
          <option value="rate">Day Rate</option>
          <option value="fixed">Fixed Price</option>
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <button onClick={openNewContract} style={{ padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + New Contract
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* Contract list */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 14 }}>
          No sub contracts found.{contracts.length === 0 ? ' Add your first contract above.' : ''}
        </div>
      )}

      {filtered.map(c => {
        const isOpen = expanded.has(c.id)
        const subName = contactName(c.contact_id)
        const jName = jobName(c.job_id)
        const entries = contractEntries(c.id)
        const cStages = contractStages(c.id)
        const total = c.type === 'rate' ? rateTotal(c) : stageTotal(c.id)
        const paid = c.type === 'fixed' ? stagePaid(c.id) : null
        const rateLabel = c.rate_type === 'hourly' ? 'hr' : 'day'

        const statusColors: Record<string, string> = { active: '#dcfce7', completed: '#dbeafe', cancelled: '#f3f4f6' }
        const statusTextColors: Record<string, string> = { active: '#16a34a', completed: '#2563eb', cancelled: '#6b7280' }

        return (
          <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, background: '#fff', overflow: 'hidden' }}>
            {/* Contract header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => toggle(c.id)}>
              <span style={{ color: '#9ca3af', fontSize: 16, transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 2 }}>{subName}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {jName !== '—' && <span style={{ marginRight: 8 }}>📋 {jName}</span>}
                  <span style={{ marginRight: 8 }}>{c.description}</span>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
                  {c.type === 'rate'
                    ? `${fmt(c.rate_amount ?? 0)}/${rateLabel} · ${fmt(total)} logged`
                    : paid !== null
                      ? `${fmt(paid)} / ${fmt(c.quoted_amount ?? 0)} paid`
                      : fmt(c.quoted_amount ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {c.type === 'rate' ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : `${cStages.length} stage${cStages.length === 1 ? '' : 's'}`}
                </div>
              </div>

              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: statusColors[c.status] ?? '#f3f4f6', color: statusTextColors[c.status] ?? '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {c.status}
              </span>

              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                {btn('Edit', () => openEditContract(c), 'ghost', true)}
                {btn('Del', () => deleteContract(c.id), 'danger', true)}
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #f3f4f6', padding: '14px 16px', background: '#fafafa' }}>
                {c.type === 'rate' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Time Entries ({c.rate_type === 'hourly' ? 'hours' : 'days'})</div>
                      <button onClick={() => openNewEntry(c.id)} style={{ fontSize: 11, padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer' }}>+ Log Time</button>
                    </div>
                    {entries.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>No entries yet.</div>}
                    {entries.length > 0 && (
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                          <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Date</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>Units</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>Amount</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Notes</th>
                            <th style={{ padding: '4px 4px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(e => (
                            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '5px 8px' }}>{e.entry_date}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{e.units} {rateLabel}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>{fmt(Number(e.units) * (c.rate_amount ?? 0))}</td>
                              <td style={{ padding: '5px 8px', color: '#6b7280' }}>{e.notes}</td>
                              <td style={{ padding: '5px 4px' }}>
                                <button onClick={() => deleteEntry(e.id)} style={{ fontSize: 10, padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      Total: {fmt(total)}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Payment Stages</div>
                      <button onClick={() => openNewStage(c.id)} style={{ fontSize: 11, padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer' }}>+ Add Stage</button>
                    </div>
                    {cStages.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>No stages yet.</div>}
                    {cStages.length > 0 && (
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                          <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Description</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 500 }}>Amount</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Due</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Paid</th>
                            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 500 }}>Xero</th>
                            <th style={{ padding: '4px 4px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cStages.map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', background: s.paid_date ? '#f0fdf4' : 'transparent' }}>
                              <td style={{ padding: '5px 8px' }}>{s.description}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>{fmt(Number(s.amount))}</td>
                              <td style={{ padding: '5px 8px', color: '#6b7280' }}>{s.due_date ?? '—'}</td>
                              <td style={{ padding: '5px 8px' }}>
                                {s.paid_date
                                  ? <span style={{ color: '#16a34a', fontWeight: 500 }}>✓ {s.paid_date}</span>
                                  : <span style={{ color: '#9ca3af' }}>—</span>}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                {s.xero_bill_id
                                  ? <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>✓ Synced</span>
                                  : (
                                    <button onClick={() => pushStageToXero(s)} disabled={xeroPushing === s.id}
                                      style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer', opacity: xeroPushing === s.id ? 0.5 : 1 }}>
                                      {xeroPushing === s.id ? '…' : '→ Xero'}
                                    </button>
                                  )}
                              </td>
                              <td style={{ padding: '5px 4px', whiteSpace: 'nowrap' }}>
                                <button onClick={() => openEditStage(s)} style={{ fontSize: 10, padding: '2px 6px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>✎</button>
                                <button onClick={() => deleteStage(s.id)} style={{ fontSize: 10, padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, fontSize: 13 }}>
                      <span style={{ color: '#6b7280' }}>Paid: <strong style={{ color: '#16a34a' }}>{fmt(paid ?? 0)}</strong></span>
                      <span style={{ color: '#6b7280' }}>Quoted: <strong style={{ color: '#111827' }}>{fmt(c.quoted_amount ?? 0)}</strong></span>
                      <span style={{ color: '#6b7280' }}>Outstanding: <strong style={{ color: '#dc2626' }}>{fmt((c.quoted_amount ?? 0) - (paid ?? 0))}</strong></span>
                    </div>
                  </>
                )}

                {/* Quote document */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#6b7280' }}>📄 Quote:</span>
                  {c.quote_document_id ? (
                    <>
                      <button onClick={() => viewQuoteDoc(c.quote_document_id!)}
                        style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>
                        View document
                      </button>
                      <button onClick={() => unlinkQuoteDoc(c.id)}
                        style={{ fontSize: 11, padding: '2px 6px', background: 'none', color: '#9ca3af', border: 'none', cursor: 'pointer' }}>
                        Unlink
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>None — open the document in Document Inbox and link it to this contract</span>
                  )}
                </div>

                {c.notes && <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>📝 {c.notes}</div>}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Contract Modal ─────────────────────────────────────────── */}
      {contractModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editingContract ? 'Edit Sub Contract' : 'New Sub Contract'}</h3>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Subcontractor *</label>
                <ContactPicker
                  value={form.contactId}
                  onChange={id => setForm(f => ({ ...f, contactId: id }))}
                  contacts={subs}
                  placeholder="Search subcontractor…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Job</label>
                <select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                  <option value="">No specific job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.client || j.address} — {j.address}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Contract Type *</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['rate', 'fixed'] as const).map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '8px 14px', border: `1px solid ${form.type === t ? '#2563eb' : '#d1d5db'}`, borderRadius: 6, background: form.type === t ? '#eff6ff' : '#fff' }}>
                      <input type="radio" checked={form.type === t} onChange={() => setForm(f => ({ ...f, type: t }))} style={{ accentColor: '#2563eb' }} />
                      {t === 'rate' ? '⏱ Day/Hour Rate' : '📋 Fixed Quote'}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Description / Scope *</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Plastering works, First fix plumbing…"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {form.type === 'rate' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Rate Type</label>
                    <select value={form.rateType} onChange={e => setForm(f => ({ ...f, rateType: e.target.value as 'hourly' | 'daily' }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                      <option value="daily">Daily</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Rate (£) *</label>
                    <input type="number" min="0" step="0.01" value={form.rateAmount} onChange={e => setForm(f => ({ ...f, rateAmount: e.target.value }))} placeholder="e.g. 180"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              {form.type === 'fixed' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Quoted Amount (£) *</label>
                  <input type="number" min="0" step="0.01" value={form.quotedAmount} onChange={e => setForm(f => ({ ...f, quotedAmount: e.target.value }))} placeholder="e.g. 4500"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this sub contract…"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minHeight: 64, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {editingContract && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof form.status }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setContractModal(false); setError('') }} style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveContract} disabled={saving} style={{ padding: '8px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : editingContract ? 'Save Changes' : 'Create Contract'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Time Entry Modal ───────────────────────────────────────── */}
      {entryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Log Time</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Date *</label>
                <input type="date" value={entryForm.entryDate} onChange={e => setEntryForm(f => ({ ...f, entryDate: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>
                  Units ({contracts.find(c => c.id === entryContractId)?.rate_type === 'hourly' ? 'hours' : 'days'}) *
                </label>
                <input type="number" min="0.5" step="0.5" value={entryForm.units} onChange={e => setEntryForm(f => ({ ...f, units: e.target.value }))} placeholder="e.g. 1"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Notes</label>
                <input value={entryForm.notes} onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Foundation excavation"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setEntryModal(false); setError('') }} style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEntry} disabled={saving} style={{ padding: '8px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Log Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Stage Modal ────────────────────────────────────── */}
      {stageModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editingStage ? 'Edit Stage' : 'Add Payment Stage'}</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Description *</label>
                <input value={stageForm.description} onChange={e => setStageForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Stage 1 — Rough-in complete"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Amount (£) *</label>
                <input type="number" min="0" step="0.01" value={stageForm.amount} onChange={e => setStageForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 1500"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Due Date</label>
                  <input type="date" value={stageForm.dueDate} onChange={e => setStageForm(f => ({ ...f, dueDate: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Paid Date</label>
                  <input type="date" value={stageForm.paidDate} onChange={e => setStageForm(f => ({ ...f, paidDate: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setStageModal(false); setError('') }} style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveStage} disabled={saving} style={{ padding: '8px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : editingStage ? 'Save Stage' : 'Add Stage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
