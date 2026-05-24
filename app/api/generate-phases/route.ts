import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { scope, jobType, address } = await req.json()

  if (!scope?.trim()) {
    return NextResponse.json({ error: 'No scope provided' }, { status: 400 })
  }

  const system = `You are an expert UK quantity surveyor and building contractor. Convert a scope of works into a structured cost breakdown by phase.

Each phase must have THREE separate cost lines: labour, materials, and plant hire.

Return ONLY valid JSON — no markdown, no code blocks, no explanation:

{
  "phases": [
    {
      "phase": "Phase Name",
      "labour": 1200,
      "labourNotes": "Brief description of labour tasks",
      "materials": 800,
      "materialsNotes": "Key materials required",
      "plant": 300,
      "plantNotes": "Plant/machinery needed (empty string if none)"
    }
  ]
}

Rules:
- Use realistic UK 2024 contractor rates (all costs ex-VAT)
- labour = cost of all workers for this phase
- materials = cost of all materials, components and supplies for this phase
- plant = cost of machinery hire: excavators, scaffolding, skips, mixers, access platforms etc — use 0 if none needed
- All cost fields must be numbers (no £ signs)
- Include 5–12 phases appropriate to the job type
- Phase names must use professional UK construction terminology
- Notes fields should be brief (max 10 words) or empty string
- Do not include profit, markup or VAT`

  const userMessage = `Job type: ${jobType || 'general building works'}
Property: ${address || 'not specified'}

Scope of works:
${scope}

Generate a full phase cost breakdown with labour, materials and plant hire for each phase.`

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
        max_tokens: 4096,
        system,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: '{' }, // prefill — forces pure JSON
        ],
      }),
    })

    const data = await res.json()

    if (data.error) {
      console.error('Anthropic API error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 500 })
    }

    // Prepend the prefilled '{' back
    const rawText = data.content?.[0]?.text || ''
    const text = '{' + rawText

    let jsonStr = text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    if (!jsonStr.startsWith('{')) {
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)
    }

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse AI JSON:', jsonStr.slice(0, 300))
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.phases)) {
      return NextResponse.json({ error: 'Unexpected AI response structure' }, { status: 500 })
    }

    return NextResponse.json({ phases: parsed.phases })
  } catch (err) {
    console.error('Generate phases error:', err)
    return NextResponse.json({ error: 'Failed to generate phases' }, { status: 500 })
  }
}
