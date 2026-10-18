'use client'

// A yellow reminder on the quote: a roof is vaulted, but nothing yet prices the insulation and plasterboard lining of the vaulted ceiling. See lib/quote-warnings.ts.

import React from 'react'
import type { QuotePhase } from '@/lib/types'
import { vaultedCeilingReminder } from '@/lib/quote-warnings'

export default function VaultedCeilingReminder({ phases }: { phases: QuotePhase[] }) {
  const r = vaultedCeilingReminder(phases)
  if (!r.show) return null
  return (
    <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
      <span style={{ fontSize: 16 }}>⚠</span>
      <div>
        <strong>This quote has a vaulted ceiling ({r.roofs.join(', ')}), but nothing yet for its insulation and plasterboard.</strong>{' '}
        The roof price does not include them. Add the <strong>Vaulted ceiling</strong> tasks under <strong>Plastering &amp; Boarding</strong> (Ceiling Plastering &amp; Boarding): insulation between and under the rafters, plasterboard to the rafters, and the skim.
      </div>
    </div>
  )
}
