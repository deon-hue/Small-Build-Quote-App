import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Route classification
  const isPortalRoute  = pathname.startsWith('/portal')
  const isPortalLogin  = pathname === '/portal/login'
  const isAdminLogin   = pathname === '/login'

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
  } else {
    // Admin routes: unauthenticated → /login; logged-in on login page → /dashboard
    if (!user && !isAdminLogin) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (user && isAdminLogin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    // Customer trying to access admin routes → send them to their portal
    if (user) {
      const { data: role } = await supabase.rpc('get_my_role')
      if (role === 'customer') {
        return NextResponse.redirect(new URL('/portal', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
