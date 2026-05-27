// ── Labour trade types & default day / hour rates ───────────────────────────
// Default rates are based on UK market 2024–25 (London / South East).
// The Back Office "Trade Rates" section lets the user override these defaults.
// They are persisted to localStorage so they survive page reloads.

export const TRADE_TYPES = [
  'Labourer',
  'Builder',
  'Carpenter',
  'Bricklayer',
  'Plasterer',
  'Electrician',
  'Plumber',
  'Decorator',
  'Roofer',
] as const

export type TradeType = typeof TRADE_TYPES[number]

export interface TradeRate {
  trade: TradeType
  dayRate: number   // £ per day
  hourRate: number  // £ per hour
}

/** One trade line within a phase's Labour Trades panel */
export interface LabourTrade {
  id: string
  trade: string          // one of TRADE_TYPES
  qty: number            // number of days (or hours)
  unit: 'day' | 'hr'
  costRate: number       // £/day or £/hr (pulled from defaults, overridable)
  markup: number         // % markup applied to this trade's cost
  // Calculated fields (always in sync via calcLabourTrade)
  cost: number           // qty × costRate
  markupAmount: number   // cost × markup / 100
  quotePrice: number     // cost + markupAmount  (sell price, ex VAT)
}

// ── Built-in default rates ────────────────────────────────────────────────────
export const BUILT_IN_TRADE_RATES: TradeRate[] = [
  { trade: 'Labourer',    dayRate: 180, hourRate: 22 },
  { trade: 'Builder',     dayRate: 250, hourRate: 31 },
  { trade: 'Carpenter',   dayRate: 280, hourRate: 35 },
  { trade: 'Bricklayer',  dayRate: 280, hourRate: 35 },
  { trade: 'Plasterer',   dayRate: 270, hourRate: 34 },
  { trade: 'Electrician', dayRate: 350, hourRate: 44 },
  { trade: 'Plumber',     dayRate: 350, hourRate: 44 },
  { trade: 'Decorator',   dayRate: 230, hourRate: 29 },
  { trade: 'Roofer',      dayRate: 290, hourRate: 36 },
]

// ── localStorage persistence (Back Office overrides) ─────────────────────────
const STORAGE_KEY = 'sbc_trade_rates'

export function loadTradeRates(): TradeRate[] {
  if (typeof window === 'undefined') return BUILT_IN_TRADE_RATES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TradeRate>[]
      // Merge stored rates with built-ins so new trades added to TRADE_TYPES are never missing
      const map = new Map(parsed.map(r => [r.trade, r]))
      return TRADE_TYPES.map(trade => {
        const stored = map.get(trade)
        const builtin = BUILT_IN_TRADE_RATES.find(d => d.trade === trade)!
        return {
          trade,
          dayRate:  stored?.dayRate  ?? builtin.dayRate,
          hourRate: stored?.hourRate ?? builtin.hourRate,
        }
      })
    }
  } catch { /* ignore parse errors */ }
  return BUILT_IN_TRADE_RATES
}

export function saveTradeRatesToStorage(rates: TradeRate[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates))
  }
}

/** Get default rate for a given trade + unit from stored/built-in defaults */
export function getDefaultCostRate(trade: string, unit: 'day' | 'hr'): number {
  const rates = loadTradeRates()
  const found = rates.find(r => r.trade === trade)
  if (!found) return 0
  return unit === 'day' ? found.dayRate : found.hourRate
}

// ── Trade calculation ─────────────────────────────────────────────────────────
export function calcLabourTrade(t: LabourTrade): LabourTrade {
  const cost         = +(t.qty * t.costRate).toFixed(2)
  const markupAmount = +(cost * t.markup / 100).toFixed(2)
  const quotePrice   = +(cost + markupAmount).toFixed(2)
  return { ...t, cost, markupAmount, quotePrice }
}

/** Sum of quotePrice across all trades (the charged sell amount) */
export function labourTradesTotal(trades: LabourTrade[]): number {
  return +trades.reduce((s, t) => s + t.quotePrice, 0).toFixed(2)
}

/** Sum of cost across all trades */
export function labourTradesCostTotal(trades: LabourTrade[]): number {
  return +trades.reduce((s, t) => s + t.cost, 0).toFixed(2)
}
