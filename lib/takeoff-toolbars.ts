// The toolbars of the Take-off & Draw screen: each is a named strip of controls that can be docked to the top, left, right or bottom, renamed, shown with or without text, reordered and hidden.
// These are the pure rules (defaults, what a saved layout is allowed to say, moving them) kept apart from the screen so they can be tested. No imports. The layout is kept per browser, never in the take-off.

export type TbId = 'job' | 'phase' | 'tools' | 'aids' | 'zoom' | 'view' | 'levels'
export type TbDock = 'top' | 'left' | 'right' | 'bottom'

export interface TbPref {
  id: TbId
  name: string
  dock: TbDock
  /** text beside the icons (only matters on a top or bottom toolbar: a side strip is icons only) */
  labels: boolean
  vis: boolean
}

export const DEFAULT_TOOLBARS: TbPref[] = [
  { id: 'job',    name: 'Job and plan',      dock: 'top',    labels: true,  vis: true },
  { id: 'phase',  name: 'Phase',             dock: 'top',    labels: true,  vis: true },
  { id: 'tools',  name: 'Draw tools',        dock: 'top',    labels: false, vis: true },
  { id: 'aids',   name: 'Aids',              dock: 'top',    labels: false, vis: true },
  { id: 'zoom',   name: 'Zoom',              dock: 'top',    labels: false, vis: true },
  { id: 'view',   name: 'View and clear',    dock: 'top',    labels: true,  vis: true },
  { id: 'levels', name: 'Levels and sheets', dock: 'bottom', labels: true,  vis: true },
]

export const TB_IDS: TbId[] = DEFAULT_TOOLBARS.map(t => t.id)
export const TB_DOCKS: TbDock[] = ['top', 'left', 'right', 'bottom']
export const DOCK_LABEL: Record<TbDock, string> = { top: 'the top', left: 'the left', right: 'the right', bottom: 'the bottom' }

/** The job and plan toolbar and the levels and sheets toolbar have text boxes and chips that need a row, so they can only go along the top or the bottom. */
const TOP_BOTTOM_ONLY: TbId[] = ['job', 'levels']
export const allowedDocks = (id: TbId): TbDock[] => (TOP_BOTTOM_ONLY.includes(id) ? ['top', 'bottom'] : TB_DOCKS)
export const isSideDock = (d: TbDock) => d === 'left' || d === 'right'

const clone = (l: TbPref[]): TbPref[] => l.map(t => ({ ...t }))
export const defaultToolbars = (): TbPref[] => clone(DEFAULT_TOOLBARS)

/** A saved layout, made safe: unknown or repeated toolbars are dropped, a dock a toolbar may not use falls back to its own default, a name is trimmed, and any toolbar the save did not know about (a new one added later) is put back at its default. */
export function mergeToolbars(saved: unknown): TbPref[] {
  const out: TbPref[] = []
  if (Array.isArray(saved)) {
    for (const raw of saved) {
      const r = raw as Partial<TbPref> | null
      if (!r || typeof r !== 'object') continue
      const def = DEFAULT_TOOLBARS.find(d => d.id === r.id)
      if (!def || out.some(o => o.id === def.id)) continue
      const dock = typeof r.dock === 'string' && allowedDocks(def.id).includes(r.dock as TbDock) ? (r.dock as TbDock) : def.dock
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : def.name
      out.push({ id: def.id, name, dock, labels: typeof r.labels === 'boolean' ? r.labels : def.labels, vis: typeof r.vis === 'boolean' ? r.vis : def.vis })
    }
  }
  for (const d of DEFAULT_TOOLBARS) if (!out.some(o => o.id === d.id)) out.push({ ...d })
  return out
}

/** The visible toolbars on one edge, in order. */
export const toolbarsOn = (list: TbPref[], dock: TbDock): TbPref[] => list.filter(t => t.vis && t.dock === dock)

const edit = (list: TbPref[], id: TbId, fn: (t: TbPref) => TbPref): TbPref[] => list.map(t => (t.id === id ? fn(t) : t))

/** Docks a toolbar to an edge (ignored if it may not go there). */
export const setToolbarDock = (list: TbPref[], id: TbId, dock: TbDock): TbPref[] => (allowedDocks(id).includes(dock) ? edit(list, id, t => ({ ...t, dock })) : list)
export const renameToolbar = (list: TbPref[], id: TbId, name: string): TbPref[] => (name.trim() ? edit(list, id, t => ({ ...t, name: name.trim().slice(0, 40) })) : list)
export const setToolbarLabels = (list: TbPref[], id: TbId, labels: boolean): TbPref[] => edit(list, id, t => ({ ...t, labels }))
export const setToolbarVisible = (list: TbPref[], id: TbId, vis: boolean): TbPref[] => edit(list, id, t => ({ ...t, vis }))

/** Moves a toolbar one place earlier (-1) or later (+1) among the toolbars on its own edge (hidden ones and other edges are stepped over). */
export function moveToolbar(list: TbPref[], id: TbId, step: -1 | 1): TbPref[] {
  const me = list.find(t => t.id === id)
  if (!me) return list
  const mates = list.filter(t => t.dock === me.dock && t.vis)
  const i = mates.findIndex(t => t.id === id)
  const j = i + step
  if (i < 0 || j < 0 || j >= mates.length) return list
  const other = mates[j]
  const a = list.findIndex(t => t.id === id), b = list.findIndex(t => t.id === other.id)
  const next = [...list]
  next[a] = other
  next[b] = me
  return next
}
