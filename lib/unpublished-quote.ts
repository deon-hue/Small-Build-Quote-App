// A quote that is already out with the client (sent, approved or declined) is NOT saved behind their back while it is being edited:
// edits are kept on this computer only, and reach the client's portal when Update Quote is pressed. Pure rules, no imports.

/** What a quote's editing screen holds that the client could see. */
export interface QuoteEditValues {
  phases: unknown[]
  custName: string
  custAddr: string
  custEmail: string
  custPhone: string
  jobType: string
  jobTitle: string
  markup: number
  vatOn: boolean
  scope: string
  photo: string
  /** the quote's payment plan (null or absent when there is none): an edit to it is an edit to the quote */
  paymentPlan?: unknown
}

/** A text that changes only when the CONTENT changes: the screen's own numbering of phases and lines (`id`) is left out, so re-numbering after a reload is not an edit. */
export function unpublishedSignature(v: QuoteEditValues): string {
  return JSON.stringify(
    [v.phases, v.custName, v.custAddr, v.custEmail, v.custPhone, v.jobType, v.jobTitle, v.markup, v.vatOn, v.scope, v.photo, v.paymentPlan ?? null],
    (k, val) => (k === 'id' ? undefined : val),
  )
}

export const unpublishedDraftKey = (quoteId: string): string => `sbc_quote_unpublished_${quoteId}`

/** The most photo text kept in the safety copy: a big photo would fill the browser's storage, and the loaded photo is used instead. */
export const MAX_DRAFT_PHOTO_CHARS = 300_000

export interface UnpublishedDraft {
  at: string
  data: Omit<QuoteEditValues, 'photo'> & { photo?: string }
}

/** The safety copy as it goes into storage; a photo too big for storage is left out. */
export function serialiseUnpublishedDraft(v: QuoteEditValues, now: Date = new Date()): string {
  const { photo, ...rest } = v
  const data: UnpublishedDraft['data'] = photo.length <= MAX_DRAFT_PHOTO_CHARS ? { ...rest, photo } : { ...rest }
  return JSON.stringify({ at: now.toISOString(), data } satisfies UnpublishedDraft)
}

/** Reads a stored safety copy; anything that is not a whole, well-shaped copy is ignored (null), never half used. */
export function parseUnpublishedDraft(raw: string | null | undefined): UnpublishedDraft | null {
  if (!raw) return null
  let o: unknown
  try { o = JSON.parse(raw) } catch { return null }
  if (!o || typeof o !== 'object') return null
  const { at, data } = o as { at?: unknown; data?: unknown }
  if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime())) return null
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const str = (x: unknown) => typeof x === 'string'
  if (!Array.isArray(d.phases)) return null
  if (!(str(d.custName) && str(d.custAddr) && str(d.custEmail) && str(d.custPhone) && str(d.jobType) && str(d.jobTitle) && str(d.scope))) return null
  if (typeof d.markup !== 'number' || !Number.isFinite(d.markup)) return null
  if (typeof d.vatOn !== 'boolean') return null
  if (d.photo !== undefined && !str(d.photo)) return null
  return { at, data: d as unknown as UnpublishedDraft['data'] }
}

/** The values a safety copy would put back: its own, with the loaded photo where the copy left the photo out. */
export function draftValues(loaded: QuoteEditValues, draft: UnpublishedDraft): QuoteEditValues {
  return { ...loaded, ...draft.data, photo: draft.data.photo ?? loaded.photo }
}

/** A safety copy is only worth offering back when it differs from what the quote is now. */
export function shouldOfferUnpublishedDraft(loaded: QuoteEditValues, draft: UnpublishedDraft): boolean {
  return unpublishedSignature(draftValues(loaded, draft)) !== unpublishedSignature(loaded)
}
