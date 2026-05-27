// /api/scope-to-quote
// Analyses a written scope of works and returns a structured list of phases and
// tasks drawn from the task library.  The client uses the response to populate
// the quote with EstimatorItems that inherit their rates from Back Office config.

import { NextRequest, NextResponse } from 'next/server'
import { JOB_TEMPLATES } from '@/lib/utils'
import { ESTIMATOR_PHASE_DEFAULTS } from '@/lib/estimatorDefaults'

// ── Helpers ────────────────────────────────────────────────────────────────────

// Build a compact task library for the AI prompt.
// Job-template phases appear first (in construction sequence order) so the model
// respects job-type ordering.  Every other phase in the defaults follows.
function buildLibrary(jobType: string): { phaseTaskMap: Record<string, string[]>; parentPhaseMap: Record<string, string> } {
  const phaseTaskMap: Record<string, string[]> = {}
  const parentPhaseMap: Record<string, string> = {}

  const template = JOB_TEMPLATES[jobType] ?? JOB_TEMPLATES['Rear Extension'] ?? []

  // Phase 1 — phases that belong to this job type (in order)
  for (const tp of template) {
    const tasks = ESTIMATOR_PHASE_DEFAULTS[tp.phase]
    if (tasks && !phaseTaskMap[tp.phase]) {
      phaseTaskMap[tp.phase] = tasks.map(t => t.name)
      parentPhaseMap[tp.phase] = tp.parentPhase
    }
  }

  // Phase 2 — all remaining default phases (for out-of-template work detection)
  for (const [phaseName, items] of Object.entries(ESTIMATOR_PHASE_DEFAULTS)) {
    if (!phaseTaskMap[phaseName]) {
      phaseTaskMap[phaseName] = items.map(t => t.name)
      parentPhaseMap[phaseName] = 'Additional Works'
    }
  }

  return { phaseTaskMap, parentPhaseMap }
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const { scope, jobType } = await req.json()
  if (!scope?.trim()) return NextResponse.json({ error: 'No scope provided' }, { status: 400 })

  const { phaseTaskMap, parentPhaseMap } = buildLibrary(jobType || 'Rear Extension')

  // Compact library text — "Phase name": task1 | task2 | task3
  const libraryLines = Object.entries(phaseTaskMap).map(([phase, tasks]) =>
    `"${phase}": ${tasks.join(' | ')}`
  )
  const libraryText = libraryLines.join('\n')

  // Also include the parentPhase map so the AI can assign correct parent groupings
  const parentMapText = Object.entries(parentPhaseMap)
    .map(([phase, parent]) => `"${phase}" → "${parent}"`)
    .join('\n')

  const system = `You are an expert UK quantity surveyor. Analyse a scope of works and select the appropriate construction phases and tasks from the provided task library.

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
        max_tokens: 8192,
        system,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: '{' },  // prefill — forces pure JSON
        ],
      }),
    })

    const data = await res.json()

    if (data.error) {
      console.error('Anthropic API error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'AI error' }, { status: 500 })
    }

    const rawText = data.content?.[0]?.text || ''
    let jsonStr = ('{' + rawText).trim()

    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    if (!jsonStr.startsWith('{')) {
      const s = jsonStr.indexOf('{')
      const e = jsonStr.lastIndexOf('}')
      if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1)
    }

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse AI JSON:', jsonStr.slice(0, 400))
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.phases)) {
      return NextResponse.json({ error: 'Unexpected AI response structure' }, { status: 500 })
    }

    // Validate and sanitise: drop phases with missing names
    const phases = parsed.phases.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => typeof p.phase === 'string' && p.phase.trim()
    )

    return NextResponse.json({ phases })
  } catch (err) {
    console.error('scope-to-quote error:', err)
    return NextResponse.json({ error: 'Failed to analyse scope' }, { status: 500 })
  }
}
