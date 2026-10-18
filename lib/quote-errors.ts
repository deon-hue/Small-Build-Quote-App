// Why a quote did not save, in words a person can act on. Saving a quote used to say "updated successfully" whatever the database answered; now the answer is checked and a failure says so.

/** The update changed no quote at all: it has been deleted (perhaps in another window) or is no longer yours to change. Whatever was typed is still on the screen. */
export class QuoteGoneError extends Error {
  constructor() {
    super('This quote could not be found in the database any more, so nothing was saved. It may have been deleted in another window. Your changes are still on this screen.')
    this.name = 'QuoteGoneError'
  }
}

/** Anything a save failed with, as one plain sentence. */
export function quoteSaveMessage(e: unknown): string {
  if (e instanceof QuoteGoneError) return e.message
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  return `The quote did not save${m ? ` (${m})` : ''}. Your changes are still on this screen: check your connection and try again.`
}
