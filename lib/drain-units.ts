// Underground drainage priced by the run (Drainage & Services → Underground Drainage (by run)). Each run is a length of drain with a use (foul, surface water or combined), a pipe size, an average
// trench depth, how it is dug (machine or by hand) and what it crosses (soft ground, block paving, tarmac or concrete). From that it works out the trench (volume dug, by machine or by hand, and the machine days),
// the pipe, the granular bed and surround, the backfill and the soil taken away, trench support where it is deep, and putting the surface back. Chambers and manholes, rodding eyes, connections to an
// existing drain or the sewer and a CCTV survey are counted separately for the job. Counts and prices only: falls, sizes, depths and any work to a public sewer are the drainage designer's and the water company's.
// Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity.
// All rates are samples to be checked against real prices.

export type DrainUse = 'foul' | 'surface' | 'combined'
export const DRAIN_USE_LABEL: Record<DrainUse, string> = { foul: 'Foul water', surface: 'Surface water', combined: 'Combined' }

export const DRAIN_SIZES_MM = [110, 160, 225]
/** pipe outside diameter, m, trench width, m, and the pipe's price per metre, £ (supplied, with its share of bends and junctions) */
export const DRAIN_PIPE: Record<number, { od: number; trench: number; perLm: number }> = {
  110: { od: 0.11, trench: 0.6, perLm: 6.5 },
  160: { od: 0.16, trench: 0.7, perLm: 16 },
  225: { od: 0.225, trench: 0.8, perLm: 34 },
}
export const BED_BELOW_M = 0.1
export const SURROUND_ABOVE_M = 0.15

export type DigMethod = 'machine' | 'hand'
export type Surface = 'soft' | 'paving' | 'tarmac' | 'concrete'
export const SURFACE_LABEL: Record<Surface, string> = {
  soft: 'Soft ground (grass, soil, planting)', paving: 'Block paving or slabs (lifted and relaid)', tarmac: 'Tarmac', concrete: 'Concrete',
}
/** putting the surface back, materials £ per m² of the trench width */
export const REINSTATE_PER_M2: Record<Surface, number> = { soft: 3, paving: 8, tarmac: 35, concrete: 48 }

export const GRAVEL_PER_M3 = 42
export const IMPORTED_BACKFILL_PER_M3 = 44
export const MUCKAWAY_PER_M3 = 28
export const SPOIL_BULKING = 1.3
export const MACHINE_M3_PER_DAY = 30
export const SUPPORT_DEPTH_M = 1.2
export const SUPPORT_LM_PER_DAY = 15
export const SUPPORT_PER_DAY = 60

export type ChamberKind = 'ic-shallow' | 'ic-deep' | 'manhole' | 'rodding-eye'
export interface ChamberInfo { label: string; each: number }
export const CHAMBERS: Record<ChamberKind, ChamberInfo> = {
  'ic-shallow': { label: 'Inspection chamber, shallow (450mm, up to about 0.6m deep) with cover', each: 180 },
  'ic-deep': { label: 'Inspection chamber, deeper (450mm with extension, up to about 1.2m) with cover', each: 320 },
  manhole: { label: 'Manhole (concrete rings, 1050mm, up to about 3m) with cover and steps', each: 1100 },
  'rodding-eye': { label: 'Rodding eye with access cap', each: 35 },
}
export const CONNECT_EXISTING_EACH = 250   // cutting a junction into an existing drain
export const CONNECT_SEWER_EACH = 1200     // a connection to the public sewer: a provisional sum, the water company's charges and approval are separate
export const CCTV_EACH = 280

export interface DrainRun {
  id: string
  name: string
  use: DrainUse
  size: number
  lengthM: number
  /** average trench depth, mm */
  depthMm: number
  dig: DigMethod
  surface: Surface
}

export interface DrainInput {
  runs: DrainRun[]
  chambers: Record<ChamberKind, number>
  connectExisting: number
  connectSewer: number
  cctv: boolean
  /** take all the soil away and bring in granular backfill, instead of backfilling with what came out */
  importBackfill: boolean
}

export interface DrainLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number; runId?: string; wastePct?: number }

export interface DrainResult {
  lines: DrainLine[]
  totalLm: number
  machineM3: number
  handM3: number
  /** days the machine is digging (the screen turns this into days on site) */
  excavatorDays: number
  gravelM3: number
  backfillM3: number
  spoilAwayM3: number
  supportDays: number
  reinstateM2: Record<Surface, number>
  chamberCount: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateDrain(i: DrainInput): DrainResult {
  const lines: DrainLine[] = []
  const warnings: string[] = []
  const reinstateM2: Record<Surface, number> = { soft: 0, paving: 0, tarmac: 0, concrete: 0 }
  let totalLm = 0, machineM3 = 0, handM3 = 0, gravelM3 = 0, backfillM3 = 0, spoilM3 = 0, supportLm = 0

  for (const r of i.runs) {
    const rn = r.name.trim() || `${DRAIN_USE_LABEL[r.use]} drain`
    if (!(r.lengthM >= 0) || !(r.depthMm >= 0)) throw new Error(`The length and depth of "${rn}" cannot be negative.`)
    if (r.lengthM === 0) continue
    const pipe = DRAIN_PIPE[r.size]
    if (!pipe) throw new Error(`There is no ${r.size}mm drain pipe here: choose ${DRAIN_SIZES_MM.join(', ')}mm.`)
    if (!(r.depthMm >= 300)) throw new Error(`The depth of "${rn}" must be at least 300mm.`)
    const depth = r.depthMm / 1000
    const dugPerLm = pipe.trench * depth
    const gravelPerLm = Math.min(pipe.trench * (BED_BELOW_M + pipe.od + SURROUND_ABOVE_M), dugPerLm)
    const dig = dugPerLm * r.lengthM
    const gravel = gravelPerLm * r.lengthM
    const backfill = Math.max(dig - gravel, 0)
    if (r.dig === 'machine') machineM3 += dig; else handM3 += dig
    gravelM3 += gravel
    backfillM3 += backfill
    spoilM3 += i.importBackfill ? dig : gravel
    totalLm += r.lengthM
    reinstateM2[r.surface] += pipe.trench * r.lengthM
    if (depth > SUPPORT_DEPTH_M) supportLm += r.lengthM
    if (depth > 1.5) warnings.push(`"${rn}" is about ${depth.toFixed(1)}m deep: a trench that deep must be supported or battered back, with a risk assessment, and a drain this deep may need a different design.`)
    if (depth < 0.45 && r.size === 110) warnings.push(`"${rn}" is only ${r.depthMm}mm deep: pipes with so little cover need protecting (concrete surround or a rigid cover) where they could be driven over.`)
    lines.push({ id: `pipe|${r.id}`, name: `${rn} — ${r.size}mm uPVC drain pipe and fittings (${DRAIN_USE_LABEL[r.use].toLowerCase()})`, category: 'materials', unit: 'lm', unitCost: pipe.perLm, qty: r.lengthM, wastePct: 5, runId: r.id })
    lines.push({ id: `gravel|${r.id}`, name: `${rn} — granular bed and surround (pea shingle or 10mm gravel)`, category: 'materials', unit: 'm³', unitCost: GRAVEL_PER_M3, qty: round2(gravel), wastePct: 5, runId: r.id })
    lines.push({ id: `reinstate|${r.id}`, name: `${rn} — reinstate the surface: ${SURFACE_LABEL[r.surface].toLowerCase()}`, category: 'materials', unit: 'm²', unitCost: REINSTATE_PER_M2[r.surface], qty: round2(pipe.trench * r.lengthM), runId: r.id })
  }

  const excavatorDays = machineM3 > 0 ? Math.max(0.5, Math.round((machineM3 / MACHINE_M3_PER_DAY) * 2) / 2) : 0
  const supportDays = supportLm > 0 ? Math.max(0.5, Math.round((supportLm / SUPPORT_LM_PER_DAY) * 2) / 2) : 0
  const spoilAway = round2(spoilM3 * SPOIL_BULKING)
  if (spoilAway > 0) lines.push({ id: 'spoil', name: i.importBackfill ? 'Spoil carted away (all of it, grab lorry and tip, soil bulked up 30%)' : 'Surplus spoil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: spoilAway })
  if (i.importBackfill && backfillM3 > 0) lines.push({ id: 'backfill', name: 'Imported granular backfill, compacted in layers', category: 'materials', unit: 'm³', unitCost: IMPORTED_BACKFILL_PER_M3, qty: round2(backfillM3), wastePct: 10 })
  if (supportDays > 0) lines.push({ id: 'support', name: 'Trench support (box or sheets) hire, for the deeper runs', category: 'plant', unit: 'day', unitCost: SUPPORT_PER_DAY, qty: supportDays })

  let chamberCount = 0
  for (const k of Object.keys(CHAMBERS) as ChamberKind[]) {
    const n = i.chambers[k] ?? 0
    if (!(n >= 0)) throw new Error(`The number of ${CHAMBERS[k].label.split(' (')[0].toLowerCase()} cannot be negative.`)
    if (n === 0) continue
    chamberCount += n
    lines.push({ id: `chamber|${k}`, name: CHAMBERS[k].label, category: 'materials', unit: 'nr', unitCost: CHAMBERS[k].each, qty: n })
  }
  if (!(i.connectExisting >= 0) || !(i.connectSewer >= 0)) throw new Error('The connections cannot be negative.')
  if (i.connectExisting > 0) lines.push({ id: 'connect-existing', name: 'Connection to an existing drain (junction cut in and made good)', category: 'subcontractors', unit: 'nr', unitCost: CONNECT_EXISTING_EACH, qty: i.connectExisting })
  if (i.connectSewer > 0) {
    lines.push({ id: 'connect-sewer', name: 'Connection to the public sewer (provisional sum)', category: 'subcontractors', unit: 'nr', unitCost: CONNECT_SEWER_EACH, qty: i.connectSewer })
    warnings.push('A connection to the public sewer needs the water company\'s approval and charges, and is often done by them or an approved contractor: the figure is a provisional sum.')
  }
  if (i.cctv && totalLm > 0) lines.push({ id: 'cctv', name: 'CCTV survey of the new drain, with a report', category: 'subcontractors', unit: 'item', unitCost: CCTV_EACH, qty: 1 })

  if (totalLm === 0) warnings.push('No runs with a length yet. Add a run and give it a length and a depth.')
  warnings.push('The falls (about 1 in 40 to 1 in 80 for a 100mm foul drain), the sizes and the depths are the drainage designer\'s to confirm; Building Control inspect and test the drain before it is covered.')
  return { lines, totalLm: round1(totalLm), machineM3: round1(machineM3), handM3: round1(handM3), excavatorDays, gravelM3: round2(gravelM3), backfillM3: round2(backfillM3), spoilAwayM3: spoilAway, supportDays, reinstateM2, chamberCount, warnings }
}

export function drainSubtotal(lines: DrainLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost * (1 + (l.wastePct ?? 0) / 100), 0))
}
