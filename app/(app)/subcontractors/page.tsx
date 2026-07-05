'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { ContactPicker } from '@/components/ContactPicker'
import { signedDocUrl, insertJobCost } from '@/lib/job-costs'

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
  status: string
  submitted_by: string
  admin_notes: string | null
  start_time: string | null
  finish_time: string | null
  break_mins: number
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

interface AdminTimeLog {
  id: string
  contact_id: string
  job_id: string | null
  entry_date: string
  start_time: string | null
  finish_time: string | null
  total_hours: number | null
  rate_type: 'hourly' | 'day' | 'half_day' | 'custom'
  rate_amount: number
  amount: number
  amount_overridden: boolean
  notes: string
  entry_type: 'payable' | 'billable' | 'internal'
  status: 'pending' | 'approved' | 'paid'
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
  const [portalInviting, setPortalInviting] = useState<string | null>(null)
  const [portalInviteSent, setPortalInviteSent] = useState<Set<string>>(new Set())

  // Timesheet approval
  const [approvingEntry, setApprovingEntry] = useState<string | null>(null)
  const [entryNotes, setEntryNotes] = useState<Record<string, string>>({})  // entryId → notes input
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set())        // entries with notes input open

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

  // Admin time log
  const emptyLogForm = { contactId: '', jobId: '', entryDate: today(), rateType: 'day' as AdminTimeLog['rate_type'], rateAmount: '', totalHours: '', amount: '', amountOverridden: false, notes: '', entryType: 'payable' as AdminTimeLog['entry_type'] }
  const [timeLogs, setTimeLogs] = useState<AdminTimeLog[]>([])
  const [logModal, setLogModal] = useState(false)
  const [editingLog, setEditingLog] = useState<AdminTimeLog | null>(null)
  const [logForm, setLogForm] = useState(emptyLogForm)
  const [logFilter, setLogFilter] = useState('')

  async function sendPortalInvite(contractId: string, contactId: string | null) {
    const contact = clients.find(c => c.id === contactId)
    if (!contact?.email) { alert(`This subcontractor has no email address on file. Add one on the Contacts page first.`); return }
    setPortalInviting(contractId)
    try {
      const { error: otpErr } = await sb.auth.signInWithOtp({
        email: contact.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/sub-portal` },
      })
      if (otpErr) { alert(`Failed to send invite: ${otpErr.message}`); return }
      await sb.rpc('mark_sub_portal_invite', { p_client_id: contactId })
      setPortalInviteSent(prev => new Set(prev).add(contractId))
    } finally {
      setPortalInviting(null)
    }
  }

  async function approveEntry(entry: TimeEntry, contract: Contract) {
    setApprovingEntry(entry.id)
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      await sb.from('sub_time_entries').update({ status: 'approved', admin_notes: null }).eq('id', entry.id)
      // Create job cost if contract has a job
      if (contract.job_id) {
        const amount = Number(entry.units) * (contract.rate_amount ?? 0)
        await insertJobCost(sb, user.id, {
          jobId: contract.job_id,
          source: 'timesheet',
          costCategory: 'subcontractors',
          supplier: contactName(contract.contact_id),
          description: entry.notes || `${contractLabel(contract)} — ${entry.entry_date}`,
          docDate: entry.entry_date,
          docNumber: '',
          netAmount: amount,
          vatAmount: 0,
          grossAmount: amount,
          paymentStatus: 'unpaid',
          chargeToClient: false,
        })
      }
      await load()
    } finally {
      setApprovingEntry(null)
    }
  }

  async function updateEntryStatus(entryId: string, status: 'queried' | 'rejected', notes: string) {
    await sb.from('sub_time_entries').update({ status, admin_notes: notes || null }).eq('id', entryId)
    setNotesOpen(prev => { const n = new Set(prev); n.delete(entryId); return n })
    setEntryNotes(prev => { const n = { ...prev }; delete n[entryId]; return n })
    await load()
  }

  const contractLabel = (c: Contract) => c.description || (c.type === 'rate' ? `${c.rate_type} rate` : 'fixed price')
  const toggleNotes = (id: string) => setNotesOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: cs }, { data: es }, { data: ps }, { data: tls }] = await Promise.all([
      sb.from('sub_contracts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      sb.from('sub_time_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: true }),
      sb.from('sub_payment_stages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      sb.from('sub_admin_time_logs').select('*').eq('user_id', user.id).order('entry_date', { ascending: false }),
    ])

    setContracts((cs ?? []) as Contract[])
    setTimeEntries((es ?? []) as TimeEntry[])
    setStages((ps ?? []) as PaymentStage[])
    setTimeLogs((tls ?? []) as AdminTimeLog[])
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

  // ─── Admin Time Log helpers ───────────────────────────────────────────────

  function calcLogAmount(form: typeof emptyLogForm): number {
    const rate = Number(form.rateAmount) || 0
    if (form.rateType === 'hourly') return rate * (Number(form.totalHours) || 0)
    return rate
  }

  function autoFillRate(contactId: string, rateType: AdminTimeLog['rate_type'], currentForm: typeof emptyLogForm) {
    const contact = clients.find(c => c.id === contactId)
    if (!contact) return currentForm
    let rate = ''
    if (rateType === 'day' && contact.subDayRate) rate = contact.subDayRate.toString()
    else if (rateType === 'half_day' && contact.subHalfDayRate) rate = contact.subHalfDayRate.toString()
    else if (rateType === 'hourly' && contact.subHourlyRate) rate = contact.subHourlyRate.toString()
    const updated = { ...currentForm, contactId, rateType, rateAmount: rate || currentForm.rateAmount }
    if (!updated.amountOverridden) updated.amount = calcLogAmount(updated).toString()
    return updated
  }

  function openNewLog() {
    setEditingLog(null)
    setLogForm(emptyLogForm)
    setError('')
    setLogModal(true)
  }

  function openEditLog(log: AdminTimeLog) {
    setEditingLog(log)
    setLogForm({
      contactId: log.contact_id,
      jobId: log.job_id ?? '',
      entryDate: log.entry_date,
      rateType: log.rate_type,
      rateAmount: log.rate_amount.toString(),
      totalHours: log.total_hours?.toString() ?? '',
      amount: log.amount.toString(),
      amountOverridden: log.amount_overridden,
      notes: log.notes,
      entryType: log.entry_type,
    })
    setError('')
    setLogModal(true)
  }

  async function saveLog() {
    if (!logForm.contactId) { setError('Select a subcontractor'); return }
    if (!logForm.entryDate) { setError('Enter a date'); return }
    if (!logForm.rateAmount) { setError('Enter a rate amount'); return }
    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }

    const amount = logForm.amountOverridden ? Number(logForm.amount) : calcLogAmount(logForm)

    const payload = {
      user_id: user.id,
      contact_id: logForm.contactId,
      job_id: logForm.jobId || null,
      entry_date: logForm.entryDate,
      rate_type: logForm.rateType,
      rate_amount: Number(logForm.rateAmount),
      total_hours: logForm.rateType === 'hourly' ? (Number(logForm.totalHours) || null) : null,
      amount,
      amount_overridden: logForm.amountOverridden,
      notes: logForm.notes.trim(),
      entry_type: logForm.entryType,
      status: editingLog ? editingLog.status : 'pending',
    }

    if (editingLog) {
      await sb.from('sub_admin_time_logs').update(payload).eq('id', editingLog.id)
    } else {
      await sb.from('sub_admin_time_logs').insert(payload)
    }
    setLogModal(false)
    await load()
    setSaving(false)
  }

  async function deleteLog(id: string) {
    if (!confirm('Delete this time log entry?')) return
    await sb.from('sub_admin_time_logs').delete().eq('id', id)
    await load()
  }

  async function updateLogStatus(id: string, status: AdminTimeLog['status']) {
    await sb.from('sub_admin_time_logs').update({ status }).eq('id', id)
    setTimeLogs(prev => prev.map(l => l.id === id ? { ...l, status } : l))
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
        <button onClick={openNewLog} style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ⏱ Log Time
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
                <button
                  title="Send subcontractor portal invite"
                  disabled={portalInviting === c.id}
                  onClick={() => sendPortalInvite(c.id, c.contact_id)}
                  style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: portalInviteSent.has(c.id) ? '#dcfce7' : '#fff', color: portalInviteSent.has(c.id) ? '#16a34a' : '#374151', cursor: 'pointer', fontWeight: 600 }}
                >
                  {portalInviting === c.id ? '…' : portalInviteSent.has(c.id) ? '✓ Invited' : '🔗 Portal'}
                </button>
                {btn('Edit', () => openEditContract(c), 'ghost', true)}
                {btn('Del', () => deleteContract(c.id), 'danger', true)}
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #f3f4f6', padding: '14px 16px', background: '#fafafa' }}>
                {c.type === 'rate' ? (
                  <>
                    {/* ── Pending Review section ────────────────────────── */}
                    {(() => {
                      const pending = entries.filter(e => e.status === 'submitted')
                      if (!pending.length) return null
                      return (
                        <div style={{ marginBottom: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ⏳ Pending Review ({pending.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {pending.map(e => (
                              <div key={e.id} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{e.entry_date}</span>
                                  <span style={{ fontSize: 12, color: '#111827', fontWeight: 700 }}>{e.units} {rateLabel}</span>
                                  <span style={{ fontSize: 12, color: '#111827' }}>= {fmt(Number(e.units) * (c.rate_amount ?? 0))}</span>
                                  {e.start_time && e.finish_time && (
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{e.start_time.slice(0,5)}–{e.finish_time.slice(0,5)}{e.break_mins > 0 ? ` (${e.break_mins}min break)` : ''}</span>
                                  )}
                                </div>
                                {e.notes && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{e.notes}</div>}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <button
                                    disabled={approvingEntry === e.id}
                                    onClick={() => approveEntry(e, c)}
                                    style={{ fontSize: 11, padding: '3px 10px', background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', borderRadius: 5, cursor: 'pointer', fontWeight: 600, opacity: approvingEntry === e.id ? 0.5 : 1 }}
                                  >
                                    {approvingEntry === e.id ? '…' : '✓ Approve'}
                                  </button>
                                  <button
                                    onClick={() => toggleNotes(e.id)}
                                    style={{ fontSize: 11, padding: '3px 10px', background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                                  >
                                    💬 Query
                                  </button>
                                  <button
                                    onClick={() => updateEntryStatus(e.id, 'rejected', entryNotes[e.id] ?? '')}
                                    style={{ fontSize: 11, padding: '3px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                                  >
                                    ✕ Reject
                                  </button>
                                </div>
                                {notesOpen.has(e.id) && (
                                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                                    <input
                                      value={entryNotes[e.id] ?? ''}
                                      onChange={ev => setEntryNotes(prev => ({ ...prev, [e.id]: ev.target.value }))}
                                      placeholder="Message to subcontractor…"
                                      style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }}
                                      onKeyDown={ev => { if (ev.key === 'Enter') updateEntryStatus(e.id, 'queried', entryNotes[e.id] ?? '') }}
                                    />
                                    <button
                                      onClick={() => updateEntryStatus(e.id, 'queried', entryNotes[e.id] ?? '')}
                                      style={{ fontSize: 11, padding: '5px 10px', background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                      Send
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

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
                            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Status</th>
                            <th style={{ padding: '4px 4px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.filter(e => e.status !== 'submitted').map(e => (
                            <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6', background: e.status === 'rejected' ? '#fff5f5' : 'transparent' }}>
                              <td style={{ padding: '5px 8px' }}>{e.entry_date}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{e.units} {rateLabel}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>{fmt(Number(e.units) * (c.rate_amount ?? 0))}</td>
                              <td style={{ padding: '5px 8px', color: '#6b7280' }}>
                                {e.notes}
                                {e.admin_notes && <div style={{ fontSize: 10, color: '#9a3412', marginTop: 2 }}>💬 {e.admin_notes}</div>}
                              </td>
                              <td style={{ padding: '5px 8px' }}>
                                {e.submitted_by === 'subcontractor'
                                  ? <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 9, background: e.status === 'approved' ? '#dcfce7' : e.status === 'rejected' ? '#fee2e2' : '#f1f5f9', color: e.status === 'approved' ? '#16a34a' : e.status === 'rejected' ? '#dc2626' : '#64748b', fontWeight: 600 }}>{e.status}</span>
                                  : null}
                              </td>
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

      {/* ── Admin Time Logs ───────────────────────────────────────── */}
      <div style={{ marginTop: 40, borderTop: '2px solid #e5e7eb', paddingTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>⏱ Time Logs</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Admin-entered time — {timeLogs.length} entr{timeLogs.length === 1 ? 'y' : 'ies'} · Total payable: {fmt(timeLogs.filter(l => l.entry_type === 'payable').reduce((s, l) => s + Number(l.amount), 0))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={logFilter} onChange={e => setLogFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
              <option value="">All subs</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={openNewLog} style={{ padding: '7px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              + Log Time
            </button>
          </div>
        </div>

        {timeLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 14, border: '1px dashed #d1d5db', borderRadius: 8 }}>
            No time logs yet. Click &quot;Log Time&quot; or &quot;⏱ Log Time&quot; in the toolbar to add the first entry.
          </div>
        ) : (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Date</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Sub</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Job</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Rate</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Type</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}></th>
                </tr>
              </thead>
              <tbody>
                {timeLogs.filter(l => !logFilter || l.contact_id === logFilter).map((log, i) => {
                  const subName = contactName(log.contact_id)
                  const jName = log.job_id ? jobName(log.job_id) : '—'
                  const rateLabel: Record<AdminTimeLog['rate_type'], string> = { day: 'Day', half_day: 'Half day', hourly: `Hourly`, custom: 'Custom' }
                  const statusColor: Record<AdminTimeLog['status'], string> = { pending: '#fef3c7', approved: '#dcfce7', paid: '#dbeafe' }
                  const statusText: Record<AdminTimeLog['status'], string> = { pending: '#92400e', approved: '#166534', paid: '#1e40af' }
                  const typeColor: Record<AdminTimeLog['entry_type'], string> = { payable: '#fee2e2', billable: '#ede9fe', internal: '#f3f4f6' }
                  const typeText: Record<AdminTimeLog['entry_type'], string> = { payable: '#dc2626', billable: '#7c3aed', internal: '#6b7280' }
                  return (
                    <tr key={log.id} style={{ borderBottom: i < timeLogs.length - 1 ? '1px solid #f3f4f6' : 'none', background: '#fff' }}>
                      <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {new Date(log.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#111827' }}>{subName}</td>
                      <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>{jName}</td>
                      <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>
                        {rateLabel[log.rate_type]} · {fmt(log.rate_amount)}
                        {log.rate_type === 'hourly' && log.total_hours ? ` × ${log.total_hours}h` : ''}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(log.amount)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: typeColor[log.entry_type], color: typeText[log.entry_type], fontWeight: 600 }}>
                          {log.entry_type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <select
                          value={log.status}
                          onChange={e => updateLogStatus(log.id, e.target.value as AdminTimeLog['status'])}
                          style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, background: statusColor[log.status], color: statusText[log.status], fontWeight: 600, cursor: 'pointer' }}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {log.notes && (
                            <span title={log.notes} style={{ fontSize: 12, cursor: 'default' }}>📝</span>
                          )}
                          {btn('Edit', () => openEditLog(log), 'ghost', true)}
                          {btn('✕', () => deleteLog(log.id), 'danger', true)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {/* ── Admin Time Log Modal ──────────────────────────────────── */}
      {logModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editingLog ? 'Edit Time Log' : '⏱ Log Sub Time'}</h3>
            <div style={{ display: 'grid', gap: 14 }}>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Subcontractor *</label>
                <ContactPicker
                  value={logForm.contactId}
                  onChange={id => setLogForm(f => autoFillRate(id, f.rateType, { ...f, contactId: id }))}
                  contacts={subs}
                  placeholder="Search subcontractor…"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Job</label>
                <select value={logForm.jobId} onChange={e => setLogForm(f => ({ ...f, jobId: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                  <option value="">No specific job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.client || j.address} — {j.address}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Date *</label>
                  <input type="date" value={logForm.entryDate} onChange={e => setLogForm(f => ({ ...f, entryDate: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Entry Type</label>
                  <select value={logForm.entryType} onChange={e => setLogForm(f => ({ ...f, entryType: e.target.value as AdminTimeLog['entry_type'] }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    <option value="payable">Payable (owed to sub)</option>
                    <option value="billable">Billable (charge to client)</option>
                    <option value="internal">Internal only</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Rate Type</label>
                  <select value={logForm.rateType} onChange={e => {
                    const rt = e.target.value as AdminTimeLog['rate_type']
                    setLogForm(f => autoFillRate(f.contactId, rt, { ...f, rateType: rt }))
                  }} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    <option value="day">Day Rate</option>
                    <option value="half_day">Half Day</option>
                    <option value="hourly">Hourly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Rate Amount (£) *</label>
                  <input type="number" min="0" step="0.01" value={logForm.rateAmount}
                    onChange={e => setLogForm(f => {
                      const updated = { ...f, rateAmount: e.target.value }
                      if (!updated.amountOverridden) updated.amount = calcLogAmount(updated).toString()
                      return updated
                    })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              {logForm.rateType === 'hourly' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Hours</label>
                  <input type="number" min="0" step="0.5" value={logForm.totalHours}
                    onChange={e => setLogForm(f => {
                      const updated = { ...f, totalHours: e.target.value }
                      if (!updated.amountOverridden) updated.amount = calcLogAmount(updated).toString()
                      return updated
                    })}
                    placeholder="e.g. 7.5"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Amount (£)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                    <input type="checkbox" checked={logForm.amountOverridden} onChange={e => setLogForm(f => ({ ...f, amountOverridden: e.target.checked }))} />
                    Override
                  </label>
                </div>
                <input
                  type="number" min="0" step="0.01"
                  value={logForm.amountOverridden ? logForm.amount : (calcLogAmount(logForm) || '').toString()}
                  readOnly={!logForm.amountOverridden}
                  onChange={e => setLogForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: logForm.amountOverridden ? '#fff' : '#f9fafb' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Notes</label>
                <input value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. First fix carpentry, day 1 of 3"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setLogModal(false); setError('') }} style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveLog} disabled={saving} style={{ padding: '8px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : editingLog ? 'Save Changes' : 'Log Time'}
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
