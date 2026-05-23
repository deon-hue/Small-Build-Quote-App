import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { messages, context } = await req.json()
  const { jobType, address, phases } = context || {}

  const system = `You are an expert UK building contractor assistant helping write professional scopes of works for client quotes.

Job context:
- Job type: ${jobType || 'not specified'}
- Property: ${address || 'not specified'}
- Work phases: ${Array.isArray(phases) && phases.length ? phases.join(', ') : 'various'}

Rules:
- Write in plain, clear English suitable for UK homeowners
- Do not include pricing or specific timescales
- When you write or revise scope text, wrap it in [SCOPE] and [/SCOPE] tags so it can be inserted directly into the quote
- Keep conversational replies brief — the scope text is what matters
- When asked to revise, output the full updated scope inside the tags
- Typical scope: 3–6 sentences covering what work will be done, how it will be carried out, and what the client can expect

Example format:
Sure, here's a draft:

[SCOPE]
Works comprise a single-storey rear extension to extend the existing kitchen and dining area. The project will include demolition of the existing rear wall, new strip foundations, cavity blockwork walls and a flat warm roof with GRP waterproofing. Aluminium bifold doors will be installed to the rear elevation to maximise natural light and provide access to the garden. All works will be carried out in accordance with Building Regulations and structural engineer's requirements.
[/SCOPE]`

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
        max_tokens: 700,
        system,
        messages,
      }),
    })

    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('AI scope chat error:', err)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}
