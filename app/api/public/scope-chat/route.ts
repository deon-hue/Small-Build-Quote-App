import { NextRequest, NextResponse } from 'next/server'

// Public version of scope-chat — no auth required.
// Called by the client-facing /get-quote wizard.

interface AttachmentPayload {
  name: string
  mimeType: string
  dataBase64: string
  isImage: boolean
}

interface ImageRef {
  url: string
  name: string
}

interface PdfBase64 {
  dataBase64: string
  name: string
  mimeType: string
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ reply: 'Quote service is temporarily unavailable. Please call us directly.' })
  }

  let body: { messages?: unknown; context?: unknown; rawInput?: unknown; attachments?: unknown; imageRefs?: unknown; pdfBase64s?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ reply: 'Bad request.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messages, context, rawInput, attachments, imageRefs, pdfBase64s } = body as any
  const { jobType, address } = context || {}

  const hasNewFiles = (Array.isArray(imageRefs) && imageRefs.length > 0) ||
                      (Array.isArray(pdfBase64s) && pdfBase64s.length > 0)
  const hasLegacyFiles = Array.isArray(attachments) && attachments.length > 0
  const hasFiles = hasNewFiles || hasLegacyFiles

  const planBlock = hasFiles
    ? `\nPlans, drawings or photos have been attached by the client. Extract all useful information including:
- Project type and main construction works visible
- Room names, dimensions, and areas
- Structural elements: beams, columns, lintels, load-bearing walls
- Wall construction, openings, door/window positions and sizes
- Roof type, pitch, and construction method if shown
- Foundation type if shown
- Services: drainage, soil stacks, electrical runs shown
- Finishes and material specifications
- Any annotations, notes, or dimensions

Use what you extract together with what the client has described.
Flag any assumptions: "(Assumed from plans: ...)". If unclear, note it.
`
    : ''

  const system = `You are an experienced UK building contractor conducting a pre-estimate interview with a potential client. Your goal is to gather just enough information to produce a detailed scope of works that can be converted into a cost estimate.

JOB CONTEXT:
- Job type: ${jobType || 'building project'}
- Property: ${address || 'not specified'}
${planBlock}
━━━ YOUR PERSONA ━━━
Sound like a knowledgeable site manager or estimator having a real conversation — friendly, professional, and reassuring. Use plain UK construction English. Be concise. Never fire a wall of questions. The client is not a builder — keep technical language simple.

━━━ INTERVIEW PHASE ━━━
After the client describes their project, identify the key information gaps and ask 2–3 targeted follow-up questions in a natural, conversational way. Only ask what is relevant.

WHAT TO PROBE (only where relevant):

EXTENSIONS (rear / side / kitchen / garden room):
- Approximate footprint — "roughly how wide and how far out?"
- Roof type: flat, pitched tiles/slates, or lantern/rooflight?
- Opening to the house: knocking through an existing wall?
- Glazing: bifold doors, sliding doors, roof lanterns, standard windows?
- Kitchen in the extension? Floor finish? Underfloor heating?
- Drainage: new toilet/shower, or rainwater only?

LOFT CONVERSIONS:
- Type: Velux-only, rear dormer, full dormer, hip-to-gable?
- Number of bedrooms / rooms
- En-suite or bathroom in the loft?
- New staircase, or existing access?

FULL REFURBISHMENTS:
- Which rooms/areas? Whole house or specific floors?
- Extent: cosmetic, full strip-back, or structural changes?
- Kitchen and/or bathroom replacement included?
- Rewire or replumb required?

ALL JOBS — probe if not mentioned:
- Any walls being knocked through or structural steels needed?
- Is the client supplying any items (kitchen, tiles, sanitaryware)?
- Does the price need to include decorating?

━━━ WHEN TO GENERATE THE SCOPE ━━━
Generate the scope when you know:
1. The main construction works and structural elements
2. Approximate scale / size
3. Which trades are involved
4. Finish and fit-out level expected

ALSO generate immediately if:
- Client says "that's all", "generate", "go ahead", "skip to estimate", or similar
- Plans or drawings were attached (extract info and proceed)
- You have already asked 3 rounds of questions — stop asking and generate

━━━ HANDLING UNCERTAINTY ━━━
"Not sure" / "don't know" → make a sensible assumption and flag it in the scope: "(Assumed: flat GRP roof)"
"Make an allowance" → note: "(Provisional sum included)"
"We'll supply it" → note: "(Client-supplied — contractor to fit only)"

━━━ OUTPUT FORMAT ━━━
When you have enough information:
1. Say briefly: "Great, here's the scope based on what you've told me:"
2. Write the full scope wrapped in [SCOPE] and [/SCOPE] tags
3. On the line immediately after [/SCOPE], add exactly: [READY_TO_BUILD]

SCOPE REQUIREMENTS:
- Friendly but professional UK contractor language
- 5–9 sentences covering all discussed trades in logical order
- Note every assumption: "(Assumed: ...)" or "(Provisional sum for ...)"
- Specific enough for a contractor to identify every trade and estimate quantities
- Do NOT include prices, rates, or programme durations

IMPORTANT: Never output [READY_TO_BUILD] without a [SCOPE] block. Only generate the scope when you genuinely have enough information.`

  // Build API messages — attach files to the last user message if present
  let apiMessages: object[]

  if (hasFiles && Array.isArray(messages) && messages.length > 0) {
    const priorMessages = messages.slice(0, -1)
    const contentItems: object[] = []

    // New approach: imageRefs are Supabase Storage URLs — fetch server-side to avoid client body limits
    if (Array.isArray(imageRefs) && imageRefs.length > 0) {
      await Promise.all((imageRefs as ImageRef[]).map(async (imgRef) => {
        try {
          const imgRes = await fetch(imgRef.url)
          if (!imgRes.ok) return
          const imgBuf = await imgRes.arrayBuffer()
          const imgBase64 = Buffer.from(imgBuf).toString('base64')
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
          contentItems.push({
            type: 'image',
            source: { type: 'base64', media_type: contentType, data: imgBase64 },
          })
        } catch { /* skip image if unreachable */ }
      }))
    }

    // PDFs sent as base64 directly (they're typically small)
    if (Array.isArray(pdfBase64s) && pdfBase64s.length > 0) {
      for (const pdf of (pdfBase64s as PdfBase64[])) {
        contentItems.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf.dataBase64 },
        })
      }
    }

    // Legacy: old base64 attachments (kept for backwards compatibility)
    if (Array.isArray(attachments) && attachments.length > 0) {
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
    }

    const textPart = (rawInput as string | undefined)?.trim()
      || 'Please analyse these plans/images and extract all relevant details to help build the scope of works.'
    contentItems.push({ type: 'text', text: textPart })

    apiMessages = [
      ...priorMessages,
      { role: 'user', content: contentItems },
    ]
  } else {
    apiMessages = messages || []
  }

  const model     = hasFiles ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
  const maxTokens = hasFiles ? 1200 : 1000

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
      return NextResponse.json({ reply: 'Sorry, the AI is unavailable right now. Please try again in a moment.' })
    }

    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.'
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Public scope-chat error:', err)
    return NextResponse.json({ reply: 'Server error. Please try again.' }, { status: 500 })
  }
}
