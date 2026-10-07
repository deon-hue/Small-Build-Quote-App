/**
 * POST /api/portal/finalize-contract
 *
 * Called by the client portal right after sign_contract reports the contract
 * is fully signed. Flattens the signed PDF (builder + client + optional
 * second client signature blocks) and stores it as a new job_attachments row,
 * so it appears in the client's file list the same way every other document
 * does. Uses the service-role client (like app/api/portal/log-activity/route.ts)
 * because a portal customer has no direct write access to job_attachments —
 * that table's RLS only allows the job's own owner.
 *
 * Body: { contractId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { signedContractBytes } from '@/lib/contract-signed'
import { notifyBuilderContractSigned } from '@/lib/contract-notify'
import { siteOrigin } from '@/lib/site-origin'

const BUCKET = 'job-documents'

function stamp() { return Date.now().toString(36) }

export async function POST(req: NextRequest) {
  const sbAuth = await createClient()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { contractId } = await req.json() as { contractId?: string }
  if (!contractId) return NextResponse.json({ error: 'Missing contractId' }, { status: 400 })

  const sb = createServiceRoleClient()

  const { data: contract } = await sb.from('contracts').select('*').eq('id', contractId).maybeSingle()
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'signed') return NextResponse.json({ error: 'Contract is not fully signed yet' }, { status: 400 })
  if (contract.signed_attachment_id) {
    return NextResponse.json({ ok: true, alreadyFinalized: true })
  }

  // Confirm this authenticated portal user actually has access to this contract's
  // job (same email/name match every portal RPC uses) before doing anything else.
  const email = user.email?.toLowerCase()
  const { data: job } = await sb.from('jobs').select('id, user_id, client').eq('id', contract.job_id).maybeSingle()
  if (!job || !email) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: matchingClients } = await sb.from('clients').select('name, first_name, last_name, email')
    .eq('user_id', job.user_id).ilike('email', email)
  const hasAccess = (matchingClients || []).some(c => {
    const full = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase()
    const jn = (job.client || '').toLowerCase()
    return jn === (c.name || '').toLowerCase() || jn === full || (c.last_name && jn.includes(c.last_name.toLowerCase()))
  })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  if (!contract.draft_attachment_id) return NextResponse.json({ error: 'No draft contract PDF on file' }, { status: 400 })
  const { data: draftAtt } = await sb.from('job_attachments').select('*').eq('id', contract.draft_attachment_id).maybeSingle()
  if (!draftAtt) return NextResponse.json({ error: 'Draft contract file missing' }, { status: 404 })

  const { data: draftFile, error: dlErr } = await sb.storage.from(BUCKET).download(draftAtt.storage_path)
  if (dlErr || !draftFile) return NextResponse.json({ error: 'Could not read draft contract file' }, { status: 500 })
  const draftBytes = new Uint8Array(await draftFile.arrayBuffer())

  const signedBytes = await signedContractBytes(contract, draftBytes)

  const path = `${job.user_id}/${job.id}/attachments/${stamp()}-signed-contract.pdf`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, Buffer.from(signedBytes), { contentType: 'application/pdf' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: newAtt, error: insErr } = await sb.from('job_attachments').insert({
    user_id: job.user_id, job_id: job.id,
    file_name: 'Signed contract.pdf', storage_path: path,
    mime_type: 'application/pdf', file_size: signedBytes.byteLength,
    category: 'contract', label: 'Signed contract',
  }).select().single()
  if (insErr || !newAtt) return NextResponse.json({ error: insErr?.message || 'Failed to save signed contract' }, { status: 500 })

  await sb.from('contracts').update({ signed_attachment_id: newAtt.id, updated_at: new Date().toISOString() }).eq('id', contractId)

  // Tell the builder it's signed (an email problem never undoes a signed contract)
  await notifyBuilderContractSigned(sb, contract, job, process.env.NEXT_PUBLIC_APP_URL || siteOrigin(req))

  return NextResponse.json({ ok: true })
}
