'use client'

// Reads the company's leads once (when the screen opens) for the client pickers, and works out which to offer (lib/lead-options.ts). It never gets in the way: a failed read, or leads.sql not run, just means no leads are listed.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { leadOptionsFrom, type LeadOption, type LeadRowLite } from '@/lib/lead-options'

export function useLeadOptions(clients: { email?: string | null; phone?: string | null }[], enabled = true): LeadOption[] {
  const [rows, setRows] = useState<LeadRowLite[]>([])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await createClient().from('quote_requests').select('id, client_name, client_email, client_phone, project_address, status, created_at').order('created_at', { ascending: false }).limit(300)
        if (!cancelled && !error && Array.isArray(data)) setRows(data as LeadRowLite[])
      } catch { /* no leads listed */ }
    })()
    return () => { cancelled = true }
  }, [enabled])
  // (the clients are only used to leave out a lead who is already a contact)
  const key = clients.map(c => `${c.email || ''}|${c.phone || ''}`).join(';')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => leadOptionsFrom(rows, clients), [rows, key])
}
