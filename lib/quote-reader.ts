// Reads a supplier's own quote (a PDF or a photo) with the AI: what kind of document it is, any PO numbers on it, who it is from, what they charge, delivery, how long it stands, and which of the
// request's items each line prices. Server only. It only reads: matching it to a request and saving anything is lib/quote-inbox.ts, and a person always checks the result.

import type { ExtractInput } from '@/lib/doc-extract/types'
import type { ReadQuoteLine } from '@/lib/quote-match'

export interface ReadQuote {
  kind: 'quote' | 'invoice' | 'delivery_note' | 'other'
  poRefs: string[]
  supplier: string
  quoteNumber: string
  date: string
  validUntil: string
  deliveryDate: string
  deliveryCharge: number
  netTotal: number
  vatAmount: number
  grossTotal: number
  lines: ReadQuoteLine[]
  notes: string
  confidence: number
}

/** The open requests the quote might answer, so the AI can say which item each line prices. Never carries any price of ours. */
export interface RequestContext { poNumber: number; title: string; items: { id: string; name: string; qty: number; unit: string }[] }

const SYSTEM = `You read ONE document sent to a UK builder by a supplier, usually a QUOTATION sent in reply to a request for prices, and extract its details. It may be a PDF, a photo, typed or handwritten.

Return ONLY valid JSON, no markdown and no commentary:

{
  "kind": "quote",
  "poRefs": [],
  "supplier": "",
  "quoteNumber": "",
  "date": "YYYY-MM-DD",
  "validUntil": "YYYY-MM-DD",
  "deliveryDate": "YYYY-MM-DD",
  "deliveryCharge": 0,
  "netTotal": 0,
  "vatAmount": 0,
  "grossTotal": 0,
  "notes": "",
  "confidence": 0.0,
  "lines": [ { "description": "", "qty": 0, "unit": "", "netAmount": 0, "itemId": null } ]
}

Rules:
- kind is "quote" for a quotation, estimate or proforma offering to supply at a price; "invoice" for a bill or receipt for something already supplied; "delivery_note" for a delivery note; otherwise "other".
- poRefs: every purchase order number, order reference, "your ref" or similar the document shows, exactly as written (for example "PO-0004", "PO 4", "Your ref: PO0004"). Include anything that looks like one. Empty list if none.
- All amounts are plain numbers in GBP with a dot for decimals, no currency symbols, and EXCLUDING VAT. netTotal is the whole quote before VAT, including any delivery charge. If only a VAT-inclusive total is shown, work out the net assuming 20% VAT. deliveryCharge is the delivery or carriage charge before VAT, 0 if none or if delivery is free.
- Dates are YYYY-MM-DD, or "" if you cannot read one. validUntil is how long the prices stand (a "valid until" date, or the quote date plus the number of days it says it is valid for). deliveryDate is the delivery date they offer.
- lines: one entry per priced line on the quote. netAmount is that line's total before VAT (quantity times unit price). Do not include delivery, VAT or totals as lines.
- itemId: when a line clearly prices one of the items listed under the request whose PO number matches this document, give that item's id exactly as listed. Otherwise null. Never guess: use null when unsure. Several of their lines may price one item.
- notes: anything a buyer must know (minimum order, lead time, substitutions offered, items they cannot supply).
- confidence: 0 to 1, how sure you are of the whole extraction.
- Never invent a number, a supplier or a reference you cannot see: use "" or 0.`

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isFinite(n) ? Math.round(n * 100) / 100 : 0
}
const date = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '')
const KINDS = ['quote', 'invoice', 'delivery_note', 'other']

export async function readQuoteDocument(page: ExtractInput, requests: RequestContext[]): Promise<ReadQuote> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const context = requests.length
    ? 'OPEN REQUESTS (a quote may answer one of these; match lines to the items of the request whose PO number appears on the document):\n' +
      requests.map(r => `PO-${String(r.poNumber).padStart(4, '0')} "${r.title}"\n` + r.items.map(i => `  itemId ${i.id}: ${i.name}, ${i.qty} ${i.unit}`).join('\n')).join('\n')
    : 'There are no open requests.'

  const isPdf = page.mimeType === 'application/pdf'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          isPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: page.base64 } }
            : { type: 'image', source: { type: 'base64', media_type: page.mimeType || 'image/jpeg', data: page.base64 } },
          { type: 'text', text: `${context}\n\nExtract this document as JSON per the schema.` },
        ],
      }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error?.message || 'Anthropic error')

  let jsonStr = (data.content?.[0]?.text || '').trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) jsonStr = fence[1].trim()
  if (!jsonStr.startsWith('{')) {
    const s = jsonStr.indexOf('{'), e = jsonStr.lastIndexOf('}')
    if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1)
  }
  let p: Record<string, unknown>
  try { p = JSON.parse(jsonStr) } catch { throw new Error('The reader returned something that could not be understood') }

  const rawLines = Array.isArray(p.lines) ? p.lines as Record<string, unknown>[] : []
  return {
    kind: (KINDS.includes(String(p.kind)) ? p.kind : 'other') as ReadQuote['kind'],
    poRefs: Array.isArray(p.poRefs) ? p.poRefs.map(x => String(x)).slice(0, 10) : [],
    supplier: String(p.supplier ?? ''),
    quoteNumber: String(p.quoteNumber ?? ''),
    date: date(p.date), validUntil: date(p.validUntil), deliveryDate: date(p.deliveryDate),
    deliveryCharge: num(p.deliveryCharge), netTotal: num(p.netTotal), vatAmount: num(p.vatAmount), grossTotal: num(p.grossTotal),
    notes: String(p.notes ?? '').slice(0, 1000),
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    lines: rawLines.map(l => ({ description: String(l.description ?? ''), qty: num(l.qty), unit: String(l.unit ?? ''), netAmount: num(l.netAmount), itemId: typeof l.itemId === 'string' && l.itemId ? l.itemId : null })),
  }
}
