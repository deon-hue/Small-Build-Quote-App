// Keeps a piece of contract text in step with the quote it was copied from (the scope of works, the changes-to-the-scope notes),
// without ever overwriting wording the builder typed into the contract themselves.
//
// The contract remembers a "snapshot" of the quote text it last copied. On opening:
//   - same as the quote now                              -> nothing to do
//   - contract empty                                     -> fill it from the quote
//   - contract still equals its snapshot (untouched)     -> follow the quote's new text
//   - contract differs from its snapshot (edited by hand), or there is no snapshot (contract made before this existed),
//     and the quote has moved on                         -> keep the contract's wording and ask
// Pure function, no imports, so it can be tested with plain Node.

/** A short fingerprint of everything on a contract that ends up in the PDF the client reads. Saved when the contract is sent, and compared later:
 *  if it no longer matches, the contract has been changed since the client was sent it (they still hold the earlier copy). Keys starting
 *  with "_" are the app's own bookkeeping and are left out, except those listed in alsoInclude (e.g. the changes-to-the-scope notes). */
export function contractFingerprint(
  fields: Record<string, string | boolean>, paymentMode: string, schedule: unknown, secondClientName: string | null | undefined, alsoInclude: string[] = [],
): string {
  const pairs = Object.entries(fields)
    .filter(([k]) => !k.startsWith('_') || alsoInclude.includes(k))
    .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v] as [string, string | boolean])
    .filter(([, v]) => v !== '' && v !== false)           // an empty box and an unticked box are the same as "not set"
    .sort((a, b) => a[0].localeCompare(b[0]))
  const text = JSON.stringify([pairs, paymentMode, schedule ?? [], (secondClientName || '').trim()])
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return String(h >>> 0)
}

export type SyncStatus = 'same' | 'filled' | 'followed' | 'differs' | 'none'

export interface SyncResult {
  value: string          // what the contract field should hold
  snapshot: string       // the quote text to remember as "last copied"
  status: SyncStatus
}

export function syncFromQuote(current: string, quoteValue: string, snapshot: string | undefined): SyncResult {
  const q = (quoteValue || '').trim()
  const cur = (current || '').trim()
  const snap = snapshot === undefined ? undefined : snapshot.trim()

  if (q === cur) return { value: current, snapshot: q, status: 'same' }
  if (!cur) return { value: q, snapshot: q, status: 'filled' }
  if (snap !== undefined && cur === snap) return { value: q, snapshot: q, status: 'followed' }   // untouched since copied: follow the quote (also when the quote's text was removed)
  if (!q) return { value: current, snapshot: snap ?? '', status: 'none' }                        // the contract has its own wording and the quote has none: nothing to compare
  if (q === (snap ?? '')) return { value: current, snapshot: snap ?? '', status: 'none' }        // the quote hasn't changed since it was copied; the contract was edited on purpose
  return { value: current, snapshot: snap ?? '', status: 'differs' }
}
