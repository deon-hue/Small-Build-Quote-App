'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Job, Quote, Client, Settings, GanttState, Invoice, JobNote, PortalStatus } from '@/lib/types'
import { uid } from '@/lib/utils'

interface AppContextType {
  jobs: Job[]
  quotes: Quote[]
  clients: Client[]
  settings: Settings
  ganttStates: Record<string, GanttState>
  invoices: Invoice[]
  jobNotes: JobNote[]
  loading: boolean

  addJob: (job: Omit<Job, 'id'>) => Promise<Job>
  updateJob: (job: Job) => Promise<void>
  deleteJob: (id: string) => Promise<void>

  addQuote: (quote: Omit<Quote, 'id' | 'ref' | 'savedDate'>) => Promise<Quote>
  updateQuote: (quote: Quote) => Promise<void>
  deleteQuote: (id: string) => Promise<void>

  addClient: (client: Omit<Client, 'id'>) => Promise<void>
  updateClient: (client: Client) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  upsertClientFromQuote: (customer: Quote['customer']) => Promise<void>
  markPortalInvite: (clientId: string) => Promise<void>

  saveSettings: (s: Settings) => Promise<void>
  saveGanttState: (jobId: string, state: GanttState) => Promise<void>
  getGanttState: (jobId: string) => GanttState | null

  addInvoice: (inv: Omit<Invoice, 'id' | 'ref' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (inv: Invoice) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>

  addJobNote: (jobId: string, note: string) => Promise<JobNote>
  deleteJobNote: (id: string) => Promise<void>

  nextQuoteRef: () => string
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

const DEFAULT_SETTINGS: Settings = {
  name: 'Small Build Company Ltd',
  tagline: 'Building Extensions & Renovations',
  contact: '', phone: '', email: '', address: '',
  terms: 'A deposit of 25% is required prior to commencement of works. Stage payments are then due at agreed milestones throughout the project. Final payment is due upon practical completion.',
  extra: 'All works are carried out in accordance with current Building Regulations. Any variations to the agreed scope of works will be priced and agreed in writing prior to proceeding.',
  logo: '',
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ganttStates, setGanttStates] = useState<Record<string, GanttState>>({})
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [jobNotes, setJobNotes] = useState<JobNote[]>([])
  const [loading, setLoading] = useState(true)

  // ── Load all data on mount ──────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [jobsRes, quotesRes, clientsRes, settingsRes, ganttRes, invoicesRes, notesRes] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: true }),
        supabase.from('quotes').select('*').order('created_at', { ascending: true }),
        supabase.from('clients').select('*').order('created_at', { ascending: true }),
        supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('gantt_states').select('*'),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('job_notes').select('*').order('created_at', { ascending: true }),
      ])

      // Separately try to get portal status — only available after phase5.sql is run
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let portalStatusMap: Record<string, any> = {}
      try {
        const { data: statusData } = await supabase.rpc('get_clients_with_portal_status')
        if (Array.isArray(statusData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statusData.forEach((r: any) => { portalStatusMap[r.id] = r })
        }
      } catch { /* phase5.sql not run yet — portal status stays as defaults */ }

      if (jobsRes.data) {
        setJobs(jobsRes.data.map(r => ({
          id: r.id, client: r.client, type: r.type, address: r.address,
          value: Number(r.value), stage: r.stage, start: r.start_date || '',
          weeks: r.weeks, done: r.done, notes: r.notes, quoteId: r.quote_id || undefined,
        })))
      }

      if (quotesRes.data) {
        setQuotes(quotesRes.data.map(r => ({
          id: r.id, ref: r.ref, savedDate: r.saved_date, lastEdited: r.last_edited,
          status: r.status, jobType: r.job_type, markup: Number(r.markup),
          vatIncluded: r.vat_included, scope: r.scope, photo: r.photo,
          convertedToJob: r.converted_to_job, customer: r.customer, phases: r.phases,
          clientApprovedAt: r.client_approved_at || null,
          clientApprovedBy: r.client_approved_by || null,
        })))
      }

      if (clientsRes.data) {
        setClients(clientsRes.data.map(r => ({
          id: r.id, name: r.name, first: r.first_name || '', last: r.last_name || '',
          phone: r.phone || '', email: r.email || '', address: r.address || '',
          notes: r.notes || '', addedFrom: r.added_from || '',
          portalInvitedAt: portalStatusMap[r.id]?.portal_invited_at || null,
          portalStatus: (portalStatusMap[r.id]?.portal_status || (r.email ? 'not_invited' : 'no_email')) as PortalStatus,
          portalLastLogin: portalStatusMap[r.id]?.portal_last_login || null,
        })))
      }

      if (settingsRes.data) {
        setSettings({
          name: settingsRes.data.company_name, tagline: settingsRes.data.tagline,
          contact: settingsRes.data.contact, phone: settingsRes.data.phone,
          email: settingsRes.data.email, address: settingsRes.data.address,
          terms: settingsRes.data.terms, extra: settingsRes.data.extra,
          logo: settingsRes.data.logo,
        })
      }

      if (ganttRes.data) {
        const map: Record<string, GanttState> = {}
        ganttRes.data.forEach(r => { map[r.job_id] = r.state })
        setGanttStates(map)
      }

      if (invoicesRes.data) {
        setInvoices(invoicesRes.data.map(r => ({
          id: r.id, ref: r.ref, jobId: r.job_id || '', quoteId: r.quote_id || '',
          clientName: r.client_name, clientAddress: r.client_address || '',
          clientEmail: r.client_email || '', lineItems: r.line_items || [],
          subtotal: Number(r.subtotal), vatIncluded: r.vat_included,
          vatAmount: Number(r.vat_amount), total: Number(r.total),
          status: r.status, issueDate: r.issue_date || '', dueDate: r.due_date || '',
          notes: r.notes || '', createdAt: r.created_at,
          paymentPlan: r.payment_plan || null,
        })))
      }

      if (notesRes.data) {
        setJobNotes(notesRes.data.map(r => ({
          id: r.id, jobId: r.job_id, note: r.note, createdAt: r.created_at,
        })))
      }

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Jobs ─────────────────────────────────────────────────────
  const addJob = useCallback(async (job: Omit<Job, 'id'>): Promise<Job> => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('jobs').insert({
      user_id: user!.id, client: job.client, type: job.type, address: job.address,
      value: job.value, stage: job.stage, start_date: job.start || null,
      weeks: job.weeks, done: job.done, notes: job.notes, quote_id: job.quoteId || null,
    }).select().single()
    if (error) throw error
    const newJob: Job = {
      id: data.id, client: data.client, type: data.type, address: data.address,
      value: Number(data.value), stage: data.stage, start: data.start_date || '',
      weeks: data.weeks, done: data.done, notes: data.notes, quoteId: data.quote_id || undefined,
    }
    setJobs(prev => [...prev, newJob])
    return newJob
  }, [supabase])

  const updateJob = useCallback(async (job: Job) => {
    await supabase.from('jobs').update({
      client: job.client, type: job.type, address: job.address, value: job.value,
      stage: job.stage, start_date: job.start || null, weeks: job.weeks,
      done: job.done, notes: job.notes, quote_id: job.quoteId || null,
    }).eq('id', job.id)
    setJobs(prev => prev.map(j => j.id === job.id ? job : j))
  }, [supabase])

  const deleteJob = useCallback(async (id: string) => {
    await supabase.from('jobs').delete().eq('id', id)
    await supabase.from('gantt_states').delete().eq('job_id', id)
    await supabase.from('job_notes').delete().eq('job_id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
    setGanttStates(prev => { const n = { ...prev }; delete n[id]; return n })
    setJobNotes(prev => prev.filter(n => n.jobId !== id))
  }, [supabase])

  // ── Quotes ───────────────────────────────────────────────────
  const nextQuoteRef = useCallback(() => {
    return 'QT-' + String(Math.floor(Math.random() * 9000) + 1000)
  }, [])

  const addQuote = useCallback(async (q: Omit<Quote, 'id' | 'ref' | 'savedDate'>): Promise<Quote> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ref = 'QT-' + String(Math.floor(Math.random() * 9000) + 1000)
    const savedDate = new Date().toLocaleDateString('en-GB')
    const { data, error } = await supabase.from('quotes').insert({
      user_id: user!.id, ref, saved_date: savedDate, last_edited: '',
      status: q.status || 'pending', job_type: q.jobType, markup: q.markup,
      vat_included: q.vatIncluded, scope: q.scope, photo: q.photo,
      converted_to_job: false, customer: q.customer, phases: q.phases,
    }).select().single()
    if (error) throw error
    const newQuote: Quote = {
      id: data.id, ref: data.ref, savedDate: data.saved_date, lastEdited: data.last_edited,
      status: data.status, jobType: data.job_type, markup: Number(data.markup),
      vatIncluded: data.vat_included, scope: data.scope, photo: data.photo,
      convertedToJob: data.converted_to_job, customer: data.customer, phases: data.phases,
    }
    setQuotes(prev => [...prev, newQuote])
    return newQuote
  }, [supabase])

  const updateQuote = useCallback(async (q: Quote) => {
    await supabase.from('quotes').update({
      status: q.status, job_type: q.jobType, markup: q.markup,
      vat_included: q.vatIncluded, scope: q.scope, photo: q.photo,
      converted_to_job: q.convertedToJob, customer: q.customer, phases: q.phases,
      last_edited: new Date().toLocaleDateString('en-GB'),
    }).eq('id', q.id)
    setQuotes(prev => prev.map(x => x.id === q.id ? { ...q, lastEdited: new Date().toLocaleDateString('en-GB') } : x))
  }, [supabase])

  const deleteQuote = useCallback(async (id: string) => {
    await supabase.from('quotes').delete().eq('id', id)
    setQuotes(prev => prev.filter(q => q.id !== id))
  }, [supabase])

  // ── Clients ──────────────────────────────────────────────────
  const addClient = useCallback(async (c: Omit<Client, 'id'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('clients').insert({
      user_id: user!.id, name: c.name, first_name: c.first, last_name: c.last,
      phone: c.phone, email: c.email, address: c.address,
      notes: c.notes, added_from: c.addedFrom,
    }).select().single()
    if (error) throw error
    setClients(prev => [...prev, {
      id: data.id, name: data.name, first: data.first_name || '', last: data.last_name || '',
      phone: data.phone || '', email: data.email || '', address: data.address || '',
      notes: data.notes || '', addedFrom: data.added_from || '',
      portalInvitedAt: null, portalStatus: 'not_invited', portalLastLogin: null,
    }])
  }, [supabase])

  const updateClient = useCallback(async (c: Client) => {
    await supabase.from('clients').update({
      name: c.name, first_name: c.first, last_name: c.last,
      phone: c.phone, email: c.email, address: c.address, notes: c.notes,
    }).eq('id', c.id)
    setClients(prev => prev.map(x => x.id === c.id ? c : x))
  }, [supabase])

  const deleteClient = useCallback(async (id: string) => {
    await supabase.from('clients').delete().eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
  }, [supabase])

  const markPortalInvite = useCallback(async (clientId: string) => {
    await supabase.rpc('mark_portal_invite', { p_client_id: clientId })
    const now = new Date().toISOString()
    setClients(prev => prev.map(c => c.id === clientId
      ? { ...c, portalInvitedAt: now, portalStatus: c.portalStatus === 'active' ? 'active' : 'invited' }
      : c
    ))
  }, [supabase])

  const upsertClientFromQuote = useCallback(async (customer: Quote['customer']) => {
    if (!customer.name) return
    const nameLower = customer.name.trim().toLowerCase()
    const existing = clients.find(c =>
      (c.name || '').toLowerCase() === nameLower ||
      ((c.first + ' ' + c.last).trim()).toLowerCase() === nameLower
    )
    if (existing) {
      const updated = {
        ...existing,
        email: customer.email && !existing.email ? customer.email : existing.email,
        phone: customer.phone && !existing.phone ? customer.phone : existing.phone,
        address: customer.address && !existing.address ? customer.address : existing.address,
      }
      await updateClient(updated)
    } else {
      const salutations = ['mr','mrs','ms','miss','dr']
      const parts = customer.name.trim().split(' ')
      const nameParts = parts.filter(p => !salutations.includes(p.replace(/[^a-z]/gi,'').toLowerCase()))
      const useParts = nameParts.length ? nameParts : parts
      const first = useParts.slice(0, -1).join(' ') || useParts[0] || customer.name
      const last = useParts.length > 1 ? useParts[useParts.length - 1] : ''
      await addClient({
        name: customer.name, first, last,
        phone: customer.phone || '', email: customer.email || '',
        address: customer.address || '', notes: '', addedFrom: 'quote',
      })
    }
  }, [clients, addClient, updateClient])

  // ── Settings ─────────────────────────────────────────────────
  const saveSettings = useCallback(async (s: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('settings').upsert({
      user_id: user!.id, company_name: s.name, tagline: s.tagline,
      contact: s.contact, phone: s.phone, email: s.email, address: s.address,
      terms: s.terms, extra: s.extra, logo: s.logo,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSettings(s)
  }, [supabase])

  // ── Gantt ────────────────────────────────────────────────────
  const saveGanttState = useCallback(async (jobId: string, state: GanttState) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('gantt_states').upsert(
      { job_id: jobId, user_id: user!.id, state },
      { onConflict: 'job_id,user_id' }
    )
    setGanttStates(prev => ({ ...prev, [jobId]: state }))
  }, [supabase])

  const getGanttState = useCallback((jobId: string): GanttState | null => {
    return ganttStates[jobId] || null
  }, [ganttStates])

  // ── Invoices ─────────────────────────────────────────────────
  const addInvoice = useCallback(async (inv: Omit<Invoice, 'id' | 'ref' | 'createdAt'>): Promise<Invoice> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ref = 'INV-' + String(Math.floor(Math.random() * 9000) + 1000)
    const { data, error } = await supabase.from('invoices').insert({
      user_id: user!.id, ref,
      job_id: inv.jobId || '', quote_id: inv.quoteId || '',
      client_name: inv.clientName, client_address: inv.clientAddress,
      client_email: inv.clientEmail, line_items: inv.lineItems,
      subtotal: inv.subtotal, vat_included: inv.vatIncluded,
      vat_amount: inv.vatAmount, total: inv.total,
      status: inv.status, issue_date: inv.issueDate, due_date: inv.dueDate,
      notes: inv.notes, payment_plan: inv.paymentPlan || null,
    }).select().single()
    if (error) throw error
    const newInv: Invoice = {
      id: data.id, ref: data.ref, jobId: data.job_id || '', quoteId: data.quote_id || '',
      clientName: data.client_name, clientAddress: data.client_address || '',
      clientEmail: data.client_email || '', lineItems: data.line_items || [],
      subtotal: Number(data.subtotal), vatIncluded: data.vat_included,
      vatAmount: Number(data.vat_amount), total: Number(data.total),
      status: data.status, issueDate: data.issue_date || '', dueDate: data.due_date || '',
      notes: data.notes || '', createdAt: data.created_at,
      paymentPlan: data.payment_plan || null,
    }
    setInvoices(prev => [newInv, ...prev])
    return newInv
  }, [supabase])

  const updateInvoice = useCallback(async (inv: Invoice) => {
    await supabase.from('invoices').update({
      client_name: inv.clientName, client_address: inv.clientAddress,
      client_email: inv.clientEmail, line_items: inv.lineItems,
      subtotal: inv.subtotal, vat_included: inv.vatIncluded,
      vat_amount: inv.vatAmount, total: inv.total,
      status: inv.status, issue_date: inv.issueDate, due_date: inv.dueDate,
      notes: inv.notes, payment_plan: inv.paymentPlan || null,
    }).eq('id', inv.id)
    setInvoices(prev => prev.map(x => x.id === inv.id ? inv : x))
  }, [supabase])

  const deleteInvoice = useCallback(async (id: string) => {
    await supabase.from('invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(i => i.id !== id))
  }, [supabase])

  // ── Job Notes ────────────────────────────────────────────────
  const addJobNote = useCallback(async (jobId: string, note: string): Promise<JobNote> => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('job_notes').insert({
      user_id: user!.id, job_id: jobId, note,
    }).select().single()
    if (error) throw error
    const newNote: JobNote = { id: data.id, jobId: data.job_id, note: data.note, createdAt: data.created_at }
    setJobNotes(prev => [...prev, newNote])
    return newNote
  }, [supabase])

  const deleteJobNote = useCallback(async (id: string) => {
    await supabase.from('job_notes').delete().eq('id', id)
    setJobNotes(prev => prev.filter(n => n.id !== id))
  }, [supabase])

  return (
    <AppContext.Provider value={{
      jobs, quotes, clients, settings, ganttStates, invoices, jobNotes, loading,
      addJob, updateJob, deleteJob,
      addQuote, updateQuote, deleteQuote,
      addClient, updateClient, deleteClient, upsertClientFromQuote, markPortalInvite,
      saveSettings,
      saveGanttState, getGanttState,
      addInvoice, updateInvoice, deleteInvoice,
      addJobNote, deleteJobNote,
      nextQuoteRef,
    }}>
      {children}
    </AppContext.Provider>
  )
}
