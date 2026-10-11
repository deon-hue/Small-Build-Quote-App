// What a client may see in their portal. The database applies the same rule (supabase/portal-hide-unsent.sql); this is the second lock in the app, and the
// one the builder's "preview what the client sees" page uses, so the two always agree.
//
// A quote is the client's to see only once it has been SENT, and afterwards once they have approved or rejected it. A quote that is draft, pending (saved,
// not yet sent), in progress, for review or archived is still the builder's work. An invoice is theirs once it is no longer a draft.

export const CLIENT_VISIBLE_QUOTE_STATUSES = ['sent', 'approved', 'accepted', 'rejected', 'declined'] as const

export const isQuoteVisibleToClient = (status: string | null | undefined): boolean =>
  (CLIENT_VISIBLE_QUOTE_STATUSES as readonly string[]).includes(String(status ?? ''))

/** A client can approve a quote only while it is sent and waiting for them. */
export const canClientApproveQuote = (status: string | null | undefined): boolean => status === 'sent'

export const isInvoiceVisibleToClient = (status: string | null | undefined): boolean => String(status ?? '') !== 'draft'
