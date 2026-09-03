import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { QuoteComment } from '@/lib/types'

function toQuoteComment(data: any): QuoteComment {
  return {
    id: data.id,
    quoteId: data.quote_id,
    userId: data.user_id,
    authorName: data.author_name,
    message: data.message,
    isInternal: data.is_internal,
    phaseLabel: data.phase_label ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

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
  return NextResponse.json(data.map(toQuoteComment))
}

export async function POST(req: NextRequest) {
  const { quoteId, message, isInternal, phaseLabel, authorName } = await req.json()
  if (!quoteId || !message) {
    return NextResponse.json({ error: 'Missing quoteId or message' }, { status: 400 })
  }

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Is the caller the contractor who owns this quote?
  const { data: ownedQuote } = await sb
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('user_id', user.id)
    .maybeSingle()

  let insertRow: Record<string, unknown>

  if (ownedQuote) {
    // Contractor posting — can be internal or client-visible
    insertRow = {
      quote_id: quoteId,
      user_id: user.id,
      author_name: 'You',
      message,
      is_internal: !!isInternal,
      phase_label: phaseLabel || null,
    }
  } else {
    // Not the owner — the quotes table has no direct read policy for portal
    // clients (the portal reads everything through the SECURITY DEFINER
    // get_portal_data() function instead), so ownership-by-email has to be
    // checked the same way, via a matching RPC rather than a direct query.
    const { data: isClientQuote } = await sb.rpc('quote_belongs_to_portal_user', { p_quote_id: quoteId })
    if (!isClientQuote) {
      return NextResponse.json({ error: 'Quote not found or not accessible' }, { status: 403 })
    }
    insertRow = {
      quote_id: quoteId,
      user_id: user.id,
      author_name: (typeof authorName === 'string' && authorName.trim()) || 'Client',
      message,
      is_internal: false,   // clients can never post an internal-only note
      phase_label: phaseLabel || null,
    }
  }

  const { data, error } = await sb
    .from('quote_comments')
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toQuoteComment(data), { status: 201 })
}
