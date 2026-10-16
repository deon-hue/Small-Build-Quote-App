// "Direct Labour" and "paid through PAYE payroll" are two different things, and a worker can be one without the other:
//   - Direct Labour (isPaye): the worker's timesheet costs go in the LABOUR category of the job's budget instead of Subcontractors.
//   - Paid through payroll: their hours are never made into a bill and never sent to Xero (they are paid by payroll, or in cash).
// A full-time labourer on CIS who invoices is Direct Labour but NOT on payroll: their week becomes a bill, with the CIS deduction, like any subcontractor.
// `paidViaPayroll` empty (never set) keeps what Direct Labour has always meant here: on payroll. An explicit false (set in Contacts) makes them billable.
// Pure.

export interface PayrollFlags { isPaye?: boolean | null; paidViaPayroll?: boolean | null }

export const isDirectLabour = (c?: PayrollFlags | null) => !!c?.isPaye

/** Paid through payroll: Direct Labour, and not marked as billed. These people never get a bill and are never sent to Xero. */
export const isOnPayroll = (c?: PayrollFlags | null) => !!c?.isPaye && c.paidViaPayroll !== false

/** The same test for a row straight from the clients table (snake_case). */
export const rowIsOnPayroll = (r?: { is_paye?: boolean | null; paid_via_payroll?: boolean | null } | null) => !!r?.is_paye && r.paid_via_payroll !== false
