// The builder dashboard's card layout: which cards are shown, in what order and at what size. Pure functions (no React), so the rules are tested on
// their own. A saved layout is merged with the app's default cards, so a card added in a later version appears (and a retired one disappears) without
// anyone's saved layout breaking.

export type CardSize = 'small' | 'medium' | 'large'
export interface CardDef { id: string; title: string; size: CardSize; on: boolean }
export interface SavedCard { id: string; size: CardSize; on: boolean }

const SIZES: CardSize[] = ['small', 'medium', 'large']
export const isSize = (s: unknown): s is CardSize => SIZES.includes(s as CardSize)

/** Reads whatever was saved (from the database or this device) defensively; anything unusable gives null (= use the defaults). */
export function parseSaved(raw: unknown): SavedCard[] | null {
  let v: unknown = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' && Array.isArray((v as { cards?: unknown }).cards) ? (v as { cards: unknown[] }).cards : null)
  if (!arr) return null
  const out: SavedCard[] = []
  for (const c of arr) {
    const o = c as Partial<SavedCard> | null
    if (o && typeof o.id === 'string' && isSize(o.size) && typeof o.on === 'boolean' && !out.some(x => x.id === o.id)) out.push({ id: o.id, size: o.size, on: o.on })
  }
  return out.length ? out : null
}

/** The layout to draw: saved order/sizes/visibility for the cards that still exist, then any new default cards on the end. */
export function mergeLayout(defaults: CardDef[], saved: SavedCard[] | null | undefined): SavedCard[] {
  const known = new Map(defaults.map(d => [d.id, d]))
  const out: SavedCard[] = []
  for (const s of saved ?? []) { if (known.has(s.id) && !out.some(x => x.id === s.id)) out.push({ id: s.id, size: s.size, on: s.on }) }
  for (const d of defaults) { if (!out.some(x => x.id === d.id)) out.push({ id: d.id, size: d.size, on: d.on }) }
  return out
}

export const defaultLayout = (defaults: CardDef[]): SavedCard[] => defaults.map(d => ({ id: d.id, size: d.size, on: d.on }))

/** Move a shown card one place earlier (-1) or later (1) among the SHOWN cards (hidden ones keep their place in the list). */
export function moveCard(cards: SavedCard[], id: string, dir: -1 | 1): SavedCard[] {
  const shown = cards.map((c, i) => (c.on ? i : -1)).filter(i => i >= 0)
  const here = cards.findIndex(c => c.id === id)
  const p = shown.indexOf(here)
  const q = p + dir
  if (p < 0 || q < 0 || q >= shown.length) return cards
  const next = cards.slice()
  const a = shown[p], b = shown[q]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** small -> medium -> large -> small */
export function cycleSize(cards: SavedCard[], id: string): SavedCard[] {
  return cards.map(c => c.id === id ? { ...c, size: SIZES[(SIZES.indexOf(c.size) + 1) % SIZES.length] } : c)
}

/** Hide a card, or show a hidden one (it joins the end of the shown cards). */
export function setOn(cards: SavedCard[], id: string, on: boolean): SavedCard[] {
  const c = cards.find(x => x.id === id)
  if (!c || c.on === on) return cards
  const rest = cards.filter(x => x.id !== id)
  if (!on) return [...rest, { ...c, on: false }]
  let lastShown = -1
  rest.forEach((x, i) => { if (x.on) lastShown = i })
  return [...rest.slice(0, lastShown + 1), { ...c, on: true }, ...rest.slice(lastShown + 1)]
}
