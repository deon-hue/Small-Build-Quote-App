import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface AttachmentPayload {
  name: string
  mimeType: string     // 'image/jpeg' or 'application/pdf'
  dataBase64: string   // raw base64 (no data-URI prefix)
  isImage: boolean
}

export async function POST(req: NextRequest) {
  try {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ reply: 'AI not configured — please add your ANTHROPIC_API_KEY in Netlify environment variables.' })
  }

  let body: { messages?: unknown; context?: unknown; rawInput?: unknown; attachments?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ reply: 'Bad request: could not parse body.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messages, context, rawInput, attachments } = body as any
  const { jobType, address, phases, existingScope } = context || {}
  const hasFiles = Array.isArray(attachments) && attachments.length > 0

  // ── Existing scope block ───────────────────────────────────────────────────
  const existingScopeBlock = existingScope?.trim()
    ? `\n\nEXISTING SCOPE OF WORKS (already saved on this quote — the user wants to update or extend it):\n"""\n${existingScope.trim()}\n"""\nWhen producing an updated scope: preserve everything the user doesn't ask you to change, make targeted improvements only, and produce a single coherent scope — not a list of changes.`
    : ''

  // ── System prompt ─────────────────────────────────────────────────────────
  const planBlock = hasFiles
    ? `\nPlans/drawings have been attached. Extract all useful information including:
- Job type and main construction works
- Room names, dimensions, and areas affected
- Structural elements: beams, columns, lintels, load-bearing walls
- Wall construction, openings, door/window positions and sizes
- Roof type, pitch, and construction method
- Foundation type and depth if shown
- Services: drainage, soil stacks, electrical runs shown
- Finishes and material specifications on drawings
- Engineer's annotations, keynotes, revision notes

Use what you extract from the plans together with the client's description.
Flag any assumptions: "(Assumed from plans: ...)". If plans are unclear, note it.
`
    : ''

  const phaseList = Array.isArray(phases) && phases.length ? phases.join(', ') : 'none set yet'

  const system = `You are an experienced UK building contractor and quantity surveyor conducting a pre-estimate interview. Your goal is to gather just enough information to write a detailed scope of works that can be converted into a fully-costed estimate.

JOB CONTEXT:
- Job type: ${jobType || 'not specified'}
- Property: ${address || 'not specified'}
- Phases already added: ${phaseList}
${existingScopeBlock}
${planBlock}
━━━ YOUR PERSONA ━━━
Sound like a knowledgeable site manager or estimator having a real conversation — not an AI form. Be concise, direct and confident. Use plain UK construction English. Never fire a wall of questions.

━━━ INTERVIEW PHASE ━━━
After the client describes the job, identify the key information gaps and ask 2–4 targeted follow-up questions in a natural, conversational way (not a numbered list). Only ask what is relevant to what they have described.

WHAT TO PROBE (only where relevant):

EXTENSIONS (rear / side / kitchen / garden room):
- Approximate footprint if not given — e.g. "roughly how wide and how far out?"
- Roof type: flat GRP/EPDM, pitched tiles/slates, parapet roof, lantern or rooflight?
- Opening to the house: knock-through existing wall? Steel beam / structural works?
- Glazing: bifold doors, sliding doors, roof lanterns, standard windows?
- Kitchen: new kitchen going into the extension? Layout change?
- Floor: tiles, LVT, polished concrete? Underfloor heating?
- Drainage: new WC/shower in extension, or rainwater connection only?
- Finishes: decorating included in contract, or client's own?

LOFT CONVERSIONS:
- Type: Velux-only, rear L-dormer, full dormer, hip-to-gable, or mansard?
- Number of bedrooms / rooms required
- En-suite or bathroom needed in the loft?
- New staircase required, or reusing the existing loft hatch/stairs?

FULL REFURBISHMENTS:
- Which rooms/areas? Whole house or specific floors?
- Extent: cosmetic decoration only, full strip-back, or structural changes?
- Kitchen replacement included?
- How many bathrooms being replaced?
- Rewire or replumb required?

ALL JOBS — probe if not mentioned and relevant:
- Structural changes: any walls removed, beams, steels?
- Client-supplied items (kitchen, tiles, sanitaryware)?
- Decorating: included or client's own decorator?

━━━ WHEN TO GENERATE THE SCOPE ━━━
Generate the output when you know:
1. The main construction works and any structural elements
2. Approximate scale / size
3. Which specialist trades are involved (structural, drainage, plumbing, electrics, kitchen, bathrooms)
4. What finish and fit-out level is expected

ALSO generate immediately if:
- The client says "that's all", "generate", "go ahead", "skip to scope", or similar
- Plans or drawings were attached (extract info and proceed)
- You have already asked 3 rounds of questions — stop asking and generate

━━━ HANDLING UNCERTAINTY ━━━
"Skip" / "not sure" / "don't know":
→ Make a sensible UK standard assumption and flag it in the scope: "(Assumed: flat GRP roof with EPDM membrane)"

"Make an allowance" / "PS" / "provisional":
→ Note in scope: "(Provisional sum included for kitchen fit-out)"

"Client's own" / "we'll supply it":
→ Note in scope: "(Kitchen units and appliances are client-supplied — contractor to fit only)"

Missing info after asking once:
→ Make the most reasonable assumption for that job type. Move on.

━━━ OUTPUT FORMAT ━━━
When you have enough information:
1. Say briefly: "Based on what you've told me, here's the scope:"
2. Write the full scope wrapped in [SCOPE] and [/SCOPE] tags
3. On the line immediately after [/SCOPE], add exactly: [READY_TO_BUILD]

SCOPE REQUIREMENTS:
- Professional UK contractor English
- 5–9 sentences covering ALL discussed trades in logical order:
  demolition / strip-out → groundworks/structure → external envelope → roof → glazing → drainage → first-fix services → finishes → external works
- Note every assumption: "(Assumed: ...)" or "(Provisional sum for ...)"
- Specific enough for a QS to identify every trade and allocate quantities
- Do NOT include prices, rates, or programme durations

IMPORTANT: Never output [READY_TO_BUILD] without a [SCOPE] block. Only generate the scope when you genuinely have enough information to price the job accurately.`

  // ── Build API messages ────────────────────────────────────────────────────
  let apiMessages: object[]

  if (hasFiles && messages.length > 0) {
    const priorMessages = messages.slice(0, -1)
    const contentItems: object[] = []

    for (const att of (attachments as AttachmentPayload[])) {
      if (att.isImage) {
        contentItems.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mimeType || 'image/jpeg', data: att.dataBase64 },
        })
      } else if (att.mimeType === 'application/pdf') {
        contentItems.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: att.dataBase64 },
        })
      }
    }

    const textPart = (rawInput as string | undefined)?.trim()
      || 'Please analyse these plans and extract all relevant details for the scope.'
    contentItems.push({ type: 'text', text: textPart })

    apiMessages = [
      ...priorMessages,
      { role: 'user', content: contentItems },
    ]
  } else {
    apiMessages = messages
  }

  // ── Model selection ───────────────────────────────────────────────────────
  const model     = 'claude-sonnet-4-6'
  const maxTokens = hasFiles ? 1000 : 1200  // extra tokens for scope generation

  // ── Call Anthropic API ────────────────────────────────────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: apiMessages }),
    })

    const data = await res.json()
    if (data.error) {
      console.error('Anthropic API error:', data.error)
      const msg = data.error?.type === 'authentication_error'
        ? 'AI not configured — please add your ANTHROPIC_API_KEY in Netlify environment variables.'
        : `AI error: ${data.error?.message || 'Unknown error'}`
      return NextResponse.json({ reply: msg })
    }

    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('AI scope chat error:', err)
    return NextResponse.json({ reply: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }

  } catch (outerErr) {
    console.error('scope-chat unhandled error:', outerErr)
    return NextResponse.json({ reply: `Unexpected error: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}` }, { status: 500 })
  }
}
