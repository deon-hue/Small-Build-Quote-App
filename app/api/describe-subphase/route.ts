import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { usageGuard } from '@/lib/usage'
import { buildDescribePrompt, cleanDescription, MAX_NOTES, type DescribeInput } from '@/lib/describe-subphase'

export const maxDuration = 30

// POST { notes, phase, parentPhase?, jobType?, roomLabel? } -> { description }
// Turns a builder's rough words about a sub-phase into the short scope-of-works line printed on the quote.
export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const limited = await usageGuard(sb, 'ai', 'describe-subphase')
  if (limited) return limited

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  let body: Partial<DescribeInput> = {}
  try { body = await req.json() } catch { /* handled below */ }
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (notes.length < 3) return NextResponse.json({ error: 'Say or type a few words about the work first.' }, { status: 400 })
  if (notes.length > MAX_NOTES * 3) return NextResponse.json({ error: 'That is too long. Keep it to a few sentences.' }, { status: 400 })

  const { system, user: userMsg } = buildDescribePrompt({
    notes,
    phase: typeof body.phase === 'string' ? body.phase.slice(0, 120) : 'Sub-phase',
    parentPhase: typeof body.parentPhase === 'string' ? body.parentPhase.slice(0, 120) : undefined,
    jobType: typeof body.jobType === 'string' ? body.jobType.slice(0, 80) : undefined,
    roomLabel: typeof body.roomLabel === 'string' ? body.roomLabel.slice(0, 80) : undefined,
  })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system, messages: [{ role: 'user', content: userMsg }] }),
    })
    const data = await res.json()
    if (data.error) return NextResponse.json({ error: data.error?.message ?? 'The AI could not write that' }, { status: 500 })
    const description = cleanDescription(String(data.content?.[0]?.text ?? ''))
    if (!description) return NextResponse.json({ error: 'The AI could not write that from those notes. Add a few more details and try again.' }, { status: 422 })
    return NextResponse.json({ description })
  } catch (e) {
    console.error('[describe-subphase] error:', e)
    return NextResponse.json({ error: 'The AI could not write that. Try again.' }, { status: 500 })
  }
}
