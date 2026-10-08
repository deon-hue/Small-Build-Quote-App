// Which job notes need the builder's attention: notes a subcontractor sent from their portal that the builder has not opened yet. Pure functions.

export interface AttentionNote { id: string; jobId: string; note: string; source?: string; authorName?: string; seenAt?: string | null; createdAt: string }

/** Subcontractor notes not yet seen, newest first. */
export function unseenSubNotes<T extends AttentionNote>(notes: T[]): T[] {
  return notes
    .filter(n => n.source === 'subcontractor' && !n.seenAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** How many unseen subcontractor notes each job has (job id -> count). */
export function unseenByJob(notes: AttentionNote[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of unseenSubNotes(notes)) out[n.jobId] = (out[n.jobId] ?? 0) + 1
  return out
}

/** A one-line version of a note for a list: first line, cut with an ellipsis. */
export function snippet(text: string, max = 70): string {
  const first = (text || '').split(/\r?\n/)[0].trim()
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}
