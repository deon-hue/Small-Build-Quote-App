// Waste and skips (Demolition → Waste & Skips): the waste a job makes, by kind and volume (loose, as it goes into the skip), turned into skips or grab lorry loads and what they cost. Each kind of waste goes in its
// own skip (rubble in a skip that is only part filled because it is heavy; plasterboard, timber and metal kept separate), hazardous waste (asbestos and the like) is a provisional sum for a licensed contractor for each
// item, and a skip on the road needs a permit. The skips for a strip-out or an outbuilding demolition are already in those calculators: this one is for the rest of the job. Counts and prices only: the waste
// carrier must be licensed and the transfer notes kept. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer
// with each layer's fixedQty set from the quantity. All rates are samples to be checked against real prices.

export type WasteKind = 'general' | 'inert' | 'soil' | 'plasterboard' | 'timber' | 'metal' | 'green'

export interface WasteKindInfo {
  label: string
  /** what a skip for it costs (hire, delivery, collection and tipping), £ */
  skipEach: number
  /** loose waste a 6-yard skip can really hold, m³ (heavy waste only part fills a skip) */
  usableM3: number
  /** a grab lorry can take it: loose m³ on a load, and a load's price (£) */
  grab?: { loadM3: number; perLoad: number }
  note: string
}

const SKIP_M3 = 4.6
export const WASTE_KINDS: Record<WasteKind, WasteKindInfo> = {
  general: { label: 'Mixed building waste', skipEach: 260, usableM3: SKIP_M3 * 0.85, note: '' },
  inert: { label: 'Rubble, brick, concrete and tiles (inert)', skipEach: 290, usableM3: SKIP_M3 * 0.6, grab: { loadM3: 8, perLoad: 420 }, note: 'Heavy: a skip is only part filled.' },
  soil: { label: 'Soil and spoil', skipEach: 290, usableM3: SKIP_M3 * 0.6, grab: { loadM3: 8, perLoad: 420 }, note: 'Heavy: a skip is only part filled. Soil from a contaminated site is not inert.' },
  plasterboard: { label: 'Plasterboard (kept separate)', skipEach: 320, usableM3: SKIP_M3 * 0.8, note: 'Plasterboard must not go in with other waste.' },
  timber: { label: 'Timber', skipEach: 250, usableM3: SKIP_M3 * 0.85, note: '' },
  metal: { label: 'Metal and scrap', skipEach: 120, usableM3: SKIP_M3 * 0.8, note: 'Scrap metal may be worth something: ask the skip company.' },
  green: { label: 'Garden and green waste', skipEach: 230, usableM3: SKIP_M3 * 0.85, note: '' },
}

export const HAZARDOUS_EACH = 650           // a provisional sum for each item of hazardous waste (asbestos sheet, a tank...)
export const PERMIT_EACH = 45              // a highway permit, for each skip and each 2 weeks it is on the road

export interface WasteItem { id: string; name: string; kind: WasteKind; volumeM3: number }

export interface WasteInput {
  items: WasteItem[]
  /** inert waste and soil go by grab lorry instead of skips */
  useGrab: boolean
  /** hazardous waste items (asbestos and the like), nr */
  hazardous: number
  /** skips on the highway: how many, and for how many weeks (0 = none on the road) */
  roadSkips: number
  roadWeeks: number
}

export interface WasteLine { id: string; name: string; category: 'other' | 'subcontractors'; unit: string; unitCost: number; qty: number }

export interface WasteResult {
  lines: WasteLine[]
  totalM3: number
  skips: number
  grabLoads: number
  byKind: Record<WasteKind, number>
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateWaste(i: WasteInput): WasteResult {
  const lines: WasteLine[] = []
  const warnings: string[] = []
  const byKind: Record<WasteKind, number> = { general: 0, inert: 0, soil: 0, plasterboard: 0, timber: 0, metal: 0, green: 0 }
  for (const it of i.items) {
    if (!(it.volumeM3 >= 0)) throw new Error(`The volume of "${it.name || WASTE_KINDS[it.kind].label}" cannot be negative.`)
    byKind[it.kind] += it.volumeM3
  }
  if (!(i.hazardous >= 0) || !(i.roadSkips >= 0) || !(i.roadWeeks >= 0)) throw new Error('The hazardous items, skips on the road and weeks cannot be negative.')

  let skips = 0, grabLoads = 0, totalM3 = 0
  for (const k of Object.keys(byKind) as WasteKind[]) {
    const v = byKind[k]
    if (v <= 0) continue
    totalM3 += v
    const info = WASTE_KINDS[k]
    if (i.useGrab && info.grab) {
      const loads = Math.ceil(v / info.grab.loadM3)
      grabLoads += loads
      lines.push({ id: `grab|${k}`, name: `${info.label}: grab lorry loads (about ${round2(v)} m³ loose)`, category: 'other', unit: 'load', unitCost: info.grab.perLoad, qty: loads })
    } else {
      const n = Math.max(1, Math.ceil(v / info.usableM3))
      skips += n
      lines.push({ id: `skip|${k}`, name: `${info.label}: skip hire (6-yard skips, about ${round2(v)} m³ loose)`, category: 'other', unit: 'skip', unitCost: info.skipEach, qty: n })
    }
    if (info.note && !(i.useGrab && info.grab)) warnings.push(`${info.label}: ${info.note}`)
  }
  if (i.hazardous > 0) {
    lines.push({ id: 'hazardous', name: 'Hazardous waste removed and disposed of by a licensed contractor (provisional sum each)', category: 'subcontractors', unit: 'nr', unitCost: HAZARDOUS_EACH, qty: Math.round(i.hazardous) })
    warnings.push('Hazardous waste such as asbestos must be removed by a licensed contractor and taken to a licensed site, with the paperwork kept.')
  }
  const permits = i.roadSkips > 0 && i.roadWeeks > 0 ? Math.round(i.roadSkips) * Math.ceil(i.roadWeeks / 2) : 0
  if (permits > 0) lines.push({ id: 'permits', name: 'Highway permits for skips on the road (for each skip and each 2 weeks)', category: 'other', unit: 'nr', unitCost: PERMIT_EACH, qty: permits })

  if (i.items.every(x => !(x.volumeM3 > 0)) && i.hazardous === 0) warnings.push('No waste yet. Add the waste the job makes, by kind and volume.')
  warnings.push('Use a licensed waste carrier and keep the waste transfer notes. A skip on the road needs a permit and lights at night; waste must be kept separate where the skip company asks.')
  return { lines, totalM3: round2(totalM3), skips, grabLoads, byKind, warnings }
}

export function wasteSubtotal(lines: WasteLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
