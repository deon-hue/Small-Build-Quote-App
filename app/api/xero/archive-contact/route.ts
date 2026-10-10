/**
 * POST /api/xero/archive-contact   { contactId }   (contactId = the contact's id in this app)
 *
 * Archives that contact in Xero (Xero never lets an app delete a contact; archived contacts disappear from Xero's normal lists and the contact sync
 * leaves them alone, and the builder can restore them in Xero). Only a contact that is already linked to Xero (it has a Xero ID saved) is touched,
 * matched by that exact ID, never by name. The contact must be one the signed-in builder can see (row security). It does NOT delete anything in the app.
 * Returns { ok: true } or { ok: false, error } with Xero's own wording, so the screen can say why.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })

  const { contactId } = await req.json().catch(() => ({})) as { contactId?: string }
  if (!contactId) return NextResponse.json({ ok: false, error: 'Missing contact' }, { status: 400 })

  // row security: only this builder's own contacts are visible here
  const { data: row } = await sb.from('clients').select('id, name, xero_contact_id').eq('id', contactId).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'Contact not found' }, { status: 404 })
  const xeroId = (row.xero_contact_id as string | null) || ''
  if (!xeroId) return NextResponse.json({ ok: true, skipped: 'not linked to Xero' })

  try {
    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ ok: false, error: 'Xero is not connected' })
    const res = await xeroFetch(conn, '/Contacts/' + encodeURIComponent(xeroId), {
      method: 'POST',
      body: JSON.stringify({ Contacts: [{ ContactID: xeroId, ContactStatus: 'ARCHIVED' }] }),
    })
    if (res.ok) return NextResponse.json({ ok: true })
    const text = await res.text()
    let msg = 'Xero said no (' + res.status + ')'
    try {
      const j = JSON.parse(text) as { Message?: string; Elements?: { ValidationErrors?: { Message?: string }[] }[] }
      msg = j.Elements?.[0]?.ValidationErrors?.[0]?.Message || j.Message || msg
    } catch { /* not JSON: keep the generic message */ }
    return NextResponse.json({ ok: false, error: msg })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not reach Xero' })
  }
}
