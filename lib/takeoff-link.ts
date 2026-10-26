// Linking a take-off to a saved quote: what the quote hands to Take-off ("Open in Take-off" on the quote), and what linking does to the take-off. Pure, so it can be tested.

/** What a quote hands to Take-off: its id and reference, its job name, and its customer's name and address (they fill the blanks of the take-off). */
export interface QuoteLink {
  id: string
  ref: string
  title?: string
  customer?: { name?: string; address?: string }
}

/** What the quote page asks Take-off to do: open one of the quote's take-offs (`id`), or start a fresh one (`fresh`). Either way the take-off ends up linked to the quote. */
export interface OpenForQuote {
  id?: string
  fresh?: boolean
  link: QuoteLink
}

/** The parts of a take-off that linking touches. */
interface Linkable {
  name?: string
  address?: string
  siteAddress?: string
  projectName?: string
  quoteId?: string
  quoteRef?: string
}

/**
 * The take-off linked to the quote: it remembers the quote (so Send to Quote goes back into it), and the quote's customer, address and job name fill whatever the take-off has not already
 * got (a name typed in Take-off is never replaced).
 */
export function linkProject<T extends Linkable>(p: T, link: QuoteLink): T {
  return {
    ...p,
    quoteId: link.id,
    quoteRef: link.ref,
    name: !p.name || p.name === 'New Take-off' ? [link.customer?.name, link.title || link.ref].filter(Boolean).join(' – ') : p.name,
    address: p.address || link.customer?.address || '',
    siteAddress: p.siteAddress || link.customer?.address || undefined,
    projectName: p.projectName || link.title || undefined,
  }
}

/** The pending request the quote page left for Take-off, read back safely (anything that does not check out is ignored). */
export function parseOpenForQuote(raw: string | null): OpenForQuote | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || !v.link || typeof v.link.id !== 'string' || !v.link.id) return null
    const id = typeof v.id === 'string' && v.id ? v.id : undefined
    if (!id && !v.fresh) return null
    return { id, fresh: !!v.fresh, link: { id: v.link.id, ref: String(v.link.ref ?? ''), title: typeof v.link.title === 'string' ? v.link.title : undefined, customer: v.link.customer && typeof v.link.customer === 'object' ? { name: typeof v.link.customer.name === 'string' ? v.link.customer.name : undefined, address: typeof v.link.customer.address === 'string' ? v.link.customer.address : undefined } : undefined } }
  } catch { return null }
}
