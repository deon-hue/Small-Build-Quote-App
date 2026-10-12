// A company's logo as an ordinary web address, so it can be shown at the top of emails (Gmail and Outlook do not show the embedded copy of the logo that is saved
// with the company details). Anyone can fetch it: a logo is meant to be seen. Only the logo is returned, never any other detail of the company.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 })
  try {
    const sb = createServiceRoleClient()
    const { data } = await sb.from('settings').select('logo').eq('user_id', id).maybeSingle()
    const logo = (data?.logo as string | undefined) ?? ''
    const m = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i.exec(logo)
    if (!m) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(Buffer.from(m[2], 'base64'), {
      status: 200,
      headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600, s-maxage=3600', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
