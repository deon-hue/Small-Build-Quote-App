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

/**
 * The status a quote gets when the builder presses Update on a quote that is already saved. It used to be 'pending' every time, so a quote that had been SENT dropped out of the client's portal (which only shows
 * sent, approved and rejected quotes) the moment it was updated: the client then saw nothing, not even the old version. A quote that is out with the client stays 'sent' (they see the update, and can still approve it);
 * anything else becomes 'pending' (saved and ready, not yet sent), as before.
 */
export const statusAfterUpdate = (current: string | null | undefined): 'sent' | 'pending' => (current === 'sent' ? 'sent' : 'pending')

/** Saving as a DRAFT takes a quote out of the client's portal: true when that would hide a quote the client can see right now (so the builder is asked first). */
export const draftWouldHideFromClient = (current: string | null | undefined): boolean => isQuoteVisibleToClient(current)
