/**
 * Tests for lib/payment-plan.ts  —  a quote's payment plan (deposit, stages by phase end or weekly, retention, exact totals, dates, safety of stored plans)
 *
 * Run with:   npx tsx __tests__/payment-plan.test.ts
 */

import * as P from '../lib/payment-plan'
let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: any) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number) => Math.abs(a - b) < 0.005

const tasks: P.PlanTask[] = [
  { key: '1', group: 'Foundations', name: 'Dig', value: 6000, days: 3 },
  { key: '2', group: 'Foundations', name: 'Concrete', value: 6000, days: 2 },
  { key: '3', group: 'Structure', name: 'Walls', value: 12000, days: 10 },
  { key: '4', group: 'Finishes', name: 'Plaster', value: 4000, days: 4 },
  { key: '5', group: 'Finishes', name: 'Paint', value: 2000, days: 1 },
]
const TOTAL = 30000
const S = P.DEFAULT_SETTINGS

// ---- phase-end, no start date
let rows = P.generateRows(tasks, S, TOTAL)
t('rows add to the total exactly', near(P.planSum(rows), TOTAL), P.planSum(rows))
t('deposit 10% = 3000, due on acceptance', rows[0].kind === 'deposit' && rows[0].amount === 3000 && rows[0].dueDay === null, rows[0])
const kinds = rows.map(r => r.kind).join()
t('deposit, 2 stages, final, retention', kinds === 'deposit,stage,stage,final,retention', kinds)
t('retention 5% = 1500', rows[rows.length - 1].amount === 1500, rows[rows.length - 1])
// foundations 12000 -> 12000*0.9=10800 ; structure 12000 -> 10800 ; finishes 6000 -> 5400 less 1500 = 3900
t('foundations stage 10800', rows[1].amount === 10800, rows[1])
t('structure stage 10800', rows[2].amount === 10800, rows[2])
t('final stage 3900 (less retention)', rows[3].amount === 3900 && /less retention/.test(rows[3].description), rows[3])
t('descriptions name the phase', /Foundations/.test(rows[1].description) && /Structure/.test(rows[2].description) && /Finishes/.test(rows[3].description), rows.map(r => r.description))
// working days: foundations ends day 5 (nominal Monday start -> Fri offset 4), structure day 15 (offset 18 : Fri 3rd week), finishes day 20 (offset 25)
t('foundations due offset 4', rows[1].dueDay === 4, rows[1].dueDay)
t('structure due after 15 working days = offset 18', rows[2].dueDay === 18, rows[2].dueDay)
t('finishes due after 20 working days = offset 25', rows[3].dueDay === 25, rows[3].dueDay)
t('retention 6 months after the last stage', rows[4].dueDay === 25 + Math.round(6 * 30.4), rows[4].dueDay)
t('no start date label', P.dueLabel(S, rows[2]) === 'About 3 weeks after work starts', P.dueLabel(S, rows[2]))
t('deposit label', P.dueLabel(S, rows[0]) === 'When you accept the quote')

// ---- with a start date (Mon 4 Jan 2027)
const S2 = { ...S, startDate: '2027-01-04' }
rows = P.generateRows(tasks, S2, TOTAL)
t('start date: foundations falls Fri 8 Jan 2027', P.longDate(P.rowDate(S2, rows[1])!) === 'Fri 8 Jan 2027', P.longDate(P.rowDate(S2, rows[1])!))
t('start date: structure Fri 22 Jan 2027', P.longDate(P.rowDate(S2, rows[2])!) === 'Fri 22 Jan 2027', P.longDate(P.rowDate(S2, rows[2])!))
t('start on a Wed: 1st working day is offset 0', P.workDayToCalDay(P.parseDay('2027-01-06'), 1) === 0)
t('start on a Wed: 3rd working day Fri = offset 2, 4th Mon = offset 5', P.workDayToCalDay(P.parseDay('2027-01-06'), 3) === 2 && P.workDayToCalDay(P.parseDay('2027-01-06'), 4) === 5)
t('start on a Sat: first working day Monday = offset 2', P.workDayToCalDay(P.parseDay('2027-01-02'), 1) === 2)
const m = P.monthlyTotals(P.generatePlan(tasks, {}, S2, TOTAL, new Date(2026, 11, 20)), new Date(2026, 11, 20))
t('monthly totals add to total', near(m.reduce((a, x) => a + x.amount, 0), TOTAL), m)
t('monthly: Dec 2026 deposit, Jan 2027 stages', m[0].label === 'Dec 2026' && m[0].amount === 3000 && m[1].label === 'Jan 2027', m)

// ---- weekly (periodic)
const W = { ...S2, mode: 'periodic' as const, everyWeeks: 1 }
rows = P.generateRows(tasks, W, TOTAL)
t('weekly: rows add to the total exactly', near(P.planSum(rows), TOTAL), P.planSum(rows))
const weekRows = rows.filter(r => r.kind === 'stage' || r.kind === 'final')
t('weekly: 4 weeks of work = 4 payments', weekRows.length === 4, weekRows.map(r => r.description))
// week1: Dig 3d (6000) + Concrete 2d (6000)= 12000 -> 10800
t('weekly: week 1 = 10800 (foundations done)', weekRows[0].amount === 10800 && /Foundations to 100%/.test(weekRows[0].description), weekRows[0])
// week2: walls 5 of 10 days = 6000 -> 5400 ; week3: walls rest 6000 -> 5400; week4: plaster 4d + paint 1d = 6000 -> 5400 less 1500 = 3900
t('weekly: week 2 = 5400, Structure to 50%', weekRows[1].amount === 5400 && /Structure to 50%/.test(weekRows[1].description), weekRows[1])
t('weekly: week 3 = 5400, Structure to 100%', weekRows[2].amount === 5400 && /Structure to 100%/.test(weekRows[2].description), weekRows[2])
t('weekly: week 4 final 3900', weekRows[3].amount === 3900 && weekRows[3].kind === 'final', weekRows[3])
t('weekly: dated to the Friday of each week', P.longDate(P.rowDate(W, weekRows[0])!) === 'Fri 8 Jan 2027' && P.longDate(P.rowDate(W, weekRows[1])!) === 'Fri 15 Jan 2027', weekRows.map(r => P.longDate(P.rowDate(W, r)!)))
// fortnightly
rows = P.generateRows(tasks, { ...W, everyWeeks: 2 }, TOTAL)
t('fortnightly: total exact, 2 payments + deposit + retention', near(P.planSum(rows), TOTAL) && rows.filter(r => r.kind === 'stage' || r.kind === 'final').length === 2, rows.map(r => r.description))

// ---- no deposit, no retention
rows = P.generateRows(tasks, { ...S, depositPct: 0, retentionPct: 0 }, TOTAL)
t('no deposit/retention: only stages, total exact', rows.every(r => r.kind === 'stage' || r.kind === 'final') && near(P.planSum(rows), TOTAL) && rows[0].amount === 12000, rows)
t('exactly one final', rows.filter(r => r.kind === 'final').length === 1)

// ---- retention bigger than the last stage is taken from the one before as well
const big = P.generateRows(tasks, { ...S, retentionPct: 25 }, TOTAL) // 7500 retention; last 5400 -> 0 and 2100 from structure
t('big retention: total exact', near(P.planSum(big), TOTAL), P.planSum(big))
t('big retention: last stage gone, structure reduced to 8700', !big.some(r => /Finishes/.test(r.description) && r.kind !== 'retention') && big.find(r => /Structure/.test(r.description))?.amount === 8700, big)
// pennies: an awkward total
const odd = P.generateRows([{ key: 'a', group: 'A', name: 'a', value: 333.33, days: 1 }, { key: 'b', group: 'B', name: 'b', value: 666.67, days: 1 }, { key: 'c', group: 'C', name: 'c', value: 100.01, days: 1 }], S, 1100.01)
t('awkward pennies add to total exactly', near(P.planSum(odd), 1100.01), P.planSum(odd))
// 100% deposit-ish and junk
t('deposit 100% leaves no stages', P.generateRows(tasks, { ...S, depositPct: 100 }, TOTAL).every(r => r.kind === 'deposit' || r.kind === 'retention' || r.amount >= 0))
t('empty tasks give no rows', P.generateRows([], S, 1000).length === 0)
t('zero total gives no rows', P.generateRows(tasks, S, 0).length === 0)
t('zero-value tasks left out', P.generateRows([{ ...tasks[0], value: 0 }], S, 100).length === 0)
t('days cleaned', P.cleanDays(0) === 1 && P.cleanDays(-3) === 1 && P.cleanDays('x') === 1 && P.cleanDays(2.6) === 3 && P.cleanDays(9999) === 400)

// ---- suggestDays
t('suggest: 4 man-days -> 2 days', P.suggestDays({ items: [], labourTrades: [{ qty: 4, unit: 'day' } as any] }) === 2)
t('suggest: 16 hours -> 1 day (2 man-days / 2)', P.suggestDays({ items: [], labourTrades: [{ qty: 16, unit: 'hr' } as any] }) === 1)
t('suggest: labour item in days', P.suggestDays({ items: [{ itemType: 'labour', qty: 10, unit: 'days' } as any] }) === 5)
t('suggest: nothing -> 1', P.suggestDays({ items: [] }) === 1)

// ---- generatePlan, problems, clean, visible
const plan = P.generatePlan(tasks, { '1': 5, '3': 7 }, S2, TOTAL, new Date('2026-12-01T10:00:00Z'))
t('plan: days used and cleaned', plan.days['1'] === 5 && plan.days['3'] === 7 && plan.days['2'] === 2, plan.days)
t('plan: no problems when it adds up and has a start date', P.planProblems(plan, TOTAL).length === 0, P.planProblems(plan, TOTAL))
t('plan: problem when quote total rose', P.planProblems(plan, TOTAL + 100).some(x => /less than the quote total/.test(x)), P.planProblems(plan, TOTAL + 100))
t('plan: problem when quote total fell', P.planProblems(plan, TOTAL - 100).some(x => /more than the quote total/.test(x)))
t('plan: no start date warned', P.planProblems(P.generatePlan(tasks, {}, S, TOTAL), TOTAL).some(x => /No start date/.test(x)))
t('plan: no rows warned', P.planProblems({ ...plan, rows: [] }, TOTAL).length === 1)
const back = P.cleanPlan(JSON.parse(JSON.stringify(plan)))
t('cleanPlan round trip', !!back && back.rows.length === plan.rows.length && back.depositPct === 10 && back.startDate === '2027-01-04' && back.mode === 'phase-end', back)
t('cleanPlan: junk is null', P.cleanPlan(null) === null && P.cleanPlan('x') === null && P.cleanPlan({}) === null && P.cleanPlan({ version: 2, rows: [] }) === null)
const hostile = P.cleanPlan({ version: 1, rows: [{ kind: 'stage', amount: -5, description: 'x' }, { kind: 'evil', amount: 5 }, { kind: 'stage', amount: 'a' }, { kind: 'stage', amount: 50, description: 'y'.repeat(900), dueDay: 'z' }, null], startDate: 'not a date', mode: 'x', depositPct: 400, retentionMonths: 9999 })
t('cleanPlan: hostile rows dropped, values clamped', !!hostile && hostile.rows.length === 1 && hostile.rows[0].description.length === 300 && hostile.rows[0].dueDay === null && hostile.startDate === '' && hostile.mode === 'phase-end' && hostile.depositPct === 100 && hostile.retentionMonths === 60, hostile)
t('visiblePlan: shown by default', !!P.visiblePlan(JSON.parse(JSON.stringify(plan))))
t('visiblePlan: hidden when switched off', P.visiblePlan({ ...plan, showToClient: false }) === null)
t('visiblePlan: hidden with no rows', P.visiblePlan({ ...plan, rows: [] }) === null)
const ms = P.planToMilestones(plan)
t('milestones: same count, total, ISO dates', ms.length === plan.rows.length && near(ms.reduce((a, x) => a + x.amount, 0), TOTAL) && ms[0].dueDate === '' && /^2027-/.test(ms[1].dueDate), ms)
t('parseDay rejects 31 Feb', P.parseDay('2027-02-31') === null && P.parseDay('') === null)
// ---- customer discount (a % off chosen sub-phases, taken off BEFORE the deposit, stages and retention)
{
  const dsc = { '4': 10, '5': 5 }   // Plaster 10% of 4000 = 400, Paint 5% of 2000 = 100
  const r = P.generateRows(tasks.map(x => ({ ...x, discountPct: dsc[x.key as '4' | '5'] ?? 0 })), S, TOTAL)
  t('discount: rows add up to the total less the discount (29,500)', near(P.planSum(r), 29500), P.planSum(r))
  t('discount: deposit is 10% of what is payable (2,950)', r[0].kind === 'deposit' && r[0].amount === 2950, r[0])
  t('discount: foundations and structure stages unchanged by it (10,800 each)', r[1].amount === 10800 && r[2].amount === 10800, r.map(x => x.amount))
  t('discount: final stage is the discounted finishes less retention (4,950 - 1,475 = 3,475)', r[3].kind === 'final' && r[3].amount === 3475, r[3])
  t('discount: retention is 5% of what is payable (1,475)', r[4].kind === 'retention' && r[4].amount === 1475, r[4])
  const plan = P.generatePlan(tasks, {}, S2, TOTAL, new Date('2026-12-01T10:00:00Z'), true, dsc)
  t('discount plan: discountTotal 500 with two items', plan.discountTotal === 500 && plan.discountItems.length === 2, plan.discountItems)
  t('discount plan: items name the task, group and amount', plan.discountItems[0].name === 'Plaster' && plan.discountItems[0].group === 'Finishes' && plan.discountItems[0].amount === 400 && plan.discountItems[1].amount === 100, plan.discountItems)
  t('discount plan: percentages kept', plan.discounts['4'] === 10 && plan.discounts['5'] === 5, plan.discounts)
  t('discount plan: total stays the quote total', plan.total === TOTAL)
  const tot = P.planTotals(plan)
  t('planTotals: gross 30,000, discount 500, payable 29,500', tot.gross === 30000 && tot.discount === 500 && tot.payable === 29500, tot)
  t('discount plan: no problems against the quote total', P.planProblems(plan, TOTAL).length === 0, P.planProblems(plan, TOTAL))
  t('discount plan: rise in the quote flagged against the total to pay', P.planProblems(plan, TOTAL + 100).some(x => /less than the total to pay/.test(x)), P.planProblems(plan, TOTAL + 100))
  const w = P.generateRows(tasks.map(x => ({ ...x, discountPct: dsc[x.key as '4' | '5'] ?? 0 })), { ...S2, mode: 'periodic', everyWeeks: 1 }, TOTAL)
  t('discount weekly: rows add up to 29,500', near(P.planSum(w), 29500), P.planSum(w))
  const full = P.applyDiscounts([{ ...tasks[0], discountPct: 100 }])
  t('discount 100% takes the whole value; no items for 0%', full.tasks[0].value === 0 && full.total === 6000 && P.applyDiscounts(tasks).items.length === 0)
  t('discount over 100 or negative is held to 0 to 100', P.applyDiscounts([{ ...tasks[0], discountPct: 500 }]).tasks[0].value === 0 && P.applyDiscounts([{ ...tasks[0], discountPct: -20 }]).total === 0)
  const back = P.cleanPlan(JSON.parse(JSON.stringify(plan)))
  t('discount plan survives being stored', !!back && back.discountTotal === 500 && back.discounts['4'] === 10 && back.discountItems.length === 2, back)
  const old = P.cleanPlan({ version: 1, rows: [{ kind: 'stage', amount: 50, description: 'x', dueDay: 3 }], startDate: '' })
  t('a plan saved before discounts reads as no discount', !!old && old.discountTotal === 0 && old.discountItems.length === 0 && Object.keys(old.discounts).length === 0, old)
  const bad = P.cleanPlan({ version: 1, rows: [], discounts: { a: 900, b: -3, c: 'x' }, discountItems: [{ name: 'ok', group: 'g', pct: 5, amount: 10 }, { amount: -5 }, null, { amount: 'z' }] })
  t('hostile discount values are cleaned', !!bad && bad.discounts.a === 100 && !('b' in bad.discounts) && !('c' in bad.discounts) && bad.discountItems.length === 1 && bad.discountTotal === 10, bad)
}
console.log(`payment plan: ${ok} ok, ${bad} failed`)
if (bad > 0) process.exit(1)
