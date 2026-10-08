'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ScheduleRow } from '@/lib/task-days'
import type { CompanyCalendarRow } from '@/lib/sub-calendar'

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
  amount?: number | null
  source?: 'portal' | 'admin'
  rate_type?: string | null
  rate_amount?: number | null
  paid_date?: string | null
  payment_method?: 'cash' | 'bill' | null
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
  /** The days this person is booked on site (their own bookings only) */
  schedule: ScheduleRow[]
  /** The company's jobs and phases for the Calendar tab; null when the builder has switched that off for this person (or it could not load) */
  companyCalendar: CompanyCalendarRow[] | null
  /** 'ok' | 'off' (builder switched it off) | 'problem' (could not load, e.g. database update not run yet) */
  companyCalendarStatus: 'ok' | 'off' | 'problem'
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
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [companyCalendar, setCompanyCalendar] = useState<CompanyCalendarRow[] | null>(null)
  const [companyCalendarStatus, setCompanyCalendarStatus] = useState<'ok' | 'off' | 'problem'>('ok')
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
        // Who is signed in is read from this phone's own saved sign-in (no waiting on the network): the middleware has already checked it on the server,
        // and every database call below is checked again by the database itself.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { setError('unauthenticated'); setLoading(false); return }

        type PortalData = {
          error?: string
          contracts: SubContract[]
          timeEntries: SubTimeEntry[]
          paymentStages: SubPaymentStage[]
          settings: SubPortalSettings
          jobs: SubPortalJob[]
          subRates: SubRates
          subName: string
        }
        // All three at once (one wait, not three). The schedule and the company calendar are kept apart from the main data, so a problem with either
        // (or a database update not being run yet) never breaks the rest of the portal.
        const fetchAll = () => Promise.all([
          supabase.rpc('get_sub_portal_data'),
          Promise.resolve(supabase.rpc('get_my_task_schedule')).catch(() => ({ data: null, error: true })),
          Promise.resolve(supabase.rpc('get_company_calendar_for_sub')).catch(() => ({ data: null, error: true })),
        ])
        let [dataRes, schRes, calRes] = await fetchAll()
        if (dataRes.error) { setError('rpc_error'); setLoading(false); return }
        let d = dataRes.data as PortalData

        // First time in (no profile yet), or a login that was set up as something else: set the subcontractor profile up, then ask again.
        if (d?.error === 'no_profile' || d?.error === 'not_subcontractor') {
          const { error: profileErr } = await supabase.rpc('create_sub_profile')
          if (profileErr) { setError('setup_required'); setLoading(false); return }
          ;[dataRes, schRes, calRes] = await fetchAll()
          if (dataRes.error) { setError('rpc_error'); setLoading(false); return }
          d = dataRes.data as PortalData
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

        // Their booked days
        const rows = (schRes.data as { rows?: ScheduleRow[] } | null)?.rows
        setSchedule(Array.isArray(rows) ? rows : [])

        // The company's other jobs (job name, address, phases only)
        const c = calRes.data as { rows?: CompanyCalendarRow[]; error?: string } | null
        if (calRes.error || !c) { setCompanyCalendar(null); setCompanyCalendarStatus('problem') }
        else if (c.error === 'disabled') { setCompanyCalendar(null); setCompanyCalendarStatus('off') }
        else if (c.error || !Array.isArray(c.rows)) { setCompanyCalendar(null); setCompanyCalendarStatus('problem') }
        else { setCompanyCalendar(c.rows); setCompanyCalendarStatus('ok') }
      } catch {
        setError('rpc_error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubPortalContext.Provider value={{ contracts, timeEntries, paymentStages, settings, jobs, subRates, subName, schedule, companyCalendar, companyCalendarStatus, loading, error, reload }}>
      {children}
    </SubPortalContext.Provider>
  )
}
