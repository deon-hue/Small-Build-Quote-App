// /api/scope-to-quote
// Analyses a written scope of works and returns a structured list of phases and
// tasks drawn from the Back Office task library (bo_tasks / bo_phases).
// Falls back to ESTIMATOR_PHASE_DEFAULTS if the user has no Back Office data yet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { JOB_TEMPLATES } from '@/lib/utils'

export const maxDuration = 60
import { ESTIMATOR_PHASE_DEFAULTS } from '@/lib/estimatorDefaults'

// ── Back Office library builder ────────────────────────────────────────────────

interface TaskLibEntry {
  id: string
  name: string
  description: string
  unit: string
  labour_cost: number
  materials_cost: number
  plant_cost: number
  subcontract_cost: number
  other_cost: number
  waste_cost: number
  markup_pct: number
  phaseName: string
  parentPhaseName: string
}

async function buildLibraryFromDB(userId: string): Promise<{
  entries: TaskLibEntry[]
  phaseTaskMap: Record<string, string[]>
  parentPhaseMap: Record<string, string>
  rateMap: Record<string, TaskLibEntry>
} | null> {
  const sb = await createClient()

  // Fetch phases
  const { data: phases } = await sb
    .from('bo_phases')
    .select('id, name, display_order')
    .eq('user_id', userId)
    .eq('active', true)
    .order('display_order')

  if (!phases || phases.length === 0) return null

  // Fetch sub-phases
  const { data: subPhases } = await sb
    .from('bo_sub_phases')
    .select('id, name, phase_id, display_order')
    .eq('user_id', userId)
    .eq('active', true)
    .order('display_order')

  // Fetch tasks
  const { data: tasks } = await sb
    .from('bo_tasks')
    .select('id, name, description, unit, labour_cost, materials_cost, plant_cost, subcontract_cost, other_cost, waste_cost, markup_pct, phase_id, sub_phase_id, display_order')
    .eq('user_id', userId)
    .eq('active', true)
    .order('display_order')

  if (!tasks || tasks.length === 0) return null

  const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p.name]))
  const subPhaseById = Object.fromEntries((subPhases ?? []).map(sp => [sp.id, { name: sp.name, phaseId: sp.phase_id }]))

  const phaseTaskMap: Record<string, string[]> = {}
  const parentPhaseMap: Record<string, string> = {}
  const rateMap: Record<string, TaskLibEntry> = {}
  const entries: TaskLibEntry[] = []

  for (const t of tasks) {
    // Determine the phase/sub-phase name hierarchy
    let phaseName = ''
    let parentPhaseName = ''

    if (t.sub_phase_id && subPhaseById[t.sub_phase_id]) {
      const sp = subPhaseById[t.sub_phase_id]
      phaseName = sp.name
      parentPhaseName = phaseById[sp.phaseId] ?? 'Other'
    } else if (t.phase_id && phaseById[t.phase_id]) {
      phaseName = phaseById[t.phase_id]
      parentPhaseName = phaseById[t.phase_id]
    } else {
      continue // orphaned task — skip
    }

    const entry: TaskLibEntry = {
      id: t.id,
      name: t.name,
      description: t.description,
      unit: t.unit,
      labour_cost: t.labour_cost,
      materials_cost: t.materials_cost,
      plant_cost: t.plant_cost,
      subcontract_cost: t.subcontract_cost,
      other_cost: t.other_cost,
      waste_cost: t.waste_cost,
      markup_pct: t.markup_pct,
      phaseName,
      parentPhaseName,
    }

    entries.push(entry)
    rateMap[t.name] = entry

    if (!phaseTaskMap[phaseName]) {
      phaseTaskMap[phaseName] = []
      parentPhaseMap[phaseName] = parentPhaseName
    }
    phaseTaskMap[phaseName].push(t.name)
  }

  return entries.length > 0 ? { entries, phaseTaskMap, parentPhaseMap, rateMap } : null
}

// ── Static fallback library builder ───────────────────────────────────────────

function buildLibraryFromStatic(jobType: string): {
  phaseTaskMap: Record<string, string[]>
  parentPhaseMap: Record<string, string>
  rateMap: Record<string, Partial<TaskLibEntry>>
} {
  const phaseTaskMap: Record<string, string[]> = {}
  const parentPhaseMap: Record<string, string> = {}
  const rateMap: Record<string, Partial<TaskLibEntry>> = {}

  const template = JOB_TEMPLATES[jobType] ?? JOB_TEMPLATES['Rear Extension'] ?? []

  for (const tp of template) {
    const tasks = ESTIMATOR_PHASE_DEFAULTS[tp.phase]
    if (tasks && !phaseTaskMap[tp.phase]) {
      phaseTaskMap[tp.phase] = tasks.map(t => t.name)
      parentPhaseMap[tp.phase] = tp.parentPhase
      for (const t of tasks) {
        rateMap[t.name] = {
          name: t.name,
          description: t.description,
          unit: t.unit,
          labour_cost: t.labourRate,
          materials_cost: t.materialsRate,
          plant_cost: t.plantRate,
          subcontract_cost: t.subRate,
          other_cost: t.otherRate,
        }
      }
    }
  }

  for (const [phaseName, items] of Object.entries(ESTIMATOR_PHASE_DEFAULTS)) {
    if (!phaseTaskMap[phaseName]) {
      phaseTaskMap[phaseName] = items.map(t => t.name)
      parentPhaseMap[phaseName] = 'Additional Works'
      for (const t of items) {
        rateMap[t.name] = {
          name: t.name,
          description: t.description,
          unit: t.unit,
          labour_cost: t.labourRate,
          materials_cost: t.materialsRate,
          plant_cost: t.plantRate,
          subcontract_cost: t.subRate,
          other_cost: t.otherRate,
        }
      }
    }
  }

  return { phaseTaskMap, parentPhaseMap, rateMap }
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const { scope, jobType } = await req.json()
  if (!scope?.trim()) return NextResponse.json({ error: 'No scope provided' }, { status: 400 })

  // Get the current user so we can query their Back Office data
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  let phaseTaskMap: Record<string, string[]>
  let parentPhaseMap: Record<string, string>
  let rateMap: Record<string, Partial<TaskLibEntry>>
  let usingDB = false

  if (user) {
    const dbLib = await buildLibraryFromDB(user.id)
    if (dbLib) {
      phaseTaskMap = dbLib.phaseTaskMap
      parentPhaseMap = dbLib.parentPhaseMap
      rateMap = dbLib.rateMap
      usingDB = true
    } else {
      // User exists but Back Office not set up yet — use static defaults
      const fallback = buildLibraryFromStatic(jobType || 'Rear Extension')
      phaseTaskMap = fallback.phaseTaskMap
      parentPhaseMap = fallback.parentPhaseMap
      rateMap = fallback.rateMap
    }
  } else {
    const fallback = buildLibraryFromStatic(jobType || 'Rear Extension')
    phaseTaskMap = fallback.phaseTaskMap
    parentPhaseMap = fallback.parentPhaseMap
    rateMap = fallback.rateMap
  }

  // Compact library text — "Phase name": task1 | task2 | task3
  const libraryLines = Object.entries(phaseTaskMap).map(([phase, tasks]) =>
    `"${phase}": ${tasks.join(' | ')}`
  )
  const libraryText = libraryLines.join('\n')

  const parentMapText = Object.entries(parentPhaseMap)
    .map(([phase, parent]) => `"${phase}" → "${parent}"`)
    .join('\n')

  // Build a compact rate reference block (for cost grounding)
  const rateLines = Object.values(rateMap)
    .filter(t => t.name)
    .map(t => {
      const parts = []
      if ((t.labour_cost ?? 0) > 0) parts.push(`labour £${t.labour_cost}/unit`)
      if ((t.materials_cost ?? 0) > 0) parts.push(`mats £${t.materials_cost}/unit`)
      if ((t.plant_cost ?? 0) > 0) parts.push(`plant £${t.plant_cost}/unit`)
      if ((t.subcontract_cost ?? 0) > 0) parts.push(`sub £${t.subcontract_cost}/unit`)
      if ((t.other_cost ?? 0) > 0) parts.push(`other £${t.other_cost}/unit`)
      return parts.length ? `  "${t.name}" (${t.unit ?? 'item'}): ${parts.join(', ')}` : null
    })
    .filter(Boolean)
    .slice(0, 60) // cap to avoid token overflow
    .join('\n')

  const system = `You are an expert UK quantity surveyor. Analyse a scope of works and select the appropriate construction phases and tasks from the provided task library.

${usingDB ? 'IMPORTANT: The task library and rates below are the contractor\'s own Back Office defaults. Always select from these tasks. The rates shown are the agreed contractor defaults per unit.' : 'Use UK industry-standard phases and task names.'}

Return ONLY valid JSON — no markdown, no code blocks, no explanation:
{
  "phases": [
    {
      "parentPhase": "Phase 1 – Site Setup & Preparation",
      "phase": "Preliminaries",
      "selectedTasks": ["Site hoarding / compound setup", "Scaffold erect & dismantle", "Building Control application"],
      "extraTasks": []
    }
  ]
}

Rules:
- "phase" must EXACTLY match a key in the task library (case-sensitive)
- "selectedTasks" items must EXACTLY match task names listed under that phase in the library
- "parentPhase" should match the parent phase grouping shown in the parent map; use your judgement for extra phases
- Only include phases genuinely required by the scope — do not include phases with nothing to do
- Always include Preliminaries for any construction project
- Include Completion & Handover for all projects
- "extraTasks" should ONLY be used for work genuinely outside the standard library; include all fields:
  { "name": "...", "description": "...", "measurementType": "quantity|area|linear|volume", "unit": "...", "labourRate": 0, "materialsRate": 0, "plantRate": 0, "subRate": 0, "otherRate": 0, "wastePercent": 0 }
- Select enough tasks to fully represent each phase — don't under-select
- Keep phases in logical construction sequence
- Do not hallucinate task names; use only exact names from the library`

  const userMessage = `Job type: ${jobType || 'general building works'}

Scope of works:
${scope}

Task library (phase: task1 | task2 | …):
${libraryText}

Parent phase groupings for reference:
${parentMapText}

${rateLines ? `\nBack Office default rates (for reference only — do not include in JSON response):\n${rateLines}\n` : ''}
Analyse the scope and select appropriate phases and tasks from the library.`

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
        ],
      }),
    })

    const data = await res.json()

    if (data.error) {
      console.error('Anthropic API error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 500 })
    }

    const rawText = data.content?.[0]?.text || ''

    // Extract from markdown fences if present
    let jsonStr = rawText
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    // Find JSON object boundaries
    const openBrace = jsonStr.indexOf('{')
    const closeBrace = jsonStr.lastIndexOf('}')
    if (openBrace !== -1 && closeBrace !== -1 && closeBrace > openBrace) {
      jsonStr = jsonStr.slice(openBrace, closeBrace + 1)
    }

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('Failed to parse AI JSON. Raw response:', rawText.slice(0, 500))
      console.error('Extracted JSON attempt:', jsonStr.slice(0, 300))
      console.error('Parse error:', parseErr instanceof Error ? parseErr.message : String(parseErr))
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.phases)) {
      return NextResponse.json({ error: 'Unexpected AI response structure' }, { status: 500 })
    }

    const phases = parsed.phases.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => typeof p.phase === 'string' && p.phase.trim()
    )

    // Build a taskRates map so the client can hydrate estimator items with Back Office rates
    // without needing to call getPhaseEstimatorDefaults (which only knows the static library)
    const taskRates: Record<string, {
      description: string; unit: string;
      labourRate: number; materialsRate: number; plantRate: number;
      subRate: number; otherRate: number; wastePercent: number;
      measurementType: string;
    }> = {}

    for (const [name, r] of Object.entries(rateMap)) {
      taskRates[name] = {
        description: r.description ?? '',
        unit: r.unit ?? 'item',
        labourRate: r.labour_cost ?? 0,
        materialsRate: r.materials_cost ?? 0,
        plantRate: r.plant_cost ?? 0,
        subRate: r.subcontract_cost ?? 0,
        otherRate: r.other_cost ?? 0,
        wastePercent: 0,
        measurementType: 'quantity',
      }
    }

    return NextResponse.json({ phases, taskRates, usingDB })
  } catch (err) {
    console.error('scope-to-quote error:', err)
    return NextResponse.json({ error: 'Failed to analyse scope' }, { status: 500 })
  }
}
