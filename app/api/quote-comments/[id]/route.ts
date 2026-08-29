import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user owns this comment
  const { data: comment, error: commentError } = await sb
    .from('quote_comments')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (commentError || !comment) {
    return NextResponse.json({ error: 'Comment not found or not owned by user' }, { status: 403 })
  }

  const { data, error } = await sb
    .from('quote_comments')
    .update({ message, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user owns this comment
  const { data: comment, error: commentError } = await sb
    .from('quote_comments')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (commentError || !comment) {
    return NextResponse.json({ error: 'Comment not found or not owned by user' }, { status: 403 })
  }

  const { error } = await sb.from('quote_comments').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
