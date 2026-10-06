// Who is booked on which task — pure helpers used by the job schedule (GanttModal) and the Calendar. Type imports only, so they can be
// tested with plain Node. The assignments themselves live in the task_assignments table, never inside the schedule JSON the client portal reads.

import type { Client, TaskAssignment } from './types'

/** The Contacts that can be booked on a task: subcontractors (which is where a subcontractor or hired-in worker is kept), by name. */
export function assignableContacts(clients: Pick<Client, 'id' | 'name' | 'clientType'>[]): Pick<Client, 'id' | 'name' | 'clientType'>[] {
  return clients
    .filter(c => c.clientType === 'subcontractor' && (c.name || '').trim() !== '')
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function assignmentFor(list: TaskAssignment[], jobId: string, phaseId: string | undefined): TaskAssignment | undefined {
  if (!phaseId) return undefined
  return list.find(a => a.jobId === jobId && a.phaseId === phaseId)
}

export interface AssigneeTag { key: string; name: string }

/** Everyone booked on a schedule row: the row's own person first, then anyone on its sub-tasks. Each person appears once. */
export function assigneesForRow(list: TaskAssignment[], jobId: string, rowId: string | undefined, childIds: (string | undefined)[]): AssigneeTag[] {
  const ids = [rowId, ...childIds].filter((x): x is string => !!x)
  const out: AssigneeTag[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const a = assignmentFor(list, jobId, id)
    if (!a) continue
    const key = a.assigneeId || `name:${a.assigneeName.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key, name: a.assigneeName })
  }
  return out
}

/** Everyone who has at least one booking, for the Calendar's "show only…" filter. */
export function allAssignees(list: TaskAssignment[]): AssigneeTag[] {
  const map = new Map<string, AssigneeTag>()
  for (const a of list) {
    const key = a.assigneeId || `name:${a.assigneeName.toLowerCase()}`
    if (!map.has(key)) map.set(key, { key, name: a.assigneeName })
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name))
}

/** A name shortened for a small chip, e.g. "Smith Roofing Ltd" -> "Smith Roofing…" */
export function shortName(name: string, max = 16): string {
  const n = (name || '').trim()
  return n.length <= max ? n : n.slice(0, max - 1).trimEnd() + '…'
}
