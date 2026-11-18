/**
 * Tests for the customer discount coming off the QUOTE TOTAL (lib/utils.ts quoteDiscount / quoteTotal), as given by the payment plan
 *
 * Run with:   npx tsx __tests__/quote-discount.test.ts
 */

import { quoteDiscount, quoteDiscountPerPhase, quoteTotal, calcPhaseSell } from '../lib/utils'
import { generatePlan, planKeys, planTotals, DEFAULT_SETTINGS } from '../lib/payment-plan'
import { planTasksFromQuote, planQuoteTotal } from '../lib/payment-plan-quote'
import type { Quote, QuotePhase } from '../lib/types'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number) => Math.abs(a - b) < 0.005

const ph = (id: number, parent: string, name: string, labour: number): QuotePhase => ({
  id, phase: name, parentPhase: parent,
  items: [{ id: id * 10, desc: 'L', qty: 1, unit: 'item', labour, materials: 0, itemType: 'labour', notes: '' }],
} as unknown as QuotePhase)
// ex VAT: 10,000 + 4,000 + 2,000 = 16,000; with VAT 19,200
const phases = [ph(1, 'Foundations', 'Dig', 10000), ph(2, 'Finishes', 'Plaster', 4000), ph(3, 'Finishes', 'Paint', 2000)]
const keys = planKeys(phases)
const quote = (over: Partial<Quote> = {}): Quote => ({ phases, markup: 0, vatIncluded: true, ...over } as unknown as Quote)
const planFor = (vatOn: boolean, disc: Record<string, number>, show = true) =>
  generatePlan(planTasksFromQuote(phases, 0, vatOn), {}, DEFAULT_SETTINGS, planQuoteTotal(phases, 0, vatOn), new Date('2026-12-01T10:00:00Z'), show, disc)

const disc = { [keys[1]]: 10, [keys[2]]: 5 }   // Plaster 10% of 4,800 = 480; Paint 5% of 2,400 = 120 (with VAT)
const plan = planFor(true, disc)

// no plan, no discount
t('no plan: no discount, total as before', quoteDiscount(quote()).incVat === 0 && near(quoteTotal(quote()), 19200), quoteTotal(quote()))
t('a plan with no discount changes nothing', near(quoteTotal(quote({ paymentPlan: planFor(true, {}) })), 19200))

// with VAT
const d = quoteDiscount(quote({ paymentPlan: plan }))
t('with VAT: 600 comes off the total (480 + 120)', near(d.incVat, 600), d)
t('with VAT: the discount before VAT is 500', near(d.exVat, 500), d)
t('with VAT: the quote total is 18,600', near(quoteTotal(quote({ paymentPlan: plan })), 18600), quoteTotal(quote({ paymentPlan: plan })))
t('the quote total is exactly what the plan says is payable', near(quoteTotal(quote({ paymentPlan: plan })), planTotals(plan).payable), [quoteTotal(quote({ paymentPlan: plan })), planTotals(plan).payable])
// the Subtotal / discount / VAT / Total block a client sees
const sub = phases.reduce((s, p) => s + calcPhaseSell(p, 0), 0)
t('block: subtotal 16,000, discount 500, VAT on 15,500 is 3,100, total 18,600', near(sub, 16000) && near((sub - d.exVat) * 0.2, 3100) && near(sub - d.exVat + (sub - d.exVat) * 0.2, 18600))

// without VAT
const planNoVat = planFor(false, disc)
const dn = quoteDiscount(quote({ vatIncluded: false, paymentPlan: planNoVat }))
t('no VAT: 400 + 100 = 500 off, the same before and after VAT', near(dn.incVat, 500) && near(dn.exVat, 500), dn)
t('no VAT: total 15,500', near(quoteTotal(quote({ vatIncluded: false, paymentPlan: planNoVat })), 15500))

// a plan that is not shown to the customer does not change the quote total (the customer would not see why)
const hidden = planFor(true, disc, false)
t('hidden plan: no discount comes off', quoteDiscount(quote({ paymentPlan: hidden })).incVat === 0 && near(quoteTotal(quote({ paymentPlan: hidden })), 19200))

// it follows the quote as it is edited now (the plan stores percentages by sub-phase)
const dearer = [phases[0], ph(2, 'Finishes', 'Plaster', 8000), phases[2]]
const dd = quoteDiscount({ phases: dearer, markup: 0, vatIncluded: true, paymentPlan: plan })
t('plaster repriced to 8,000: 10% of 9,600 = 960, plus 120', near(dd.incVat, 1080), dd)
// a sub-phase renamed or removed since the plan was made: its discount is simply not found
const renamed = [phases[0], ph(2, 'Finishes', 'Plastering', 4000), phases[2]]
t('a renamed sub-phase loses its discount (the percentage is by name), the other stays', near(quoteDiscount({ phases: renamed, markup: 0, vatIncluded: true, paymentPlan: plan }).incVat, 120))
// the quote's own margin is in the values
const mk = quoteDiscount({ phases, markup: 20, vatIncluded: true, paymentPlan: planFor(true, disc) })
t('with a 20% margin the discount is worked on the marked-up price (not the plan made at 0%)', mk.incVat > 600 && near(mk.incVat, 720), mk)
// junk plans
t('junk plan values are ignored', quoteDiscount({ phases, markup: 0, vatIncluded: true, paymentPlan: { version: 1, rows: [{ kind: 'stage', amount: 5, description: 'x', dueDay: 1 }], discounts: { [keys[1]]: 900, [keys[2]]: -5, zzz: 'x' } } }).incVat > 0 && near(quoteDiscount({ phases, markup: 0, vatIncluded: true, paymentPlan: { version: 1, rows: [{ kind: 'stage', amount: 5, description: 'x', dueDay: 1 }], discounts: { [keys[2]]: -5 } } }).incVat, 0))
t('a 900% typed in is held to 100%', near(quoteDiscount({ phases, markup: 0, vatIncluded: true, paymentPlan: { version: 1, rows: [{ kind: 'stage', amount: 5, description: 'x', dueDay: 1 }], discounts: { [keys[1]]: 900 } } }).incVat, 4800))
t('null and undefined plans', quoteDiscount({ phases, paymentPlan: null }).incVat === 0 && quoteDiscount({ phases }).incVat === 0)

// per sub-phase (an invoice of only some phases)
const per = quoteDiscountPerPhase(quote({ paymentPlan: plan }))
t('per phase: none on Dig, 480 on Plaster, 120 on Paint (with VAT)', per.length === 3 && per[0] === 0 && near(per[1], 480) && near(per[2], 120), per)
t('per phase adds up to the whole discount', near(per.reduce((a, b) => a + b, 0), quoteDiscount(quote({ paymentPlan: plan })).incVat))
t('per phase with no plan is all zero', quoteDiscountPerPhase(quote()).every(x => x === 0))
console.log(`quote discount: ${ok} ok, ${bad} failed`)
if (bad > 0) process.exit(1)
