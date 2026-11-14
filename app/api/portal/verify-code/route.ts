/**
 * POST /api/portal/verify-code   { email, token }
 *
 * Checks the 6-digit sign-in code ON THE SERVER and sets the session cookies in the response (a real Set-Cookie header). The page used to check the code in the person's browser, which made the
 * "stay signed in" cookie one written by the page's own script: iPhone Safari deletes those after about a week, so subcontractors kept being signed out and had to start again. A cookie the
 * server sets lasts as long as it says (the Supabase default is 400 days) and is not cut short that way.
 *
 * Safety: the code itself is what proves who the person is (Supabase checks it, and limits tries); this route only passes it on. Nothing is revealed about who has an account: a wrong code, a
 * used code and an unknown email all get the same answer. A limit per visitor stops guessing from one place.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logPortalActivity } from '@/lib/portal-activity'

const perVisitor = new Map<string, number[]>()
const VISITOR_MAX = 30
const VISITOR_WINDOW_MS = 60 * 60_000
function tooMany(visitor: string, now: number): boolean {
  const recent = (perVisitor.get(visitor) ?? []).filter(t => now - t < VISITOR_WINDOW_MS)
  perVisitor.set(visitor, recent)
  if (recent.length >= VISITOR_MAX) return true
  recent.push(now)
  return false
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/
const WRONG = 'That code is not right, or it has run out. Check the newest email, or send a new code.'

export async function POST(req: NextRequest) {
  let body: { email?: unknown; token?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const token = typeof body.token === 'string' ? body.token.replace(/\s+/g, '') : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!/^\d{6,10}$/.test(token)) return NextResponse.json({ error: WRONG }, { status: 400 })

  const visitor = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (tooMany(visitor, Date.now())) return NextResponse.json({ error: 'Too many tries from here. Please wait a little and try again.' }, { status: 429 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any))
          } catch { /* cookies cannot be set in some edge cases */ }
        },
      },
    },
  )

  let { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' }))
  if (error) {
    try { await logPortalActivity(email, 'sign_in_failed', 'code') } catch { /* logging must never block a sign-in */ }
    return NextResponse.json({ error: WRONG }, { status: 400 })
  }
  try { await logPortalActivity(email, 'sign_in') } catch { /* logging must never block a sign-in */ }
  return NextResponse.json({ ok: true })
}
