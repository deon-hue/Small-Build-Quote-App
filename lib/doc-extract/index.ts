// Document-extraction entry point. Swap providers via DOC_EXTRACT_PROVIDER
// ('claude' default; 'mindee' to be added in a later phase) without touching
// the UI, storage or job-costing code.

import type { ExtractInput, ExtractedDoc } from './types'
import { extractWithClaude } from './claude'

export type { ExtractInput, ExtractedDoc, ExtractedCostLine } from './types'

export async function extractDocument(input: ExtractInput | ExtractInput[]): Promise<ExtractedDoc> {
  const provider = (process.env.DOC_EXTRACT_PROVIDER || 'claude').toLowerCase()
  switch (provider) {
    case 'claude':
    default:
      return extractWithClaude(input)
  }
}
