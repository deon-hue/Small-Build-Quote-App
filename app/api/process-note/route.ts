/**
 * POST /api/process-note
 *
 * Takes a raw job-note (typed or voice-dictated) and returns an AI-cleaned version plus a
 * tag and any action items it contains. Same raw-fetch + JSON-fence-stripping pattern as
 * lib/doc-extract/claude.ts — no Anthropic SDK is used anywhere in this codebase.
 *
 * Body: { text: string }
 * Response: { cleanedText: string, tag: NoteTag, actionItems: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { NoteTag } from '@/lib/types'

const VALID_TAGS: NoteTag[] = ['snag', 'instruction', 'material', 'safety', 'general']

const SYSTEM = `You clean up short, informal construction site notes — often dictated by voice, so they may contain filler words, false starts, or transcription errors. You do not change the meaning or invent details.

Return JSON only, no other text, in exactly this shape:
{
  "cleanedText": "the note, tidied up — fix filler words, false starts and obvious transcription errors, keep the meaning and every fact exactly as given",
  "tag": "one of: snag, instruction, material, safety, general — pick whichever single tag best fits",
  "actionItems": ["short actionable to-dos genuinely present in the note — an empty array if there are none, never invent one"]
}

Tag meanings: snag = a defect/issue found on site; instruction = something the client or site told the builder to do; material = ordering/delivery/material-related; safety = a hazard or safety concern; general = anything else.`

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Note processing not configured' }, { status: 500 })

  let body: { text?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Missing note text' }, { status: 400 })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error?.message || 'Anthropic error')

    let jsonStr = (data.content?.[0]?.text || '').trim()
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonStr = fence[1].trim()
    if (!jsonStr.startsWith('{')) {
      const s = jsonStr.indexOf('{'), e = jsonStr.lastIndexOf('}')
      if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1)
    }

    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(jsonStr) } catch { throw new Error('Note processor returned invalid JSON') }

    const cleanedText = typeof parsed.cleanedText === 'string' && parsed.cleanedText.trim() ? parsed.cleanedText.trim() : text
    const tag: NoteTag = VALID_TAGS.includes(parsed.tag as NoteTag) ? parsed.tag as NoteTag : 'general'
    const actionItems = Array.isArray(parsed.actionItems)
      ? parsed.actionItems.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : []

    return NextResponse.json({ cleanedText, tag, actionItems })
  } catch (err) {
    console.error('process-note error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Note processing failed' }, { status: 500 })
  }
}
