'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Quote, Job, Invoice } from '@/lib/types'

export interface PortalSettings {
  name: string
  tagline: string
  email: string
  phone: string
  address: string
  logo: string
}

interface PortalContextType {
  quotes: Quote[]
  jobs: Job[]
  invoices: Invoice[]
  settings: PortalSettings
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
  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_SETTINGS)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  function reload() {
    setError(null)
    setLoading(true)
    setTick(t => t + 1)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      setUserEmail(user.email || '')

      // Always ensure a profile exists — safe to call every time (no-op if already set up)
      const { error: profileErr } = await supabase.rpc('create_customer_profile')
      if (profileErr) {
        // RPC doesn't exist yet → phase3.sql not run
        setError('setup_required')
        setLoading(false)
        return
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
          vatIncluded: r.vat_included, scope: r.scope || '', photo: r.photo || '',
          convertedToJob: r.converted_to_job,
          customer: r.customer || { name: '', address: '', email: '', phone: '' },
          phases: r.phases || [],
        })))
      }

      // Map jobs
      if (Array.isArray(result?.jobs)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setJobs(result.jobs.map((r: any) => ({
          id: r.id, client: r.client, type: r.type, address: r.address || '',
          value: Number(r.value), stage: r.stage,
          start: r.start_date || '', weeks: r.weeks, done: r.done,
          notes: r.notes || '',
        })))
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

      setLoading(false)
    }
    load()
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PortalContext.Provider value={{ quotes, jobs, invoices, settings, userEmail, loading, error, reload }}>
      {children}
    </PortalContext.Provider>
  )
}
