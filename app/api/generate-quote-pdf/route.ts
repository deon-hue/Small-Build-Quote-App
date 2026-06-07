/**
 * POST /api/generate-quote-pdf
 *
 * Generates a PDF for a quote and returns it as a base64 string.
 * Uses pdf-lib (pure JS, zero React dependency).
 *
 * Body: { quote: Quote, settings: Settings }
 * Response: { pdf: string } — base64-encoded PDF bytes
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildQuotePdf } from '@/lib/quotePdf'
import type { Quote, Settings } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      quote: Quote
      settings: Settings
      customerView?: boolean
      showScope?: boolean
      showPaymentTerms?: boolean
    }
    const { quote, settings, customerView, showScope, showPaymentTerms } = body

    if (!quote || !settings) {
      return NextResponse.json({ error: 'Missing quote or settings' }, { status: 400 })
    }

    const buffer = await buildQuotePdf(quote, settings, {
      customerView:    customerView    ?? true,
      showScope:       showScope       ?? true,
      showPaymentTerms: showPaymentTerms ?? true,
    })
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
