import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Route classification
  const isPortalRoute  = pathname.startsWith('/portal')
  const isPortalLogin  = pathname === '/portal/login'
  const isAdminLogin   = pathname === '/login'
  const isTeamAccept   = pathname.startsWith('/team/accept')  // invite acceptance — no auth needed
  const isPublicRoute  = pathname.startsWith('/get-quote')    // public client-facing pages — no auth needed

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: ResponseCookie }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (isPortalRoute) {
    // Portal routes: unauthenticated → /portal/login; logged-in on login page → /portal
    if (!user && !isPortalLogin) {
      return NextResponse.redirect(new URL('/portal/login', request.url))
    }
    if (user && isPortalLogin) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }
  } else if (isTeamAccept || isPublicRoute) {
    // Public / invite pages: always pass through — no auth required
    // do nothing — fall through to supabaseResponse
  } else {
    // Admin routes: unauthenticated → /login; logged-in on login page → /dashboard
    if (!user && !isAdminLogin) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (user && isAdminLogin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|auth/).*)'],
}
