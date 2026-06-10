import { NextRequest, NextResponse } from 'next/server'

// Generates an AI architectural concept image.
// Requires OPENAI_API_KEY in env. Returns { imageUrl } or { error }.
export async function POST(req: NextRequest) {
  const openAiKey  = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!openAiKey) {
    return NextResponse.json({ error: 'no_openai_key' })
  }

  const { description } = await req.json()
  if (!description?.trim()) {
    return NextResponse.json({ error: 'no_description' }, { status: 400 })
  }

  // Step 1: Claude Haiku crafts a detailed, well-structured DALL-E 3 prompt
  let dallePrompt = description
  if (anthropicKey) {
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Convert this building project description into a DALL-E 3 prompt that will generate a photorealistic architectural concept image.

Project description: ${description}

Write a prompt that produces:
- A photorealistic exterior architectural photograph
- UK residential property setting
- Shows the proposed works finished and looking great
- Bright natural daylight, clear sky, well-kept garden visible
- Garden/rear angle for rear extensions, side or street for other works
- Professional architectural photography composition
- No people visible
- Under 180 words

Return ONLY the image generation prompt — no explanation, no preamble.`,
          }],
        }),
      })
      const cd = await claudeRes.json()
      const refined = cd.content?.[0]?.text?.trim()
      if (refined) dallePrompt = refined
    } catch { /* fall through to raw description */ }
  }

  // Step 2: Generate the concept image with DALL-E 3
  try {
    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
        style: 'natural',
      }),
    })

    const dalleData = await dalleRes.json()

    if (dalleData.error) {
      console.error('DALL-E error:', dalleData.error)
      return NextResponse.json({ error: dalleData.error.message }, { status: 500 })
    }

    const imageUrl = dalleData.data?.[0]?.url
    if (!imageUrl) return NextResponse.json({ error: 'no_image' }, { status: 500 })

    return NextResponse.json({ imageUrl })
  } catch (err) {
    console.error('Visualization error:', err)
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
  }
}
