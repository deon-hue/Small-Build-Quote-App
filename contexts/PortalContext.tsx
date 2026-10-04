'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Quote, Job, Invoice, GanttState, Variation, VariationStatus, ClientPortalSettings } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'

export interface PortalSettings {
  name: string
  tagline: string
  email: string
  phone: string
  address: string
  logo: string
}

export interface PortalPayment {
  id: string
  jobId: string
  amount: number
  paymentDate: string
  method: string
  notes: string
}

/** A building contract as the client sees it in the portal */
export interface PortalContract {
  id: string; jobId: string; status: 'draft' | 'sent' | 'signed'; secondClientName: string | null
  clientSignedAt: string | null; clientSignedBy: string | null
  client2SignedAt: string | null; client2SignedBy: string | null
  createdAt: string; draftUrl: string | null; signedUrl: string | null
}

interface PortalContextType {
  contracts: PortalContract[]
  reloadContracts: () => Promise<void>
  quotes: Quote[]
  jobs: Job[]
  invoices: Invoice[]
  variations: Variation[]
  payments: PortalPayment[]
  ganttStates: Record<string, GanttState>
  settings: PortalSettings
  clientSettings: ClientPortalSettings
  userEmail: string
  loading: boolean
  error: string | null
  reload: () => void
}

const PortalContext = createContext<PortalContextType | null>(null)

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider')
  return ctx
}

const DEFAULT_SETTINGS: PortalSettings = {
  name: '', tagline: '', email: '', phone: '', address: '', logo: '',
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [variations, setVariations] = useState<Variation[]>([])
  const [payments, setPayments] = useState<PortalPayment[]>([])
  const [ganttStates, setGanttStates] = useState<Record<string, GanttState>>({})
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS)
  const [clientSettings, setClientSettings] = useState<ClientPortalSettings>(DEFAULT_CLIENT_PORTAL_SETTINGS)
  const [userEmail, setUserEmail] = useState('')
  const [contracts, setContracts] = useState<PortalContract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const silentPollRef = useRef(false)
  const lastLoadRef = useRef(0)       // when the last refresh started, so tab switches don't re-download needlessly
  const profileReadyRef = useRef(false) // create_customer_profile only needs to succeed once per visit

  // Every contract on every one of this client's jobs (one request per job). Drafts are never shown to the client.
  async function reloadContracts(jobList: Job[] = jobs) {
    const lists = await Promise.all(jobList.map(async j => {
      try {
        const res = await fetch(`/api/portal/job-contracts?jobId=${j.id}`)
        const data = res.ok ? await res.json() : []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (Array.isArray(data) ? data : []).map((c: any) => ({ ...c, jobId: j.id } as PortalContract))
      } catch { return null }   // network trouble: keep what we had for this job
    }))
    setContracts(prev => {
      const next: PortalContract[] = []
      jobList.forEach((j, i) => { next.push(...(lists[i] ?? prev.filter(c => c.jobId === j.id))) })
      return next
    })
  }

  function reload() {
    setError(null)
    setLoading(true)
    setTick(t => t + 1)
  }

  // Refresh when the client switches back to the tab — but quietly (no spinner), and only if the
  // data is more than 30 s old, so flicking between apps doesn't re-download everything each time.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadRef.current > 30_000) {
        silentPollRef.current = true
        setTick(t => t + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent background poll every 60 s — picks up Gantt changes, job progress
  // updates, etc. made by the admin without flashing the loading spinner. (Each poll re-fetches
  // the customer's whole portal, so this is deliberately not any more frequent.)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        silentPollRef.current = true
        setTick(t => t + 1)
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      const silent = silentPollRef.current
      silentPollRef.current = false
      lastLoadRef.current = Date.now()
      if (!silent) setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      setUserEmail(user.email || '')

      // Make sure a profile exists (no-op if already set up). Once it has succeeded there's no
      // need to ask again on every background refresh.
      if (!profileReadyRef.current) {
        const { error: profileErr } = await supabase.rpc('create_customer_profile')
        if (profileErr) {
          // RPC doesn't exist yet → phase3.sql not run
          setError('setup_required')
          setLoading(false)
          return
        }
        profileReadyRef.current = true
      }

      // Fetch all portal data in one call
      const { data, error: rpcError } = await supabase.rpc('get_portal_data')

      if (rpcError) {
        setError('rpc_error')
        setLoading(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = data as any

      if (result?.error) {
        setError(result.error as string)
        setLoading(false)
        return
      }

      // Map quotes
      if (Array.isArray(result?.quotes)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setQuotes(result.quotes.map((r: any) => ({
          id: r.id, ref: r.ref, savedDate: r.saved_date || '',
          lastEdited: r.last_edited || '', status: r.status,
          jobType: r.job_type, markup: Number(r.markup),
          vatIncluded: r.vat_included, scope: r.scope || '', scopeNotes: r.scope_notes || '', photo: r.photo || '',
          convertedToJob: r.converted_to_job,
          customer: r.customer || { name: '', address: '', email: '', phone: '' },
          phases: r.phases || [],
          clientApprovedAt: r.client_approved_at || null,
          clientApprovedBy: r.client_approved_by || null,
        })))
      }

      // Map jobs
      if (Array.isArray(result?.jobs)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedJobs = result.jobs.map((r: any) => ({
          id: r.id, client: r.client, type: r.type, address: r.address || '',
          value: Number(r.value), stage: r.stage,
          start: r.start_date || '', weeks: r.weeks, done: r.done,
          notes: r.notes || '',
        }))
        setJobs(mappedJobs)
        reloadContracts(mappedJobs)   // not awaited: the portal shows now, contracts fill in a moment later
      }

      // Fetch gantt states via dedicated function (works regardless of whether
      // get_portal_data has been updated with the gantt_state join).
      // Falls back gracefully if the function hasn't been deployed yet.
      try {
        const { data: ganttData } = await supabase.rpc('get_gantt_states_for_portal')
        if (Array.isArray(ganttData)) {
          const ganttMap: Record<string, GanttState> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ganttData.forEach((r: any) => { if (r.state) ganttMap[r.job_id] = r.state as GanttState })
          setGanttStates(ganttMap)
        }
      } catch {
        // get_gantt_states_for_portal not yet deployed — fall back to any gantt_state
        // embedded in the get_portal_data result (requires fix-gantt.sql to have been run)
        if (Array.isArray(result?.jobs)) {
          const ganttMap: Record<string, GanttState> = {}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(result.jobs as any[]).forEach((r: any) => {
            if (r.gantt_state) ganttMap[r.id] = r.gantt_state as GanttState
          })
          setGanttStates(ganttMap)
        }
      }

      // Map invoices
      if (Array.isArray(result?.invoices)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setInvoices(result.invoices.map((r: any) => ({
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

      // Map variations
      if (Array.isArray(result?.variations)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setVariations(result.variations.map((r: any) => ({
          id: r.id, jobId: r.job_id, ref: r.ref, title: r.title,
          description: r.description, status: r.status as VariationStatus,
          items: r.items || [], markup: Number(r.markup), vatIncluded: r.vat_included,
          total: Number(r.total), notes: r.notes || '', locked: r.locked,
          clientApprovedAt: r.client_approved_at || null,
          clientApprovedBy: r.client_approved_by || null,
          clientRejectedAt: r.client_rejected_at || null,
          clientRejectionReason: r.client_rejection_reason || null,
          sentAt: r.sent_at || null, createdAt: r.created_at,
        })))
      }

      // Map manual / cash payments
      if (Array.isArray(result?.payments)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPayments(result.payments.map((r: any) => ({
          id: r.id, jobId: r.job_id || '', amount: Number(r.amount) || 0,
          paymentDate: r.payment_date || '', method: r.method || 'cash', notes: r.notes || '',
        })))
      } else {
        setPayments([])
      }

      // Map settings
      if (result?.settings) {
        setSettings({
          name: result.settings.name || '',
          tagline: result.settings.tagline || '',
          email: result.settings.email || '',
          phone: result.settings.phone || '',
          address: result.settings.address || '',
          logo: result.settings.logo || '',
        })
      }

      // Map per-client portal settings
      if (result?.client_settings && typeof result.client_settings === 'object') {
        setClientSettings({
          ...DEFAULT_CLIENT_PORTAL_SETTINGS,
          ...(result.client_settings as Partial<ClientPortalSettings>),
        })
      } else {
        setClientSettings(DEFAULT_CLIENT_PORTAL_SETTINGS)
      }

      setLoading(false)
    }
    load()
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PortalContext.Provider value={{ contracts, reloadContracts: () => reloadContracts(), quotes, jobs, invoices, variations, payments, ganttStates, settings, clientSettings, userEmail, loading, error, reload }}>
      {children}
    </PortalContext.Provider>
  )
}
