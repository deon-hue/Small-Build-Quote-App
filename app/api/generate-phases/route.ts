import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

// Extract every fully-closed phase object from a truncated JSON string.
// Falls back gracefully when the AI hit the max_tokens ceiling mid-response.
function recoverPartialPhases(jsonStr: string): unknown[] | null {
  const phasesStart = jsonStr.indexOf('"phases"')
  if (phasesStart === -1) return null
  const arrayStart = jsonStr.indexOf('[', phasesStart)
  if (arrayStart === -1) return null

  const phases: unknown[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false

  for (let i = arrayStart + 1; i < jsonStr.length; i++) {
    const c = jsonStr[i]
    if (escape) { escape = false; continue }
    if (c === '\\' && inString) { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue

    if (c === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try { phases.push(JSON.parse(jsonStr.slice(objStart, i + 1))) } catch { /* skip malformed */ }
        objStart = -1
      }
    }
  }

  return phases.length > 0 ? phases : null
}

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

  // Fetch user's Back Office rates for cost grounding (non-fatal — fall back to standard rates)
  let ratesBlock = ''
  let plantByKey: Record<string, PlantDefault> = {}
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const rates = await fetchReferenceRates(user.id)
      ratesBlock = rates.block
      plantByKey = rates.plantByKey
    }
  } catch {
    // proceed with standard rates
  }

  const ukStandardRates = !ratesBlock ? `

UK STANDARD MARKET RATES 2025 (ex-VAT — use these as your pricing baseline):

LABOUR DAY RATES:
- General labourer / operative: £210/day
- Bricklayer (skilled): £260/day
- Carpenter / joiner: £240/day
- Plasterer: £250/day
- Tiler (floor or wall): £230/day
- Decorator / painter: £200/day
- Roofer: £260/day
- Ground worker: £220/day
- Electrician (1st fix + 2nd fix, per day): £320/day — use as subcontractor
- Plumber (1st fix + 2nd fix, per day): £320/day — use as subcontractor
- Steelwork / structural: quote per beam, approx £800–£1,400 installed

TYPICAL TRADE PACKAGE COSTS:
- Electrician full rewire (3-bed): £5,000–£7,000 (subcontractors)
- Electrician part rewire / extension circuit: £1,500–£3,000 (subcontractors)
- Plumber full install (bathroom + kitchen): £4,000–£6,500 (subcontractors)
- Plumber single bathroom: £2,000–£3,500 (subcontractors)
- Underfloor heating (wet system, per m²): £80–£120 (subcontractors)
- MVHR / mechanical vent: £3,000–£5,000 (subcontractors)
- Steel beam supply & install (per beam, inc SE design): £1,000–£1,800 (subcontractors)
- Structural engineer report / calcs: £800–£1,500 (subcontractors)

MATERIALS (common items):
- Ready-mix concrete C25: £115/m³
- Concrete block 100mm (per m²): £18
- Concrete block 140mm (per m²): £22
- Facing brick (per 1,000): £650
- Engineering brick (per 1,000): £750
- Timber 100×50 CLS (per m): £3.50
- Timber 200×50 joist (per m): £6.50
- OSB 18mm sheet: £28
- Plasterboard 12.5mm (per m²): £8
- Multifinish plaster (25kg bag): £14
- Sand/cement (25kg): £5
- PIR insulation 100mm (per m²): £20
- Mineral wool 100mm (per m²): £6
- DPC 450mm (per roll): £35
- Roof slate (per m²): £45
- Concrete roof tile (per m²): £28
- GRP flat roof kit (per m²): £60
- EPDM rubber roof (per m²): £50
- uPVC window (standard, supplied): £350–£600 each
- Bifold door (per m width, aluminium): £1,200
- Steel lintel (standard 1.2m): £45
- Soil pipe 110mm (per m): £18

PLANT HIRE (typical rates):
- 3t mini excavator (per week): £720
- 8t tracked excavator (per week): £1,400
- Tracked dumper 1t (per week): £480
- Scaffold (typical extension, erect + dismantle): £2,800
- Skip 8-yard (per skip inc disposal): £320
- Concrete pump (per day): £650
- Acrow props (per set per week): £60
- Pressure washer (per day): £60

BUILDING CONTROL & FEES:
- Building Control (extension up to 40m²): £1,200
- Building Control (extension 40–100m²): £1,600
- Building Control (loft conversion): £900
- Building Control (full refurb, structural): £1,400
- Party Wall surveyor (per award): £800–£1,500

M² ALL-IN BUILD RATES (contractor cost, ex-VAT — use to sense-check totals):
- Single storey rear/side extension: £1,900–£2,600/m² floor area
- Two storey extension: £1,700–£2,200/m² floor area
- Loft conversion Velux only: £35,000–£45,000 total
- Loft conversion rear dormer: £50,000–£70,000 total
- Full house refurbishment: £500–£800/m² floor area
- Kitchen fit-out (supply + fit): £12,000–£25,000
- Bathroom fit-out (supply + fit): £5,000–£12,000
- Garden room (timber frame, insulated): £1,400–£1,800/m²
` : ''

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
- For tasks or phases NOT in the Back Office rates, use realistic UK 2025 market rates (all costs ex-VAT)
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
- Sense-check your total against the m² all-in rates — if the total is wildly outside the expected range, adjust individual line items${ukStandardRates}

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

  const encoder = new TextEncoder()

  // Process accumulated Anthropic text into the final phases result (called once stream ends)
  function processPhases(accumulated: string, stopReason: string) {
    const truncated = stopReason === 'max_tokens'
    let jsonStr = accumulated.trim()
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
      if (truncated) {
        const recovered = recoverPartialPhases(jsonStr)
        if (recovered && recovered.length > 0) {
          parsed = { phases: recovered }
          console.warn(`AI JSON truncated; recovered ${recovered.length} phases`)
        } else {
          console.error('AI JSON truncated and unrecoverable:', jsonStr.slice(0, 300))
          return { error: 'AI response was too long to complete. Try a shorter scope or break it into sections.' }
        }
      } else {
        console.error('Failed to parse AI JSON:', jsonStr.slice(0, 300))
        return { error: 'AI returned invalid JSON' }
      }
    }

    if (!parsed || !Array.isArray(parsed.phases)) {
      return { error: 'Unexpected AI response structure' }
    }

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

    return { phases: parsed.phases, usingDB: !!ratesBlock, plantDefaultsAttached }
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        stream: true,
        system,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, errText.slice(0, 200))
      let msg = `AI service error (${anthropicRes.status})`
      try { const j = JSON.parse(errText); msg = j?.error?.message || msg } catch { /* ignore */ }
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // Stream SSE back to the client. Netlify cuts idle functions after ~26s;
    // by sending heartbeat comments while Anthropic generates, the connection
    // stays alive regardless of how long the scope takes to produce.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''
        let accumulated = ''
        let stopReason = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const chunk = line.slice(6).trim()
              if (chunk === '[DONE]') continue
              try {
                const event = JSON.parse(chunk)
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  accumulated += event.delta.text
                } else if (event.type === 'message_delta') {
                  stopReason = event.delta?.stop_reason || ''
                }
              } catch { /* ignore malformed SSE lines */ }
            }

            // Keep-alive: Netlify sees bytes flowing and won't treat the function as timed out
            controller.enqueue(encoder.encode(': ping\n\n'))
          }
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted — please try again.' })}\n\n`))
          controller.close()
          return
        }

        const result = processPhases(accumulated, stopReason)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`))
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('Generate phases error:', err)
    return NextResponse.json({ error: 'Failed to generate phases' }, { status: 500 })
  }
}
