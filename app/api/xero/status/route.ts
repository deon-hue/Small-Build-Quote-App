import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { xeroConfigured } from '@/lib/xero'

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ connected: false, configured: false })

  const { data } = await sb.from('xero_connections').select('tenant_name, updated_at').eq('user_id', user.id).maybeSingle()
  return NextResponse.json({
    configured: xeroConfigured(),
    connected: !!data,
    tenantName: data?.tenant_name ?? null,
    connectedAt: data?.updated_at ?? null,
  })
}
