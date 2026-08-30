import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Quote } from '@/lib/types'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const quoteId = searchParams.get('quoteId')

  if (!quoteId) return NextResponse.json({ error: 'Quote ID required' }, { status: 400 })

  try {
    // Get the quote to find its version series
    const { data: quote, error: fetchError } = await sb
      .from('quotes')
      .select('id, parent_quote_id')
      .eq('id', quoteId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Find the root quote ID (either this one or its parent)
    const rootId = (quote as any).parent_quote_id || quote.id

    // Get all versions of this quote
    const { data: versions, error: versionsError } = await sb
      .from('quotes')
      .select('id, ref, version_number, status, savedDate, lastEdited, created_from_version_id')
      .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`)
      .eq('user_id', user.id)
      .order('version_number', { ascending: true })

    if (versionsError) {
      console.error('Failed to fetch versions:', versionsError)
      return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 })
    }

    return NextResponse.json(versions)
  } catch (err) {
    console.error('Get versions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
