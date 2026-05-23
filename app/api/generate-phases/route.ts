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

  const system = `You are an expert UK quantity surveyor and building contractor. Your job is to convert a scope of works into a structured quote breakdown.

Return ONLY valid JSON — no markdown, no code blocks, no explanation. The JSON must match this exact structure:

{
  "phases": [
    {
      "phase": "Phase Name",
      "items": [
        {
          "desc": "Item description",
          "qty": 1,
          "unit": "Item",
          "labour": 500,
          "materials": 300,
          "plantHire": 0,
          "notes": ""
        }
      ]
    }
  ]
}

Rules:
- Use realistic UK 2024 contractor rates (labour in £/unit, materials ex-VAT)
- Split every work item into its labour cost, materials cost, and plant hire cost separately
- Plant hire is for machinery: excavators, scaffolding, skips, concrete mixers, access platforms, etc. — set to 0 if not needed
- Valid units: Item, m, m², m³, Nr, Hr, Day, Set, Kg, Tonne
- qty and all cost fields must be numbers (no £ signs, no strings)
- Include 5–12 phases appropriate to the job type, each with 2–6 line items
- Phase names should be professional UK construction terminology
- notes field should be brief (max 8 words) or empty string
- Do not include pricing contingencies, profit, or VAT — costs only`

  const userMessage = `Job type: ${jobType || 'general building works'}
Property: ${address || 'not specified'}

Scope of works:
${scope}

Generate a full phase breakdown for this quote.`

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
        max_tokens: 3000,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json()

    if (data.error) {
      console.error('Anthropic API error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 500 })
    }

    const text = data.content?.[0]?.text || ''

    // Try to parse JSON — strip markdown code fences if present
    let jsonStr = text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse AI JSON:', jsonStr.slice(0, 200))
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
