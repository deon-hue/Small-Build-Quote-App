'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Job, Quote, Client, Supplier, Settings, GanttState, Invoice, JobNote, PortalStatus, TemplatePhaseData, Variation, VariationStatus, TeamMember, TeamMemberRole, UserPermissions, ClientPortalSettings } from '@/lib/types'
import { FULL_PERMISSIONS, DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import { uid, JOB_TEMPLATES } from '@/lib/utils'

interface AppContextType {
  jobs: Job[]
  quotes: Quote[]
  clients: Client[]
  settings: Settings
  ganttStates: Record<string, GanttState>
  invoices: Invoice[]
  jobNotes: JobNote[]
  variations: Variation[]
  customTemplates: Record<string, TemplatePhaseData[]>
  loading: boolean

  // Team / permissions
  teamMembers: TeamMember[]
  currentMember: TeamMember | null   // null = this user is the owner
  isOwner: boolean
  permissions: UserPermissions

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

  suppliers: Supplier[]
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>
  updateSupplier: (supplier: Supplier) => Promise<void>
  deleteSupplier: (id: string) => Promise<void>

  saveSettings: (s: Settings) => Promise<void>
  saveGanttState: (jobId: string, state: GanttState) => Promise<boolean>
  getGanttState: (jobId: string) => GanttState | null

  addInvoice: (inv: Omit<Invoice, 'id' | 'ref' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (inv: Invoice) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>

  addJobNote: (jobId: string, note: string) => Promise<JobNote>
  deleteJobNote: (id: string) => Promise<void>

  addVariation: (jobId: string, v: Omit<Variation, 'id' | 'ref' | 'createdAt' | 'jobId'>) => Promise<Variation>
  updateVariation: (v: Variation) => Promise<void>
  deleteVariation: (id: string) => Promise<void>

  saveJobTypeTemplate: (jobType: string, template: TemplatePhaseData[]) => Promise<void>
  resetJobTypeTemplate: (jobType: string) => Promise<void>
  getTemplate: (jobType: string) => TemplatePhaseData[]

  nextQuoteRef: () => string

  // Team management (owner only)
  inviteTeamMember: (data: { email: string; name: string; role: TeamMemberRole; permissions: UserPermissions }) => Promise<TeamMember>
  updateTeamMember: (member: TeamMember) => Promise<void>
  deleteTeamMember: (id: string) => Promise<void>
  resendInvite: (id: string) => Promise<string>   // returns new invite token
  disableTeamMember: (id: string) => Promise<void>
  enableTeamMember: (id: string) => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

const DEFAULT_SETTINGS: Settings = {
  name: 'Buildospro',
  tagline: 'Building Extensions & Renovations',
  contact: '', phone: '', email: '', address: '',
  terms: 'A deposit of 25% is required prior to commencement of works. Stage payments are then due at agreed milestones throughout the project. Final payment is due upon practical completion.',
  extra: 'All works are carried out in accordance with current Building Regulations. Any variations to the agreed scope of works will be priced and agreed in writing prior to proceeding.',
  logo: '',
}

function mapTeamMember(r: Record<string, unknown>): TeamMember {
  return {
    id:           r.id as string,
    ownerId:      r.owner_id as string,
    authUserId:   (r.auth_user_id as string | null) ?? null,
    email:        r.email as string,
    name:         r.name as string,
    role:         r.role as TeamMemberRole,
    status:       r.status as TeamMember['status'],
    permissions:  (r.permissions as UserPermissions) || FULL_PERMISSIONS,
    inviteToken:  (r.invite_token as string | null) ?? null,
    invitedAt:    (r.invited_at as string | null) ?? null,
    lastActiveAt: (r.last_active_at as string | null) ?? null,
    createdAt:    r.created_at as string,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ganttStates, setGanttStates] = useState<Record<string, GanttState>>({})
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [jobNotes, setJobNotes] = useState<JobNote[]>([])
  const [variations, setVariations] = useState<Variation[]>([])
  const [customTemplates, setCustomTemplates] = useState<Record<string, TemplatePhaseData[]>>({})
  const [loading, setLoading] = useState(true)
  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null)
  const [isOwner, setIsOwner] = useState(true)
  const [permissions, setPermissions] = useState<UserPermissions>(FULL_PERMISSIONS)
  // Resolved owner ID used for all data inserts (ref avoids stale-closure in callbacks)
  const dataOwnerIdRef = useRef<string | null>(null)

  // ── Load all data on mount ──────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // ── Resolve effective owner ID (sub-users get their owner's ID) ──
      let resolvedOwnerId = user.id
      try {
        const { data: ownerIdData } = await supabase.rpc('get_effective_owner_id')
        if (ownerIdData) resolvedOwnerId = ownerIdData as string
      } catch { /* phase10.sql not run yet — use own ID */ }
      dataOwnerIdRef.current = resolvedOwnerId

      // ── Check if this user is a team member ──
      try {
        const { data: memberRow } = await supabase
          .from('team_members').select('*').eq('auth_user_id', user.id).maybeSingle()
        if (memberRow) {
          const member = mapTeamMember(memberRow as Record<string, unknown>)
          setCurrentMember(member)
          setIsOwner(false)
          setPermissions(member.permissions || FULL_PERMISSIONS)
          // Update last_active_at
          await supabase.from('team_members')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', memberRow.id)
        } else {
          setIsOwner(true)
          setPermissions(FULL_PERMISSIONS)
          // Load team members for the owner
          const { data: teamData } = await supabase
            .from('team_members').select('*').order('created_at', { ascending: true })
          if (Array.isArray(teamData)) {
            setTeamMembers(teamData.map(r => mapTeamMember(r as Record<string, unknown>)))
          }
        }
      } catch { /* phase10.sql not run yet — single-user mode */ }

      const [jobsRes, quotesRes, clientsRes, settingsRes, ganttRes, invoicesRes, notesRes, variationsRes, suppliersRes] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: true }),
        supabase.from('quotes').select('*').order('created_at', { ascending: true }),
        supabase.from('clients').select('*').order('created_at', { ascending: true }),
        supabase.from('settings').select('*').eq('user_id', resolvedOwnerId).maybeSingle(),
        supabase.from('gantt_states').select('*'),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('job_notes').select('*').order('created_at', { ascending: true }),
        supabase.from('variations').select('*').order('created_at', { ascending: true }),
        supabase.from('suppliers').select('*').order('created_at', { ascending: true }),
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
          quoteSource: r.quote_source || undefined,
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
          portalSettings: (r.portal_settings && typeof r.portal_settings === 'object'
            ? { ...DEFAULT_CLIENT_PORTAL_SETTINGS, ...(r.portal_settings as Partial<ClientPortalSettings>) }
            : DEFAULT_CLIENT_PORTAL_SETTINGS),
        })))
      }

      if (suppliersRes.data) {
        setSuppliers(suppliersRes.data.map(r => ({
          id: r.id, name: r.name || '', contactName: r.contact_name || '',
          phone: r.phone || '', email: r.email || '', address: r.address || '',
          notes: r.notes || '', accountNumber: r.account_number || '', addedFrom: r.added_from || '',
          xeroContactId: r.xero_contact_id || null,
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
          syncToXero: r.sync_to_xero ?? false,
          xeroInvoiceId: r.xero_invoice_id || undefined,
        })))
      }

      if (notesRes.data) {
        setJobNotes(notesRes.data.map(r => ({
          id: r.id, jobId: r.job_id, note: r.note, createdAt: r.created_at,
        })))
      }

      if (variationsRes.data) {
        setVariations(variationsRes.data.map(r => ({
          id: r.id, jobId: r.job_id, ref: r.ref, title: r.title,
          description: r.description, status: r.status as VariationStatus,
          items: r.items || [], markup: Number(r.markup), vatIncluded: r.vat_included,
          total: Number(r.total), notes: r.notes || '', locked: r.locked,
          clientApprovedAt: r.client_approved_at || null,
          clientApprovedBy: r.client_approved_by || null,
          clientRejectedAt: r.client_rejected_at || null,
          clientRejectionReason: r.client_rejection_reason || null,
          sentAt: r.sent_at || null,
          createdAt: r.created_at,
        })))
      }

      // Load custom job type templates — only available after phase6.sql is run
      try {
        const { data: tplData } = await supabase.from('job_type_templates').select('*')
        if (Array.isArray(tplData)) {
          const map: Record<string, TemplatePhaseData[]> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tplData.forEach((r: any) => { map[r.job_type] = r.template })
          setCustomTemplates(map)
        }
      } catch { /* phase6.sql not run yet — use built-in templates */ }

      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Jobs ─────────────────────────────────────────────────────
  const addJob = useCallback(async (job: Omit<Job, 'id'>): Promise<Job> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const { data, error } = await supabase.from('jobs').insert({
      user_id: ownerId, client: job.client, type: job.type, address: job.address,
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
    await supabase.from('variations').delete().eq('job_id', id)
    setJobs(prev => prev.filter(j => j.id !== id))
    setGanttStates(prev => { const n = { ...prev }; delete n[id]; return n })
    setJobNotes(prev => prev.filter(n => n.jobId !== id))
    setVariations(prev => prev.filter(v => v.jobId !== id))
  }, [supabase])

  // ── Quotes ───────────────────────────────────────────────────
  const nextQuoteRef = useCallback(() => {
    return 'QT-' + String(Math.floor(Math.random() * 9000) + 1000)
  }, [])

  const addQuote = useCallback(async (q: Omit<Quote, 'id' | 'ref' | 'savedDate'>): Promise<Quote> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const ref = 'QT-' + String(Math.floor(Math.random() * 9000) + 1000)
    const savedDate = new Date().toLocaleDateString('en-GB')
    const { data, error } = await supabase.from('quotes').insert({
      user_id: ownerId, ref, saved_date: savedDate, last_edited: '',
      status: q.status || 'pending', job_type: q.jobType, markup: q.markup,
      vat_included: q.vatIncluded, scope: q.scope, photo: q.photo,
      converted_to_job: false, customer: q.customer, phases: q.phases,
      quote_source: q.quoteSource || null,
    }).select().single()
    if (error) throw error
    const newQuote: Quote = {
      id: data.id, ref: data.ref, savedDate: data.saved_date, lastEdited: data.last_edited,
      status: data.status, jobType: data.job_type, markup: Number(data.markup),
      vatIncluded: data.vat_included, scope: data.scope, photo: data.photo,
      convertedToJob: data.converted_to_job, customer: data.customer, phases: data.phases,
      quoteSource: data.quote_source || undefined,
    }
    setQuotes(prev => [...prev, newQuote])
    return newQuote
  }, [supabase])

  const updateQuote = useCallback(async (q: Quote) => {
    await supabase.from('quotes').update({
      status: q.status, job_type: q.jobType, markup: q.markup,
      vat_included: q.vatIncluded, scope: q.scope, photo: q.photo,
      converted_to_job: q.convertedToJob, customer: q.customer, phases: q.phases,
      quote_source: q.quoteSource || null,
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
    const ownerId = dataOwnerIdRef.current || user!.id
    const portalSettings = c.portalSettings || DEFAULT_CLIENT_PORTAL_SETTINGS
    const basePayload = {
      user_id: ownerId, name: c.name, first_name: c.first, last_name: c.last,
      phone: c.phone, email: c.email, address: c.address,
      notes: c.notes, added_from: c.addedFrom,
      updated_at: new Date().toISOString(),
    }
    // Try with portal_settings column; fall back without it if column doesn't exist yet
    let res = await supabase.from('clients').insert({ ...basePayload, portal_settings: portalSettings }).select().single()
    if (res.error) {
      res = await supabase.from('clients').insert(basePayload).select().single()
    }
    if (res.error) throw res.error
    const data = res.data
    setClients(prev => [...prev, {
      id: data.id, name: data.name, first: data.first_name || '', last: data.last_name || '',
      phone: data.phone || '', email: data.email || '', address: data.address || '',
      notes: data.notes || '', addedFrom: data.added_from || '',
      portalInvitedAt: null, portalStatus: 'not_invited', portalLastLogin: null,
      portalSettings,
    }])
  }, [supabase])

  const updateClient = useCallback(async (c: Client) => {
    const basePayload = {
      name: c.name, first_name: c.first, last_name: c.last,
      phone: c.phone, email: c.email, address: c.address, notes: c.notes,
      updated_at: new Date().toISOString(),
    }
    // Try with portal_settings column; fall back without it if column doesn't exist yet
    const { error } = await supabase.from('clients').update({
      ...basePayload,
      portal_settings: c.portalSettings || DEFAULT_CLIENT_PORTAL_SETTINGS,
    }).eq('id', c.id)
    if (error) {
      await supabase.from('clients').update(basePayload).eq('id', c.id)
    }
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

  // ── Suppliers ────────────────────────────────────────────────
  const addSupplier = useCallback(async (s: Omit<Supplier, 'id'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const { data, error } = await supabase.from('suppliers').insert({
      user_id: ownerId, name: s.name, contact_name: s.contactName, phone: s.phone,
      email: s.email, address: s.address, notes: s.notes, account_number: s.accountNumber,
      added_from: s.addedFrom,
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    setSuppliers(prev => [...prev, {
      id: data.id, name: data.name || '', contactName: data.contact_name || '',
      phone: data.phone || '', email: data.email || '', address: data.address || '',
      notes: data.notes || '', accountNumber: data.account_number || '', addedFrom: data.added_from || '',
      xeroContactId: data.xero_contact_id || null,
    }])
  }, [supabase])

  const updateSupplier = useCallback(async (s: Supplier) => {
    await supabase.from('suppliers').update({
      name: s.name, contact_name: s.contactName, phone: s.phone, email: s.email,
      address: s.address, notes: s.notes, account_number: s.accountNumber,
      updated_at: new Date().toISOString(),
    }).eq('id', s.id)
    setSuppliers(prev => prev.map(x => x.id === s.id ? s : x))
  }, [supabase])

  const deleteSupplier = useCallback(async (id: string) => {
    await supabase.from('suppliers').delete().eq('id', id)
    setSuppliers(prev => prev.filter(s => s.id !== id))
  }, [supabase])

  // ── Settings ─────────────────────────────────────────────────
  const saveSettings = useCallback(async (s: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    await supabase.from('settings').upsert({
      user_id: ownerId, company_name: s.name, tagline: s.tagline,
      contact: s.contact, phone: s.phone, email: s.email, address: s.address,
      terms: s.terms, extra: s.extra, logo: s.logo,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSettings(s)
  }, [supabase])

  // ── Gantt ────────────────────────────────────────────────────
  const saveGanttState = useCallback(async (jobId: string, state: GanttState): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { console.error('[saveGanttState] No authenticated user'); return false }
    const ownerId = dataOwnerIdRef.current || user.id
    const { error } = await supabase.from('gantt_states').upsert(
      { job_id: jobId, user_id: ownerId, state },
      { onConflict: 'job_id,user_id' }
    )
    if (error) {
      console.error('[saveGanttState] Supabase error:', error)
      return false
    }
    setGanttStates(prev => ({ ...prev, [jobId]: state }))
    return true
  }, [supabase])

  const getGanttState = useCallback((jobId: string): GanttState | null => {
    return ganttStates[jobId] || null
  }, [ganttStates])

  // ── Invoices ─────────────────────────────────────────────────
  const addInvoice = useCallback(async (inv: Omit<Invoice, 'id' | 'ref' | 'createdAt'>): Promise<Invoice> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const ref = 'INV-' + String(Math.floor(Math.random() * 9000) + 1000)
    const { data, error } = await supabase.from('invoices').insert({
      user_id: ownerId, ref,
      job_id: inv.jobId || '', quote_id: inv.quoteId || '',
      client_name: inv.clientName, client_address: inv.clientAddress,
      client_email: inv.clientEmail, line_items: inv.lineItems,
      subtotal: inv.subtotal, vat_included: inv.vatIncluded,
      vat_amount: inv.vatAmount, total: inv.total,
      status: inv.status, issue_date: inv.issueDate, due_date: inv.dueDate,
      notes: inv.notes, payment_plan: inv.paymentPlan || null,
      sync_to_xero: inv.syncToXero ?? false,
      xero_invoice_id: inv.xeroInvoiceId || null,
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
      syncToXero: data.sync_to_xero ?? false,
      xeroInvoiceId: data.xero_invoice_id || undefined,
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
      sync_to_xero: inv.syncToXero ?? false,
      xero_invoice_id: inv.xeroInvoiceId || null,
    }).eq('id', inv.id)
    setInvoices(prev => prev.map(x => x.id === inv.id ? inv : x))
  }, [supabase])

  const deleteInvoice = useCallback(async (id: string) => {
    await supabase.from('invoices').delete().eq('id', id)
    setInvoices(prev => prev.filter(i => i.id !== id))
  }, [supabase])

  // ── Variations ───────────────────────────────────────────────
  const addVariation = useCallback(async (
    jobId: string,
    v: Omit<Variation, 'id' | 'ref' | 'createdAt' | 'jobId'>
  ): Promise<Variation> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const ref = 'VAR-' + String(Math.floor(Math.random() * 9000) + 1000)
    const { data, error } = await supabase.from('variations').insert({
      user_id: ownerId, job_id: jobId, ref,
      title: v.title, description: v.description, status: v.status,
      items: v.items, markup: v.markup, vat_included: v.vatIncluded,
      total: v.total, notes: v.notes, locked: v.locked,
      client_approved_at: v.clientApprovedAt, client_approved_by: v.clientApprovedBy,
      client_rejected_at: v.clientRejectedAt, client_rejection_reason: v.clientRejectionReason,
      sent_at: v.sentAt,
    }).select().single()
    if (error) throw error
    const newVar: Variation = {
      id: data.id, jobId: data.job_id, ref: data.ref, title: data.title,
      description: data.description, status: data.status as VariationStatus,
      items: data.items || [], markup: Number(data.markup), vatIncluded: data.vat_included,
      total: Number(data.total), notes: data.notes || '', locked: data.locked,
      clientApprovedAt: data.client_approved_at || null,
      clientApprovedBy: data.client_approved_by || null,
      clientRejectedAt: data.client_rejected_at || null,
      clientRejectionReason: data.client_rejection_reason || null,
      sentAt: data.sent_at || null, createdAt: data.created_at,
    }
    setVariations(prev => [...prev, newVar])
    return newVar
  }, [supabase])

  const updateVariation = useCallback(async (v: Variation) => {
    const { error } = await supabase.from('variations').update({
      title: v.title, description: v.description, status: v.status,
      items: v.items, markup: v.markup, vat_included: v.vatIncluded,
      total: v.total, notes: v.notes, locked: v.locked,
      client_approved_at: v.clientApprovedAt, client_approved_by: v.clientApprovedBy,
      client_rejected_at: v.clientRejectedAt, client_rejection_reason: v.clientRejectionReason,
      sent_at: v.sentAt, updated_at: new Date().toISOString(),
    }).eq('id', v.id)
    if (error) throw error
    setVariations(prev => prev.map(x => x.id === v.id ? v : x))
  }, [supabase])

  const deleteVariation = useCallback(async (id: string) => {
    await supabase.from('variations').delete().eq('id', id)
    setVariations(prev => prev.filter(v => v.id !== id))
  }, [supabase])

  // ── Job Notes ────────────────────────────────────────────────
  const addJobNote = useCallback(async (jobId: string, note: string): Promise<JobNote> => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    const { data, error } = await supabase.from('job_notes').insert({
      user_id: ownerId, job_id: jobId, note,
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

  // ── Job Type Templates ────────────────────────────────────────
  const saveJobTypeTemplate = useCallback(async (jobType: string, template: TemplatePhaseData[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    await supabase.from('job_type_templates').upsert({
      user_id: ownerId, job_type: jobType, template,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,job_type' })
    setCustomTemplates(prev => ({ ...prev, [jobType]: template }))
  }, [supabase])

  const resetJobTypeTemplate = useCallback(async (jobType: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = dataOwnerIdRef.current || user!.id
    await supabase.from('job_type_templates').delete().eq('user_id', ownerId).eq('job_type', jobType)
    setCustomTemplates(prev => {
      const next = { ...prev }
      delete next[jobType]
      return next
    })
  }, [supabase])

  const getTemplate = useCallback((jobType: string): TemplatePhaseData[] => {
    return customTemplates[jobType] || JOB_TEMPLATES[jobType] || []
  }, [customTemplates])

  // ── Team Management (owner only) ─────────────────────────────
  const inviteTeamMember = useCallback(async (data: {
    email: string; name: string; role: TeamMemberRole; permissions: UserPermissions
  }): Promise<TeamMember> => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: row, error } = await supabase.from('team_members').insert({
      owner_id: user!.id,
      email: data.email.trim().toLowerCase(),
      name: data.name.trim(),
      role: data.role,
      permissions: data.permissions,
      status: 'invited',
    }).select().single()
    if (error) throw error
    const member = mapTeamMember(row as Record<string, unknown>)
    setTeamMembers(prev => [...prev, member])
    return member
  }, [supabase])

  const updateTeamMember = useCallback(async (member: TeamMember) => {
    const { error } = await supabase.from('team_members').update({
      name: member.name, role: member.role, permissions: member.permissions,
    }).eq('id', member.id)
    if (error) throw error
    setTeamMembers(prev => prev.map(m => m.id === member.id ? member : m))
  }, [supabase])

  const deleteTeamMember = useCallback(async (id: string) => {
    await supabase.from('team_members').delete().eq('id', id)
    setTeamMembers(prev => prev.filter(m => m.id !== id))
  }, [supabase])

  const resendInvite = useCallback(async (id: string): Promise<string> => {
    // Generate a fresh invite token
    const newToken = crypto.randomUUID()
    const { error } = await supabase.from('team_members').update({
      invite_token: newToken, invited_at: new Date().toISOString(), status: 'invited',
    }).eq('id', id)
    if (error) throw error
    setTeamMembers(prev => prev.map(m => m.id === id
      ? { ...m, inviteToken: newToken, status: 'invited' as const }
      : m
    ))
    return newToken
  }, [supabase])

  const disableTeamMember = useCallback(async (id: string) => {
    await supabase.from('team_members').update({ status: 'disabled' }).eq('id', id)
    setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, status: 'disabled' as const } : m))
  }, [supabase])

  const enableTeamMember = useCallback(async (id: string) => {
    await supabase.from('team_members').update({ status: 'active' }).eq('id', id)
    setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, status: 'active' as const } : m))
  }, [supabase])

  return (
    <AppContext.Provider value={{
      jobs, quotes, clients, settings, ganttStates, invoices, jobNotes, variations, customTemplates, loading,
      teamMembers, currentMember, isOwner, permissions,
      addJob, updateJob, deleteJob,
      addQuote, updateQuote, deleteQuote,
      addClient, updateClient, deleteClient, upsertClientFromQuote, markPortalInvite,
      suppliers, addSupplier, updateSupplier, deleteSupplier,
      saveSettings,
      saveGanttState, getGanttState,
      addInvoice, updateInvoice, deleteInvoice,
      addJobNote, deleteJobNote,
      addVariation, updateVariation, deleteVariation,
      saveJobTypeTemplate, resetJobTypeTemplate, getTemplate,
      nextQuoteRef,
      inviteTeamMember, updateTeamMember, deleteTeamMember, resendInvite,
      disableTeamMember, enableTeamMember,
    }}>
      {children}
    </AppContext.Provider>
  )
}
