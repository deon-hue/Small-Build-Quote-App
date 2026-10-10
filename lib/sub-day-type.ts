// A subcontractor's day in the portal's "Add my time" form: a full day, a half day, or a split day (the morning at one job, the afternoon at another).
// This works out what to send for each. A half day is paid at their half-day rate, or half their day rate if no half-day rate is saved. A split
// day is two half days, one per job, the same as the office's "Split day" tick on the weekly timesheet.

export type DayType = 'full' | 'half' | 'split'

export interface DayRates { hourlyRate: number | null; dayRate: number | null; halfDayRate: number | null }

export interface TimesheetBody {
  jobId: string
  date: string
  units: number
  description: string
  startTime: string | null
  finishTime: string | null
  breakMins: number
  rateType: 'daily' | 'hourly' | 'half_day'
  rateAmount: number
}

/** Their pay for a half day: the saved half-day rate, otherwise half the day rate. 0 when neither is saved. */
export function halfDayRateOf(r: DayRates): number {
  if (r.halfDayRate) return r.halfDayRate
  return r.dayRate ? Math.round((r.dayRate / 2) * 100) / 100 : 0
}

/** Only subcontractors paid by the day or half day get the choice; someone paid by the hour just gives their hours. */
export function canPickDayType(r: DayRates): boolean {
  return !!(r.dayRate || r.halfDayRate)
}

export interface DayInput {
  dayType: DayType
  date: string
  rates: DayRates
  jobId: string
  description: string
  hours: number
  startTime: string
  finishTime: string
  breakMins: number
  secondJobId: string
  secondDescription: string
}

/** What to send to the office: one timesheet for a full or half day, two for a split day. Throws a plain-English message when something is missing. */
export function buildDayBodies(i: DayInput): TimesheetBody[] {
  const r = i.rates
  if (!i.date) throw new Error('Please fill in the date.')
  if (!i.jobId) throw new Error('Please select a project or job.')

  if (i.dayType === 'full' || !canPickDayType(r)) {
    if (!i.hours) throw new Error('Please fill in date and hours.')
    const rateType = r.dayRate ? 'daily' : r.hourlyRate ? 'hourly' : r.halfDayRate ? 'half_day' : 'daily'
    const rateAmount = r.dayRate ?? r.hourlyRate ?? r.halfDayRate ?? 0
    return [{ jobId: i.jobId, date: i.date, units: i.hours, description: i.description, startTime: i.startTime || null, finishTime: i.finishTime || null, breakMins: i.breakMins || 0, rateType, rateAmount }]
  }

  const half = halfDayRateOf(r)
  if (i.dayType === 'half') {
    return [{ jobId: i.jobId, date: i.date, units: 1, description: i.description, startTime: i.startTime || null, finishTime: i.finishTime || null, breakMins: i.breakMins || 0, rateType: 'half_day', rateAmount: half }]
  }

  // split day
  if (!i.secondJobId) throw new Error('Please select the second job.')
  if (i.secondJobId === i.jobId) throw new Error('Pick two different jobs for a split day, or choose Half day for one job.')
  return [
    { jobId: i.jobId, date: i.date, units: 1, description: i.description, startTime: null, finishTime: null, breakMins: 0, rateType: 'half_day', rateAmount: half },
    { jobId: i.secondJobId, date: i.date, units: 1, description: i.secondDescription, startTime: null, finishTime: null, breakMins: 0, rateType: 'half_day', rateAmount: half },
  ]
}
