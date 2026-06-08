import { NextRequest, NextResponse } from 'next/server'
import { redirectUri, authorizeUrl } from '@/lib/xero'
import { createClient } from '@/lib/supabase/server'

// Diagnostic only: reveals the redirect URI + authorize URL the app sends to
// Xero so we can compare them to what's registered. Exposes no secrets.
export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const origin = req.nextUrl.origin
  const built = authorizeUrl(origin, 'debug-state')
  // What NextResponse.redirect would actually emit as the Location header:
  const viaRedirectLocation = NextResponse.redirect(built).headers.get('location')
  return NextResponse.json({
    requestOrigin: origin,
    effectiveRedirectUri: redirectUri(origin),
    authorizeUrl: built,
    viaRedirectLocation,
    clientIdSet: !!process.env.XERO_CLIENT_ID,
    clientSecretSet: !!process.env.XERO_CLIENT_SECRET,
  })
}
