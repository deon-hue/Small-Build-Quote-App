// The kinds of alert a person can switch on or off in Settings. Plain data with no server code, so the Settings screen and the server share one list.

export type PushCategory = 'supplier_replies' | 'sub_notes' | 'timesheets' | 'daily_summary'

/** What can be switched on or off in Settings, in the order they are listed there. */
export const PUSH_CATEGORIES: { key: PushCategory; label: string; hint: string }[] = [
  { key: 'supplier_replies', label: 'A supplier replies to a price request', hint: 'As soon as a supplier sends their prices.' },
  { key: 'sub_notes', label: 'A subcontractor sends a site note', hint: 'When a subcontractor adds a note to a job from their portal.' },
  { key: 'timesheets', label: 'A subcontractor sends a timesheet', hint: 'When a timesheet is waiting for you to review.' },
  { key: 'daily_summary', label: 'A morning summary of what needs you', hint: 'Once a day, only if something needs you: late deliveries, invoices not arrived, overdue invoices, prices to compare.' },
]
