import { NextRequest, NextResponse } from 'next/server'
import { redirectUri, authorizeUrl } from '@/lib/xero'

// Diagnostic only: reveals the redirect URI + authorize URL the app sends to
// Xero so we can compare them to what's registered. Exposes no secrets.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  return NextResponse.json({
    requestOrigin: origin,
    effectiveRedirectUri: redirectUri(origin),
    authorizeUrl: authorizeUrl(origin, 'debug-state'),
    clientIdSet: !!process.env.XERO_CLIENT_ID,
    clientSecretSet: !!process.env.XERO_CLIENT_SECRET,
  })
}
