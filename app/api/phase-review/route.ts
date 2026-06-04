import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { fetchSimilarPhases }        from '@/lib/quote-intelligence'
import type { QuotePhase }           from '@/lib/types'

export interface PhaseReviewRequest {
  phase:   QuotePhase
  jobType: string
  markup:  number
}

export interface ReviewSuggestion {
  category: 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
  item:     string
  reason:   string
  desc:     string   // suggested description to pre-fill the new row
}

export interface PhaseReviewResult {
  gaps:           ReviewSuggestion[]
  suggestions:    ReviewSuggestion[]
  concerns:       string[]
  looksComplete:  string[]
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { phase, jobType, markup } = await req.json() as PhaseReviewRequest

  // ── Fetch historical context ────────────────────────────────────────────────
  const similar = await fetchSimilarPhases(sb, user.id, phase.phase, jobType, 4)
  const historyBlock = similar.length > 0
    ? `\nHISTORICAL DATA — ${similar.length} similar phase${similar.length > 1 ? 's' : ''} from past quotes:\n` +
      similar.map((s, i) => {
        const items = (s.items_summary as { category: string; desc: string }[])
          .map(x => `${x.category}: ${x.desc}`).join('; ')
        return `  ${i + 1}. ${s.phase_name} (${s.job_type ?? 'general'}, ${s.qty_value ?? '?'} ${s.qty_unit ?? ''}) ` +
               `Labour £${s.labour_total} · Materials £${s.materials_total} · Plant £${s.plant_total} ` +
               `[${s.quote_outcome}]\n     Items: ${items || 'none recorded'}`
      }).join('\n')
    : '\nNo historical data yet for this phase type.'

  // ── Build phase summary ─────────────────────────────────────────────────────
  const items      = phase.items ?? []
  const products   = phase.products ?? []
  const plantItems = phase.plantItems ?? []

  const totals = { labour: 0, materials: 0, plant: 0, sub: 0, other: 0 }
  const descs: { cat: string; d: string }[] = []

  for (const i of items) {
    if (i.enabled === false) continue
    totals.labour    += i.labour       ?? 0
    totals.materials += i.materials    ?? 0
    totals.plant     += i.plantHire    ?? 0
    totals.sub       += i.subcontractors ?? 0
    totals.other     += i.other        ?? 0
    if (i.desc?.trim()) descs.push({ cat: i.itemType ?? 'other', d: i.desc.trim() })
  }
  for (const p of products) {
    if (p.enabled === false) continue
    totals.materials += p.costPrice ?? 0
    descs.push({ cat: 'materials', d: p.name })
  }
  for (const p of plantItems) {
    if (p.enabled === false) continue
    totals.plant += p.costPrice ?? 0
    descs.push({ cat: 'plant', d: p.name })
  }

  const zeroCats = (['labour', 'materials', 'plant', 'subcontractors', 'other'] as const)
    .filter(c => ({ labour: totals.labour, materials: totals.materials, plant: totals.plant, subcontractors: totals.sub, other: totals.other }[c] === 0))

  const measurements = phase.meta?.measurements
    ? `${phase.meta.measurements.qty ?? ''} ${phase.meta.measurements.unit ?? ''} ${phase.meta.measurements.area ? `(area: ${phase.meta.measurements.area}m²)` : ''}`.trim()
    : 'not specified'

  // ── Prompt ──────────────────────────────────────────────────────────────────
  const system = `You are an expert UK construction estimator with 20+ years experience across residential extensions, loft conversions, refurbishments and new builds. You understand UK building regulations, typical labour rates, material specifications and contractor workflows.

Your job: review a single quote phase and identify anything that looks incomplete, missing or unusual based on UK construction best practice and the contractor's own past quotes.

Be practical and specific to the trade. Only flag things that are genuinely typical/required — do not over-suggest. If historical data shows this contractor consistently includes certain items, flag their absence as a gap.`

  const user_msg = `Review this quote phase and check for completeness.

JOB TYPE: ${jobType || 'General'}
PHASE: ${phase.parentPhase ? `${phase.parentPhase} → ` : ''}${phase.phase}
TASK: ${phase.taskName || phase.phase}
MEASUREMENTS: ${measurements}
MARKUP: ${markup}%

COST ENTERED:
- Labour: £${totals.labour.toFixed(2)}${descs.filter(x => x.cat === 'labour').length ? ' — ' + descs.filter(x => x.cat === 'labour').map(x => x.d).join(', ') : ' (nothing entered)'}
- Materials: £${totals.materials.toFixed(2)}${descs.filter(x => x.cat === 'materials').length ? ' — ' + descs.filter(x => x.cat === 'materials').map(x => x.d).join(', ') : ' (nothing entered)'}
- Plant/Equipment: £${totals.plant.toFixed(2)}${descs.filter(x => x.cat === 'plant').length ? ' — ' + descs.filter(x => x.cat === 'plant').map(x => x.d).join(', ') : ' (nothing entered)'}
- Subcontractors: £${totals.sub.toFixed(2)}
- Other: £${totals.other.toFixed(2)}

ZERO COST CATEGORIES: ${zeroCats.length ? zeroCats.join(', ') : 'none'}
${historyBlock}

Return JSON only:
{
  "gaps": [{"category": "labour|materials|plant|subcontractors|other", "item": "Short name", "reason": "Why it's typically needed", "desc": "Suggested description for the cost row"}],
  "suggestions": [{"category": "labour|materials|plant|subcontractors|other", "item": "Short name", "reason": "Why to consider", "desc": "Suggested description"}],
  "concerns": ["Any rate or scope concerns as plain strings"],
  "looksComplete": ["Things that look correct and complete"]
}

Limit to the most important 3-5 gaps and 2-3 suggestions. Be specific to the trade.`

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
        max_tokens: 2048,
        system,
        messages: [
          { role: 'user',      content: user_msg },
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

    const result: PhaseReviewResult = JSON.parse(raw)
    return NextResponse.json({ result, hasHistory: similar.length > 0 })
  } catch (e) {
    console.error('[phase-review] error:', e)
    return NextResponse.json({ error: 'AI review failed' }, { status: 500 })
  }
}
