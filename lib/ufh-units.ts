// Water underfloor heating priced zone by zone (Plumbing & Heating → Underfloor Heating). Each zone is a room (or part of one) with an area, how the pipe is laid (clipped to insulation in a screed, in
// overlay panels on an existing floor, or between joists with spreader plates), the pipe spacing and how far the zone is from the manifold. From that it works out the pipe (with the flow and return to
// the manifold), the loops (a 16mm loop is kept to about 100m), the floor fixing material, and the manifold, actuators, thermostats, mixing group, installer's fitting and commissioning. Every part is its own
// priced line, all editable. NOT here: the floor insulation, the edge strip and the screed over the pipes (priced in the Screeded Floor calculator, with a thinner liquid screed if wanted), the heat source (the Heating
// Plant calculator) and electric underfloor heating mats (Electrics). The heat loss and the layout are the UFH supplier's design to confirm. Self-contained (no cross-file runtime imports), so it can be hand-tested
// with plain Node; the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity. All rates are samples to be checked against real prices.

export type UfhFloor = 'screed' | 'overlay' | 'joisted'

export interface UfhFloorInfo { label: string; /** floor fixing material, £ per m² of floor */ fixing: number; fixingName: string; /** installer's fitting, £ per m² */ fitRate: number }

export const UFH_FLOORS: Record<UfhFloor, UfhFloorInfo> = {
  screed: { label: 'In a screed (pipe clipped to insulation)', fixing: 2.1, fixingName: 'Pipe clip rail or staple tape', fitRate: 16 },
  overlay: { label: 'Overlay panels on an existing floor (low profile)', fixing: 34, fixingName: 'Pre-routed overlay panels with diffusion plates', fitRate: 20 },
  joisted: { label: 'Between timber joists (spreader plates)', fixing: 9.5, fixingName: 'Aluminium spreader plates', fitRate: 22 },
}

export const SPACINGS_MM = [100, 150, 200, 300]
export const PIPE_PER_M = 0.85            // 16mm multilayer or PE-RT pipe
export const PIPE_WASTE = 1.05
export const MAX_LOOP_M = 100
export const MANIFOLD_BASE = 40
export const MANIFOLD_PER_PORT = 42
export const MANIFOLD_MAX_PORTS = 12
export const ACTUATOR_EACH = 28           // one per loop
export const THERMOSTAT_EACH = 48         // one per zone
export const WIRING_CENTRE_EACH = 95      // one per manifold
export const MIXING_GROUP_EACH = 320      // blending valve and pump, one per manifold
export const MANIFOLD_FIT_EACH = 280      // installer: mount the manifold, connect flow and return, fill and vent
export const COMMISSION_EACH = 120        // pressure test, balance and heat-up, per manifold

export interface UfhZone {
  id: string
  name: string
  areaM2: number
  floor: UfhFloor
  spacingMm: number
  /** how far the zone is from the manifold, m (the run each way) */
  distanceM: number
  /** the room on the Take-off plan this zone was made from: its area follows the plan until typed over */
  planRoomId?: string
  /** the area (and name) last taken from the Take-off plan; `drawing` = it came from the area drawn for this calculator, not from a room */
  fromPlan?: { areaM2: number; name: string; drawing?: boolean }
}

export interface UfhInput {
  zones: UfhZone[]
  /** a mixing group (blending valve and pump) per manifold: needed when the boiler runs hotter than the floor */
  mixingGroup: boolean
  /** manifolds, or null to work out from the loops */
  manifoldsOverride: number | null
  commission: boolean
}

export interface UfhLine { id: string; name: string; category: 'subcontractors' | 'materials'; unit: string; unitCost: number; qty: number; roomId?: string }

export interface UfhZoneSummary { zoneId: string; name: string; areaM2: number; pipeM: number; loops: number; loopM: number; outputWM2: number }

export interface UfhResult {
  lines: UfhLine[]
  zoneSummaries: UfhZoneSummary[]
  totalAreaM2: number
  totalPipeM: number
  totalLoops: number
  manifolds: number
  portsPerManifold: number[]
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Rough output for a floor at this spacing, W/m² (a guide only: the real figure depends on the floor covering, water temperature and room). */
export function outputGuide(spacingMm: number): number {
  return spacingMm <= 100 ? 100 : spacingMm <= 150 ? 85 : spacingMm <= 200 ? 70 : 55
}

/** How many loops a zone needs: each is kept to about 100m of pipe including its own flow and return to the manifold. The calculator and the picture on the Take-off plan both use this. */
export function ufhLoopCount(areaM2: number, spacingMm: number, distanceM: number): number {
  if (!(areaM2 > 0) || !(spacingMm > 0)) return 1
  const pipeInZone = areaM2 * (1000 / spacingMm) * PIPE_WASTE
  let loops = 1
  while ((pipeInZone / loops) + 2 * Math.max(0, distanceM) > MAX_LOOP_M && loops < 40) loops++
  return loops
}

export function calculateUfh(i: UfhInput): UfhResult {
  const warnings: string[] = []
  const lines: UfhLine[] = []
  const zoneSummaries: UfhZoneSummary[] = []
  let totalArea = 0, totalPipe = 0, totalLoops = 0
  const zoneCount = i.zones.filter(z => z.areaM2 > 0).length

  for (const z of i.zones) {
    const zn = z.name.trim() || 'Zone'
    if (!(z.areaM2 >= 0) || !(z.distanceM >= 0)) throw new Error(`The area and distance for ${zn} cannot be negative.`)
    if (!(z.spacingMm >= 50 && z.spacingMm <= 400)) throw new Error(`The pipe spacing for ${zn} must be between 50mm and 400mm.`)
    if (z.areaM2 === 0) continue
    const info = UFH_FLOORS[z.floor]
    const pipeInZone = z.areaM2 * (1000 / z.spacingMm) * PIPE_WASTE
    // each loop is kept to about 100m including its own flow and return to the manifold
    const loops = ufhLoopCount(z.areaM2, z.spacingMm, z.distanceM)
    const pipe = pipeInZone + 2 * z.distanceM * loops
    const loopM = pipe / loops
    if (2 * z.distanceM >= MAX_LOOP_M) warnings.push(`${zn} is ${z.distanceM}m from the manifold: the flow and return alone use the whole loop. Move the manifold nearer.`)
    if (z.spacingMm > 200) warnings.push(`${zn}: pipe at ${z.spacingMm}mm centres gives a low output (about ${outputGuide(z.spacingMm)}W/m²): fine for a well insulated room only.`)
    totalArea += z.areaM2; totalPipe += pipe; totalLoops += loops
    zoneSummaries.push({ zoneId: z.id, name: zn, areaM2: z.areaM2, pipeM: round1(pipe), loops, loopM: round1(loopM), outputWM2: outputGuide(z.spacingMm) })
    lines.push({ id: `pipe|${z.id}`, name: `${zn} — 16mm underfloor heating pipe (${loops} loop${loops === 1 ? '' : 's'}, ${z.spacingMm}mm centres)`, category: 'materials', unit: 'm', unitCost: PIPE_PER_M, qty: round1(pipe), roomId: z.id })
    lines.push({ id: `fix|${z.id}|${z.floor}`, name: `${zn} — ${info.fixingName}`, category: 'materials', unit: 'm²', unitCost: info.fixing, qty: z.areaM2, roomId: z.id })
    lines.push({ id: `fit|${z.id}`, name: `${zn} — lay the pipe (${info.label.split(' (')[0].toLowerCase()})`, category: 'subcontractors', unit: 'm²', unitCost: info.fitRate, qty: z.areaM2, roomId: z.id })
    lines.push({ id: `actuators|${z.id}`, name: `${zn} — manifold actuators, one per loop`, category: 'materials', unit: 'nr', unitCost: ACTUATOR_EACH, qty: loops, roomId: z.id })
    lines.push({ id: `stat|${z.id}`, name: `${zn} — room thermostat`, category: 'materials', unit: 'nr', unitCost: THERMOSTAT_EACH, qty: 1, roomId: z.id })
  }

  // manifolds: as many as the loops need, each up to 12 ports, the loops shared out evenly
  const auto = totalLoops === 0 ? 0 : Math.ceil(totalLoops / MANIFOLD_MAX_PORTS)
  const manifolds = i.manifoldsOverride !== null ? Math.max(0, Math.round(i.manifoldsOverride)) : auto
  const portsPerManifold: number[] = []
  if (manifolds > 0) {
    const base = Math.floor(totalLoops / manifolds), extra = totalLoops % manifolds
    for (let m = 0; m < manifolds; m++) portsPerManifold.push(Math.max(2, base + (m < extra ? 1 : 0)))
    portsPerManifold.forEach((p, m) => {
      if (p > MANIFOLD_MAX_PORTS) warnings.push(`Manifold ${m + 1} needs ${p} ports: add another manifold.`)
      lines.push({ id: `manifold|${m}`, name: `Manifold ${manifolds > 1 ? m + 1 + ' ' : ''}— ${p} ports, with flow meters and valves`, category: 'materials', unit: 'nr', unitCost: money(MANIFOLD_BASE + MANIFOLD_PER_PORT * p), qty: 1 })
    })
    lines.push({ id: 'wiring', name: 'Wiring centre for the zone thermostats and actuators', category: 'materials', unit: 'nr', unitCost: WIRING_CENTRE_EACH, qty: manifolds })
    if (i.mixingGroup) lines.push({ id: 'mixing', name: 'Mixing group (blending valve and pump)', category: 'materials', unit: 'nr', unitCost: MIXING_GROUP_EACH, qty: manifolds })
    lines.push({ id: 'manifold-fit', name: 'Fit the manifold, connect the flow and return, fill and vent', category: 'subcontractors', unit: 'nr', unitCost: MANIFOLD_FIT_EACH, qty: manifolds })
    if (i.commission) lines.push({ id: 'commission', name: 'Pressure test, balance and first heat-up', category: 'subcontractors', unit: 'nr', unitCost: COMMISSION_EACH, qty: manifolds })
    else warnings.push('No pressure test and commissioning is included. The pipe must be pressure tested before the screed is poured.')
  }

  if (zoneCount === 0) warnings.push('No zones with an area yet. Add a zone and give it an area.')
  warnings.push('Not in this price: the floor insulation, edge strip and the screed over the pipes (Screeded Floor calculator), the heat source, and the floor covering. The supplier designs the layout and confirms the output.')
  return { lines, zoneSummaries, totalAreaM2: round1(totalArea), totalPipeM: round1(totalPipe), totalLoops, manifolds, portsPerManifold, warnings }
}

export function ufhSubtotal(lines: UfhLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
