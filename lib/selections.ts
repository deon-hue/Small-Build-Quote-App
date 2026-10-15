// Selections: the things a client has chosen for their home (skirting, light fittings, taps, tiles…), kept per job so the builder knows what is being fitted.
// Shared by the client portal, the builder's preview of it and the builder's own window. Pure: no database, no network. See supabase/job-selections.sql.

export type SelectionStatus = 'idea' | 'chosen' | 'checked' | 'ordered' | 'delivered' | 'installed'
export type SuppliedBy = 'client' | 'builder' | 'unsure'

export const SELECTION_STATUSES: { key: SelectionStatus; label: string; color: string; hint: string }[] = [
  { key: 'idea',      label: 'Idea',              color: '#94a3b8', hint: 'Still thinking about it' },
  { key: 'chosen',    label: 'Chosen',            color: '#2563eb', hint: 'Decided, waiting for your builder to look' },
  { key: 'checked',   label: 'Checked by builder', color: '#16a34a', hint: 'Your builder has checked it and it is fine to go ahead' },
  { key: 'ordered',   label: 'Ordered',           color: '#b45309', hint: 'It has been ordered' },
  { key: 'delivered', label: 'Delivered',         color: '#7c3aed', hint: 'It is on site' },
  { key: 'installed', label: 'Installed',         color: '#0f766e', hint: 'It is fitted' },
]
export const STATUS_LABEL = Object.fromEntries(SELECTION_STATUSES.map(s => [s.key, s.label])) as Record<SelectionStatus, string>
export const STATUS_COLOR = Object.fromEntries(SELECTION_STATUSES.map(s => [s.key, s.color])) as Record<SelectionStatus, string>

export const SELECTION_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'skirting',   label: 'Skirting & architrave',          icon: '🪵' },
  { key: 'doors',      label: 'Doors & ironmongery',            icon: '🚪' },
  { key: 'lighting',   label: 'Lighting',                       icon: '💡' },
  { key: 'electrical', label: 'Sockets & switches',             icon: '🔌' },
  { key: 'tiles',      label: 'Tiles',                          icon: '🔳' },
  { key: 'flooring',   label: 'Flooring',                       icon: '🟫' },
  { key: 'kitchen',    label: 'Kitchen',                        icon: '🍳' },
  { key: 'bathroom',   label: 'Bathroom & taps',                icon: '🚿' },
  { key: 'windows',    label: 'Windows & glazing',              icon: '🪟' },
  { key: 'paint',      label: 'Paint & colours',                icon: '🎨' },
  { key: 'heating',    label: 'Radiators & heating',            icon: '♨️' },
  { key: 'fittings',   label: 'Fixtures & fittings',            icon: '🔧' },
  { key: 'other',      label: 'Something else',                 icon: '📌' },
]
export const CATEGORY_LABEL = Object.fromEntries(SELECTION_CATEGORIES.map(c => [c.key, c.label])) as Record<string, string>
export const categoryIcon = (key: string) => SELECTION_CATEGORIES.find(c => c.key === key)?.icon ?? '📌'

export const SUGGESTED_ROOMS = ['Kitchen', 'Living room', 'Dining room', 'Hall', 'Bathroom', 'En-suite', 'Bedroom 1', 'Bedroom 2', 'Utility', 'Whole house', 'Outside']

export const SUPPLIED_BY_LABEL: Record<SuppliedBy, string> = { client: "I'll buy it", builder: 'Please price it', unsure: 'Not sure yet' }
/** the same choice, worded for the builder reading it */
export const SUPPLIED_BY_BUILDER_LABEL: Record<SuppliedBy, string> = { client: 'Client buying', builder: 'Client asks us to price it', unsure: 'Not decided who buys' }

export interface SelectionFile { id: string; fileName: string; mimeType: string; fileSize: number; url: string | null }

export interface Selection {
  id: string
  jobId: string
  title: string
  room: string
  category: string
  details: string
  link: string
  suppliedBy: SuppliedBy
  /** YYYY-MM-DD or '' */
  neededBy: string
  status: SelectionStatus
  builderReply: string
  builderRepliedAt?: string
  addedBy: 'client' | 'builder'
  createdAt?: string
  /** builder side: the client has added or changed it since the builder last opened the job's Selections */
  isNew?: boolean
  files: SelectionFile[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const d10 = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '')
const STATUS_SET = new Set<string>(SELECTION_STATUSES.map(s => s.key))

/** One selection from a database row (snake_case, as the table and the portal functions return it). `files` are already shaped. */
export function rowToSelection(r: Record<string, unknown>, files: SelectionFile[] = [], isNew = false): Selection {
  const by = r.supplied_by === 'client' || r.supplied_by === 'builder' ? r.supplied_by : 'unsure'
  return {
    id: str(r.id), jobId: str(r.job_id), title: str(r.title), room: str(r.room), category: str(r.category) || 'other', details: str(r.details), link: str(r.link),
    suppliedBy: by, neededBy: d10(r.needed_by), status: (STATUS_SET.has(str(r.status)) ? str(r.status) : 'idea') as SelectionStatus,
    builderReply: str(r.builder_reply), builderRepliedAt: str(r.builder_replied_at) || undefined,
    addedBy: r.added_by === 'builder' ? 'builder' : 'client', createdAt: str(r.created_at) || undefined, isNew, files,
  }
}

/** A file's row as returned by the portal function (snake_case) → the shape the screens use; the url is filled in by the server. */
export function rowToFile(r: Record<string, unknown>, url: string | null): SelectionFile {
  return { id: str(r.id), fileName: str(r.file_name), mimeType: str(r.mime_type), fileSize: Number(r.file_size) || 0, url }
}

/** The client may change or add files to their own item until the builder has ordered it. */
export const clientCanEdit = (s: Pick<Selection, 'addedBy' | 'status'>) => s.addedBy === 'client' && (s.status === 'idea' || s.status === 'chosen' || s.status === 'checked')
/** ...and delete it only while it is still an idea or a choice. */
export const clientCanDelete = (s: Pick<Selection, 'addedBy' | 'status'>) => s.addedBy === 'client' && (s.status === 'idea' || s.status === 'chosen')

/** How urgent is "needed by"? 'late' = date has passed and it is not ordered yet; 'soon' = within 14 days (not yet ordered). */
export function neededState(s: Pick<Selection, 'neededBy' | 'status'>, today: string): '' | 'soon' | 'late' {
  if (!s.neededBy || s.status === 'ordered' || s.status === 'delivered' || s.status === 'installed') return ''
  if (s.neededBy < today) return 'late'
  const days = Math.round((new Date(s.neededBy + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
  return days <= 14 ? 'soon' : ''
}

export function neededLabel(neededBy: string): string {
  if (!neededBy) return ''
  const d = new Date(neededBy + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Items grouped by room, rooms in the order they were first used (an item with no room goes under "Other"). */
export function groupByRoom(items: Selection[]): { room: string; items: Selection[] }[] {
  const order: string[] = []
  const map = new Map<string, Selection[]>()
  for (const s of items) {
    const room = s.room.trim() || 'Other'
    if (!map.has(room)) { map.set(room, []); order.push(room) }
    map.get(room)!.push(s)
  }
  return order.map(room => ({ room, items: map.get(room)! }))
}

/** A link a client typed, made safe to put in an href: only http(s) is kept, anything else (javascript:, data:) becomes ''. */
export function safeLink(url: string): string {
  const u = (url || '').trim()
  if (!/^https?:\/\/[^\s]+$/i.test(u)) return ''
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : '' } catch { return '' }
}

/** "lightingshop.co.uk" out of a link, to show instead of the whole address. */
export function linkHost(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return '' }
}

export const SELECTION_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const SELECTION_MAX_FILE_BYTES = 4 * 1024 * 1024
export const SELECTION_MAX_FILES = 8
