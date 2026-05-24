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

  const system = `You are an expert UK quantity surveyor and building contractor. Convert a scope of works into a structured cost breakdown using UK industry standard build phases.

The phase structure is job-type dependent. Use a two-level hierarchy:
- parentPhase = main phase group (e.g. "Phase 2 – Groundworks & Foundations")
- phase = sub-phase / category (e.g. "Excavation", "Concrete Foundations", "Underground Drainage")

Each sub-phase has FIVE separate cost rows.

Return ONLY valid JSON — no markdown, no code blocks, no explanation:

{
  "phases": [
    {
      "parentPhase": "Phase 1 – Site Setup & Preparation",
      "phase": "Site Establishment",
      "labour": 700,
      "labourNotes": "Welfare, site management, H&S setup",
      "materials": 400,
      "materialsNotes": "Hoarding, protection sheets, heras fencing",
      "plant": 800,
      "plantNotes": "Scaffold erect/dismantle",
      "subcontractors": 0,
      "subNotes": "",
      "other": 200,
      "otherNotes": "Building Control application fee"
    }
  ]
}

Rules:
- Use realistic UK 2024 contractor rates (all costs ex-VAT)
- labour = direct labour cost for this sub-phase
- materials = materials, components and supplies
- plant = machinery hire: excavators, scaffolding, skips, mixers, access platforms — use 0 if none
- subcontractors = specialist subcontract cost (structural engineer, window fitter, etc) — use 0 if not applicable
- other = miscellaneous: Building Control fees, survey fees, provisional sums — use 0 if none
- All cost fields must be numbers (no £ signs)
- Group sub-phases under the correct UK industry standard main phase header for this job type
- For rear/side extension: ~10 main phases with 2–4 sub-phases each
- For landscaping or fit-out jobs: fewer phases, typically 5–8 main phases
- Notes fields must be brief (max 10 words) or empty string
- Do not include profit, markup or VAT`

  const userMessage = `Job type: ${jobType || 'general building works'}
Property: ${address || 'not specified'}

Scope of works:
${scope}

Generate a full phase cost breakdown using UK industry standard phases for this job type.
Group sub-phases under main phase headers. Include all five cost types per sub-phase.`

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
        max_tokens: 8192,
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
