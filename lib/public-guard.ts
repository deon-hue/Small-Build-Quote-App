// Limits for the PUBLIC, signed-out pages (the Get-a-Quote flow) whose AI features cost the platform money and which anyone on the
// internet can call. Counts per visitor (a salted hash of their IP — the raw address is never stored) and across the whole site per day.
// The counters live in the database (supabase/usage-limits.sql → consume_public_use), called with the service role.
//
// Settings (all optional, set in Netlify environment variables):
//   PUBLIC_AI_DISABLED=true      emergency off switch for every public AI call
//   PUBLIC_AI_IP_LIMIT           per visitor per day (default 15)
//   PUBLIC_AI_SITE_LIMIT         whole site per day (default 300)
//   PUBLIC_UPLOAD_IP_LIMIT       file uploads per visitor per day (default 30)
//   PUBLIC_UPLOAD_SITE_LIMIT     file uploads whole site per day (default 500)

import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

function visitorKey(req: Request): string {
  // Netlify sets x-nf-client-connection-ip; fall back to the first x-forwarded-for entry
  const ip = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) || 'buildos'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export async function publicGuard(req: Request, kind: 'ai' | 'upload'): Promise<NextResponse | null> {
  if (kind === 'ai' && process.env.PUBLIC_AI_DISABLED === 'true') {
    return NextResponse.json({ error: 'This feature is temporarily switched off. Please try again later.' }, { status: 503 })
  }

  const ipLimit = kind === 'ai' ? num(process.env.PUBLIC_AI_IP_LIMIT, 15) : num(process.env.PUBLIC_UPLOAD_IP_LIMIT, 30)
  const siteLimit = kind === 'ai' ? num(process.env.PUBLIC_AI_SITE_LIMIT, 300) : num(process.env.PUBLIC_UPLOAD_SITE_LIMIT, 500)

  try {
    const sb = createServiceRoleClient()
    const { data, error } = await sb.rpc('consume_public_use', {
      p_ip_hash: visitorKey(req), p_kind: kind, p_ip_limit: ipLimit, p_global_limit: siteLimit,
    })
    if (error) throw error
    if ((data as { allowed?: boolean } | null)?.allowed) return null
    const reason = (data as { reason?: string } | null)?.reason
    return NextResponse.json(
      { error: reason === 'site_limit'
          ? 'This feature is very busy today. Please try again tomorrow.'
          : "You've used this feature a lot today. Please try again tomorrow." },
      { status: 429 },
    )
  } catch (err) {
    // Fail closed: if the limiter can't run, don't leave a paid feature open to the whole internet
    console.error('[publicGuard] could not check limits:', err)
    return NextResponse.json({ error: 'This feature is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
}
