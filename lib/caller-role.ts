// Guards for routes that send email/links on a contractor's behalf. Customers and subcontractors are real
// sign-in accounts too, so "is signed in" is not enough — only contractor accounts may use these routes.

import type { SupabaseClient } from '@supabase/supabase-js'

/** True when the caller is a portal-only account (customer / subcontractor) and not also a contractor. */
export async function callerIsPortalOnly(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (!profile || (profile.role !== 'customer' && profile.role !== 'subcontractor')) return false

  // A contractor who once opened the portal can carry a customer profile. They still own a settings row
  // (or are an active team member), so they stay allowed.
  const { data: settings } = await sb.from('settings').select('user_id').eq('user_id', userId).maybeSingle()
  if (settings) return false
  const { data: member } = await sb.from('team_members').select('id').eq('auth_user_id', userId).eq('status', 'active').maybeSingle()
  return !member
}
