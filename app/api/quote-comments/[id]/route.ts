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
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comment, error: commentError } = await sb
    .from('quote_comments')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (commentError || !comment) {
    return NextResponse.json({ error: 'Comment not found or not owned by user' }, { status: 403 })
  }

  const { data, error } = await sb
    .from('quote_comments')
    .update({ message, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toQuoteComment(data))
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comment, error: commentError } = await sb
    .from('quote_comments')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (commentError || !comment) {
    return NextResponse.json({ error: 'Comment not found or not owned by user' }, { status: 403 })
  }

  const { error } = await sb.from('quote_comments').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
