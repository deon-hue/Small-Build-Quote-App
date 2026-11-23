/**
 * Tests for buying steel in whole stock bars (lib/steel-stock.ts)
 *
 * Run with:   npx tsx __tests__/steel-stock.test.ts
 */
import { planBars, parseStockLengths, STOCK_BARS_MM } from '../lib/steel-stock'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

const one = planBars([3200])
t('one 3.2m piece comes from one 6.1m bar, 2.9m left over (as the merchant charges)', one.bars.length === 1 && one.bars[0].lengthMm === 6100 && one.buyMm === 6100 && one.cutMm === 3200 && one.offcutMm === 2900 && one.tooLong.length === 0, one)
const three = planBars([3200, 3200, 3200])
t('three 3.2m pieces share ONE 12.2m bar (9.6m and the saw cuts, 2.58m left) rather than two 6.1m bars', three.bars.length === 1 && three.bars[0].lengthMm === 12200 && three.buyMm === 12200 && three.bars[0].cuts.length === 3, three)
const two = planBars([3000, 3000])
t('two 3.0m pieces share a 6.1m bar (6.0m and one saw cut fit)', two.bars.length === 1 && two.bars[0].lengthMm === 6100 && two.offcutMm === 6100 - 6000, two)
t('two 3.1m pieces do not fit one 6.1m bar: a longer bar is bought if cheaper, else two', (() => { const p = planBars([3100, 3100]); return p.buyMm <= 12200 && p.bars.every(b => b.usedMm <= b.lengthMm) })())
const mixed = planBars([6000, 2500])
t('a 6.0m and a 2.5m piece: a 9.1m bar holds both (8.5m), cheaper than a 6.1m and another 6.1m (12.2m)', mixed.buyMm === 9100 && mixed.bars.length === 1, mixed)
const big = planBars([7000])
t('a 7.0m piece is bought as a 9.1m bar', big.bars.length === 1 && big.bars[0].lengthMm === 9100 && big.offcutMm === 2100, big)
t('a piece longer than the longest bar is left out, flagged, and buys no bar', (() => { const p = planBars([13000, 3000]); return p.tooLong.length === 1 && p.tooLong[0] === 13000 && p.bars.length === 1 && p.cutMm === 3000 })())
t('a piece exactly as long as the longest bar fits with no offcut', planBars([12200]).offcutMm === 0)
t('nothing to cut: nothing to buy', planBars([]).bars.length === 0 && planBars([0, -5]).buyMm === 0)
t('no stock lengths: every piece is too long to plan', planBars([3000], []).tooLong.length === 1 && planBars([3000], []).bars.length === 0)
t('custom stock lengths are used (4m and 8m bars)', planBars([3000], [4000, 8000]).bars[0].lengthMm === 4000)
t('a typed list in any order, with rubbish, is cleaned', planBars([3000], [12200, 6100, 6100, NaN, 3]).bars[0].lengthMm === 6100)
t('the cuts in a bar are listed longest first and never overfill it', (() => { const p = planBars([1000, 2500, 800, 2900, 1200, 600, 3300, 700]); return p.bars.every(b => b.usedMm <= b.lengthMm && b.cuts.every((c, i, a) => i === 0 || a[i - 1] >= c)) && p.cutMm === 13000 })())
t('the saw cut is allowed for: five 2.4m pieces and four cuts do not squeeze into 12.0m... they need the 12.2m bar and fit', (() => { const p = planBars([2400, 2400, 2400, 2400, 2400]); return p.bars.length === 1 && p.bars[0].lengthMm === 12200 && p.bars[0].usedMm === 12000 + 4 * 5 })())
t('the saw cut can push a piece into a second bar', (() => { const p = planBars([6098, 6098]); return p.bars.length >= 2 || p.bars[0].lengthMm > 6100 })())
t('buying more than is cut: bought = cut + offcut, always', (() => { for (const pcs of [[3200], [3200, 2000, 1000], [8000, 4000], [500, 600, 700, 5000]]) { const p = planBars(pcs); if (p.buyMm !== p.cutMm + p.offcutMm) return false } return true })())
t('parse: millimetres, metres and words', JSON.stringify(parseStockLengths('6100, 9100 and 12200')) === '[6100,9100,12200]' && JSON.stringify(parseStockLengths('6.1  9.1  12.2')) === '[6100,9100,12200]')
t('parse: rubbish gives the usual lengths', JSON.stringify(parseStockLengths('abc')) === JSON.stringify(STOCK_BARS_MM) && JSON.stringify(parseStockLengths('')) === JSON.stringify(STOCK_BARS_MM) && JSON.stringify(parseStockLengths('0.1, 99999')) === JSON.stringify(STOCK_BARS_MM))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
