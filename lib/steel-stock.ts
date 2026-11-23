// Buying steel the way a merchant sells it: in whole bars of standard lengths, not by the cut length. A 3.2m beam from a 6.1m bar leaves a 2.9m offcut that is still paid for (the merchant's "wastage charge"), unless it is cut from
// a bar that other pieces share. This turns the list of pieces of ONE section into the bars to buy: which stock bar lengths, which cuts go in which bar, and what is left over, choosing the cheapest way (fewest metres bought).
// Pure: no screen, no pricing (the engine prices the bars: lib/structural-steel-units.ts).

/** Sample stock bar lengths, mm: the usual merchant lengths. Typed over in the calculator. */
export const STOCK_BARS_MM = [6100, 9100, 12200]
/** The steel lost to each saw cut, mm */
export const KERF_MM = 5

export interface Bar { lengthMm: number; /** the cuts in this bar, longest first */ cuts: number[]; /** the cuts and the saw cuts between them */ usedMm: number; offcutMm: number }
export interface BarPlan {
  bars: Bar[]
  /** pieces longer than the longest stock bar: they cannot come from one bar, so they are priced by their cut length (and need a splice) */
  tooLong: number[]
  /** metres of steel bought, cut and left over, mm */
  buyMm: number
  cutMm: number
  offcutMm: number
}

const clean = (stock: number[]): number[] => Array.from(new Set(stock.filter(n => Number.isFinite(n) && n >= 500 && n <= 30000).map(Math.round))).sort((a, b) => a - b)

/** first-fit decreasing: each piece goes in the first bar with room for it and the saw cut before it */
function packFFD(pieces: number[], capMm: number, kerfMm: number): { cuts: number[]; usedMm: number }[] {
  const bins: { cuts: number[]; usedMm: number }[] = []
  for (const p of pieces) {
    const bin = bins.find(b => b.usedMm + kerfMm + p <= capMm)
    if (bin) { bin.cuts.push(p); bin.usedMm += kerfMm + p } else bins.push({ cuts: [p], usedMm: p })
  }
  return bins
}

/**
 * The bars to buy for these pieces (each piece a length in mm, one entry per piece): the pieces are packed into bars of one stock length, or packed into the longest bar and each bar then bought as the shortest stock length that
 * holds its cuts; whichever buys the fewest metres wins (fewer bars on a tie). A piece longer than the longest stock bar is returned in `tooLong` and left out of the bars. With no stock lengths nothing is planned.
 */
export function planBars(piecesMm: number[], stockMm: number[] = STOCK_BARS_MM, kerfMm: number = KERF_MM): BarPlan {
  const stock = clean(Array.isArray(stockMm) ? stockMm : [])
  const pieces = piecesMm.filter(p => Number.isFinite(p) && p > 0).map(Math.round).sort((a, b) => b - a)
  const maxBar = stock[stock.length - 1]
  const tooLong = maxBar === undefined ? pieces.slice() : pieces.filter(p => p > maxBar)
  const normal = maxBar === undefined ? [] : pieces.filter(p => p <= maxBar)
  const cutMm = normal.reduce((s, p) => s + p, 0)
  if (normal.length === 0) return { bars: [], tooLong, buyMm: 0, cutMm: 0, offcutMm: 0 }
  const longest = normal[0]
  const candidates: Bar[][] = []
  // one stock length for all the bars
  for (const L of stock) {
    if (L < longest) continue
    candidates.push(packFFD(normal, L, kerfMm).map(b => ({ lengthMm: L, cuts: b.cuts, usedMm: b.usedMm, offcutMm: L - b.usedMm })))
  }
  // packed into the longest bar, each bar then bought as the shortest stock length that holds it
  candidates.push(packFFD(normal, maxBar, kerfMm).map(b => { const L = stock.find(s => s >= b.usedMm) ?? maxBar; return { lengthMm: L, cuts: b.cuts, usedMm: b.usedMm, offcutMm: L - b.usedMm } }))
  const total = (bars: Bar[]) => bars.reduce((s, b) => s + b.lengthMm, 0)
  let best = candidates[0]
  for (const c of candidates) { if (total(c) < total(best) || (total(c) === total(best) && c.length < best.length)) best = c }
  const bars = best.slice().sort((a, b) => b.lengthMm - a.lengthMm || b.usedMm - a.usedMm)
  const buyMm = total(bars)
  return { bars, tooLong, buyMm, cutMm, offcutMm: buyMm - cutMm }
}

/** The stock lengths a person typed ('6100, 9100 and 12200', '6.1 9.1 12.2' in metres) as a list in mm; anything that is not a sensible length is left out, and nothing usable gives the usual lengths */
export function parseStockLengths(text: string): number[] {
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).map(n => (n > 0 && n < 100 ? n * 1000 : n)).filter(n => n >= 500 && n <= 30000)
  const list = clean(nums)
  return list.length ? list : STOCK_BARS_MM.slice()
}
