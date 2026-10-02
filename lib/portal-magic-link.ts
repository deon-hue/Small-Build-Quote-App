/**
 * One-click portal sign-in links (server-side only).
 *
 * Uses the Supabase admin generateLink API, which creates the account if needed and never sends
 * an email itself. The link it returns points at Supabase's own /verify endpoint, which then
 * signs the person in through tokens in the URL *fragment* — something our server-side
 * /auth/callback route can't see, so the redirect to the portal was lost and the person landed
 * wherever the browser happened to go next (for a customer: an empty contractor app).
 *
 * So instead we only take the one-time token out of the response and build our own link to
 * /auth/callback?token_hash=…, which verifies it on the server, sets the session cookies and
 * redirects to `next` — the same server-side path the ?code= links already use.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function createPortalSignInLink(
  email: string,
  appUrl: string,
  next = '/portal',
): Promise<{ url: string } | { error: string }> {
  const { data, error } = await createServiceRoleClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) return { error: error.message }
  const { hashed_token, verification_type } = data.properties
  if (!hashed_token) return { error: 'Supabase did not return a sign-in token.' }
  const params = new URLSearchParams({ token_hash: hashed_token, type: verification_type, next })
  return { url: `${appUrl}/auth/callback?${params.toString()}` }
}
