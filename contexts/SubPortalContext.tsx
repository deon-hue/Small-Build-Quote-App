'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface SubPortalSettings {
  name: string
  tagline: string
  email: string
  phone: string
  logo: string
}

export interface SubPortalJob {
  id: string
  client: string
  type: string
  address: string
  stage: string
}

export interface SubRates {
  hourlyRate: number | null
  dayRate: number | null
  halfDayRate: number | null
  paymentType: string | null
}

export interface SubContract {
  id: string
  job_id: string | null
  type: 'rate' | 'fixed'
  description: string
  rate_type: 'hourly' | 'daily' | null
  rate_amount: number | null
  quoted_amount: number | null
  status: string
  notes: string
  created_at: string
  job_type: string | null
  job_client: string | null
  job_address: string | null
  job_status: string | null
  start_date: string | null
  end_date: string | null
}

export interface SubTimeEntry {
  id: string
  sub_contract_id: string | null
  job_id: string | null
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

export interface SubPaymentStage {
  id: string
  sub_contract_id: string
  description: string
  amount: number
  due_date: string | null
  paid_date: string | null
  xero_bill_id: string | null
  created_at: string
}

interface SubPortalContextType {
  contracts: SubContract[]
  timeEntries: SubTimeEntry[]
  paymentStages: SubPaymentStage[]
  settings: SubPortalSettings
  jobs: SubPortalJob[]
  subRates: SubRates
  subName: string
  loading: boolean
  error: string | null
  reload: () => void
}

const SubPortalContext = createContext<SubPortalContextType | null>(null)

export function useSubPortal() {
  const ctx = useContext(SubPortalContext)
  if (!ctx) throw new Error('useSubPortal must be used inside SubPortalProvider')
  return ctx
}

const DEFAULT_SETTINGS: SubPortalSettings = { name: '', tagline: '', email: '', phone: '', logo: '' }
const DEFAULT_RATES: SubRates = { hourlyRate: null, dayRate: null, halfDayRate: null, paymentType: null }

export function SubPortalProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [contracts, setContracts] = useState<SubContract[]>([])
  const [timeEntries, setTimeEntries] = useState<SubTimeEntry[]>([])
  const [paymentStages, setPaymentStages] = useState<SubPaymentStage[]>([])
  const [settings, setSettings] = useState<SubPortalSettings>(DEFAULT_SETTINGS)
  const [jobs, setJobs] = useState<SubPortalJob[]>([])
  const [subRates, setSubRates] = useState<SubRates>(DEFAULT_RATES)
  const [subName, setSubName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const silentRef = useRef(false)

  function reload() { setError(null); setLoading(true); setTick(t => t + 1) }

  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') setTick(t => t + 1) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') { silentRef.current = true; setTick(t => t + 1) }
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      const silent = silentRef.current
      silentRef.current = false
      if (!silent) setLoading(true)

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('unauthenticated'); setLoading(false); return }

        // Ensure a sub profile exists (no-op if already set up)
        const { error: profileErr } = await supabase.rpc('create_sub_profile')
        if (profileErr) { setError('setup_required'); setLoading(false); return }

        const { data, error: rpcErr } = await supabase.rpc('get_sub_portal_data')
        if (rpcErr) { setError('rpc_error'); setLoading(false); return }

        const d = data as {
          error?: string
          contracts: SubContract[]
          timeEntries: SubTimeEntry[]
          paymentStages: SubPaymentStage[]
          settings: SubPortalSettings
          jobs: SubPortalJob[]
          subRates: SubRates
          subName: string
        }

        if (d.error) { setError(d.error); setLoading(false); return }

        setContracts(d.contracts ?? [])
        setTimeEntries(d.timeEntries ?? [])
        setPaymentStages(d.paymentStages ?? [])
        setSettings(d.settings ?? DEFAULT_SETTINGS)
        setJobs(d.jobs ?? [])
        setSubRates(d.subRates ?? DEFAULT_RATES)
        setSubName(d.subName ?? '')
        setError(null)
      } catch {
        setError('rpc_error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubPortalContext.Provider value={{ contracts, timeEntries, paymentStages, settings, jobs, subRates, subName, loading, error, reload }}>
      {children}
    </SubPortalContext.Provider>
  )
}
