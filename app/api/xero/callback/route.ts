import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, fetchFirstTenant } from '@/lib/xero'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  const back = (status: string) => NextResponse.redirect(new URL(`/settings?xero=${status}`, origin))

  if (err) return back('denied')
  if (!code) return back('error')

  // CSRF check
  const cookieState = req.cookies.get('xero_oauth_state')?.value
  if (!cookieState || cookieState !== state) return back('state')

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', origin))

  try {
    const t = await exchangeCode(origin, code)
    const tenant = await fetchFirstTenant(t.access_token)
    if (!tenant) return back('notenant')

    const expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString()
    await sb.from('xero_connections').upsert({
      user_id: user.id,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at,
      scopes: t.scope ?? '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    const res = back('connected')
    res.cookies.delete('xero_oauth_state')
    return res
  } catch (e) {
    console.error('Xero callback error:', e)
    return back('error')
  }
}
