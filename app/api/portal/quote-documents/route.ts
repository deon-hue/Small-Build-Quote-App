import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'quote-documents'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const quoteId = req.nextUrl.searchParams.get('quoteId')
  if (!quoteId) return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })

  const { data: rows, error } = await sb.rpc('get_quote_documents_for_portal', { p_quote_id: quoteId })
  if (error || !Array.isArray(rows)) return NextResponse.json([])

  // Sign with the service-role client — the quote-documents bucket's storage RLS only
  // allows the file's own owner (the contractor) to read it, so the portal customer's
  // own session could never generate a signed URL for it directly. The RPC above already
  // confirmed this customer may see this quote's files.
  const svc = createServiceRoleClient()

  const result = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rows as any[]).map(async r => {
      const { data } = await svc.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600)
      return {
        id:        r.id,
        fileName:  r.file_name,
        mimeType:  r.mime_type,
        fileSize:  r.file_size,
        category:  r.category,
        label:     r.label,
        createdAt: r.created_at,
        url:       data?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json(result)
}
