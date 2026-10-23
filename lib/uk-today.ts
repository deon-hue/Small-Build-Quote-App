// Today's date as YYYY-MM-DD in UK time. `new Date().toISOString().slice(0, 10)` is the UTC date, which is yesterday's date for the first hour after midnight in summer (BST), so anything dated "today"
// (a bill, a payment) must use this instead. Pure; the clock can be passed in for tests.

export function ukToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
