import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'
import { logPortalActivity } from '@/lib/portal-activity'
import { siteOrigin } from '@/lib/site-origin'

const OTP_TYPES: EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email', 'email_change']

// `next` comes from the link, so it must be a path on this site. Anything else (//host, /\host, user@host) would
// turn a genuine sign-in link into a redirect to someone else's website.
function safeNext(raw: string | null): string {
  const fallback = '/portal'
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (/[\\@\u0000-\u001f]/.test(raw)) return fallback
  return raw
}

// Handles the sign-in redirect for both kinds of link we send:
//  • ?code=XXX            — links from Supabase's own emails (signInWithOtp): exchanged for a session
//  • ?token_hash=…&type=… — links we build ourselves from admin generateLink (quote emails and
//                           portal invites, see lib/portal-magic-link.ts): verified server-side
// Either way the session is set in cookies here and the user is sent straight to `next`
// (default: /portal).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = siteOrigin(request)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = safeNext(searchParams.get('next'))

  const hasTokenHash = !!tokenHash && !!type && OTP_TYPES.includes(type)

  if (code || hasTokenHash) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                cookieStore.set(name, value, options as any)
              )
            } catch {
              // Cookies can't be set in some edge cases — safe to ignore
            }
          },
        },
      }
    )

    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string })

    if (!error) {
      const email = data.session?.user?.email
      if (email) {
        try { await logPortalActivity(email, 'sign_in') } catch { /* logging must never block a sign-in */ }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Code missing or exchange failed — send to the correct login page with an error flag
  const loginPage = next.startsWith('/sub-portal') ? '/sub-portal/login' : next.startsWith('/portal') ? '/portal/login' : '/login'
  return NextResponse.redirect(`${origin}${loginPage}?error=auth`)
}
