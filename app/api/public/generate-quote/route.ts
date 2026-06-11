import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 30

// Public version of generate-phases — no auth required.
// Uses BUILDER_USER_ID env var to fetch the builder's Back Office rates.

interface PlantDefault { names: string[]; total: number }
interface BuilderConfig {
  block: string
  plantByKey: Record<string, PlantDefault>
  markup: number      // e.g. 20 = 20%
  vatRate: number     // e.g. 20 = 20%, 0 if not VAT-registered
}

function normKey(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function fetchBuilderRates(): Promise<BuilderConfig> {
  const userId = process.env.BUILDER_USER_ID
  if (!userId) return { block: '', plantByKey: {}, markup: 20, vatRate: 20 }

  let sb
  try {
    sb = createServiceRoleClient()
  } catch {
    return { block: '', plantByKey: {}, markup: 20, vatRate: 20 }
  }

  const [{ data: phases }, { data: subPhases }, { data: tasks }, { data: settings }] = await Promise.all([
    sb.from('bo_phases').select('id, name').eq('user_id', userId).eq('active', true),
    sb.from('bo_sub_phases').select('id, name, phase_id').eq('user_id', userId).eq('active', true),
    sb.from('bo_tasks')
      .select('name, unit, labour_cost, materials_cost, plant_cost, subcontract_cost, other_cost, phase_id, sub_phase_id, recipe_items')
      .eq('user_id', userId).eq('active', true).order('display_order'),
    sb.from('settings').select('default_markup, vat_rate, vat_registered').eq('user_id', userId).single(),
  ])

  const markup  = Number((settings as { default_markup?: number } | null)?.default_markup ?? 20)
  const vatRate = (settings as { vat_registered?: boolean; vat_rate?: number } | null)?.vat_registered === false
    ? 0
    : Number((settings as { vat_rate?: number } | null)?.vat_rate ?? 20)

  if (!tasks || tasks.length === 0) return { block: '', plantByKey: {}, markup, vatRate }

  const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p.name]))
  const subPhaseById = Object.fromEntries((subPhases ?? []).map(sp => [sp.id, sp.name]))

  const plantByKey: Record<string, PlantDefault> = {}
  const addPlant = (key: string, names: string[], total: number) => {
    if (!key || (names.length === 0 && total <= 0)) return
    const cur = plantByKey[key] ?? { names: [], total: 0 }
    for (const n of names) if (!cur.names.includes(n)) cur.names.push(n)
    cur.total = +(cur.total + total).toFixed(2)
    plantByKey[key] = cur
  }

  const grouped: Record<string, string[]> = {}
  for (const t of tasks) {
    const subName = t.sub_phase_id ? subPhaseById[t.sub_phase_id] : undefined
    const phaseName = subName ?? (t.phase_id ? phaseById[t.phase_id] : 'Other')
    if (!grouped[phaseName]) grouped[phaseName] = []

    let plantNames: string[] = []
    let plantTotal = t.plant_cost || 0
    const rec = t.recipe_items as { plantItems?: Array<{ name: string; total: number }> } | null
    if (rec?.plantItems?.length) {
      plantNames = rec.plantItems.map(p => p.name)
      plantTotal = +rec.plantItems.reduce((s, p) => s + (p.total || 0), 0).toFixed(2)
    }
    if (subName) addPlant(normKey(subName), plantNames, plantTotal)
    addPlant(normKey(t.name), plantNames, plantTotal)

    const parts: string[] = []
    if (t.labour_cost > 0) parts.push(`labour £${t.labour_cost}`)
    if (t.materials_cost > 0) parts.push(`mats £${t.materials_cost}`)
    if (plantTotal > 0) parts.push(`plant £${plantTotal}`)
    if (t.subcontract_cost > 0) parts.push(`sub £${t.subcontract_cost}`)
    if (t.other_cost > 0) parts.push(`other £${t.other_cost}`)

    if (parts.length > 0) {
      const plantStr = plantNames.length ? `  [plant: ${plantNames.join(', ')}]` : ''
      grouped[phaseName].push(`    ${t.name} (per ${t.unit}): ${parts.join(', ')}${plantStr}`)
    }
  }

  const lines = Object.entries(grouped)
    .map(([phase, taskLines]) => `  ${phase}:\n${taskLines.join('\n')}`)
    .join('\n')

  const block = lines
    ? `\n\nCONTRACTOR BACK OFFICE DEFAULT RATES (use these as your cost baseline):\n${lines}\n`
    : ''
  return { block, plantByKey, markup, vatRate }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Quote service unavailable' }, { status: 500 })
  }

  const { scope, jobType, address } = await req.json()
  if (!scope?.trim()) {
    return NextResponse.json({ error: 'No scope provided' }, { status: 400 })
  }

  const { block: ratesBlock, plantByKey, markup, vatRate } = await fetchBuilderRates()

  const system = `You are an expert UK quantity surveyor. Convert a scope of works into a structured cost breakdown.

Use a two-level hierarchy:
- parentPhase = main phase group (e.g. "Phase 2 – Groundworks & Foundations")
- phase = sub-phase (e.g. "Excavation", "Concrete Foundations")

Return ONLY valid JSON — no markdown, no code blocks:

{"phases":[{"parentPhase":"Phase 1 – Site Setup & Preparation","phase":"Site Establishment","labour":700,"labourNotes":"Welfare, site management","materials":400,"materialsNotes":"Hoarding, protection","plant":800,"plantNotes":"Scaffold erect/dismantle","subcontractors":0,"subNotes":"","other":200,"otherNotes":"Building Control fee"}]}

Rules:
- Use Back Office rates where provided; scale by quantity
- For unlisted items use realistic UK 2024 contractor rates (ex-VAT)
- labour = direct labour; materials = components; plant = machinery/scaffold/skips; subcontractors = specialists; other = fees/provisional sums
- All cost fields must be numbers
- Notes fields max 10 words or empty string
- Do not include profit, markup or VAT${ratesBlock}`

  const userMessage = `Job type: ${jobType || 'general building works'}
Property: ${address || 'not specified'}

Scope of works:
${scope}

Generate a full phase cost breakdown scaled to this scope.`

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
          { role: 'assistant', content: '{' },
        ],
      }),
    })

    const data = await res.json()
    if (data.error) {
      return NextResponse.json({ error: 'AI error' }, { status: 500 })
    }

    const rawText = data.content?.[0]?.text || ''
    let jsonStr = ('{' + rawText).trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    if (!jsonStr.startsWith('{')) {
      const start = jsonStr.indexOf('{'); const end = jsonStr.lastIndexOf('}')
      if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)
    }

    let parsed
    try { parsed = JSON.parse(jsonStr) } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.phases)) {
      return NextResponse.json({ error: 'Unexpected AI response' }, { status: 500 })
    }

    // Apply plant defaults from Back Office
    for (const ph of parsed.phases) {
      const def = plantByKey[normKey(ph.phase)] ?? plantByKey[normKey(ph.parentPhase)]
      if (def && def.names.length) {
        ph.plantNotes = def.names.join(', ')
        if (!ph.plant || Number(ph.plant) === 0) ph.plant = def.total
      }
    }

    // Apply builder markup to each cost field so the customer sees sell prices.
    // Phases are stored ex-VAT at sell price; VAT is applied to the total only.
    const markupFactor = 1 + markup / 100
    for (const ph of parsed.phases) {
      const round2 = (n: number) => Math.round(n * 100) / 100
      ph.labour        = round2((Number(ph.labour)        || 0) * markupFactor)
      ph.materials     = round2((Number(ph.materials)     || 0) * markupFactor)
      ph.plant         = round2((Number(ph.plant)         || 0) * markupFactor)
      ph.subcontractors = round2((Number(ph.subcontractors) || 0) * markupFactor)
      ph.other         = round2((Number(ph.other)         || 0) * markupFactor)
    }

    // Total = sum of sell prices (ex-VAT), then VAT applied on top
    const subtotal = parsed.phases.reduce((s: number, ph: Record<string, number>) =>
      s + (Number(ph.labour) || 0) + (Number(ph.materials) || 0) +
          (Number(ph.plant) || 0) + (Number(ph.subcontractors) || 0) + (Number(ph.other) || 0), 0)
    const total = Math.round(subtotal * (1 + vatRate / 100) * 100) / 100

    return NextResponse.json({ phases: parsed.phases, total, subtotal, markup, vatRate, usingBuilderRates: !!ratesBlock })
  } catch (err) {
    console.error('Public generate-quote error:', err)
    return NextResponse.json({ error: 'Failed to generate estimate' }, { status: 500 })
  }
}
