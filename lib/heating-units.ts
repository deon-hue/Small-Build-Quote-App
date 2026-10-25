// A heating plant priced itemised: the heat source (so far a gas combi boiler), its flue, the installer's fitting and commissioning, controls, a magnetic filter, flushing the system, the pipework that
// moves with a boiler (gas, flow and return, condensate), and taking the old boiler away. Each part is its own priced line, all editable. Radiators and towel rails are NOT here: they are counted room by room in
// the Plumbing Installation calculator. Counts and prices only: the boiler size and the heat loss are the heating engineer's to confirm, and the work must be done and commissioned by a Gas Safe registered
// engineer. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the
// quantity. All rates are samples to be checked against real prices.

export type HeatSource = 'combi'
export const HEAT_SOURCE_LABEL: Record<HeatSource, string> = { combi: 'Gas combi boiler' }

/** Combi boiler sizes: the unit's price (sample, supplied) by output. */
export const BOILER_SIZES: { kw: number; label: string; price: number; suits: string }[] = [
  { kw: 24, label: '24kW combi', price: 850, suits: 'one bathroom, up to about 8 radiators' },
  { kw: 28, label: '28kW combi', price: 950, suits: 'one or two bathrooms, up to about 12 radiators' },
  { kw: 30, label: '30kW combi', price: 1050, suits: 'two bathrooms, up to about 15 radiators' },
  { kw: 35, label: '35kW combi', price: 1200, suits: 'larger homes with one shower running at a time' },
]

export type FitMode = 'replace' | 'relocate'
export const FIT_LABEL: Record<FitMode, string> = {
  replace: 'Replace the existing boiler where it is',
  relocate: 'New position (pipework, flue and gas run to be moved)',
}
/** the installer's fitting charge, £ (a Gas Safe engineer, all in: connecting, testing, filling), by job */
export const FIT_RATE: Record<FitMode, number> = { replace: 650, relocate: 950 }

export type FlueKind = 'horizontal' | 'vertical' | 'existing'
export const FLUE_LABEL: Record<FlueKind, string> = {
  horizontal: 'Horizontal flue through an external wall',
  vertical: 'Vertical flue through the roof',
  existing: 'Existing flue reused',
}
export const FLUE_KIT: Record<FlueKind, number> = { horizontal: 85, vertical: 210, existing: 0 }
export const PLUME_KIT = 120
export const CORE_DRILL = 95

export type ControlsKind = 'none' | 'programmer' | 'smart'
export const CONTROLS_LABEL: Record<ControlsKind, string> = { none: 'None (existing controls reused)', programmer: 'Programmable room thermostat', smart: 'Smart thermostat' }
export const CONTROLS_PRICE: Record<ControlsKind, number> = { none: 0, programmer: 70, smart: 190 }

export const FILTER_PRICE = 85            // magnetic system filter
export const FLUSH_ITEM = 120             // chemical clean and inhibitor, per system
export const FLUSH_PER_RADIATOR = 10
export const REMOVE_OLD = 120             // taking the old boiler away and disposing of it
export const COMMISSION_FEE = 85          // commissioning, benchmark certificate and Building Regulations notification
export const CONDENSATE_PUMP = 110
export const PIPE_PER_LM = { gas: 14, heating: 9, condensate: 6 }

export interface HeatingInput {
  source: HeatSource
  boilerKw: number
  fit: FitMode
  flue: FlueKind
  /** a new hole through the wall: core drilling and making good */
  coreDrill: boolean
  plumeKit: boolean
  controls: ControlsKind
  magneticFilter: boolean
  flush: boolean
  /** radiators on the system, for the flush (set from the plumbing rooms by hand) */
  radiators: number
  removeOld: boolean
  commission: boolean
  condensatePump: boolean
  /** pipework moved or added with the boiler, lm */
  gasPipeLm: number
  heatingPipeLm: number
  condensateLm: number
  /** who buys the boiler: 'us' (the default) prices it, 'client' leaves it out and prices only the fitting */
  boilerSupply?: 'us' | 'client'
  /** the boiler chosen from the product list: its name and our cost replace the sample price for the size */
  boilerProduct?: { name: string; cost: number }
}

export interface HeatingLine { id: string; name: string; category: 'subcontractors' | 'materials'; unit: string; unitCost: number; qty: number }

export interface HeatingResult { lines: HeatingLine[]; warnings: string[]; boilerLabel: string }

const money = (n: number) => +n.toFixed(2)

export function calculateHeating(i: HeatingInput, rates: Record<string, number> = {}): HeatingResult {
  const size = BOILER_SIZES.find(b => b.kw === i.boilerKw)
  if (!size) throw new Error('Choose the boiler size.')
  for (const [k, v] of Object.entries({ radiators: i.radiators, gasPipeLm: i.gasPipeLm, heatingPipeLm: i.heatingPipeLm, condensateLm: i.condensateLm })) {
    if (!(v >= 0)) throw new Error(`The ${k === 'radiators' ? 'number of radiators' : 'pipework length'} cannot be negative.`)
  }
  const rate = (id: string, base: number) => rates[id] ?? base
  const L: HeatingLine[] = []
  const add = (id: string, name: string, category: HeatingLine['category'], unit: string, base: number, qty: number) => { if (qty > 0) L.push({ id, name, category, unit, unitCost: money(rate(id, base)), qty }) }
  const warnings: string[] = ['The work must be done, tested and commissioned by a Gas Safe registered engineer. The boiler size comes from a heat loss calculation: the engineer confirms it.']

  if ((i.boilerSupply ?? 'us') === 'us') {
    if (i.boilerProduct && i.boilerProduct.cost > 0) add('boiler', `${i.boilerProduct.name} (supplied)`, 'materials', 'nr', i.boilerProduct.cost, 1)
    else add('boiler', `${size.label} gas boiler (supplied)`, 'materials', 'nr', size.price, 1)
  }
  add('fit', `Fit the boiler: ${i.fit === 'replace' ? 'replace the existing boiler' : 'new position'} (Gas Safe engineer, connect, test, fill)`, 'subcontractors', 'item', FIT_RATE[i.fit], 1)
  if (i.flue !== 'existing') add('flue', `${FLUE_LABEL[i.flue]}: flue kit`, 'materials', 'nr', FLUE_KIT[i.flue], 1)
  if (i.coreDrill) add('core', 'Core drill the wall and make good', 'subcontractors', 'item', CORE_DRILL, 1)
  if (i.plumeKit) add('plume', 'Plume management kit', 'materials', 'nr', PLUME_KIT, 1)
  if (i.controls !== 'none') add('controls', `${CONTROLS_LABEL[i.controls]} (supplied)`, 'materials', 'nr', CONTROLS_PRICE[i.controls], 1)
  if (i.magneticFilter) add('filter', 'Magnetic system filter', 'materials', 'nr', FILTER_PRICE, 1)
  if (i.flush) {
    add('flush', 'Chemical clean of the system and inhibitor', 'materials', 'item', FLUSH_ITEM, 1)
    add('flush-rad', 'Chemical clean: for each radiator', 'subcontractors', 'nr', FLUSH_PER_RADIATOR, i.radiators)
  }
  if (i.condensatePump) add('cond-pump', 'Condensate pump', 'materials', 'nr', CONDENSATE_PUMP, 1)
  add('gas-pipe', 'Gas pipework moved or added', 'materials', 'lm', PIPE_PER_LM.gas, i.gasPipeLm)
  add('heating-pipe', 'Flow and return pipework moved or added', 'materials', 'lm', PIPE_PER_LM.heating, i.heatingPipeLm)
  add('condensate', 'Condensate pipe run', 'materials', 'lm', PIPE_PER_LM.condensate, i.condensateLm)
  if (i.removeOld) add('remove', 'Remove and dispose of the old boiler', 'subcontractors', 'item', REMOVE_OLD, 1)
  if (i.commission) add('commission', 'Commissioning, benchmark certificate and Building Regulations notification', 'subcontractors', 'item', COMMISSION_FEE, 1)
  else warnings.push('No commissioning and benchmark certificate is included: a new boiler needs one, and Building Control must be notified by a Gas Safe engineer.')
  if (i.fit === 'relocate' && i.gasPipeLm === 0) warnings.push('A boiler in a new position usually needs gas pipework: add the length under Pipework.')
  if (i.fit === 'relocate' && i.flue === 'existing') warnings.push('A boiler in a new position needs its own flue: choose horizontal or vertical.')
  if (i.flue === 'horizontal' && !i.coreDrill && i.fit === 'relocate') warnings.push('A new horizontal flue needs a hole through the wall: tick core drilling.')
  warnings.push('The electrical connection (a fused spur), the radiators and towel rails (priced in the Plumbing Installation rooms) and any new cylinder or heat pump are not in this price.')
  return { lines: L, warnings, boilerLabel: i.boilerProduct?.name.trim() || size.label }
}

export function heatingSubtotal(lines: HeatingLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
