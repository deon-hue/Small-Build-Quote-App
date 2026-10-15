// The client portal's Selections, for the signed-in portal customer. Every read and write goes through the portal_* database functions (supabase/job-selections.sql), which check that
// this customer really is the client of the job and that the item is still theirs to change; this route only passes the request on, signs the file addresses (the files are in the
// builder's storage, which a client cannot read directly) and tells the builder when something new arrives.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { rowToSelection, rowToFile, type Selection } from '@/lib/selections'
import { pushToOwner } from '@/lib/push'

const BUCKET = 'job-documents'
const MISSING = /does not exist|schema cache|PGRST202|PGRST205|42P01|42883/i

function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }
/** Our own messages (raised by the database functions) are fit to show; anything else is not. */
const friendly = (m: string) => (/^(Please|You |This |The |That |There )/.test(m) ? m : 'Something went wrong. Please try again.')

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return fail('Not authenticated', 401)
  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return fail('Missing jobId')

  const { data, error } = await sb.rpc('portal_list_selections', { p_job_id: jobId })
  if (error) return NextResponse.json({ items: [], missing: MISSING.test(error.message) })
  const rows = (Array.isArray(data) ? data : []) as (Record<string, unknown> & { files?: Record<string, unknown>[] })[]

  // Sign with the service-role client: the client's own session cannot read the builder's storage.
  const svc = createServiceRoleClient()
  const items: Selection[] = await Promise.all(rows.map(async r => {
    const files = await Promise.all((r.files ?? []).map(async f => {
      const { data: s } = await svc.storage.from(BUCKET).createSignedUrl(String(f.storage_path), 3600)
      return rowToFile(f, s?.signedUrl ?? null)
    }))
    return rowToSelection(r, files)
  }))
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return fail('Not authenticated', 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail('Bad request') }
  const action = String(body.action || '')
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

  if (action === 'save') {
    const jobId = str(body.jobId, 60)
    if (!jobId) return fail('Missing job')
    const id = typeof body.id === 'string' && body.id ? body.id : null
    const needed = typeof body.neededBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.neededBy) ? body.neededBy : null
    const { data, error } = await sb.rpc('portal_save_selection', {
      p_job_id: jobId, p_id: id, p_title: str(body.title, 200), p_room: str(body.room, 100), p_category: str(body.category, 60), p_details: str(body.details, 3000),
      p_link: str(body.link, 600), p_supplied_by: str(body.suppliedBy, 20), p_needed_by: needed,
    })
    if (error) return fail(MISSING.test(error.message) ? 'Selections are not switched on yet. Please tell your builder.' : friendly(error.message))
    // tell the builder (best effort: the item is saved either way)
    try {
      const { data: owner } = await sb.rpc('portal_selection_job_owner', { p_job_id: jobId })
      if (owner) {
        const title = str(body.title, 80).trim()
        await pushToOwner(owner as string, 'selections', {
          title: id ? 'A client changed a selection' : 'A client added a selection',
          body: title ? `${title}${str(body.room, 40) ? ' (' + str(body.room, 40) + ')' : ''}` : 'Open the job to see it.',
          url: `/jobs?selections=${encodeURIComponent(jobId)}`,
          tag: `selection-${data}`,
        })
      }
    } catch { /* an alert is a convenience */ }
    return NextResponse.json({ ok: true, id: data })
  }

  if (action === 'status') {
    const { error } = await sb.rpc('portal_set_selection_status', { p_id: str(body.id, 60), p_status: str(body.status, 20) })
    if (error) return fail(friendly(error.message))
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { data, error } = await sb.rpc('portal_delete_selection', { p_id: str(body.id, 60) })
    if (error) return fail(friendly(error.message))
    const paths = (Array.isArray(data) ? data : []).filter((p): p is string => typeof p === 'string')
    if (paths.length) { try { await createServiceRoleClient().storage.from(BUCKET).remove(paths) } catch { /* the files are orphaned at worst */ } }
    return NextResponse.json({ ok: true })
  }

  if (action === 'remove-file') {
    const { data, error } = await sb.rpc('portal_remove_selection_file', { p_file_id: str(body.fileId, 60) })
    if (error) return fail(friendly(error.message))
    if (typeof data === 'string' && data) { try { await createServiceRoleClient().storage.from(BUCKET).remove([data]) } catch { /* orphaned at worst */ } }
    return NextResponse.json({ ok: true })
  }

  return fail('Bad request')
}
