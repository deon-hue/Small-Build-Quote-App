// The client portal dashboard's two "at a glance" cards for the Selections and Sent to you tabs: how many things, where they stand, and what was sent last. Pure (no imports), so it can be hand-tested with
// plain Node, and shared by the real dashboard and the builder's preview of it (components/PortalGlanceCards.tsx).

export interface GlanceSelection { status: string; neededBy: string }
export interface SelectionsGlance {
  total: number
  /** still being decided or checked: idea, chosen, checked */
  open: number
  /** ordered or delivered: on its way */
  onTheWay: number
  installed: number
  /** needed by a date that has passed, and not ordered yet */
  late: number
  /** needed within 14 days, and not ordered yet */
  soon: number
}

const DONE = new Set(['ordered', 'delivered', 'installed'])

/** The counts for the Selections card. `today` is YYYY-MM-DD (the same rule as neededState in lib/selections.ts). */
export function selectionsGlance(items: GlanceSelection[], today: string): SelectionsGlance {
  const g: SelectionsGlance = { total: items.length, open: 0, onTheWay: 0, installed: 0, late: 0, soon: 0 }
  for (const s of items) {
    if (s.status === 'installed') g.installed++
    else if (s.status === 'ordered' || s.status === 'delivered') g.onTheWay++
    else g.open++
    if (s.neededBy && !DONE.has(s.status)) {
      if (s.neededBy < today) g.late++
      else {
        const days = Math.round((new Date(s.neededBy + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
        if (days <= 14) g.soon++
      }
    }
  }
  return g
}

/** The Selections card's one line: "6 items: 3 still being decided, 2 on the way, 1 installed" (or an invitation when there are none) */
export function selectionsLine(g: SelectionsGlance): string {
  if (g.total === 0) return 'Add your ideas and links for the things you want, such as skirting, lights and taps, so we know what to order and fit.'
  const bits: string[] = []
  if (g.open) bits.push(`${g.open} still being decided`)
  if (g.onTheWay) bits.push(`${g.onTheWay} on the way`)
  if (g.installed) bits.push(`${g.installed} installed`)
  return `${g.total} ${g.total === 1 ? 'item' : 'items'}: ${bits.join(', ')}`
}

export interface GlanceSent { subject: string; body: string; sentAt: string; files: unknown[] }
export interface SentGlance { count: number; fileCount: number; latestTitle: string; latestAt: string }

/** The counts for the Sent to you card, and what came last (a record with no subject is called by its first words, or "Files for you") */
export function sentGlance(items: GlanceSent[]): SentGlance {
  let latest: GlanceSent | null = null
  let files = 0
  for (const i of items) {
    files += Array.isArray(i.files) ? i.files.length : 0
    if (!latest || (Date.parse(i.sentAt) || 0) > (Date.parse(latest.sentAt) || 0)) latest = i
  }
  const title = latest ? (latest.subject.trim() || latest.body.trim().split('\n')[0].slice(0, 60) || (Array.isArray(latest.files) && latest.files.length ? 'Files for you' : 'A message for you')) : ''
  return { count: items.length, fileCount: files, latestTitle: title, latestAt: latest?.sentAt ?? '' }
}
