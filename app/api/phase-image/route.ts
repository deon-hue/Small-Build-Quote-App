import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/phase-image?query=brickwork+construction
 *
 * Proxies an Unsplash random-photo request.
 * Returns { photoUrl: string } on success, { photoUrl: null } if the
 * UNSPLASH_ACCESS_KEY env var isn't set or the request fails.
 *
 * Free tier: 50 requests/hour. All photos are landscape-oriented and
 * ~400px wide (small size) — good enough for quote documents.
 */
export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ photoUrl: null }, { status: 401 })

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return NextResponse.json({ photoUrl: null })

  const query = req.nextUrl.searchParams.get('query') ?? 'construction building'

  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${key}`,
      { next: { revalidate: 3600 } },  // cache per query for 1 hour
    )

    if (!res.ok) return NextResponse.json({ photoUrl: null })

    const data = await res.json()
    const photoUrl: string | null = data?.urls?.small ?? null
    return NextResponse.json({ photoUrl })
  } catch {
    return NextResponse.json({ photoUrl: null })
  }
}
