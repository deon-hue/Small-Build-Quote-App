import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { jobType, address, phases } = await req.json()

  const prompt = `You are a professional UK building contractor writing a scope of works for a client quote.

Job type: ${jobType}
Property address: ${address || 'not specified'}
Phases of work: ${phases?.join(', ') || 'various phases'}

Write a clear, professional scope of works paragraph (3-5 sentences) that describes what the works involve, how they will be carried out, and what the client can expect. Write in plain English suitable for sending to a homeowner. Do not include pricing or timescales. Start directly with the description — no preamble.`

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
