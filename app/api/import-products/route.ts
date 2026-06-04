import { NextRequest, NextResponse } from 'next/server'

export interface ImportedProduct {
  name:         string
  category:     string
  unit:         string
  default_cost: number
  waste_pct:    number
  markup_pct:   number
  supplier:     string
  description?: string
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const { category, context } = await req.json()

  const system = `You are a UK construction materials expert with detailed knowledge of trade prices, product specifications and supplier ranges. Generate accurate, realistic product lists for UK small builders and contractors. Use current 2024 UK trade prices ex-VAT. Be specific with product names and sizes.`

  const user_msg = `Generate a comprehensive list of common UK construction products for the category: "${category}"${context ? `\nExtra context: ${context}` : ''}

Include 15-25 products covering the full typical range a UK builder would need. Be specific about sizes (e.g. "Engineering Brick 215x102x65mm Class A" not just "Engineering Brick"). Include realistic 2024 UK trade prices ex-VAT.

Return JSON only:
{
  "products": [
    {
      "name": "Engineering Brick 215x102x65mm Class A",
      "category": "Concrete & Masonry",
      "unit": "nr",
      "default_cost": 0.95,
      "waste_pct": 5,
      "markup_pct": 20,
      "supplier": "",
      "description": "High strength engineering brick, Class A ≤3% water absorption"
    }
  ]
}

Units must be one of: nr, m², m³, lm, bag, tonne, kg, item, m, hr, day, week.
Waste % should reflect realistic ordering waste (5-15% typical).`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system,
        messages: [
          { role: 'user', content: user_msg },
          { role: 'assistant', content: '{' },
        ],
      }),
    })

    const data = await res.json()
    if (data.error) return NextResponse.json({ error: data.error?.message }, { status: 500 })

    let raw = ('{' + (data.content?.[0]?.text ?? '')).trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1].trim()
    if (!raw.startsWith('{')) { const s = raw.indexOf('{'); const e = raw.lastIndexOf('}'); if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1) }

    const parsed = JSON.parse(raw)
    const products: ImportedProduct[] = (parsed.products ?? []).filter((p: ImportedProduct) =>
      p.name && p.unit && typeof p.default_cost === 'number'
    )
    return NextResponse.json({ products })
  } catch (e) {
    console.error('[import-products] error:', e)
    return NextResponse.json({ error: 'AI import failed' }, { status: 500 })
  }
}
