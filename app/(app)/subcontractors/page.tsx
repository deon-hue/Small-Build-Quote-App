'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  sub_contract_id: string | null
  job_id: string | null
  contact_id: string | null
  rate_type: string | null
  rate_amount: number | null
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
  week_start: string | null
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
  xero_bill_id: string | null
  job_cost_id: string | null
  created_at: string
}

interface DayRow {
  date: string
  active: boolean
  jobId: string
  rateType: AdminTimeLog['rate_type']
  rateAmount: string
  hours: string
  notes: string
  paidCash: boolean
  existingId?: string
}

const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().slice(0, 10)
}
function getWeekDays(ws: string): string[] {
  const base = new Date(ws + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d.toISOString().slice(0, 10) })
}
function fmtWeekRange(ws: string): string {
  const s = new Date(ws + 'T12:00:00')
  const e = new Date(ws + 'T12:00:00')
  e.setDate(e.getDate() + 6)
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function SubcontractorsPage() {
  const sb = createClient()
  const router = useRouter()
  const { jobs, clients, updateClient, addClient, addBill } = useApp()
  const subs = clients.filter(c => c.clientType === 'subcontractor' || c.clientType === 'supplier')

  const [contracts, setContracts] = useState<Contract[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [stages, setStages] = useState<PaymentStage[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [xeroPushing, setXeroPushing] = useState<string | null>(null)
  const [xeroPushingLog, setXeroPushingLog] = useState<string | null>(null)
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
  // Quick-add new subcontractor inline in the contract modal
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAdd, setQuickAdd] = useState({ name: '', email: '', phone: '' })
  const [pendingSelectName, setPendingSelectName] = useState('')

  // Auto-select newly created subcontractor once clients list updates
  useEffect(() => {
    if (!pendingSelectName) return
    const match = clients.find(c => c.name.trim().toLowerCase() === pendingSelectName.toLowerCase())
    if (match) {
      setForm(f => ({ ...f, contactId: match.id }))
      setPendingSelectName('')
    }
  }, [clients, pendingSelectName])

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

  // Admin time log — weekly timesheets
  const [timeLogs, setTimeLogs] = useState<AdminTimeLog[]>([])
  const [weekModal, setWeekModal] = useState(false)
  const [weekSub, setWeekSub] = useState('')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today()))
  const [weekRows, setWeekRows] = useState<DayRow[]>([])
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [logFilter, setLogFilter] = useState('')
  const [sendingToBills, setSendingToBills] = useState<string | null>(null)
  const [fixingCosts, setFixingCosts] = useState(false)
  const [fixingLabour, setFixingLabour] = useState(false)

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
          costCategory: isPaye(contract.contact_id) ? 'labour' : 'subcontractors',
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

  async function approveDirectEntry(entry: TimeEntry) {
    setApprovingEntry(entry.id)
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      await sb.from('sub_time_entries').update({ status: 'approved', admin_notes: null }).eq('id', entry.id)
      // Derive amount from rate stored on the entry itself
      const amount = entry.rate_type === 'daily' || entry.rate_type === 'half_day'
        ? Number(entry.rate_amount) ?? 0
        : Number(entry.units) * (Number(entry.rate_amount) ?? 0)
      if (entry.job_id && amount > 0) {
        await insertJobCost(sb, user.id, {
          jobId: entry.job_id,
          source: 'timesheet',
          costCategory: isPaye(entry.contact_id) ? 'labour' : 'subcontractors',
          supplier: contactName(entry.contact_id),
          description: entry.notes || `Sub time — ${entry.entry_date}`,
          docDate: entry.entry_date, docNumber: '',
          netAmount: amount, vatAmount: 0, grossAmount: amount,
          paymentStatus: 'unpaid', chargeToClient: false,
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
  const isPaye = (id: string | null) => !!clients.find(c => c.id === id)?.isPaye

  async function togglePaye(contactId: string) {
    const contact = clients.find(c => c.id === contactId)
    if (!contact) return
    await updateClient({ ...contact, isPaye: !contact.isPaye })
  }
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

  // ─── Admin Time Log helpers — weekly timesheets ──────────────────────────

  function buildWeekRows(ws: string, contactId: string, existingLogs: AdminTimeLog[]): DayRow[] {
    const contact = clients.find(c => c.id === contactId)
    const defType: AdminTimeLog['rate_type'] = contact?.subDayRate ? 'day' : contact?.subHalfDayRate ? 'half_day' : contact?.subHourlyRate ? 'hourly' : 'day'
    const defRate = (contact?.subDayRate ?? contact?.subHalfDayRate ?? contact?.subHourlyRate ?? 0).toString()
    return getWeekDays(ws).map(date => {
      const ex = existingLogs.find(l => l.contact_id === contactId && l.entry_date === date)
      if (ex) return { date, active: true, jobId: ex.job_id ?? '', rateType: ex.rate_type, rateAmount: ex.rate_amount.toString(), hours: ex.total_hours?.toString() ?? '', notes: ex.notes, paidCash: ex.status === 'paid', existingId: ex.id }
      return { date, active: false, jobId: '', rateType: defType, rateAmount: defRate, hours: '', notes: '', paidCash: false }
    })
  }

  function openWeekSheet(contactId = '', ws = getWeekStart(today())) {
    setWeekSub(contactId)
    setWeekStart(ws)
    setWeekRows(buildWeekRows(ws, contactId, timeLogs))
    setError('')
    setWeekModal(true)
  }

  async function saveWeekSheet() {
    if (!weekSub) { setError('Select a subcontractor'); return }
    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }
    const ws = weekStart
    for (const row of weekRows) {
      const rate = Number(row.rateAmount) || 0
      const amount = row.rateType === 'hourly' ? rate * (Number(row.hours) || 0) : rate
      if (row.active) {
        let logId = row.existingId
        if (row.existingId) {
          await sb.from('sub_admin_time_logs').update({
            job_id: row.jobId || null, week_start: ws,
            rate_type: row.rateType, rate_amount: rate,
            total_hours: row.rateType === 'hourly' ? (Number(row.hours) || null) : null,
            amount, amount_overridden: false, notes: row.notes.trim(),
          }).eq('id', row.existingId)
        } else {
          const { data: ins } = await sb.from('sub_admin_time_logs').insert({
            user_id: user.id, contact_id: weekSub,
            job_id: row.jobId || null, entry_date: row.date, week_start: ws,
            rate_type: row.rateType, rate_amount: rate,
            total_hours: row.rateType === 'hourly' ? (Number(row.hours) || null) : null,
            amount, amount_overridden: false, notes: row.notes.trim(),
            entry_type: 'payable', status: 'pending',
          }).select('id').single()
          logId = ins?.id
        }
        // If cash-paid, mark status and link to job_costs
        if (row.paidCash && logId) {
          await sb.from('sub_admin_time_logs').update({ status: 'paid' }).eq('id', logId)
          if (row.jobId) {
            const existingLog = timeLogs.find(l => l.id === logId)
            if (existingLog?.job_cost_id) {
              await sb.from('job_costs').update({ payment_status: 'paid' }).eq('id', existingLog.job_cost_id)
            } else {
              const cost = await insertJobCost(sb, user.id, {
                jobId: row.jobId, source: 'timesheet',
                costCategory: isPaye(weekSub) ? 'labour' : 'subcontractors',
                supplier: contactName(weekSub),
                description: row.notes.trim() || `Sub time — ${row.date}`,
                docDate: row.date, docNumber: '',
                netAmount: amount, vatAmount: 0, grossAmount: amount,
                paymentStatus: 'paid', chargeToClient: false,
              })
              if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', logId)
            }
          }
        }
      } else if (row.existingId) {
        await sb.from('sub_admin_time_logs').delete().eq('id', row.existingId)
      }
    }
    setWeekModal(false)
    await load()
    setSaving(false)
  }

  async function sendToBills(contactId: string, ws: string) {
    const key = `${contactId}_${ws}`
    setSendingToBills(key)
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const billableLogs = timeLogs
        .filter(l => l.contact_id === contactId && (l.week_start ?? getWeekStart(l.entry_date)) === ws && l.status !== 'paid' && !l.xero_bill_id)
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      if (billableLogs.length === 0) return
      // Approve any still-pending days and link job_costs
      for (const log of billableLogs) {
        if (log.status === 'pending') {
          await sb.from('sub_admin_time_logs').update({ status: 'approved' }).eq('id', log.id)
          if (log.job_id && !log.job_cost_id) {
            const cost = await insertJobCost(sb, user.id, {
              jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
              supplier: contactName(log.contact_id),
              description: log.notes || `Sub time — ${log.entry_date}`,
              docDate: log.entry_date, docNumber: '',
              netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
              paymentStatus: 'unpaid', chargeToClient: false,
            })
            if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
          }
        }
      }
      let li = 0
      const lineItems = billableLogs.map(log => {
        const dow = new Date(log.entry_date + 'T12:00:00').getDay()
        const dayLabel = DAY_LABELS[dow === 0 ? 6 : dow - 1]
        const dateLabel = new Date(log.entry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        const rateLabel: Record<AdminTimeLog['rate_type'], string> = { day: 'Day rate', half_day: 'Half day', hourly: `${log.total_hours ?? '?'}h`, custom: 'Custom' }
        return { id: ++li, desc: `${dayLabel} ${dateLabel}${log.notes ? ` — ${log.notes}` : ''} (${rateLabel[log.rate_type]} @ ${fmt(log.rate_amount)})`, category: 'labour' as const, amount: Number(log.amount) }
      })
      const total = billableLogs.reduce((s, l) => s + Number(l.amount), 0)
      const sub = clients.find(c => c.id === contactId)
      const cisRate = sub?.cisPercentage ?? 0
      const cisDeduction = Math.round(total * cisRate) / 100
      const jobCounts = new Map<string, number>()
      for (const l of billableLogs) if (l.job_id) jobCounts.set(l.job_id, (jobCounts.get(l.job_id) ?? 0) + 1)
      const dominantJobId = [...jobCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const weekEnd = new Date(ws + 'T12:00:00'); weekEnd.setDate(weekEnd.getDate() + 6)
      await addBill({
        supplierId: contactId, supplierName: contactName(contactId),
        jobId: dominantJobId,
        billDate: weekEnd.toISOString().slice(0, 10), dueDate: '',
        description: `Week of ${fmtWeekRange(ws)}`,
        lineItems, labourAmount: total, materialsAmount: 0, plantAmount: 0, otherAmount: 0,
        subtotal: total, cisRate, cisDeduction, totalPayable: total - cisDeduction,
        status: 'draft', notes: 'Awaiting subcontractor invoice', syncToXero: false,
      })
      router.push('/bills')
    } finally {
      setSendingToBills(null)
    }
  }

  async function deleteWeek(contactId: string, ws: string) {
    const weekLogs = timeLogs.filter(l => l.contact_id === contactId && (l.week_start ?? getWeekStart(l.entry_date)) === ws)
    const costIds = weekLogs.map(l => l.job_cost_id).filter(Boolean) as string[]
    const hasCosts = costIds.length > 0
    const msg = hasCosts
      ? `Delete all ${weekLogs.length} time entries for this week?\n\nThis will also remove the ${costIds.length} linked job cost record${costIds.length !== 1 ? 's' : ''} from job tracking.`
      : `Delete all ${weekLogs.length} time entries for this week?`
    if (!confirm(msg)) return
    const ids = weekLogs.map(l => l.id)
    if (ids.length > 0) await sb.from('sub_admin_time_logs').delete().in('id', ids)
    if (costIds.length > 0) await sb.from('job_costs').delete().in('id', costIds)
    await load()
  }

  async function approveWeek(contactId: string, ws: string) {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const pending = timeLogs.filter(l => l.contact_id === contactId && (l.week_start ?? getWeekStart(l.entry_date)) === ws && l.status === 'pending')
    for (const log of pending) {
      await sb.from('sub_admin_time_logs').update({ status: 'approved' }).eq('id', log.id)
      if (log.job_id && !log.job_cost_id) {
        const cost = await insertJobCost(sb, user.id, {
          jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
          supplier: contactName(log.contact_id),
          description: log.notes || `Sub time — ${log.entry_date}`,
          docDate: log.entry_date, docNumber: '',
          netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
          paymentStatus: 'unpaid', chargeToClient: false,
        })
        if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
      }
    }
    await load()
  }

  async function markWeekPaidCash(contactId: string, ws: string) {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const weekLogs = timeLogs.filter(l => l.contact_id === contactId && (l.week_start ?? getWeekStart(l.entry_date)) === ws)
    for (const log of weekLogs) {
      await sb.from('sub_admin_time_logs').update({ status: 'paid' }).eq('id', log.id)
      if (log.job_id) {
        if (log.job_cost_id) {
          await sb.from('job_costs').update({ payment_status: 'paid' }).eq('id', log.job_cost_id)
        } else {
          const cost = await insertJobCost(sb, user.id, {
            jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
            supplier: contactName(log.contact_id),
            description: log.notes || `Sub time — ${log.entry_date}`,
            docDate: log.entry_date, docNumber: '',
            netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
            paymentStatus: 'paid', chargeToClient: false,
          })
          if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
        }
      }
    }
    await load()
  }

  async function markDayCash(log: AdminTimeLog) {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('sub_admin_time_logs').update({ status: 'paid' }).eq('id', log.id)
    if (log.job_id) {
      if (log.job_cost_id) {
        await sb.from('job_costs').update({ payment_status: 'paid' }).eq('id', log.job_cost_id)
      } else {
        const cost = await insertJobCost(sb, user.id, {
          jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
          supplier: contactName(log.contact_id),
          description: log.notes || `Sub time — ${log.entry_date}`,
          docDate: log.entry_date, docNumber: '',
          netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
          paymentStatus: 'paid', chargeToClient: false,
        })
        if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
      }
    }
    await load()
  }

  async function pushDayToXero(log: AdminTimeLog) {
    setXeroPushingLog(log.id)
    setError('')
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      if (log.status === 'pending') {
        await sb.from('sub_admin_time_logs').update({ status: 'approved' }).eq('id', log.id)
        if (log.job_id && !log.job_cost_id) {
          const cost = await insertJobCost(sb, user.id, {
            jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
            supplier: contactName(log.contact_id),
            description: log.notes || `Sub time — ${log.entry_date}`,
            docDate: log.entry_date, docNumber: '',
            netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
            paymentStatus: 'unpaid', chargeToClient: false,
          })
          if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
        }
      }
      const res = await fetch('/api/xero/push-time-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logId: log.id }) })
      const data = await res.json() as { xeroBillId?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'Xero push failed'); return }
      await load()
    } catch {
      setError('Network error — could not push to Xero')
    } finally {
      setXeroPushingLog(null)
    }
  }

  async function pushWeekToXero(contactId: string, ws: string) {
    const key = `${contactId}_${ws}`
    setXeroPushingLog(key)
    setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setXeroPushingLog(null); return }
    // Only entries not already individually pushed or cash-paid
    const weekLogs = timeLogs.filter(l => l.contact_id === contactId && (l.week_start ?? getWeekStart(l.entry_date)) === ws && !l.xero_bill_id && l.status !== 'paid')
    if (weekLogs.length === 0) { setError('No unpaid entries to push to Xero'); setXeroPushingLog(null); return }
    // Approve any still-pending entries and create their job costs first
    for (const log of weekLogs) {
      if (log.status === 'pending') {
        await sb.from('sub_admin_time_logs').update({ status: 'approved' }).eq('id', log.id)
        if (log.job_id && !log.job_cost_id) {
          const cost = await insertJobCost(sb, user.id, {
            jobId: log.job_id, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
            supplier: contactName(log.contact_id),
            description: log.notes || `Sub time — ${log.entry_date}`,
            docDate: log.entry_date, docNumber: '',
            netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
            paymentStatus: 'unpaid', chargeToClient: false,
          })
          if (cost?.id) await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
        }
      }
    }
    try {
      const res = await fetch('/api/xero/push-time-log-week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId, weekStart: ws, logIds: weekLogs.map(l => l.id) }) })
      const data = await res.json() as { xeroBillId?: string; error?: string }
      if (!res.ok || data.error) { setError(data.error ?? 'Xero push failed'); return }
      await load()
    } catch {
      setError('Network error — could not push to Xero')
    } finally {
      setXeroPushingLog(null)
    }
  }

  async function fixMissingCosts() {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    setFixingCosts(true)
    const toFix = timeLogs.filter(l => l.job_id && !l.job_cost_id && (l.status === 'approved' || l.status === 'paid'))
    let count = 0
    for (const log of toFix) {
      const cost = await insertJobCost(sb, user.id, {
        jobId: log.job_id!, source: 'timesheet', costCategory: isPaye(log.contact_id) ? 'labour' : 'subcontractors',
        supplier: contactName(log.contact_id),
        description: log.notes || `Sub time — ${log.entry_date}`,
        docDate: log.entry_date, docNumber: '',
        netAmount: log.amount, vatAmount: 0, grossAmount: log.amount,
        paymentStatus: log.status === 'paid' ? 'paid' : 'unpaid', chargeToClient: false,
      })
      if (cost?.id) {
        await sb.from('sub_admin_time_logs').update({ job_cost_id: cost.id }).eq('id', log.id)
        count++
      }
    }
    setFixingCosts(false)
    await load()
    if (count > 0) alert(`Created ${count} missing job cost${count === 1 ? '' : 's'}`)
    else alert('No missing job costs found')
  }

  async function fixLabourCategories() {
    setFixingLabour(true)
    // Collect names of all Direct Labour contacts
    const labourNames = clients.filter(c => c.isPaye).map(c => c.name).filter(Boolean)
    if (labourNames.length === 0) { setFixingLabour(false); alert('No contacts marked as Direct Labour'); return }
    // Also collect job_cost_ids directly linked via time log back-references
    const linkedIds = [...new Set(
      timeLogs.filter(l => l.job_cost_id && isPaye(l.contact_id)).map(l => l.job_cost_id!)
    )]
    // Update by supplier name (covers portal entries with no job_cost_id back-ref)
    await sb.from('job_costs')
      .update({ cost_category: 'labour' })
      .in('supplier', labourNames)
      .eq('cost_category', 'subcontractors')
      .eq('source', 'timesheet')
    // Update by linked IDs (belt-and-braces for admin time logs)
    if (linkedIds.length > 0) {
      await sb.from('job_costs')
        .update({ cost_category: 'labour' })
        .in('id', linkedIds)
        .eq('cost_category', 'subcontractors')
    }
    setFixingLabour(false)
    alert('Done — job costs for Direct Labour contacts reclassified to Labour')
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
        <button onClick={() => openWeekSheet()} style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ⏱ Log Time
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {/* ── Direct portal submissions (no contract) ─────────── */}
      {(() => {
        const direct = timeEntries.filter(e => !e.sub_contract_id && e.status === 'submitted')
        if (!direct.length) return null
        return (
          <div style={{ marginBottom: 24, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>
              ⏳ Portal Timesheets Pending Review ({direct.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {direct.map(e => {
                const subLabel = contactName(e.contact_id)
                const jName = jobName(e.job_id)
                const amount = e.rate_type === 'daily' || e.rate_type === 'half_day'
                  ? Number(e.rate_amount) ?? 0
                  : Number(e.units) * (Number(e.rate_amount) ?? 0)
                return (
                  <div key={e.id} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: '#374151' }}>{subLabel}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>→ {jName}</span>
                      <span style={{ fontSize: 12, color: '#111827', fontWeight: 600 }}>{e.entry_date}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{e.units} {e.rate_type === 'hourly' ? 'hrs' : e.rate_type === 'half_day' ? 'half day' : 'day'}</span>
                      {amount > 0 && <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>{fmt(amount)}</span>}
                      {e.rate_amount && <span style={{ fontSize: 11, color: '#9ca3af' }}>@ £{e.rate_amount}/{e.rate_type}</span>}
                      {e.start_time && e.finish_time && <span style={{ fontSize: 11, color: '#9ca3af' }}>{e.start_time.slice(0,5)}–{e.finish_time.slice(0,5)}{e.break_mins > 0 ? ` (${e.break_mins}min break)` : ''}</span>}
                    </div>
                    {e.notes && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{e.notes}</div>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        disabled={approvingEntry === e.id}
                        onClick={() => approveDirectEntry(e)}
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
                )
              })}
            </div>
          </div>
        )
      })()}

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

      {/* ── Admin Time Logs — weekly timesheets ──────────────────── */}
      {(() => {
        const filteredLogs = timeLogs.filter(l => !logFilter || l.contact_id === logFilter)
        const missingCostCount = timeLogs.filter(l => l.job_id && !l.job_cost_id && (l.status === 'approved' || l.status === 'paid')).length
        const weekGroupMap = new Map<string, { contactId: string; ws: string; logs: AdminTimeLog[] }>()
        for (const log of filteredLogs) {
          const ws = log.week_start ?? getWeekStart(log.entry_date)
          const key = `${log.contact_id}_${ws}`
          if (!weekGroupMap.has(key)) weekGroupMap.set(key, { contactId: log.contact_id, ws, logs: [] })
          weekGroupMap.get(key)!.logs.push(log)
        }
        const weekGroups = [...weekGroupMap.values()].sort((a, b) => b.ws.localeCompare(a.ws))
        return (
          <div style={{ marginTop: 40, borderTop: '2px solid #e5e7eb', paddingTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>⏱ Weekly Timesheets</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {weekGroups.length} week{weekGroups.length === 1 ? '' : 's'} · Total payable: {fmt(timeLogs.reduce((s, l) => s + Number(l.amount), 0))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={logFilter} onChange={e => setLogFilter(e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
                  <option value="">All subs</option>
                  {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {missingCostCount > 0 && (
                  <button onClick={fixMissingCosts} disabled={fixingCosts} style={{ padding: '7px 12px', background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: fixingCosts ? 0.6 : 1 }}>
                    {fixingCosts ? 'Fixing…' : `⚠ Fix ${missingCostCount} missing cost${missingCostCount === 1 ? '' : 's'}`}
                  </button>
                )}
                <button onClick={fixLabourCategories} disabled={fixingLabour} style={{ padding: '7px 12px', background: '#ede9fe', border: '1px solid #c4b5fd', color: '#5b21b6', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: fixingLabour ? 0.6 : 1 }}>
                  {fixingLabour ? 'Fixing…' : '🔧 Fix Labour categories'}
                </button>
                <button onClick={() => openWeekSheet()} style={{ padding: '7px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                  + Log Time
                </button>
              </div>
            </div>

            {weekGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 14, border: '1px dashed #d1d5db', borderRadius: 8 }}>
                No time logs yet. Click &quot;Log Time&quot; or &quot;⏱ Log Time&quot; in the toolbar to enter the first weekly timesheet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {weekGroups.map(({ contactId, ws, logs }) => {
                  const key = `${contactId}_${ws}`
                  const subName = contactName(contactId)
                  const total = logs.reduce((s, l) => s + Number(l.amount), 0)
                  const allApproved = logs.every(l => l.status !== 'pending')
                  const allPaid = logs.every(l => l.status === 'paid')
                  const anyXero = logs.some(l => l.xero_bill_id)
                  const cashCount = logs.filter(l => l.status === 'paid' && !l.xero_bill_id).length
                  const pendingCount = logs.filter(l => l.status === 'pending').length
                  const billableCount = logs.filter(l => l.status !== 'paid' && !l.xero_bill_id).length
                  const isExpanded = expandedWeeks.has(key)
                  return (
                    <div key={key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: '#f9fafb', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}
                        onClick={() => setExpandedWeeks(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                          <span style={{ fontWeight: 700, color: '#111827' }}>{subName}</span>
                          <button
                            onClick={e => { e.stopPropagation(); togglePaye(contactId) }}
                            title={isPaye(contactId) ? 'Direct Labour — costs recorded as Labour. Click to switch to Subcontractor' : 'Subcontractor — click to mark as Direct Labour'}
                            style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: isPaye(contactId) ? '#e0e7ff' : '#f3f4f6', color: isPaye(contactId) ? '#4338ca' : '#9ca3af', border: `1px solid ${isPaye(contactId) ? '#c7d2fe' : '#e5e7eb'}`, cursor: 'pointer', fontWeight: 600 }}
                          >
                            {isPaye(contactId) ? 'Labour' : 'Sub'}
                          </button>
                          <span style={{ fontSize: 13, color: '#6b7280' }}>Week of {fmtWeekRange(ws)}</span>
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>· {logs.length} day{logs.length !== 1 ? 's' : ''}</span>
                          {cashCount > 0 && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>💵 {cashCount} cash</span>}
                          {pendingCount > 0 && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: '#fef9c3', color: '#854d0e', fontWeight: 600 }}>⏳ {pendingCount} pending</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(total)}</span>
                          {anyXero
                            ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>✓ Xero</span>
                            : allPaid
                              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#374151', fontWeight: 600 }}>✓ Cash paid</span>
                              : billableCount > 0
                                ? <button onClick={() => markWeekPaidCash(contactId, ws)} style={{ fontSize: 11, padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', color: '#374151', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>💵 Cash paid</button>
                                : null
                          }
                          {billableCount > 0 && (
                            <button
                              onClick={() => sendToBills(contactId, ws)}
                              disabled={sendingToBills === key}
                              style={{ fontSize: 11, padding: '3px 10px', background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#6d28d9', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: sendingToBills === key ? 0.6 : 1 }}
                            >
                              {sendingToBills === key ? '…' : '→ Bills'}
                            </button>
                          )}
                          <button onClick={() => openWeekSheet(contactId, ws)} style={{ fontSize: 11, padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', color: '#374151', borderRadius: 6, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => deleteWeek(contactId, ws)} style={{ fontSize: 11, padding: '3px 10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div>
                          {[...logs].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).map((log) => {
                            const dow = new Date(log.entry_date + 'T12:00:00').getDay()
                            const dayLabel = DAY_LABELS[dow === 0 ? 6 : dow - 1]
                            const jName = log.job_id ? jobName(log.job_id) : '—'
                            const rateLabel: Record<AdminTimeLog['rate_type'], string> = { day: 'Day', half_day: '½ Day', hourly: `${log.total_hours ?? '?'}h`, custom: 'Custom' }
                            const hasXero = !!log.xero_bill_id
                            const isPaid = log.status === 'paid'
                            return (
                              <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid #f3f4f6', fontSize: 13, flexWrap: 'wrap' }}>
                                <span style={{ color: '#6b7280', minWidth: 90, fontSize: 12 }}>{dayLabel} {new Date(log.entry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                <span style={{ color: '#374151', flex: 1, minWidth: 100 }}>{jName}</span>
                                <span style={{ color: '#6b7280', fontSize: 12 }}>{rateLabel[log.rate_type]} · {fmt(log.rate_amount)}</span>
                                <span style={{ fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{fmt(log.amount)}</span>
                                {log.notes && <span title={log.notes} style={{ cursor: 'default' }}>📝</span>}
                                {log.job_cost_id && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>✓ Cost</span>}
                                {hasXero
                                  ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>✓ Xero</span>
                                  : isPaid
                                    ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#f3f4f6', color: '#374151', fontWeight: 600 }}>✓ Cash</span>
                                    : <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#fef9c3', color: '#854d0e', fontWeight: 600 }}>⏳ Pending</span>
                                        <button onClick={() => markDayCash(log)} style={{ fontSize: 10, padding: '2px 7px', background: '#f9fafb', border: '1px solid #d1d5db', color: '#374151', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>💵 Cash</button>
                                      </div>
                                }
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Contract Modal ─────────────────────────────────────────── */}
      {contractModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>{editingContract ? 'Edit Sub Contract' : 'New Sub Contract'}</h3>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Subcontractor *</label>
                  <button
                    type="button"
                    onClick={() => { setQuickAddOpen(o => !o); setQuickAdd({ name: '', email: '', phone: '' }) }}
                    style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  >
                    {quickAddOpen ? '✕ Cancel' : '+ New Subcontractor'}
                  </button>
                </div>
                <ContactPicker
                  value={form.contactId}
                  onChange={id => setForm(f => ({ ...f, contactId: id }))}
                  contacts={subs}
                  placeholder="Search subcontractor…"
                />
                {quickAddOpen && (
                  <div style={{ marginTop: 10, padding: '12px 14px', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>New Subcontractor</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        value={quickAdd.name}
                        onChange={e => setQuickAdd(q => ({ ...q, name: e.target.value }))}
                        placeholder="Full name *"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                      />
                      <input
                        type="email"
                        value={quickAdd.email}
                        onChange={e => setQuickAdd(q => ({ ...q, email: e.target.value }))}
                        placeholder="Email address"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                      />
                      <input
                        value={quickAdd.phone}
                        onChange={e => setQuickAdd(q => ({ ...q, phone: e.target.value }))}
                        placeholder="Phone number"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                      />
                      <button
                        type="button"
                        disabled={!quickAdd.name.trim() || quickAddSaving}
                        onClick={async () => {
                          if (!quickAdd.name.trim()) return
                          setQuickAddSaving(true)
                          try {
                            const name = quickAdd.name.trim()
                            const parts = name.split(' ')
                            const first = parts.slice(0, -1).join(' ') || parts[0]
                            const last = parts.length > 1 ? parts[parts.length - 1] : ''
                            await addClient({
                              name, first, last,
                              email: quickAdd.email.trim(), phone: quickAdd.phone.trim(),
                              address: '', notes: '', paymentTerms: '30 days',
                              clientType: 'subcontractor',
                              portalStatus: 'no_email', addedFrom: 'subcontractors',
                              portalSettings: undefined as never,
                            })
                            // useEffect will auto-select once clients list updates
                            setPendingSelectName(name)
                            setQuickAddOpen(false)
                          } finally {
                            setQuickAddSaving(false)
                          }
                        }}
                        style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !quickAdd.name.trim() || quickAddSaving ? 0.5 : 1 }}
                      >
                        {quickAddSaving ? 'Saving…' : 'Add & Select'}
                      </button>
                    </div>
                  </div>
                )}
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

      {/* ── Weekly Timesheet Modal ────────────────────────────────── */}
      {weekModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 740, maxHeight: '92vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>⏱ Weekly Timesheet</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Subcontractor *</label>
                <ContactPicker
                  value={weekSub}
                  onChange={id => { setWeekSub(id); setWeekRows(buildWeekRows(weekStart, id, timeLogs)) }}
                  contacts={subs}
                  placeholder="Search subcontractor…"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: 500 }}>Week</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={e => {
                    const ws = getWeekStart(e.target.value)
                    setWeekStart(ws)
                    setWeekRows(buildWeekRows(ws, weekSub, timeLogs))
                  }}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{fmtWeekRange(weekStart)}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: 110, fontWeight: 600, color: '#374151', fontSize: 11 }}>Day</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Job</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', width: 160, fontWeight: 600, color: '#374151', fontSize: 11 }}>Rate</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', width: 80, fontWeight: 600, color: '#374151', fontSize: 11 }}>Amount</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: 72, fontWeight: 600, color: '#374151', fontSize: 11 }}>Cash paid?</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 11 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map((row, i) => {
                    const dayLabel = DAY_LABELS[i]
                    const dateLabel = new Date(row.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    const rowAmt = row.active ? (row.rateType === 'hourly' ? (Number(row.rateAmount) || 0) * (Number(row.hours) || 0) : (Number(row.rateAmount) || 0)) : 0
                    return (
                      <tr key={row.date} style={{ borderBottom: i < 6 ? '1px solid #f3f4f6' : 'none', background: row.active ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <input type="checkbox" checked={row.active} onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, active: e.target.checked } : r))} />
                            <div>
                              <div style={{ fontWeight: row.active ? 600 : 400, color: row.active ? '#111827' : '#9ca3af', fontSize: 12 }}>{dayLabel}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{dateLabel}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {row.active ? (
                            <select value={row.jobId} onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, jobId: e.target.value } : r))}
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }}>
                              <option value="">No job</option>
                              {jobs.map(j => <option key={j.id} value={j.id}>{j.client || j.address}</option>)}
                            </select>
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {row.active ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <select value={row.rateType} onChange={e => setWeekRows(rows => rows.map((r, idx) => {
                                if (idx !== i) return r
                                const rt = e.target.value as AdminTimeLog['rate_type']
                                const contact = clients.find(c => c.id === weekSub)
                                let ra = r.rateAmount
                                if (rt === 'day' && contact?.subDayRate) ra = contact.subDayRate.toString()
                                else if (rt === 'half_day' && contact?.subHalfDayRate) ra = contact.subHalfDayRate.toString()
                                else if (rt === 'hourly' && contact?.subHourlyRate) ra = contact.subHourlyRate.toString()
                                return { ...r, rateType: rt, rateAmount: ra }
                              }))} style={{ padding: '5px 4px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 11, flex: '0 0 60px' }}>
                                <option value="day">Day</option>
                                <option value="half_day">Half</option>
                                <option value="hourly">Hourly</option>
                                <option value="custom">Custom</option>
                              </select>
                              <input type="number" min="0" step="0.01" value={row.rateAmount}
                                onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, rateAmount: e.target.value } : r))}
                                style={{ width: 58, padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }} />
                              {row.rateType === 'hourly' && (
                                <input type="number" min="0" step="0.5" value={row.hours} placeholder="hrs"
                                  onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, hours: e.target.value } : r))}
                                  style={{ width: 42, padding: '5px 4px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }} />
                              )}
                            </div>
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: row.active ? '#111827' : '#d1d5db' }}>
                          {row.active ? fmt(rowAmt) : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {row.active ? (
                            <input
                              type="checkbox"
                              checked={row.paidCash}
                              title={row.paidCash ? 'Paid in cash — will be linked to job, not sent to Xero' : 'Not yet paid — will generate a Xero bill'}
                              onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, paidCash: e.target.checked } : r))}
                              style={{ accentColor: '#16a34a', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {row.active ? (
                            <input value={row.notes} onChange={e => setWeekRows(rows => rows.map((r, idx) => idx === i ? { ...r, notes: e.target.value } : r))}
                              placeholder="Notes…"
                              style={{ width: '100%', padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' as const }} />
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                    <td colSpan={3} style={{ padding: '10px', fontWeight: 600, fontSize: 13, color: '#374151' }}>
                      Total · {weekRows.filter(r => r.active).length} day{weekRows.filter(r => r.active).length === 1 ? '' : 's'} worked
                      {weekRows.some(r => r.active && r.paidCash) && (
                        <span style={{ marginLeft: 10, fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
                          · {weekRows.filter(r => r.active && r.paidCash).length} cash paid
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                      {fmt(weekRows.filter(r => r.active).reduce((s, r) => s + (r.rateType === 'hourly' ? (Number(r.rateAmount) || 0) * (Number(r.hours) || 0) : (Number(r.rateAmount) || 0)), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setWeekModal(false); setError('') }} style={{ padding: '8px 16px', background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveWeekSheet} disabled={saving} style={{ padding: '8px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Timesheet'}
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
