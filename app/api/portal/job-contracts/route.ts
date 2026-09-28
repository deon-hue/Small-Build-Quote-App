import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'job-documents'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const { data: rows, error } = await sb.rpc('get_job_contracts_for_portal', { p_job_id: jobId })
  if (error || !Array.isArray(rows)) return NextResponse.json([])

  // Sign with the service-role client, not the portal customer's own session — the
  // job-documents bucket's storage RLS only allows the file's own owner (the contractor,
  // storage_path's first folder segment) to read it, so createSignedUrl would silently
  // fail (return no signedUrl) for a portal customer under the regular client. The RPC
  // above already verified this customer may see this job's contracts, so signing here
  // doesn't skip any check — it just performs the one step that customer's own session
  // was never going to be allowed to do itself.
  const svc = createServiceRoleClient()

  const result = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rows as any[]).map(async r => {
      const [draftUrl, signedUrl] = await Promise.all([
        r.draft_storage_path ? signedUrl_(svc, r.draft_storage_path) : Promise.resolve(null),
        r.signed_storage_path ? signedUrl_(svc, r.signed_storage_path) : Promise.resolve(null),
      ])
      return {
        id: r.id,
        status: r.status,
        secondClientName: r.second_client_name,
        clientSignedAt: r.client_signed_at,
        clientSignedBy: r.client_signed_by,
        client2SignedAt: r.client2_signed_at,
        client2SignedBy: r.client2_signed_by,
        createdAt: r.created_at,
        draftUrl,
        signedUrl,
      }
    })
  )

  return NextResponse.json(result)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signedUrl_(sb: any, storagePath: string): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? null
}
