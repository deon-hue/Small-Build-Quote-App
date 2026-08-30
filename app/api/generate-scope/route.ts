import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { jobType, address, phases } = await req.json()

  const phaseList = phases?.join(', ') || 'various phases'
  const hasPhases = phases && phases.length > 0

  const prompt = `You are a professional UK building contractor writing a scope of works for a client quote.

Job type: ${jobType}
Property address: ${address || 'not specified'}
Phases of work: ${phaseList}

Write a clear, professional scope of works. ${hasPhases ? `Organize it by the following phases, using each phase name as a bold markdown heading (e.g. **Phase Name**). For each phase, write 1-2 sentences describing the works involved in that phase.

Phases:
${phases.map((p, i) => `${i + 1}. ${p}`).join('\n')}

` : 'Write as 4-6 sentences covering all main work areas in logical order (demolition → structure → external → roof → internal → finishes).'}

Use plain English suitable for sending to a homeowner. Do not include pricing or timescales. Start directly with the description — no preamble.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const scope = data.content?.[0]?.text || ''
    return NextResponse.json({ scope })
  } catch (err) {
    console.error('Anthropic API error:', err)
    return NextResponse.json({ error: 'Failed to generate scope' }, { status: 500 })
  }
}
