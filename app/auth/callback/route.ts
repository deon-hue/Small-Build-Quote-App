import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Handles the magic link / OTP redirect from Supabase.
// Supabase sends the user here with ?code=XXX — we exchange it for a session,
// then redirect them to their destination (default: /portal).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/portal'

  if (code) {
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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
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
