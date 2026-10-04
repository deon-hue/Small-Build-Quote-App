// Thin wrapper for calling the owner_* database functions from the owner pages. The functions themselves refuse anyone who isn't the
// platform owner signed in with two-step verification, so this file does no security checking of its own.

import { createClient } from '@/lib/supabase/client'

export async function ownerRpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc(fn, args ?? {})
  if (error) {
    if (error.code === '42501' || /not_allowed/.test(error.message)) throw new Error('You need to be signed in as the owner with two-step sign-in.')
    throw new Error(error.message || 'Something went wrong')
  }
  return data as T
}

export function fmtDate(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export interface OwnerCompany {
  owner_id: string; company_name: string; owner_email: string | null; joined: string | null; last_sign_in_at: string | null
  terms_version: string | null; terms_accepted_at: string | null; paused: boolean
  ai_limit: number; ai_limit_override: number | null; send_limit: number; send_limit_override: number | null
  quotes: number; jobs: number; clients: number
  ai_today: number; ai_7d: number; ai_30d: number; send_today: number; send_7d: number; send_30d: number
  invite_label: string | null
}
