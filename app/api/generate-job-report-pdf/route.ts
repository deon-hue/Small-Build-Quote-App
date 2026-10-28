/**
 * POST /api/generate-job-report-pdf
 *
 * Generates the customer-facing Job Financial Summary as a PDF and returns it as a base64 string (the email attaches it).
 * Uses pdf-lib (pure JS, zero React dependency). It only formats what it is given: nothing is read from the database.
 *
 * Body: { data: JobReportData, settings: Settings }
 * Response: { pdf: string } — base64-encoded PDF bytes
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildJobReportPdf } from '@/lib/jobReportPdf'
import type { JobReportData } from '@/lib/jobReportHtml'
import type { Settings } from '@/lib/types'

export async function POST(req: NextRequest) {
  // a builder's own tool: only a signed-in account may use it
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await req.json() as { data?: JobReportData; settings?: Settings }
    const { data, settings } = body
    if (!data || !settings || !Array.isArray(data.variations) || !Array.isArray(data.invoices) || !Array.isArray(data.payments)) {
      return NextResponse.json({ error: 'Missing report data or settings' }, { status: 400 })
    }
    const buffer = await buildJobReportPdf(data, settings)
    return NextResponse.json({ pdf: buffer.toString('base64') })
  } catch (err) {
    console.error('[generate-job-report-pdf] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF generation failed' }, { status: 500 })
  }
}
