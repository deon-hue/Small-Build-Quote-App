import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeUrl, xeroConfigured } from '@/lib/xero'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', origin))
  if (!xeroConfigured()) return NextResponse.redirect(new URL('/settings?xero=notconfigured', origin))

  // CSRF state — random token echoed back and verified in the callback.
  const state = crypto.randomUUID()
  const res = NextResponse.redirect(authorizeUrl(origin, state))
  res.cookies.set('xero_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
  return res
}
