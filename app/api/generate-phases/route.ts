import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Fetch Back Office reference rates for the current user ─────────────────────

interface PlantDefault { names: string[]; total: number }

// Normalise a phase/sub-phase/task name into a stable lookup key.
function normKey(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function fetchReferenceRates(userId: string): Promise<{ block: string; plantByKey: Record<string, PlantDefault> }> {
  const sb = await createClient()

  const [{ data: phases }, { data: subPhases }, { data: tasks }] = await Promise.all([
    sb.from('bo_phases').select('id, name').eq('user_id', userId).eq('active', true),
    sb.from('bo_sub_phases').select('id, name, phase_id').eq('user_id', userId).eq('active', true),
    sb.from('bo_tasks')
      .select('name, unit, labour_cost, materials_cost, plant_cost, subcontract_cost, other_cost, phase_id, sub_phase_id, recipe_items')
      .eq('user_id', userId).eq('active', true).order('display_order'),
  ])

  if (!tasks || tasks.length === 0) return { block: '', plantByKey: {} }

  const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p.name]))
  const subPhaseById = Object.fromEntries((subPhases ?? []).map(sp => [sp.id, sp.name]))

  // Default plant items per sub-phase / task name (from the layer plant list).
  const plantByKey: Record<string, PlantDefault> = {}
  const addPlant = (key: string, names: string[], total: number) => {
    if (!key || (names.length === 0 && total <= 0)) return
    const cur = plantByKey[key] ?? { names: [], total: 0 }
    for (const n of names) if (!cur.names.includes(n)) cur.names.push(n)
    cur.total = +(cur.total + total).toFixed(2)
    plantByKey[key] = cur
  }

  // Group tasks by phase for readability
  const grouped: Record<string, string[]> = {}
  for (const t of tasks) {
    const subName = t.sub_phase_id ? subPhaseById[t.sub_phase_id] : undefined
    const phaseName = subName ?? (t.phase_id ? phaseById[t.phase_id] : 'Other')
    if (!grouped[phaseName]) grouped[phaseName] = []

    // Plant item names + total: prefer the explicit recipe plant list.
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
    ? `\n\nCONTRACTOR BACK OFFICE DEFAULT RATES (use these as your cost baseline — scale by area/quantity as needed). Where a sub-phase lists [plant: …], name those exact plant items in plantNotes:\n${lines}\n`
    : ''
  return { block, plantByKey }
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { scope, jobType, address } = await req.json()

  if (!scope?.trim()) {
    return NextResponse.json({ error: 'No scope provided' }, { status: 400 })
  }

  // Fetch user's Back Office rates for cost grounding
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  const { block: ratesBlock, plantByKey } = user ? await fetchReferenceRates(user.id) : { block: '', plantByKey: {} as Record<string, PlantDefault> }

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
- Use the contractor's Back Office rates where provided — these are the agreed pricing defaults
- Where a Back Office rate is provided, derive totals by multiplying the per-unit rate by the required quantity
- For tasks or phases NOT in the Back Office rates, use realistic UK 2024 contractor rates (all costs ex-VAT)
- labour = direct labour cost for this sub-phase
- materials = materials, components and supplies
- plant = machinery hire: excavators, scaffolding, skips, mixers, access platforms — use 0 if none
- subcontractors = specialist subcontract cost (structural engineer, window fitter, etc) — use 0 if not applicable
- other = miscellaneous: Building Control fees, survey fees, provisional sums, skip hire, waste disposal — use 0 if none
- All cost fields must be numbers (no £ signs)
- Group sub-phases under the correct UK industry standard main phase header for this job type
- For rear/side extension: ~10 main phases with 2–4 sub-phases each
- For landscaping or fit-out jobs: fewer phases, typically 5–8 main phases
- Notes fields must be brief (max 10 words) or empty string
- Do not include profit, markup or VAT

DEMOLITION / STRIP OUT RULES — when the scope mentions any demolition, strip out, or removal work, create detailed sub-phases within Phase 1 – Site Setup & Preparation:
- "knock through" or "remove load-bearing wall" → sub-phase: Structural Demolition — Remove load-bearing wall (include SE fee in subcontractors, acrow props in plant)
- "remove wall" or "knock down" → sub-phase: Structural Demolition — Remove masonry wall
- "chimney breast" → sub-phase: Structural Demolition — Break out chimney breast
- "strip ceiling" or "remove ceiling" → sub-phase: Ceiling Strip Out
- "hack off plaster" or "remove plaster" → sub-phase: Wall Finishes Strip Out — Hack off plaster
- "remove tiles" or "tile removal" → sub-phase: Wall Finishes Strip Out — Remove tiles from walls
- "lift floorboards" or "remove floor" → sub-phase: Floor Strip Out
- "strip out kitchen" or "remove kitchen" → sub-phase: Kitchen/Bathroom Strip Out — Remove kitchen units (include services cap-off in subcontractors)
- "strip out bathroom" or "remove bathroom" → sub-phase: Kitchen/Bathroom Strip Out — Remove bathroom suite
- "remove stud wall" or "stud partition" → sub-phase: Non-Structural Demolition — Remove stud wall
- "remove shed" or "remove outbuilding" → sub-phase: External Demolition — Remove outbuilding
- "remove patio" or "paving" → sub-phase: External Demolition — Remove patio / paving
- "skip" or "clear site" or "clear waste" → sub-phase: Waste & Clearance — include skip hire (other) and labour loading out (labour)
- Always add a Waste & Clearance sub-phase when demolition is present: skip hire (other £310/skip), labour loading out (labour £300/day)
- Flag asbestos risk in buildingRegsNotes for any pre-1985 property or where existing coatings are being removed
- Always include a provisional sum for hazardous materials in older properties${ratesBlock}`

  const userMessage = `Job type: ${jobType || 'general building works'}
Property: ${address || 'not specified'}

Scope of works:
${scope}

Generate a full phase cost breakdown. Use the Back Office default rates provided in the system prompt as your pricing baseline, scaled to the quantities implied by the scope. Include all five cost types per sub-phase.`

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

    // Deterministically attach Back Office default plant items to each sub-phase,
    // matching on sub-phase name (falling back to the main phase name). This
    // guarantees e.g. "Excavation" carries Mini Excavator / Tracked Dumper / etc.
    // regardless of what the model wrote.
    let plantDefaultsAttached = 0
    for (const ph of parsed.phases) {
      const def = plantByKey[normKey(ph.phase)] ?? plantByKey[normKey(ph.parentPhase)]
      if (def && def.names.length) {
        ph.plantItems = def.names
        ph.plantNotes = def.names.join(', ')
        if (!ph.plant || Number(ph.plant) === 0) ph.plant = def.total
        plantDefaultsAttached++
      }
    }

    return NextResponse.json({ phases: parsed.phases, usingDB: !!ratesBlock, plantDefaultsAttached })
  } catch (err) {
    console.error('Generate phases error:', err)
    return NextResponse.json({ error: 'Failed to generate phases' }, { status: 500 })
  }
}
