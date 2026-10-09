// The builder dashboard's card layout: which cards are shown, in what order and how wide (1 to 4 columns of a four-column grid). Pure functions (no
// React), so the rules are tested on their own. A saved layout is merged with the app's default cards, so a card added in a later version appears (and
// a retired one disappears) without anyone's saved layout breaking. Layouts saved by the first version (small/medium/large) are read as 1/2/4 columns.

export type Span = 1 | 2 | 3 | 4
export interface CardDef { id: string; title: string; span: Span; on: boolean }
export interface SavedCard { id: string; span: Span; on: boolean }

export const isSpan = (s: unknown): s is Span => s === 1 || s === 2 || s === 3 || s === 4
const LEGACY: Record<string, Span> = { small: 1, medium: 2, large: 4 }

/** Reads whatever was saved (from the database or this device) defensively; anything unusable gives null (= use the defaults). */
export function parseSaved(raw: unknown): SavedCard[] | null {
  let v: unknown = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' && Array.isArray((v as { cards?: unknown }).cards) ? (v as { cards: unknown[] }).cards : null)
  if (!arr) return null
  const out: SavedCard[] = []
  for (const c of arr) {
    const o = c as { id?: unknown; span?: unknown; size?: unknown; on?: unknown } | null
    if (!o || typeof o.id !== 'string' || typeof o.on !== 'boolean' || out.some(x => x.id === o.id)) continue
    const span = isSpan(o.span) ? o.span : (typeof o.size === 'string' ? LEGACY[o.size] : undefined)
    if (span) out.push({ id: o.id, span, on: o.on })
  }
  return out.length ? out : null
}

/** The layout to draw: saved order/widths/visibility for the cards that still exist, then any new default cards on the end. */
export function mergeLayout(defaults: CardDef[], saved: SavedCard[] | null | undefined): SavedCard[] {
  const known = new Map(defaults.map(d => [d.id, d]))
  const out: SavedCard[] = []
  for (const s of saved ?? []) { if (known.has(s.id) && !out.some(x => x.id === s.id)) out.push({ id: s.id, span: s.span, on: s.on }) }
  for (const d of defaults) { if (!out.some(x => x.id === d.id)) out.push({ id: d.id, span: d.span, on: d.on }) }
  return out
}

export const defaultLayout = (defaults: CardDef[]): SavedCard[] => defaults.map(d => ({ id: d.id, span: d.span, on: d.on }))

/** Move a shown card one place earlier (-1) or later (1) among the SHOWN cards (hidden ones keep their place in the list). Used by the arrows on touch screens. */
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

/** Drag and drop: put a card just before (or just after) another card. Hidden cards are left where they are in the list. */
export function moveCardTo(cards: SavedCard[], id: string, targetId: string, after: boolean): SavedCard[] {
  if (id === targetId) return cards
  const moving = cards.find(c => c.id === id)
  if (!moving || !cards.some(c => c.id === targetId)) return cards
  const rest = cards.filter(c => c.id !== id)
  const t = rest.findIndex(c => c.id === targetId)
  return [...rest.slice(0, after ? t + 1 : t), moving, ...rest.slice(after ? t + 1 : t)]
}

/** Set a card's width (1 to 4 columns); anything outside that is pulled back into range. */
export function setSpan(cards: SavedCard[], id: string, span: number): SavedCard[] {
  const s = Math.max(1, Math.min(4, Math.round(span))) as Span
  return cards.map(c => c.id === id && c.span !== s ? { ...c, span: s } : c)
}

/** The size button on touch screens: quarter -> half -> full -> quarter */
export function cycleSize(cards: SavedCard[], id: string): SavedCard[] {
  return cards.map(c => c.id === id ? { ...c, span: (c.span === 1 ? 2 : c.span === 2 ? 4 : 1) as Span } : c)
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
