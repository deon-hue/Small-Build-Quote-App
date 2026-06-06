/**
 * POST /api/generate-quote-pdf
 *
 * Generates a PDF for a quote and returns it as a base64 string.
 * Used by SendQuoteModal to produce an attachment for Resend.
 *
 * Body: { quote: Quote, settings: Settings }
 * Response: { pdf: string } — base64-encoded PDF bytes
 */

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { QuotePdfDocument } from '@/lib/quotePdf'
import type { Quote, Settings } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { quote: Quote; settings: Settings }
    const { quote, settings } = body

    if (!quote || !settings) {
      return NextResponse.json({ error: 'Missing quote or settings' }, { status: 400 })
    }

    // Use JSX directly — the recommended react-pdf pattern
    const buffer = await renderToBuffer(
      <QuotePdfDocument quote={quote} settings={settings} />
    )

    const base64 = buffer.toString('base64')
    return NextResponse.json({ pdf: base64 })

  } catch (err) {
    console.error('[generate-quote-pdf] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
