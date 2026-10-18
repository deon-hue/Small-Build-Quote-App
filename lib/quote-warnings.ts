// Reminders a quote shows about what it is missing, worked out from its phases. Pure.

import type { QuotePhase } from './types'

/**
 * A pitched roof structure saved with a vaulted ceiling does not price the insulation and plasterboard lining of that ceiling: they belong under Plastering & Boarding. The reminder shows while a roof
 * is flagged vaulted and no other part of the quote mentions a vaulted ceiling (the "Vaulted ceiling" tasks in Plastering & Boarding, or anything the estimator wrote about it).
 */
export function vaultedCeilingReminder(phases: QuotePhase[]): { show: boolean; roofs: string[] } {
  const roofs = phases.filter(p => p.vaultedCeiling)
  if (roofs.length === 0) return { show: false, roofs: [] }
  const mentions = (p: QuotePhase) => /vault/i.test([p.phase, p.taskName ?? '', p.scopeDetail ?? '', ...p.items.map(i => i.desc)].join(' '))
  // a roof flagged vaulted always mentions it in its own description, so it is the OTHER phases that count
  const covered = phases.some(p => !p.vaultedCeiling && mentions(p))
  return { show: !covered, roofs: roofs.map(p => p.phase || 'Roof structure') }
}
