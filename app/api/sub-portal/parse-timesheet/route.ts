import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ContractSummary {
  id: string
  description: string
  job_type: string | null
  job_address: string | null
  type: string
  rate_type: string | null
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { text, contracts, today } = await req.json() as {
    text: string
    contracts: ContractSummary[]
    today: string
  }

  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const contractList = contracts.length
    ? contracts.map((c, i) =>
        `${i + 1}. [${c.id}] ${c.job_type || c.description}${c.job_address ? ' at ' + c.job_address : ''} (${c.type === 'rate' ? (c.rate_type ?? 'rate') : 'fixed price'})`
      ).join('\n')
    : '(no active projects)'

  const system = `You are a building site timesheet parser. Extract structured data from a subcontractor's natural language timesheet entry. Return ONLY valid JSON — no markdown, no explanation.`

  const userMsg = `Today's date: ${today}

Active projects:
${contractList}

Parse this timesheet entry: "${text}"

Return JSON:
{
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM or null",
  "finishTime": "HH:MM or null",
  "breakMins": 0,
  "totalHours": 8.5,
  "description": "Professional description of work done",
  "contractId": "matching project UUID or null"
}

Rules:
- date: use today unless specified; "yesterday" means ${today} minus 1 day
- totalHours: calculate from start/finish minus break, or estimate: "all day"/"full day"=8.0, "half day"=4.0
- description: professional UK building site language (e.g. "Blockwork to rear extension cavity walls" not "laying bricks")
- contractId: match keywords (job type, address) to project list; if only 1 project always use its ID; null only if genuinely ambiguous with multiple projects
- If times are given as e.g. "8-5" treat as 08:00-17:00`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    const data = await res.json()
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 })

    let raw = (data.content?.[0]?.text ?? '').trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1].trim()
    if (!raw.startsWith('{')) { const s = raw.indexOf('{'); const e = raw.lastIndexOf('}'); if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1) }

    const parsed = JSON.parse(raw)
    return NextResponse.json({ parsed })
  } catch (err) {
    console.error('parse-timesheet error:', err)
    return NextResponse.json({ error: 'AI parse failed' }, { status: 500 })
  }
}
