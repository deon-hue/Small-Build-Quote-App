// Opens a supplier's own quote file (the PDF or photo they sent): a short-lived link, only for the owner of the request. The file lives in private storage, so the link is made here.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const quoteId = req.nextUrl.searchParams.get('quoteId')
  const incomingId = req.nextUrl.searchParams.get('incomingId')

  // looked up with the person's own login, so only their own rows are ever found
  let path = ''
  if (quoteId) {
    const { data } = await sb.from('job_order_quotes').select('file_path').eq('id', quoteId).maybeSingle()
    path = (data?.file_path as string) || ''
  } else if (incomingId) {
    const { data } = await sb.from('incoming_quotes').select('storage_path').eq('id', incomingId).maybeSingle()
    path = (data?.storage_path as string) || ''
  }
  if (!path) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data: signed } = await createServiceRoleClient().storage.from('job-documents').createSignedUrl(path, 300)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not open the file' }, { status: 500 })
  return NextResponse.redirect(signed.signedUrl)
}
