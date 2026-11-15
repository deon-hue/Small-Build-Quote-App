/**
 * GET /api/version  ->  { build }
 *
 * The id of the version of the app this server is running (the short commit id that next.config.js bakes in at build time, the same one the page's own code carries as NEXT_PUBLIC_BUILD_ID).
 * A page that was opened BEFORE a deploy keeps running its old code until it is reloaded; components/NewVersionBanner.tsx asks this now and then and, when the answer differs from the id in
 * the page's own code, offers a Reload. Public and read-only (the middleware skips /api/), it says nothing but the id, and it is never cached.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
