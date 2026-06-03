import { NextRequest, NextResponse } from 'next/server'
import { redirectUri } from '@/lib/xero'

// Diagnostic only: reveals the redirect URI the app will send to Xero so we can
// compare it to what's registered. Exposes no secrets.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  return NextResponse.json({
    requestOrigin: origin,
    derivedFromOrigin: `${origin}/api/xero/callback`,
    envRedirectUri: process.env.XERO_REDIRECT_URI ?? null,
    effectiveRedirectUri: redirectUri(origin),
    clientIdSet: !!process.env.XERO_CLIENT_ID,
    clientSecretSet: !!process.env.XERO_CLIENT_SECRET,
  })
}
