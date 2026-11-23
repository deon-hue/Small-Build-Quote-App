/**
 * Tests for the live summary with its ex VAT / inc VAT switch (lib/calc-summary.ts)
 *
 * Run with:   npx tsx __tests__/calc-summary.test.ts
 */
import { totalsFromLines, buildSummary } from '../lib/calc-summary'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.001) => Math.abs(a - b) <= e
const sum = (rows: { value: number }[]) => Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100

const lines = [
  { category: 'materials', cost: 500 }, { category: 'materials', cost: 120.5 },
  { category: 'subcontractors', cost: 166.1 }, { category: 'plant', cost: 80 }, { category: 'labour', cost: 210 }, { category: 'other', cost: 350 },
]
const tot = totalsFromLines(lines, 20, 1)
t('totals by kind', near(tot.materials, 620.5) && near(tot.subcontractors, 166.1) && near(tot.plant, 80) && near(tot.labour, 210) && near(tot.other, 350), tot)
t('cost subtotal is the sum of every line (1426.60), profit 20% is 285.32, total 1711.92', near(tot.costSubtotal, 1426.6) && near(tot.profitAmount, 285.32) && near(tot.total, 1711.92), tot)
t('a category it does not know goes under other', totalsFromLines([{ category: 'weird', cost: 10 }], 0, 1).other === 10)
t('no profit and bad profit values give none', totalsFromLines(lines, 0, 1).profitAmount === 0 && totalsFromLines(lines, NaN, 1).profitAmount === 0 && totalsFromLines(lines, -5, 1).profitAmount === 0)
t('a bad quantity is 1', totalsFromLines(lines, 0, 0).qty === 1 && totalsFromLines(lines, 0, NaN).qty === 1)
t('a bad cost is counted as nothing', totalsFromLines([{ category: 'materials', cost: NaN }, { category: 'materials', cost: 5 }], 0, 1).materials === 5)

const ex = buildSummary(tot, { inc: false, vatRate: 20, kg: 200 })
t('ex VAT: the total is 1711.92, VAT 342.38, inc VAT 2054.30', near(ex.totalEx, 1711.92) && near(ex.vat, 342.38) && near(ex.totalInc, 2054.3) && near(ex.shown, 1711.92), ex)
t('ex VAT: the rows add up to the total shown', near(sum(ex.rows), 1711.92), ex.rows)
t('ex VAT: rows are steel and materials, fabrication, plant, labour, other, then profit', ex.rows.map(r => r.key).join() === 'materials,subcontractors,plant,labour,other,profit', ex.rows.map(r => r.key))
t('ex VAT: each row is its own total', near(ex.rows[0].value, 620.5) && near(ex.rows[5].value, 285.32))
t('profit row says the percentage', ex.rows[5].label === 'Profit (20%)')
const inc = buildSummary(tot, { inc: true, vatRate: 20, kg: 200 })
t('inc VAT: the total shown is 2054.30', near(inc.shown, 2054.3), inc)
t('inc VAT: the rows add up to the total shown, to the penny', near(sum(inc.rows), 2054.3), [inc.rows, sum(inc.rows)])
t('inc VAT: each row is about its ex VAT figure x 1.2', near(inc.rows[0].value, 620.5 * 1.2, 0.011) && near(inc.rows[3].value, 252, 0.011))
t('the ex and inc totals are the same either way round', near(ex.totalInc, inc.totalInc) && near(ex.totalEx, inc.totalEx))
t('price per kg: 1711.92 / 200 = 8.56 ex VAT, 10.27 inc VAT', near(ex.perKg!, 8.56) && near(inc.perKg!, 10.27), [ex.perKg, inc.perKg])
t('no steel means no price per kg', buildSummary(tot, { inc: false, vatRate: 20 }).perKg === null && buildSummary(tot, { inc: false, vatRate: 20, kg: 0 }).perKg === null)
t('a zero VAT rate: inc is the same as ex', (() => { const z = buildSummary(tot, { inc: true, vatRate: 0 }); return near(z.shown, 1711.92) && near(z.vat, 0) })())
t('a rubbish VAT rate is treated as none', near(buildSummary(tot, { inc: true, vatRate: NaN }).shown, 1711.92) && near(buildSummary(tot, { inc: true, vatRate: -5 }).shown, 1711.92))
t('5% VAT: 1711.92 + 85.60 = 1797.52', (() => { const f = buildSummary(tot, { inc: true, vatRate: 5 }); return near(f.vat, 85.6) && near(f.shown, 1797.52) && near(sum(f.rows), 1797.52) })())
t('a quantity multiplies everything (3 off: 5135.76)', (() => { const q = buildSummary(totalsFromLines(lines, 20, 3), { inc: false, vatRate: 20 }); return near(q.shown, 5135.76) && near(sum(q.rows), 5135.76) })())
t('with a quantity the price per kg is for the whole job', (() => { const q = buildSummary(totalsFromLines(lines, 20, 3), { inc: false, vatRate: 20, kg: 200 }); return near(q.perKg!, 5135.76 / 600) })())
t('nothing priced: no rows, a zero total', (() => { const e = buildSummary(totalsFromLines([], 20, 1), { inc: true, vatRate: 20 }); return e.rows.length === 0 && e.shown === 0 })())
t('rows that are nothing are left out (no plant, no labour)', buildSummary(totalsFromLines([{ category: 'materials', cost: 100 }], 0, 1), { inc: false, vatRate: 20 }).rows.map(r => r.key).join() === 'materials')
t('awkward pennies still add up: thirds of a pound at 20% VAT', (() => {
  const a = totalsFromLines([{ category: 'materials', cost: 33.33 }, { category: 'subcontractors', cost: 33.33 }, { category: 'plant', cost: 33.33 }, { category: 'labour', cost: 0.01 }], 0, 1)
  const r = buildSummary(a, { inc: true, vatRate: 20 })
  return near(sum(r.rows), r.shown, 0.001)
})())
t('many awkward lines at 17.5% VAT add up too', (() => {
  const a = totalsFromLines([{ category: 'materials', cost: 12.37 }, { category: 'subcontractors', cost: 45.61 }, { category: 'plant', cost: 7.19 }, { category: 'labour', cost: 88.43 }, { category: 'other', cost: 3.03 }], 15, 1)
  const r = buildSummary(a, { inc: true, vatRate: 17.5 })
  return near(sum(r.rows), r.shown, 0.001)
})())

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
