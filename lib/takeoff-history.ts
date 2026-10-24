// Undo and redo for Take-off's drawings and priced items. The screen hands this the drawings and items each time they may have changed; a burst of changes close together (a drag, typing in a box) is ONE step, and the
// step back goes to how things were before the burst. Pure, so it can be tested. Used with lib/takeoff-types: S is { elements, items }.

export interface History<S> {
  undo: S[]
  redo: S[]
  /** the state last seen: what an undo of the next change goes back to */
  prev: S
  lastAt: number
  /** the screen just restored a state: the next change it reports is that restore, not a new step */
  restoring: boolean
  /** what the history belongs to (the take-off and its sheets): when it changes the history starts again */
  key: string
}

export const HISTORY_GAP_MS = 600
export const HISTORY_MAX = 80

export function newHistory<S>(s: S, key: string): History<S> {
  return { undo: [], redo: [], prev: s, lastAt: 0, restoring: false, key }
}

/** Reports the current state. Returns true when the undo or redo lists changed (so the buttons need redrawing). `same` says whether two states are the same one. */
export function observe<S>(h: History<S>, cur: S, key: string, now: number, same: (a: S, b: S) => boolean): boolean {
  if (h.key !== key) { h.undo = []; h.redo = []; h.prev = cur; h.lastAt = 0; h.restoring = false; h.key = key; return true }
  if (same(cur, h.prev)) return false
  if (h.restoring) { h.restoring = false; h.prev = cur; return true }
  let changed = false
  if (now - h.lastAt > HISTORY_GAP_MS) {
    h.undo.push(h.prev)
    if (h.undo.length > HISTORY_MAX) h.undo.shift()
    if (h.redo.length > 0) h.redo = []
    changed = true
  }
  h.lastAt = now
  h.prev = cur
  return changed
}

/** The state to go back to (and the current one is kept for redo), or null if there is nothing to undo. The caller sets it on screen. */
export function undoStep<S>(h: History<S>, cur: S): S | null {
  const s = h.undo.pop()
  if (s === undefined) return null
  h.redo.push(cur)
  h.restoring = true
  h.lastAt = 0
  return s
}

export function redoStep<S>(h: History<S>, cur: S): S | null {
  const s = h.redo.pop()
  if (s === undefined) return null
  h.undo.push(cur)
  h.restoring = true
  h.lastAt = 0
  return s
}
