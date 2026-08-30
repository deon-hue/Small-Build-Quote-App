import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Quote } from '@/lib/types'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { quoteId } = await req.json()
  if (!quoteId) return NextResponse.json({ error: 'Quote ID required' }, { status: 400 })

  try {
    // Get the quote to version
    const { data: quote, error: fetchError } = await sb
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const currentQuote = quote as Quote & { user_id: string }

    // Determine parent quote and next version number
    const parentQuoteId = currentQuote.parentQuoteId || currentQuote.id
    const { data: versionData } = await sb
      .from('quotes')
      .select('version_number')
      .eq(currentQuote.parentQuoteId ? 'parent_quote_id' : 'id', parentQuoteId)
      .order('version_number', { ascending: false })
      .limit(1)

    const nextVersion = ((versionData?.[0]?.version_number as number) ?? 0) + 1

    // Create new version by duplicating the quote
    // Map camelCase Quote type to snake_case database columns
    const rawQuote = quote as any
    const newQuote = {
      user_id: user.id,
      ref: `${rawQuote.ref}-v${nextVersion}`,
      saved_date: new Date().toISOString(),
      last_edited: new Date().toISOString(),
      status: 'draft',
      job_type: rawQuote.job_type,
      markup: rawQuote.markup,
      vat_included: rawQuote.vat_included,
      scope: rawQuote.scope,
      photo: rawQuote.photo,
      converted_to_job: rawQuote.converted_to_job,
      customer: rawQuote.customer,
      phases: rawQuote.phases,
      version_number: nextVersion,
      parent_quote_id: parentQuoteId,
      created_from_version_id: rawQuote.id,
    }

    // Insert the new version
    const { data: created, error: insertError } = await sb
      .from('quotes')
      .insert([newQuote])
      .select('*')
      .single()

    if (insertError || !created) {
      console.error('Failed to create version:', insertError)
      return NextResponse.json({ error: 'Failed to create version' }, { status: 500 })
    }

    return NextResponse.json(created)
  } catch (err) {
    console.error('Create version error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
