// ── Labour trade types & rates ───────────────────────────────────────────────
// Standard working day = 8 hours.
// Day rate is the MASTER rate; half-day and hourly are derived from it.
//   Hourly   = Day ÷ 8
//   Half-Day = Day ÷ 2  (or manually overridden in Back Office)
//
// Back Office overrides are persisted to localStorage.
// Default rates are UK market 2024–25 (London / South East).

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
export type LabourUnit = 'day' | 'half-day' | 'hr'

export const LABOUR_UNIT_OPTIONS: { value: LabourUnit; label: string; short: string }[] = [
  { value: 'day',      label: 'Days',      short: 'day'  },
  { value: 'half-day', label: 'Half Days', short: 'half' },
  { value: 'hr',       label: 'Hours',     short: 'hr'   },
]

// ── Back Office trade rate config ─────────────────────────────────────────────
export interface TradeRate {
  trade: TradeType
  /** PRIMARY master rate (£/day). All other rates are derived from this. */
  dayRate: number
  /** Manually-set half-day rate. When absent, auto-calculated as dayRate ÷ 2. */
  halfDayRateOverride?: number
  /** Default markup % applied when this trade is first added to a phase. */
  defaultMarkup: number
}

// ── Derived helpers (never stored) ───────────────────────────────────────────
/** Hourly rate = Day rate ÷ 8 */
export function getHourlyRate(dayRate: number): number {
  return +(dayRate / 8).toFixed(2)
}

/** Half-day rate = Day rate ÷ 2, unless manually overridden */
export function getHalfDayRate(dayRate: number, halfDayRateOverride?: number): number {
  return halfDayRateOverride != null
    ? halfDayRateOverride
    : +(dayRate / 2).toFixed(2)
}

/** Rate for a given unit, derived from the master day rate */
export function getUnitRate(dayRate: number, unit: LabourUnit, halfDayRateOverride?: number): number {
  switch (unit) {
    case 'day':      return dayRate
    case 'half-day': return getHalfDayRate(dayRate, halfDayRateOverride)
    case 'hr':       return getHourlyRate(dayRate)
  }
}

// ── LabourTrade — one trade line within a phase ───────────────────────────────
export interface LabourTrade {
  id: string
  trade: string
  qty: number
  unit: LabourUnit
  /** Snapshot of the Back Office default day rate when this trade was added. */
  defaultDayRate: number
  /** Effective day rate for this quote. May differ from defaultDayRate if overridden. */
  dayRate: number
  /** True when dayRate has been changed from defaultDayRate for this quote. */
  isOverridden: boolean
  markup: number
  // Calculated — always updated by calcLabourTrade():
  unitRate: number       // £ per selected unit (day/half/hr)
  cost: number           // qty × unitRate
  markupAmount: number   // cost × markup / 100
  quotePrice: number     // cost + markupAmount  (sell price, ex VAT)
}

// ── Built-in defaults ─────────────────────────────────────────────────────────
export const BUILT_IN_TRADE_RATES: TradeRate[] = [
  { trade: 'Labourer',    dayRate: 160, defaultMarkup: 20 },
  { trade: 'Builder',     dayRate: 240, defaultMarkup: 20 },
  { trade: 'Carpenter',   dayRate: 280, defaultMarkup: 20 },
  { trade: 'Bricklayer',  dayRate: 280, defaultMarkup: 20 },
  { trade: 'Plasterer',   dayRate: 260, defaultMarkup: 20 },
  { trade: 'Electrician', dayRate: 320, defaultMarkup: 20 },
  { trade: 'Plumber',     dayRate: 320, defaultMarkup: 20 },
  { trade: 'Decorator',   dayRate: 220, defaultMarkup: 20 },
  { trade: 'Roofer',      dayRate: 280, defaultMarkup: 20 },
]

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'sbc_trade_rates'

export function loadTradeRates(): TradeRate[] {
  if (typeof window === 'undefined') return BUILT_IN_TRADE_RATES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TradeRate>[]
      const map    = new Map(parsed.map(r => [r.trade, r]))
      return TRADE_TYPES.map(trade => {
        const stored  = map.get(trade)
        const builtin = BUILT_IN_TRADE_RATES.find(d => d.trade === trade)!
        return {
          trade,
          dayRate:             stored?.dayRate             ?? builtin.dayRate,
          halfDayRateOverride: stored?.halfDayRateOverride,   // undefined = auto
          defaultMarkup:       stored?.defaultMarkup       ?? builtin.defaultMarkup,
        }
      })
    }
  } catch { /* ignore */ }
  return BUILT_IN_TRADE_RATES
}

export function saveTradeRatesToStorage(rates: TradeRate[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates))
  }
}

/** Full TradeRate for a given trade name. Falls back to a safe zero-rate default. */
export function getDefaultTradeRate(trade: string): TradeRate {
  const rates = loadTradeRates()
  return (
    rates.find(r => r.trade === trade) ?? {
      trade: trade as TradeType,
      dayRate: 0,
      defaultMarkup: 20,
    }
  )
}

// ── Calculation ───────────────────────────────────────────────────────────────
export function calcLabourTrade(t: LabourTrade): LabourTrade {
  const unitRate     = getUnitRate(t.dayRate, t.unit)
  const cost         = +(t.qty * unitRate).toFixed(2)
  const markupAmount = +(cost * t.markup / 100).toFixed(2)
  const quotePrice   = +(cost + markupAmount).toFixed(2)
  return {
    ...t,
    unitRate,
    isOverridden: t.dayRate !== t.defaultDayRate,
    cost,
    markupAmount,
    quotePrice,
  }
}

/**
 * Migrate a LabourTrade saved in the old format (costRate field, no dayRate /
 * defaultDayRate). Safe to call on already-migrated records.
 */
export function migrateLabourTrade(
  raw: Partial<LabourTrade> & { costRate?: number },
): LabourTrade {
  const dayRate = raw.dayRate ?? raw.costRate ?? 0
  const unit: LabourUnit =
    raw.unit === 'half-day' ? 'half-day' :
    raw.unit === 'hr'       ? 'hr'       :
    'day'
  return calcLabourTrade({
    id:             raw.id    ?? `trade-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    trade:          raw.trade ?? 'Builder',
    qty:            raw.qty   ?? 1,
    unit,
    defaultDayRate: raw.defaultDayRate ?? dayRate,
    dayRate,
    isOverridden:   false,
    markup:         raw.markup ?? 20,
    unitRate: 0, cost: 0, markupAmount: 0, quotePrice: 0,
  })
}

export function labourTradesTotal(trades: LabourTrade[]): number {
  return +trades.reduce((s, t) => s + t.quotePrice, 0).toFixed(2)
}

export function labourTradesCostTotal(trades: LabourTrade[]): number {
  return +trades.reduce((s, t) => s + t.cost, 0).toFixed(2)
}

// ── TaskLabourLine — per-task labour allocation (cost only, no markup) ────────
// Used inside individual EstimatorItems.  Global quote markup is applied later
// by calcPhaseSell — these lines intentionally carry no per-line markup.
export interface TaskLabourLine {
  id: string
  trade: string
  qty: number
  unit: LabourUnit
  /** Back Office default day rate at time of creation. */
  defaultDayRate: number
  /** Effective day rate for this task line (may be overridden). */
  dayRate: number
  /** True when dayRate !== defaultDayRate. */
  isOverridden: boolean
  /** Derived: £ per selected unit */
  unitRate: number
  /** Derived: qty × unitRate  (cost, no markup) */
  total: number
}

export function calcTaskLabourLine(l: TaskLabourLine): TaskLabourLine {
  const unitRate = getUnitRate(l.dayRate, l.unit)
  const total    = +(l.qty * unitRate).toFixed(2)
  return {
    ...l,
    unitRate,
    isOverridden: l.dayRate !== l.defaultDayRate,
    total,
  }
}

/**
 * Migrate a TaskLabourLine saved in an old format (costRate field, missing
 * fields).  Safe to call on already-valid records.
 */
export function migrateTaskLabourLine(
  raw: Partial<TaskLabourLine> & { costRate?: number },
): TaskLabourLine {
  const dayRate = raw.dayRate ?? raw.costRate ?? 0
  const unit: LabourUnit =
    raw.unit === 'half-day' ? 'half-day' :
    raw.unit === 'hr'       ? 'hr'       :
    'day'
  return calcTaskLabourLine({
    id:             raw.id    ?? `task-trade-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    trade:          raw.trade ?? 'Builder',
    qty:            raw.qty   ?? 1,
    unit,
    defaultDayRate: raw.defaultDayRate ?? dayRate,
    dayRate,
    isOverridden:   false,
    unitRate:       0,
    total:          0,
  })
}

export function taskLabourLinesTotal(lines: TaskLabourLine[]): number {
  return +lines.reduce((s, l) => s + l.total, 0).toFixed(2)
}
