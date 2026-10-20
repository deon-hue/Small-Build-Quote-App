// What the AI quote can hand to the three Drainage & Services calculators (Underground Drainage by run, Soakaway & Rainwater, Services Connections): the runs, areas and connections the
// scope describes, checked here and turned into each calculator's own inputs. Only what the scope says: a run with no stated length is left out (never an invented one), a soakaway is only sized
// from a roof or paved area (or a storage volume) the scope states, and anything the calculator's standard filled in (trench depth, soakaway kind...) is reported so the estimator checks it.
// Pure (apart from the calculators' own tables), so it can be tested with a loader that resolves the extension-less imports.

import { DRAIN_SIZES_MM, DRAIN_USE_LABEL, SURFACE_LABEL as DRAIN_SURFACE_LABEL, CHAMBERS, type DrainRun, type DrainUse, type DigMethod, type Surface, type ChamberKind } from './drain-units'
import { SOAKAWAY_KINDS, type SoakawayKind } from './soakaway-units'
import { UTILITIES, WORK_LABEL, type ServiceItem, type Utility, type ServiceWork } from './services-units'
import { isObj, whole, between, str } from './ai-spec'

let seq = 0
const digOf = (v: unknown): DigMethod => (v === 'hand' ? 'hand' : 'machine')
const surfaceOf = (v: unknown): Surface => (typeof v === 'string' && v in DRAIN_SURFACE_LABEL ? (v as Surface) : 'soft')

// ── Underground drainage, by run ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiDrain {
  runs: DrainRun[]
  chambers: Record<ChamberKind, number>
  connectExisting: number
  connectSewer: number
  cctv: boolean
  importBackfill: boolean
  /** what the scope did not say, so the calculator's standard was used: for the review note */
  assumed: string[]
}

const CHAMBER_KINDS = Object.keys(CHAMBERS) as ChamberKind[]

export function drainFromScope(spec: unknown): AiDrain | null {
  if (!isObj(spec)) return null
  const runs: DrainRun[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.runs) ? spec.runs.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const len = between(raw.lengthM, 0, 500)
    if (len === null) continue   // never invent a length: a run with no stated length is left out
    const use: DrainUse = typeof raw.use === 'string' && raw.use in DRAIN_USE_LABEL ? (raw.use as DrainUse) : 'foul'
    const sizeRaw = whole(raw.size, 50, 400)
    const size = sizeRaw !== null && DRAIN_SIZES_MM.includes(sizeRaw) ? sizeRaw : 110
    const name = str(raw.name, 60)
    const d = between(raw.depthMm, 299, 6000)
    runs.push({ id: 'ai-run-' + ++seq, name, use, size, lengthM: len, depthMm: d !== null ? d : 900, dig: digOf(raw.dig), surface: surfaceOf(raw.surface) })
    if (d === null) assumed.push(`${name || `${DRAIN_USE_LABEL[use].toLowerCase()} drain`}: 900mm average trench depth`)
  }
  const chambers = Object.fromEntries(CHAMBER_KINDS.map(k => [k, 0])) as Record<ChamberKind, number>
  if (isObj(spec.chambers)) for (const k of CHAMBER_KINDS) { const n = whole(spec.chambers[k], 0, 50); if (n !== null) chambers[k] = n }
  const connectExisting = whole(spec.connectExisting, 0, 20) ?? 0
  const connectSewer = whole(spec.connectSewer, 0, 10) ?? 0
  const cctv = spec.cctv === true
  const importBackfill = spec.importBackfill === true
  const anyCount = CHAMBER_KINDS.some(k => chambers[k] > 0) || connectExisting > 0 || connectSewer > 0 || cctv
  if (runs.length === 0 && !anyCount) return null
  return { runs, chambers, connectExisting, connectSewer, cctv, importBackfill, assumed }
}

// ── Soakaway & rainwater ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiSoakaway {
  roofAreaM2: number
  pavedAreaM2: number
  storageOverrideM3: number | null
  kind: SoakawayKind
  count: number
  channelLightLm: number
  channelHeavyLm: number
  gullies: number
  downpipeConnections: number
  waterButts: number
  assumed: string[]
  /** a soakaway was mentioned but no roof or paved area (or storage volume) was stated to size it, so none is priced */
  unsized: boolean
}

export function soakawayFromScope(spec: unknown): AiSoakaway | null {
  if (!isObj(spec)) return null
  const roofAreaM2 = between(spec.roofAreaM2, 0, 5000) ?? 0
  const pavedAreaM2 = between(spec.pavedAreaM2, 0, 5000) ?? 0
  const storageOverrideM3 = between(spec.storageM3, 0, 500)
  const sized = roofAreaM2 > 0 || pavedAreaM2 > 0 || storageOverrideM3 !== null
  const assumed: string[] = []
  const kindRaw = typeof spec.kind === 'string' && spec.kind in SOAKAWAY_KINDS ? (spec.kind as SoakawayKind) : null
  const kind: SoakawayKind = kindRaw ?? 'crates'
  if (sized && !kindRaw) assumed.push('soakaway crates (the usual choice)')
  const countRaw = whole(spec.count, 1, 10)
  const count = sized ? (countRaw ?? 1) : 0
  const channelLightLm = between(spec.channelLightLm, 0, 500) ?? 0
  const channelHeavyLm = between(spec.channelHeavyLm, 0, 500) ?? 0
  const gullies = whole(spec.gullies, 0, 50) ?? 0
  const downpipeConnections = whole(spec.downpipeConnections, 0, 30) ?? 0
  const waterButts = whole(spec.waterButts, 0, 20) ?? 0
  const unsized = !sized && (kindRaw !== null || countRaw !== null || spec.soakaway === true)
  const anything = sized || channelLightLm > 0 || channelHeavyLm > 0 || gullies > 0 || downpipeConnections > 0 || waterButts > 0
  if (!anything) return null
  return { roofAreaM2, pavedAreaM2, storageOverrideM3, kind, count, channelLightLm, channelHeavyLm, gullies, downpipeConnections, waterButts, assumed, unsized }
}

// ── Services connections ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiServices { items: ServiceItem[]; assumed: string[] }

export function servicesFromScope(spec: unknown): AiServices | null {
  if (!isObj(spec)) return null
  const items: ServiceItem[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.items) ? spec.items.slice(0, 12) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const utility: Utility | null = typeof raw.utility === 'string' && raw.utility in UTILITIES ? (raw.utility as Utility) : null
    if (!utility) continue
    const work: ServiceWork = typeof raw.work === 'string' && raw.work in WORK_LABEL ? (raw.work as ServiceWork) : 'new'
    const name = str(raw.name, 60)
    let lengthM = 0
    if (work !== 'cap-off') {
      const len = between(raw.lengthM, 0, 500)
      if (len !== null) lengthM = len
      else assumed.push(`${name || `${UTILITIES[utility].label.toLowerCase()} ${WORK_LABEL[work].toLowerCase()}`}: no trench length stated, so only the utility's charge and the meter box are priced`)
    }
    items.push({ id: 'ai-svc-' + ++seq, name, utility, work, lengthM, dig: digOf(raw.dig), surface: surfaceOf(raw.surface), box: raw.box !== false, chargeOverride: null })
  }
  return items.length > 0 ? { items, assumed } : null
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for each drainage calculator line, with the exact ids it may use. */
export function drainagePromptGuide(): string {
  const uses = (Object.keys(DRAIN_USE_LABEL) as DrainUse[]).map(u => `${u} = ${DRAIN_USE_LABEL[u].toLowerCase()}`).join(', ')
  const surfaces = (Object.keys(DRAIN_SURFACE_LABEL) as Surface[]).map(s => `${s} = ${DRAIN_SURFACE_LABEL[s].split(' (')[0].toLowerCase()}`).join('; ')
  const chambers = CHAMBER_KINDS.map(k => `${k} = ${CHAMBERS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const kinds = (Object.keys(SOAKAWAY_KINDS) as SoakawayKind[]).map(k => `${k} = ${SOAKAWAY_KINDS[k].short}`).join('; ')
  const utilities = (Object.keys(UTILITIES) as Utility[]).map(u => `${u} = ${UTILITIES[u].label.toLowerCase()}`).join(', ')
  const works = (Object.keys(WORK_LABEL) as ServiceWork[]).map(w => `${w} = ${WORK_LABEL[w].toLowerCase()}`).join(', ')
  return `For a drainage calculator line, add "calc": {…} with the shape for THAT line only, describing ONLY the work the scope mentions (never invent a length, area, count or depth; if the scope has none for that line, leave "calc" out):
  - "Underground Drainage (by run)": "calc": {"runs": [{"name": "Foul drain to the sewer", "use": "<use>", "size": 110|160|225, "lengthM": <m>, "depthMm": <average trench depth in mm>, "dig": "machine"|"hand", "surface": "<surface>"}], "chambers": {"<chamber id>": <count>}, "connectExisting": <count>, "connectSewer": <count>, "cctv": true, "importBackfill": true}. A run ONLY where the scope states its length; leave out "size", "depthMm", "dig" and "surface" unless stated. Uses: ${uses}. Surfaces it crosses: ${surfaces}. Chambers: ${chambers}. "connectExisting" = connections to an existing drain, "connectSewer" = connections to the public sewer; "cctv" only if a survey is mentioned.
  - "Soakaway & Rainwater": "calc": {"roofAreaM2": <m² of roof draining to it>, "pavedAreaM2": <m² of paving draining to it>, "storageM3": <m³ if the designer states one>, "kind": "<kind>", "count": <soakaways>, "channelLightLm": <m>, "channelHeavyLm": <m>, "gullies": <count>, "downpipeConnections": <count>, "waterButts": <count>}. Only the numbers the scope states; a soakaway is only priced if a roof or paved area (or a storage volume) is stated. Kinds: ${kinds}. Channel drains: light duty is paths and patios, heavy duty is driveways. The pipes from the downpipes to the soakaway are surface water runs in Underground Drainage, not here.
  - "Services Connections": "calc": {"items": [{"name": "New water supply", "utility": "<utility>", "work": "<work>", "lengthM": <trench length in m from the street or meter to the building>, "dig": "machine"|"hand", "surface": "<surface>", "box": true}]}. One item per service the scope mentions. Utilities: ${utilities}. Work: ${works}. Leave out "lengthM" unless stated; a cap-off has none.`
}
