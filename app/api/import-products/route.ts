import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface ImportedProduct {
  name:         string
  category:     string
  unit:         string
  default_cost: number
  waste_pct:    number
  markup_pct:   number
  supplier:     string
  description?: string
}

// Strip HTML tags and collapse whitespace to get readable text from a page
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&pound;/g, '£')
    .replace(/&#163;/g, '£')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000)  // cap at ~12k chars to stay within context
}

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const { category, context, url } = await req.json()

  // ── URL mode: fetch page and extract products from it ─────────────────────
  let pageContent = ''
  let sourceSupplier = ''
  if (url?.trim()) {
    try {
      const resp = await fetch(url.trim(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      })

      if (resp.status === 404) {
        return NextResponse.json({
          error: 'Page not found (404) — check the URL is correct, or try copying the URL directly from your browser address bar.',
        }, { status: 400 })
      }
      if (resp.status === 403 || resp.status === 401) {
        return NextResponse.json({
          error: `This site requires login or blocks automated access (${resp.status}). Try exporting a CSV from the supplier instead, then use the 📊 CSV button.`,
        }, { status: 400 })
      }
      if (!resp.ok) {
        return NextResponse.json({
          error: `Could not load the page (HTTP ${resp.status}). The site may be blocking automated access — try the 📊 CSV import instead.`,
        }, { status: 400 })
      }

      const html = await resp.text()
      if (!html || html.trim().length < 100) {
        return NextResponse.json({
          error: 'The page returned empty content. The site may require JavaScript to load products — try the 📊 CSV import instead.',
        }, { status: 400 })
      }

      pageContent = extractText(html)
      // Try to extract supplier name from URL hostname
      try { sourceSupplier = new URL(url.trim()).hostname.replace('www.', '').split('.')[0] } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed'
      const hint = msg.includes('timeout') || msg.includes('abort')
        ? 'The site took too long to respond. Try again or use 📊 CSV import.'
        : `Could not reach the URL. Check the address is correct and accessible.`
      return NextResponse.json({ error: hint }, { status: 400 })
    }
  }

  const system = `You are a UK construction materials expert with detailed knowledge of trade prices, product specifications and supplier ranges. Generate accurate, realistic product lists for UK small builders and contractors. Use current 2024 UK trade prices ex-VAT. Be specific with product names and sizes.`

  const user_msg = url?.trim() ? (
    // URL mode — extract from page content
    `Extract all construction products and materials from the following supplier web page content.
${sourceSupplier ? `Supplier: ${sourceSupplier}` : ''}
${category ? `Focus on category: ${category}` : ''}
${context ? `Extra focus: ${context}` : ''}

PAGE CONTENT:
${pageContent}

Extract every product you can find with its price, unit and any other details. If exact prices aren't visible, use realistic 2024 UK trade prices.

Return JSON only:
{
  "products": [
    {
      "name": "Product name with size/spec",
      "category": "Concrete & Masonry",
      "unit": "nr",
      "default_cost": 0.95,
      "waste_pct": 5,
      "markup_pct": 20,
      "supplier": "${sourceSupplier || ''}",
      "description": "Brief spec"
    }
  ]
}`
  ) : (
    // Standard category generation mode
    `Generate a comprehensive list of common UK construction products for the category: "${category}"${context ? `\nNarrow down to: ${context}` : ''}

Include 15-25 products covering the full typical range a UK builder would need. Be specific about sizes (e.g. "Engineering Brick 215x102x65mm Class A" not just "Engineering Brick"). Include realistic 2024 UK trade prices ex-VAT.

Return JSON only:
{
  "products": [
    {
      "name": "Engineering Brick 215x102x65mm Class A",
      "category": "Concrete & Masonry",
      "unit": "nr",
      "default_cost": 0.95,
      "waste_pct": 5,
      "markup_pct": 20,
      "supplier": "",
      "description": "High strength engineering brick, Class A ≤3% water absorption"
    }
  ]
}

Units must be one of: nr, m², m³, lm, bag, tonne, kg, item, m, hr, day, week.
Waste % should reflect realistic ordering waste (5-15% typical).`
  )

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        messages: [
          { role: 'user', content: user_msg },
        ],
      }),
    })

    const data = await res.json()
    if (data.error) return NextResponse.json({ error: data.error?.message }, { status: 500 })

    let raw = ('{' + (data.content?.[0]?.text ?? '')).trim()
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1].trim()
    if (!raw.startsWith('{')) { const s = raw.indexOf('{'); const e = raw.lastIndexOf('}'); if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1) }

    const parsed = JSON.parse(raw)
    const products: ImportedProduct[] = (parsed.products ?? []).filter((p: ImportedProduct) =>
      p.name && p.unit && typeof p.default_cost === 'number'
    )
    return NextResponse.json({ products })
  } catch (e) {
    console.error('[import-products] error:', e)
    return NextResponse.json({ error: 'AI import failed' }, { status: 500 })
  }
}
