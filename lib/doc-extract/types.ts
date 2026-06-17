// Swappable document-extraction contract. Providers (Claude now; Mindee/Veryfi
// later) all return this shape, so the UI, storage and job-costing wiring never
// change when the engine is swapped.

import type { JobCostCategory, PaymentStatus } from '@/lib/types'

export interface ExtractInput {
  base64: string        // raw base64, no data-URI prefix
  mimeType: string      // image/* or application/pdf
  fileName?: string
}

export interface ExtractedCostLine {
  description: string
  costCategory: JobCostCategory
  netAmount: number
  vatAmount: number
  grossAmount: number
  chargeToClient?: boolean
  jobId?: string          // overrides the document-level default job for this line
}

export interface ExtractedDoc {
  supplier: string
  docDate: string       // YYYY-MM-DD or ''
  docNumber: string
  description: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  paymentStatus: PaymentStatus
  costCategory: JobCostCategory
  /** One line per cost split (e.g. materials + plant on one invoice). */
  lines: ExtractedCostLine[]
  confidence?: number
}
