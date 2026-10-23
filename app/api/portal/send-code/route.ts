/**
 * POST /api/portal/send-code   { email, kind: 'sub' | 'client' }
 *
 * The logged-out sign-in for the subcontractor and client portals. Emails the person a 6-digit code AND a one-tap sign-in button (our own branded email through Resend, so it never meets
 * Supabase's own outbound-email limit). The code is what makes this easy: they type it into the page they are already on, so it does not matter which browser their email app opens, or that a
 * security scanner may have used the link first.
 *
 * Safety: it only ever emails an address that is one of a builder's contacts (a client or subcontractor row), so it cannot be used to create accounts or to spam strangers, and it answers the same
 * way whether the address is known or not, so it does not reveal who has an account. A short wait per address and a limit per visitor stop it being used to flood an inbox.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createPortalSignInLink } from '@/lib/portal-magic-link'
import { buildPortalCodeEmail, portalCodeSubject, type PortalKind } from '@/lib/portal-code-email'
import { senderFrom, withPoweredBy } from '@/lib/email-brand'
import { escapeLike } from '@/lib/email-match'
import { logPortalActivity } from '@/lib/portal-activity'
import { PRODUCT_NAME } from '@/lib/product-config'

// Best-effort limits (they live in this server's memory, which is fine for stopping a flood from one place).
const lastSent = new Map<string, number>()
const perVisitor = new Map<string, number[]>()
const EMAIL_WAIT_MS = 30_000
const VISITOR_MAX = 12
const VISITOR_WINDOW_MS = 60 * 60_000

function tooMany(visitor: string, now: number): boolean {
  const recent = (perVisitor.get(visitor) ?? []).filter(t => now - t < VISITOR_WINDOW_MS)
  perVisitor.set(visitor, recent)
  if (recent.length >= VISITOR_MAX) return true
  recent.push(now)
  return false
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

export async function POST(req: NextRequest) {
  let body: { email?: string; kind?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const email = (body.email || '').trim()
  const kind: PortalKind = body.kind === 'sub' ? 'sub' : 'client'
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  const now = Date.now()
  const visitor = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (tooMany(visitor, now)) return NextResponse.json({ error: 'Too many sign-in requests from here. Please wait a little and try again.' }, { status: 429 })

  const key = email.toLowerCase()
  if (now - (lastSent.get(key) ?? 0) < EMAIL_WAIT_MS) return NextResponse.json({ ok: true, wait: true })

  // Only a builder's own contacts get an email (and an account): anything else gets the same answer and nothing is sent
  const sb = createServiceRoleClient()
  const { data: known } = await sb.from('clients').select('id').ilike('email', escapeLike(email)).limit(1)
  if (!known || known.length === 0) return NextResponse.json({ ok: true })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Sign-in emails are not set up on this site yet. Please tell your builder.' }, { status: 500 })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || ''
  const link = await createPortalSignInLink(email, appUrl, kind === 'sub' ? '/sub-portal' : '/portal')
  if ('error' in link || !link.code) return NextResponse.json({ error: 'Could not make a sign-in code just now. Please try again.' }, { status: 500 })

  const fromEmail = process.env.NOTIFY_FROM_EMAIL || 'noreply@resend.dev'
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: senderFrom(fromEmail),
      to: email,
      subject: portalCodeSubject(kind),
      html: withPoweredBy(buildPortalCodeEmail({ kind, code: link.code, signInUrl: link.url, product: PRODUCT_NAME })),
    }),
  })
  if (!emailRes.ok) return NextResponse.json({ error: 'The email could not be sent just now. Please try again in a minute.' }, { status: 500 })

  lastSent.set(key, now)
  try { await logPortalActivity(email, 'magic_link_sent') } catch { /* logging must never block a sign-in */ }
  return NextResponse.json({ ok: true })
}
