import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const quoteId = req.nextUrl.searchParams.get('quoteId')
  if (!quoteId) return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all non-internal comments, plus user's own internal comments
  const { data, error } = await sb
    .from('quote_comments')
    .select('*')
    .eq('quote_id', quoteId)
    .or(`is_internal.eq.false,user_id.eq.${user.id}`)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { quoteId, message, isInternal } = await req.json()
  if (!quoteId || !message) {
    return NextResponse.json({ error: 'Missing quoteId or message' }, { status: 400 })
  }

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user owns this quote
  const { data: quote, error: quoteError } = await sb
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('user_id', user.id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: 'Quote not found or not owned by user' }, { status: 403 })
  }

  const { data, error } = await sb
    .from('quote_comments')
    .insert({
      quote_id: quoteId,
      user_id: user.id,
      author_name: 'You',
      message,
      is_internal: !!isInternal,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
