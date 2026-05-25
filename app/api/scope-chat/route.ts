import { NextRequest, NextResponse } from 'next/server'

interface AttachmentPayload {
  name: string
  mimeType: string     // 'image/jpeg' or 'application/pdf'
  dataBase64: string   // raw base64 (no data-URI prefix)
  isImage: boolean
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  const { messages, context, rawInput, attachments } = await req.json()
  const { jobType, address, phases } = context || {}
  const hasFiles = Array.isArray(attachments) && attachments.length > 0

  // ── System prompt ─────────────────────────────────────────
  const planBlock = hasFiles
    ? `\nYou have received uploaded building plans, drawings, or photos. Extract all useful information including:
- Job type and main construction works
- Rooms, areas, and spaces affected
- Dimensions and measurements (note precisely)
- Structural elements: beams, columns, lintels, load-bearing walls
- Wall construction types, openings, door and window positions and sizes
- Roof type, pitch, and construction method
- Foundation type and depth if shown
- Building regulation notes or engineer's annotations
- Finishes, material specifications, and schedules shown on drawings
- Notes, keynotes, revision clouds, or title block information

Combine what you extract from the plans with the user's description to write the scope.
If plans are unclear or missing information, flag assumptions like "(Assumed: ...)".
`
    : ''

  const system = `You are an expert UK building contractor assistant helping write professional scopes of works for client quotes.

Job context:
- Job type: ${jobType || 'not specified'}
- Property: ${address || 'not specified'}
- Work phases: ${Array.isArray(phases) && phases.length ? phases.join(', ') : 'various'}
${planBlock}
Rules:
- Write in plain, clear English suitable for UK homeowners
- Do not include pricing or specific timescales
- When you write or revise scope text, wrap it in [SCOPE] and [/SCOPE] tags so it can be inserted directly into the quote
- Keep conversational replies brief — the scope text is what matters
- When asked to revise, output the full updated scope inside the tags
- Typical scope: 3–6 sentences covering what work will be done, how it will be carried out, and what the client can expect

Example format:
Sure, here's a draft:

[SCOPE]
Works comprise a single-storey rear extension to extend the existing kitchen and dining area. The project will include demolition of the existing rear wall, new strip foundations, cavity blockwork walls and a flat warm roof with GRP waterproofing. Aluminium bifold doors will be installed to the rear elevation to maximise natural light and provide access to the garden. All works will be carried out in accordance with Building Regulations and structural engineer's requirements.
[/SCOPE]`

  // ── Build API messages ────────────────────────────────────
  // When files are present, convert the last user message to a multi-modal content array.
  // Prior messages (which contain the AI's text descriptions of previous analyses) stay as-is.
  let apiMessages: object[]

  if (hasFiles && messages.length > 0) {
    const priorMessages = messages.slice(0, -1)

    // Build content blocks: files first, then the user's text
    const contentItems: object[] = []

    for (const att of (attachments as AttachmentPayload[])) {
      if (att.isImage) {
        contentItems.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType || 'image/jpeg',
            data: att.dataBase64,
          },
        })
      } else if (att.mimeType === 'application/pdf') {
        contentItems.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: att.dataBase64,
          },
        })
      }
    }

    // rawInput is the original typed/spoken text, without the "📎 filename" display prefix
    const textPart = (rawInput as string | undefined)?.trim()
      || 'Please analyse these plans and help me write a detailed scope of works for this job.'

    contentItems.push({ type: 'text', text: textPart })

    apiMessages = [
      ...priorMessages,
      { role: 'user', content: contentItems },
    ]
  } else {
    apiMessages = messages
  }

  // ── Model selection ───────────────────────────────────────
  // Sonnet for document-enhanced chats (stronger at reading plans + PDFs);
  // Haiku for text-only (faster and cheaper).
  const model     = hasFiles ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-haiku-20241022'
  const maxTokens = hasFiles ? 2000 : 700

  // PDF document blocks require the pdfs beta header
  const betaHeader: Record<string, string> = hasFiles ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}

  // ── Call Anthropic API ────────────────────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...betaHeader,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: apiMessages,
      }),
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
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}
