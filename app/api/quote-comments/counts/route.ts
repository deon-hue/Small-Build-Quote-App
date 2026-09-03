import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/quote-comments/counts?quoteIds=id1,id2,id3
// Returns { [quoteId]: number } — total comment count per quote, for showing a
// "N messages" badge on a quote list without one request per row.
export async function GET(req: NextRequest) {
  const quoteIdsParam = req.nextUrl.searchParams.get('quoteIds')
  if (!quoteIdsParam) return NextResponse.json({})

  const quoteIds = quoteIdsParam.split(',').map(s => s.trim()).filter(Boolean)
  if (!quoteIds.length) return NextResponse.json({})

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await sb
    .from('quote_comments')
    .select('quote_id')
    .in('quote_id', quoteIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.quote_id] = (counts[row.quote_id] ?? 0) + 1
  }
  return NextResponse.json(counts)
}
