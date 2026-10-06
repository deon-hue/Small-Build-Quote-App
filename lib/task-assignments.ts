// Who is booked on which task — pure helpers used by the job schedule (GanttModal) and the Calendar. Type imports only, so they can be
// tested with plain Node. The assignments themselves live in the task_assignments table, never inside the schedule JSON the client portal reads.

import type { Client, TaskAssignment } from './types'

/** The Contacts that can be booked on a task: subcontractors (which is where a subcontractor or hired-in worker is kept), by name. */
export function assignableContacts(clients: Pick<Client, 'id' | 'name' | 'clientType'>[]): Pick<Client, 'id' | 'name' | 'clientType'>[] {
  return clients
    .filter(c => c.clientType === 'subcontractor' && (c.name || '').trim() !== '')
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Everyone booked on one schedule row (several people can share a task) */
export function assignmentsFor(list: TaskAssignment[], jobId: string, phaseId: string | undefined): TaskAssignment[] {
  if (!phaseId) return []
  return list.filter(a => a.jobId === jobId && a.phaseId === phaseId)
}

/** Same person = same key: their Contact id, or their name when the contact has since been deleted */
export function assignmentKey(a: { assigneeId: string | null; assigneeName: string }): string {
  return a.assigneeId || `name:${a.assigneeName.toLowerCase()}`
}

/** A person to book on a task. dayOffsets: null = every working day, a list = just those days, undefined = leave their days as they are. */
export interface AssigneePick { id: string | null; name: string; dayOffsets?: number[] | null }

function sameOffsets(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  const x = a && a.length ? [...a].sort((p, q) => p - q) : null
  const y = b && b.length ? [...b].sort((p, q) => p - q) : null
  if (x === null || y === null) return x === y
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** What has to change to turn the people currently booked on a row into the wanted list: who to remove, who to add. */
export function diffAssignments(current: TaskAssignment[], wanted: AssigneePick[]): { remove: TaskAssignment[]; add: AssigneePick[]; update: { assignment: TaskAssignment; dayOffsets: number[] | null }[] } {
  const wantKeys = new Set(wanted.map(w => assignmentKey({ assigneeId: w.id, assigneeName: w.name })))
  const haveKeys = new Set(current.map(assignmentKey))
  const seen = new Set<string>()
  const add: AssigneePick[] = []
  for (const w of wanted) {
    const k = assignmentKey({ assigneeId: w.id, assigneeName: w.name })
    if (haveKeys.has(k) || seen.has(k) || !w.name.trim()) continue
    seen.add(k)
    add.push({ id: w.id, name: w.name.trim(), dayOffsets: w.dayOffsets ?? null })
  }
  // people already booked whose days were changed
  const update: { assignment: TaskAssignment; dayOffsets: number[] | null }[] = []
  for (const w of wanted) {
    if (w.dayOffsets === undefined) continue
    const cur = current.find(a => assignmentKey(a) === assignmentKey({ assigneeId: w.id, assigneeName: w.name }))
    if (cur && !sameOffsets(cur.dayOffsets, w.dayOffsets)) update.push({ assignment: cur, dayOffsets: w.dayOffsets && w.dayOffsets.length ? w.dayOffsets : null })
  }
  return { remove: current.filter(a => !wantKeys.has(assignmentKey(a))), add, update }
}

export interface AssigneeTag { key: string; name: string }

/** Everyone booked on a schedule row: the row's own person first, then anyone on its sub-tasks. Each person appears once. */
export function assigneesForRow(list: TaskAssignment[], jobId: string, rowId: string | undefined, childIds: (string | undefined)[]): AssigneeTag[] {
  const ids = [rowId, ...childIds].filter((x): x is string => !!x)
  const out: AssigneeTag[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    for (const a of assignmentsFor(list, jobId, id)) {
      const key = assignmentKey(a)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, name: a.assigneeName })
    }
  }
  return out
}

/** Everyone who has at least one booking, for the Calendar's "show only…" filter. */
export function allAssignees(list: TaskAssignment[]): AssigneeTag[] {
  const map = new Map<string, AssigneeTag>()
  for (const a of list) {
    const key = assignmentKey(a)
    if (!map.has(key)) map.set(key, { key, name: a.assigneeName })
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name))
}

/** A name shortened for a small chip, e.g. "Smith Roofing Ltd" -> "Smith Roofing…" */
export function shortName(name: string, max = 16): string {
  const n = (name || '').trim()
  return n.length <= max ? n : n.slice(0, max - 1).trimEnd() + '…'
}
