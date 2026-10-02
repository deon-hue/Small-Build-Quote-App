import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

const OTP_TYPES: EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email', 'email_change']

// Handles the sign-in redirect for both kinds of link we send:
//  • ?code=XXX            — links from Supabase's own emails (signInWithOtp): exchanged for a session
//  • ?token_hash=…&type=… — links we build ourselves from admin generateLink (quote emails and
//                           portal invites, see lib/portal-magic-link.ts): verified server-side
// Either way the session is set in cookies here and the user is sent straight to `next`
// (default: /portal).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/portal'

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
        fetch(`${origin}/api/portal/log-activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, eventType: 'sign_in' }),
        }).catch(() => {})
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Code missing or exchange failed — send to the correct login page with an error flag
  const loginPage = next.startsWith('/sub-portal') ? '/sub-portal/login' : '/portal/login'
  return NextResponse.redirect(`${origin}${loginPage}?error=auth`)
}
