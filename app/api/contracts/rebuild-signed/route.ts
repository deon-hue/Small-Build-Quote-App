/**
 * POST /api/contracts/rebuild-signed   { contractId }
 *
 * For the BUILDER: makes the signed copy of an already-signed contract again from the copy that was sent plus the signatures recorded on the
 * contract (names and dates only; nothing about who signed or when is changed). Needed once, to correct signed copies made while the
 * client's signature went into the second signature box instead of the first. The new copy replaces the old one in the job's files.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { signedContractBytes } from '@/lib/contract-signed'

const BUCKET = 'job-documents'

export async function POST(req: NextRequest) {
  const sbAuth = await createClient()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { contractId } = await req.json().catch(() => ({})) as { contractId?: string }
  if (!contractId) return NextResponse.json({ error: 'Missing contractId' }, { status: 400 })

  // Row-level security: the builder's own session can only see contracts of their own company
  const { data: visible } = await sbAuth.from('contracts').select('id').eq('id', contractId).maybeSingle()
  if (!visible) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sb = createServiceRoleClient()
  const { data: contract } = await sb.from('contracts').select('*').eq('id', contractId).maybeSingle()
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (contract.status !== 'signed') return NextResponse.json({ error: 'This contract has not been signed yet.' }, { status: 400 })
  if (!contract.draft_attachment_id) return NextResponse.json({ error: 'The copy that was sent is missing, so the signed copy cannot be rebuilt.' }, { status: 400 })

  const { data: draftAtt } = await sb.from('job_attachments').select('storage_path').eq('id', contract.draft_attachment_id).maybeSingle()
  if (!draftAtt) return NextResponse.json({ error: 'The copy that was sent is missing, so the signed copy cannot be rebuilt.' }, { status: 404 })
  const { data: draftFile, error: dlErr } = await sb.storage.from(BUCKET).download(draftAtt.storage_path)
  if (dlErr || !draftFile) return NextResponse.json({ error: 'Could not read the copy that was sent.' }, { status: 500 })

  const bytes = await signedContractBytes(contract, new Uint8Array(await draftFile.arrayBuffer()))

  const path = `${contract.user_id}/${contract.job_id}/attachments/${Date.now().toString(36)}-signed-contract.pdf`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, Buffer.from(bytes), { contentType: 'application/pdf' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: newAtt, error: insErr } = await sb.from('job_attachments').insert({
    user_id: contract.user_id, job_id: contract.job_id,
    file_name: 'Signed contract.pdf', storage_path: path,
    mime_type: 'application/pdf', file_size: bytes.byteLength,
    category: 'contract', label: 'Signed contract',
  }).select().single()
  if (insErr || !newAtt) {
    await sb.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: insErr?.message || 'Could not save the rebuilt copy.' }, { status: 500 })
  }

  // Point the contract at the new copy first, then remove the old one so there is never a moment with no signed copy
  const oldId = contract.signed_attachment_id as string | null
  await sb.from('contracts').update({ signed_attachment_id: newAtt.id, updated_at: new Date().toISOString() }).eq('id', contractId)
  if (oldId) {
    const { data: old } = await sb.from('job_attachments').select('storage_path').eq('id', oldId).maybeSingle()
    await sb.from('job_attachments').delete().eq('id', oldId)
    if (old?.storage_path) await sb.storage.from(BUCKET).remove([old.storage_path])
  }
  return NextResponse.json({ ok: true })
}
