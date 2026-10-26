// What a drawing is called on the plan and in the schedule: worked out from what it IS (the wall type, the foundation, the floor, the roof, the calculator it is priced by, the task, and for Tiling
// Preparation whether it is the floor, the walls or both), not from the phase it was drawn in with four random characters after it ("Tiling & Finishes p39v"). Pure, so it can be tested.
//
// A label is AUTOMATIC until someone types their own: an old automatic label (a phase or "Floor area" and four characters, with a side number such as 2/4 on a wall drawn as sides) is recognised and
// follows the item, and anything else is kept exactly as typed.

export type PrepScopeWord = 'floor' | 'walls' | 'both'

/** What decides the label of one drawing. */
export interface LabelInput {
  phase: string
  /** the name of the flat task the item is priced from (an item priced from a task, not a calculator) */
  taskName?: string
  /** the sub-phase picked: a calculator's name, or the sub-phase of a task item */
  subPhase?: string
  /** the calculator's canonical id (only Tiling Preparation is worded by its choice) */
  canonicalId?: string
  /** Tiling Preparation: what the drawing is for */
  prepScope?: PrepScopeWord
  /** the name of the Build-up Type (a wall type, a floor, a roof build-up) */
  makeupName?: string
  /** a foundation line's type ('strip', 'trench_fill', 'pad_edge', 'raft_edge', 'piled', 'underpin') */
  foundationType?: string
  /** the room or location typed on the item or in its calculator */
  roomName?: string
}

const FOUNDATION_WORDS: Record<string, string> = {
  trench_fill: 'Trench fill foundation', strip: 'Strip foundation', pad_edge: 'Pad foundation', raft_edge: 'Raft foundation', piled: 'Piled foundation', underpin: 'Underpinning',
}
const PREP_WORDS: Record<PrepScopeWord, string> = { floor: 'floor', walls: 'walls', both: 'floor & walls' }

/** "Floor Tiling (by room)" is "Floor Tiling": a trailing bracket says how the calculator works, not what the drawing is. */
export const cleanSubPhase = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name.trim()

/** What the drawing is, without the room: "Cavity Wall – Partial Fill", "Tiling prep – walls", "Ceramic wall tile". */
export function whatItIs(i: LabelInput): string {
  if (i.canonicalId === 'tile-prep-rooms') return `Tiling prep – ${PREP_WORDS[i.prepScope ?? 'floor']}`
  if (i.taskName && i.taskName.trim()) return i.taskName.trim()
  if (i.subPhase && i.subPhase.trim()) return cleanSubPhase(i.subPhase)
  if (i.makeupName && i.makeupName.trim()) return i.makeupName.trim()
  if (i.foundationType && FOUNDATION_WORDS[i.foundationType]) return FOUNDATION_WORDS[i.foundationType]
  return i.phase
}

/** The label of a drawing: what it is, with the room first when it has one ("Kitchen – Floor Tiling"). */
export function labelFor(i: LabelInput): string {
  const what = whatItIs(i)
  const room = i.roomName?.trim()
  return room ? `${room} – ${what}` : what
}

/** The side number a wall drawn as sides carries ("2/4"), with its space, or nothing. */
export const sideSuffix = (label: string) => (/ \d+\/\d+$/.exec(label)?.[0] ?? '')

/** True for a label nobody typed: a phase (or "Floor area") and four characters, with or without a side number. A label that was typed is never one. */
export function isAutoName(label: string | undefined, phases: readonly string[], typed?: boolean): boolean {
  if (typed) return false
  const t = (label ?? '').trim()
  if (!t) return true
  const m = /^(.*) [0-9a-z]{4}(?: \d+\/\d+)?$/.exec(t)
  return !!m && (m[1] === 'Floor area' || phases.includes(m[1]))
}

/** Drawings that would have the same label are numbered in the order given ("Floor Tiling 1", "Floor Tiling 2"); one that stands alone, or has a side number, is left as it is. */
export function numberSame(entries: { id: string; label: string }[]): Map<string, string> {
  const out = new Map<string, string>()
  const counts = new Map<string, number>()
  for (const e of entries) if (!sideSuffix(e.label)) counts.set(e.label, (counts.get(e.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const e of entries) {
    if (sideSuffix(e.label) || (counts.get(e.label) ?? 0) < 2) { out.set(e.id, e.label); continue }
    const n = (seen.get(e.label) ?? 0) + 1
    seen.set(e.label, n)
    out.set(e.id, `${e.label} ${n}`)
  }
  return out
}
