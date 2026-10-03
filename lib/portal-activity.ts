// Records a customer's portal activity (sign-ins, failed attempts, password resets) so the contractor can see
// it on the client's page. Used by /auth/callback (signed-in links) and /api/portal/log-activity (the
// logged-out portal login page). Service role: the portal user has no right to write this table.

import { createServiceRoleClient } from '@/lib/supabase/service-role'

// Only these events are accepted — anything else is ignored, so nobody can write arbitrary entries.
export const PORTAL_EVENT_TYPES = new Set([
  'sign_in',
  'sign_in_failed',
  'magic_link_sent',
  'magic_link_rate_limit',
  'password_reset_requested',
  'password_reset_failed',
  'password_reset_success',
])

// ilike treats % and _ as wildcards; an email containing them must match literally.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => '\\' + m)
}

/** Returns true if an entry was written. False (silently) for an unknown event or an email that isn't a client. */
export async function logPortalActivity(email: string, eventType: string, details?: string | null): Promise<boolean> {
  const clean = email.trim()
  if (!clean || !PORTAL_EVENT_TYPES.has(eventType)) return false

  const sb = createServiceRoleClient()
  const { data: client } = await sb
    .from('clients')
    .select('id, user_id')
    .ilike('email', escapeLike(clean))
    .limit(1)
    .maybeSingle()
  if (!client) return false

  await sb.from('portal_activity_logs').insert({
    owner_user_id: client.user_id,
    client_id: client.id,
    client_email: clean.toLowerCase(),
    event_type: eventType,
    details: details ? String(details).slice(0, 300) : null,
  })
  return true
}
