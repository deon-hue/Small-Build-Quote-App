// Claude (Anthropic) document-extraction provider. Server-only.
// Mirrors the existing raw-fetch pattern used in app/api/scope-chat.

import type { ExtractInput, ExtractedDoc, ExtractedCostLine } from './types'
import type { JobCostCategory, PaymentStatus } from '@/lib/types'

const CATEGORIES: JobCostCategory[] = ['labour', 'materials', 'plant', 'subcontractors', 'other']
const PAYMENTS: PaymentStatus[] = ['unknown', 'unpaid', 'partial', 'paid']

const SYSTEM = `You are a bookkeeping assistant for a UK building contractor. You read a single supplier document (invoice, receipt, delivery note, or subcontractor invoice — typed or handwritten, possibly a photo) and extract its details.

Return ONLY valid JSON — no markdown, no commentary:

{
  "supplier": "",
  "docDate": "YYYY-MM-DD",
  "docNumber": "",
  "description": "short summary of what was bought",
  "netAmount": 0,
  "vatAmount": 0,
  "grossAmount": 0,
  "paymentStatus": "unknown",
  "costCategory": "materials",
  "confidence": 0.0,
  "lines": [
    { "description": "", "costCategory": "materials", "netAmount": 0, "vatAmount": 0, "grossAmount": 0 }
  ]
}

Rules:
- All amounts are plain numbers in GBP, no currency symbols. Use a dot for decimals.
- If only the gross total is shown, set grossAmount and compute vatAmount assuming 20% UK VAT (vat = gross - gross/1.2), netAmount = gross - vat. If the document is clearly zero/exempt VAT, set vatAmount 0 and netAmount = grossAmount.
- docDate must be YYYY-MM-DD; if you cannot read a date, use "".
- costCategory MUST be one of: labour, materials, plant, subcontractors, other.
  - materials = builders merchants, timber, plumbing/electrical supplies, tools consumables
  - plant = tool/plant hire, equipment hire, skips-as-equipment
  - subcontractors = labour-only or trade subcontractor invoices (CIS)
  - labour = direct wages/labour
  - other = fuel, parking, fees, waste disposal, sundries
- paymentStatus MUST be one of: unknown, unpaid, partial, paid. Use "unknown" unless the document clearly states it (e.g. "PAID", "BALANCE DUE").
- "lines": if the document splits across more than one cost category or has distinct line items worth separating, return one entry per line; otherwise return a single line equal to the totals. Each line's category must be one of the allowed values.
- confidence: 0..1, your overall confidence in the extraction.
- Never invent a supplier or number you cannot see; use "" instead.`

function clampCategory(v: unknown): JobCostCategory {
  return CATEGORIES.includes(v as JobCostCategory) ? (v as JobCostCategory) : 'materials'
}
function clampPayment(v: unknown): PaymentStatus {
  return PAYMENTS.includes(v as PaymentStatus) ? (v as PaymentStatus) : 'unknown'
}
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isFinite(n) ? +n.toFixed(2) : 0
}

export async function extractWithClaude(input: ExtractInput): Promise<ExtractedDoc> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const isPdf = input.mimeType === 'application/pdf'
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: input.mimeType || 'image/jpeg', data: input.base64 } }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
  if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        { role: 'user', content: [block, { type: 'text', text: 'Extract this document as JSON per the schema.' }] },
        { role: 'assistant', content: '{' },
      ],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error?.message || 'Anthropic error')

  let jsonStr = ('{' + (data.content?.[0]?.text || '')).trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonStr = fence[1].trim()
  if (!jsonStr.startsWith('{')) {
    const s = jsonStr.indexOf('{'), e = jsonStr.lastIndexOf('}')
    if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1)
  }

  let p: Record<string, unknown>
  try { p = JSON.parse(jsonStr) } catch { throw new Error('Extractor returned invalid JSON') }

  const rawLines = Array.isArray(p.lines) ? p.lines as Record<string, unknown>[] : []
  let lines: ExtractedCostLine[] = rawLines.map(l => ({
    description: String(l.description ?? ''),
    costCategory: clampCategory(l.costCategory),
    netAmount: num(l.netAmount),
    vatAmount: num(l.vatAmount),
    grossAmount: num(l.grossAmount),
  }))

  const doc: ExtractedDoc = {
    supplier: String(p.supplier ?? ''),
    docDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.docDate ?? '')) ? String(p.docDate) : '',
    docNumber: String(p.docNumber ?? ''),
    description: String(p.description ?? ''),
    netAmount: num(p.netAmount),
    vatAmount: num(p.vatAmount),
    grossAmount: num(p.grossAmount),
    paymentStatus: clampPayment(p.paymentStatus),
    costCategory: clampCategory(p.costCategory),
    confidence: typeof p.confidence === 'number' ? p.confidence : undefined,
    lines: [],
  }

  // Fall back to a single line from the totals if none returned.
  if (lines.length === 0) {
    lines = [{ description: doc.description, costCategory: doc.costCategory, netAmount: doc.netAmount, vatAmount: doc.vatAmount, grossAmount: doc.grossAmount }]
  }
  doc.lines = lines
  return doc
}
