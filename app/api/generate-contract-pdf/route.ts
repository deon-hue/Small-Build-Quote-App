/**
 * POST /api/generate-contract-pdf
 *
 * Fills the FMB contract template with a contract's saved fields and returns
 * it as a base64 string, for preview or for the caller to upload as a job
 * attachment. Server-side only — the template file lives outside /public.
 *
 * Body: { fields: ContractFields, paymentMode: 'simple' | 'staged', paymentSchedule: ContractPaymentStage[] }
 * Response: { pdf: string } — base64-encoded PDF bytes
 */

import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { fillContractPdf } from '@/lib/fmb-contract'
import type { ContractFields, ContractPaymentStage } from '@/lib/types'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib', 'contract-templates', 'fmb-dom1e.pdf')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fields: ContractFields
      paymentMode: 'simple' | 'staged'
      paymentSchedule: ContractPaymentStage[]
    }
    const { fields, paymentMode, paymentSchedule } = body
    if (!fields) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    let templateBytes: Buffer
    try {
      templateBytes = fs.readFileSync(TEMPLATE_PATH)
    } catch {
      return NextResponse.json(
        { error: 'Contract template not found on the server — copy the FMB PDF to lib/contract-templates/fmb-dom1e.pdf and redeploy.' },
        { status: 500 },
      )
    }

    const filled = await fillContractPdf(templateBytes, fields, paymentMode ?? 'simple', paymentSchedule ?? [])
    const base64 = Buffer.from(filled).toString('base64')

    return NextResponse.json({ pdf: base64 })
  } catch (err) {
    console.error('[generate-contract-pdf] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate contract PDF' }, { status: 500 })
  }
}
