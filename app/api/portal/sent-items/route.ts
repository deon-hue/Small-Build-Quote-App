// What the company has sent this client, for the client portal's "Sent to you" tab (the records are made in the "Sent to them" box on a lead or contact: supabase/sent-items.sql).
// The signed-in portal customer is found by their email address: the contacts (of any company) that have it, and from those the records sent to that contact, to that email address, or from a lead with that
// email, that the company has left switched on for the portal. A client has no direct access to the table: this route reads it with the server's own key, so every filter here is the only thing keeping one
// client from another's records. Files are signed with that key too (the bucket only lets its owner read), for an hour. Nothing but the words, the date and the file links goes back.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { likeSafe, portalItemFrom, portalVisible, mergeSent, sentItemFromRow, type SentItem } from '@/lib/sent-items'

const BUCKET = 'job-documents'
export const maxDuration = 30

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const email = user.email.trim().toLowerCase()

  const svc = createServiceRoleClient()
  // (a client's contact: not a supplier or subcontractor who happens to share the address; a missing type is a client)
  const { data: contacts } = await svc.from('clients').select('id, user_id, client_type').ilike('email', likeSafe(email))
  const rows = ((contacts ?? []) as { id: string; user_id: string; client_type: string | null }[]).filter(r => r.client_type !== 'supplier' && r.client_type !== 'subcontractor')
  if (rows.length === 0) return NextResponse.json({ items: [], missing: false })
  const clientIds = rows.map(r => r.id)
  const ownerIds = Array.from(new Set(rows.map(r => r.user_id)))

  let missing = false
  const found: SentItem[][] = []
  const run = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await q
    if (error) { if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message)) missing = true; return }
    found.push(((data ?? []) as Record<string, unknown>[]).map(sentItemFromRow))
  }
  const base = () => svc.from('sent_items').select('*').in('user_id', ownerIds).eq('show_in_portal', true).order('sent_at', { ascending: false }).limit(200)
  await run(base().in('client_id', clientIds))
  await run(base().ilike('to_email', likeSafe(email)))
  const { data: leads } = await svc.from('quote_requests').select('id').in('user_id', ownerIds).ilike('client_email', likeSafe(email)).limit(50)
  const leadIds = ((leads ?? []) as { id: string }[]).map(l => l.id)
  if (leadIds.length) await run(base().in('lead_id', leadIds))

  if (missing) return NextResponse.json({ items: [], missing: true })
  const items = portalVisible(mergeSent(...found)).slice(0, 100)
  const paths = items.flatMap(i => i.files.map(f => f.path))
  const urls: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await svc.storage.from(BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl
  }
  return NextResponse.json({ items: items.map(i => portalItemFrom(i, urls)), missing: false })
}
