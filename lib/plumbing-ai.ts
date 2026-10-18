// What the AI quote can hand to the four plumbing calculators (Plumbing Installation by room, Heating Plant, Underfloor Heating, Pipework Runs): the rooms, fittings, zones, runs and
// boiler details the scope describes, checked here and turned into each calculator's own inputs. Only what the scope says: a room named with no fittings stated gets the usual fittings
// for that kind of room (what the calculator itself does when you add one) and is reported as such so the estimator checks it; a size the scope does not state is never invented, and a
// zone or run with no stated area or length is left out. Pure (apart from the calculators' own tables), so it can be tested with a loader that resolves the extension-less imports.

import {
  FITTING_BY_ID, ROOM_TYPE_BY_ID, ROOM_TYPES, SPECIAL_BY_ID, SPECIAL_TYPES, FITTING_TYPES, WHOLE_HOUSE_BY_ID, WHOLE_HOUSE_ITEMS, DEFAULT_SITUATIONS,
  type PlumbingRoom, type PlumbingSpecial,
} from './plumbing-units'
import { BOILER_SIZES, type FitMode, type FlueKind, type ControlsKind } from './heating-units'
import { UFH_FLOORS, SPACINGS_MM, type UfhZone, type UfhFloor } from './ufh-units'
import { RUN_TYPES, ROUTE_LABEL, type PipeRun, type RunType, type PipeMaterial, type Route } from './pipework-units'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null }
const whole = (v: unknown, min: number, max: number): number | null => { const n = num(v); if (n === null) return null; const r = Math.round(n); return r >= min && r <= max ? r : null }
const between = (v: unknown, min: number, max: number): number | null => { const n = num(v); return n !== null && n > min && n <= max ? n : null }
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const situationOf = (v: unknown): string => (typeof v === 'string' && DEFAULT_SITUATIONS.some(s => s.id === v) ? v : 'new-build')

let seq = 0

/** The kind of room a name looks like ("Bathroom 2" -> bathroom), for a room the AI named without a kind. */
export function guessPlumbRoomType(name: string): string {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some(x => n.includes(x))
  if (has('en-suite', 'ensuite', 'en suite')) return 'ensuite'
  if (has('cloak', 'wc', 'toilet')) return 'cloakroom'
  if (has('bath', 'shower', 'wet room')) return 'bathroom'
  if (has('kitchen') && has('diner', 'family', 'living', 'dining')) return 'kitchen-diner'
  if (has('kitchen')) return 'kitchen'
  if (has('utility', 'laundry')) return 'utility'
  if (has('living', 'lounge', 'sitting', 'reception')) return 'living'
  if (has('dining')) return 'dining'
  if (has('study', 'office')) return 'study'
  if (has('bed')) return 'bedroom'
  if (has('hall', 'landing', 'stair', 'entrance')) return 'hall'
  if (has('garage')) return 'garage'
  if (has('outside', 'external', 'garden', 'patio')) return 'outside'
  return 'other'
}

// ── Plumbing installation, by room ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiPlumbing {
  rooms: PlumbingRoom[]
  wholeHouse: Record<string, number>
  jobSituationId: string
  /** rooms that had no fittings stated, so got the usual set for their kind */
  usualRooms: string[]
}

export function plumbingFromScope(spec: unknown): AiPlumbing | null {
  if (!isObj(spec)) return null
  const rooms: PlumbingRoom[] = []
  const usualRooms: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []

  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name) continue
    const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
    const kind = ROOM_TYPE_BY_ID[kindRaw] ? kindRaw : guessPlumbRoomType(name)

    const fittings: Record<string, number> = {}
    if (isObj(raw.fittings)) {
      for (const [id, v] of Object.entries(raw.fittings)) {
        const n = whole(v, 1, 60)
        if (FITTING_BY_ID[id] && n !== null) fittings[id] = n
      }
    }
    const specials: PlumbingSpecial[] = []
    if (Array.isArray(raw.specials)) {
      for (const sr of raw.specials.slice(0, 10)) {
        if (!isObj(sr)) continue
        const typeId = typeof sr.type === 'string' && SPECIAL_BY_ID[sr.type] ? sr.type : 'other-fitting'
        const count = whole(sr.count ?? 1, 1, 20)
        if (count === null) continue
        specials.push({ id: 'ai-spec-' + ++seq, typeId, name: str(sr.name, 60), count, supply: sr.supply === 'us' ? 'us' : 'client', itemCost: 0 })
      }
    }

    let usual = false
    let finalFittings = fittings
    if (Object.keys(fittings).length === 0 && specials.length === 0) {
      const t = ROOM_TYPE_BY_ID[kind]
      if (!t || Object.keys(t.fittings).length === 0) continue   // a room of no known kind with nothing stated: nothing to price
      finalFittings = { ...t.fittings }
      usual = true
    }

    // the same room named twice is one room
    const existing = rooms.find(r => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      for (const [id, n] of Object.entries(finalFittings)) existing.fittings[id] = (existing.fittings[id] ?? 0) + n
      existing.specials.push(...specials)
      continue
    }
    rooms.push({
      id: 'ai-room-' + ++seq, name, typeId: kind, fittings: finalFittings, situationId: null, mode: 'fittings', days: 1, dayRate: 280,
      supply: raw.supply === 'us' ? 'us' : 'client', specials,
    })
    if (usual) usualRooms.push(name)
  }

  const wholeHouse: Record<string, number> = Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w.defaultQty]))
  let anyWhole = false
  if (isObj(spec.wholeHouse)) {
    for (const [id, v] of Object.entries(spec.wholeHouse)) {
      if (!WHOLE_HOUSE_BY_ID[id]) continue
      const n = whole(v, 0, 20)
      if (n === null) continue
      wholeHouse[id] = n
      if (id !== 'pressure-test' && n > 0) anyWhole = true
    }
  }
  if (rooms.length === 0 && !anyWhole) return null
  return { rooms, wholeHouse, jobSituationId: situationOf(spec.situation), usualRooms }
}

// ── Heating plant (gas combi boiler) ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiHeating {
  boilerKw: number
  fit: FitMode
  flue: FlueKind
  controls: ControlsKind
  radiators: number
  /** what the scope did not say, so the calculator's standard was used: for the review note */
  assumed: string[]
}

export function heatingFromScope(spec: unknown): AiHeating | null {
  if (!isObj(spec)) return null
  const assumed: string[] = []
  const kwRaw = whole(spec.boilerKw, 1, 100)
  const boilerKw = kwRaw !== null && BOILER_SIZES.some(b => b.kw === kwRaw) ? kwRaw : (assumed.push('the boiler size (28kW)'), 28)
  const fit: FitMode = spec.fit === 'relocate' ? 'relocate' : (spec.fit === 'replace' ? 'replace' : (assumed.push('replacing the boiler where it is'), 'replace'))
  const flue: FlueKind = spec.flue === 'horizontal' || spec.flue === 'vertical' ? spec.flue : 'existing'
  const controls: ControlsKind = spec.controls === 'smart' || spec.controls === 'programmer' ? spec.controls : 'none'
  const rad = whole(spec.radiators, 0, 60)
  const radiators = rad !== null ? rad : (assumed.push('8 radiators for the system clean'), 8)
  return { boilerKw, fit, flue, controls, radiators, assumed }
}

// ── Underfloor heating ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiUfh { zones: UfhZone[]; assumed: string[] }

export function ufhFromScope(spec: unknown): AiUfh | null {
  if (!isObj(spec)) return null
  const zones: UfhZone[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.zones) ? spec.zones.slice(0, 20) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const area = between(raw.areaM2, 0, 500)
    if (area === null) continue   // never invent an area: a zone with no stated area is left out
    const name = str(raw.name, 60) || `Zone ${zones.length + 1}`
    const floor: UfhFloor = typeof raw.floor === 'string' && raw.floor in UFH_FLOORS ? (raw.floor as UfhFloor) : 'screed'
    const sp = whole(raw.spacingMm, 50, 400)
    const spacingMm = sp !== null && SPACINGS_MM.includes(sp) ? sp : 150
    const d = between(raw.distanceM, 0, 60)
    zones.push({ id: 'ai-zone-' + ++seq, name, areaM2: area, floor, spacingMm, distanceM: d !== null ? d : 5 })
    if (d === null) assumed.push(`${name}: 5m to the manifold`)
  }
  return zones.length > 0 ? { zones, assumed } : null
}

// ── Pipework runs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiPipework { runs: PipeRun[]; jobSituationId: string }

export function pipeworkFromScope(spec: unknown): AiPipework | null {
  if (!isObj(spec)) return null
  const runs: PipeRun[] = []
  const list = Array.isArray(spec.runs) ? spec.runs.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const len = between(raw.lengthM, 0, 500)
    if (len === null) continue   // never invent a length
    const type: RunType | null = typeof raw.type === 'string' && raw.type in RUN_TYPES ? (raw.type as RunType) : null
    if (!type) continue
    const info = RUN_TYPES[type]
    const sizeRaw = whole(raw.size, 1, 200)
    const size = sizeRaw !== null && info.sizes.includes(sizeRaw) ? sizeRaw : info.sizes[0]
    const material: PipeMaterial = typeof raw.material === 'string' && (info.materials as string[]).includes(raw.material) ? (raw.material as PipeMaterial) : info.materials[0]
    const route: Route = typeof raw.route === 'string' && raw.route in ROUTE_LABEL ? (raw.route as Route) : 'surface'
    runs.push({ id: 'ai-run-' + ++seq, name: str(raw.name, 60), type, size, material, lengthM: len, route, lagged: info.lagging && raw.lagged === true })
  }
  return runs.length > 0 ? { runs, jobSituationId: situationOf(spec.situation) } : null
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for each plumbing calculator line, with the exact ids it may use. */
export function plumbingPromptGuide(): string {
  const fittings = FITTING_TYPES.map(f => `${f.id} = ${f.name}`).join('; ')
  const specials = SPECIAL_TYPES.map(f => `${f.id} = ${f.name}`).join('; ')
  const whole = WHOLE_HOUSE_ITEMS.filter(w => w.id !== 'pressure-test').map(w => `${w.id} = ${w.name}`).join('; ')
  const kinds = ROOM_TYPES.filter(r => r.id !== 'other').map(r => r.id).join(', ')
  const sits = DEFAULT_SITUATIONS.map(s => `${s.id} = ${s.label.split(' (')[0]}`).join('; ')
  const runTypes = (Object.keys(RUN_TYPES) as RunType[]).map(t => `${t} = ${RUN_TYPES[t].label} (sizes ${RUN_TYPES[t].sizes.join('/')}mm, ${RUN_TYPES[t].materials.join(' or ')})`).join('; ')
  const routes = (Object.keys(ROUTE_LABEL) as Route[]).map(r => `${r} = ${ROUTE_LABEL[r].toLowerCase()}`).join('; ')
  return `For a plumbing calculator line, add "calc": {…} with the shape for THAT line only, describing ONLY the work the scope mentions (never invent a room, count, size, area or length; if the scope has none for that line, leave "calc" out):
  - "Plumbing Installation (by room)": "calc": {"situation": "<id>", "rooms": [{"name": "Family bathroom", "kind": "<room kind>", "supply": "client", "fittings": {"<fitting id>": <count>}, "specials": [{"type": "<special id>", "name": "", "count": 1, "supply": "client"}]}], "wholeHouse": {"<item id>": <count>}}. One entry per room the scope names or clearly means to plumb, using its own name. "kind" is one of: ${kinds}. "fittings": only the counts the scope states, using exactly these ids: ${fittings}. If the scope names a room but not its fittings, LEAVE "fittings" OUT and the calculator uses the usual set for that kind of room. "supply" is "us" only if the scope says we supply the sanitaryware, taps or radiators, otherwise "client". A special fitting (freestanding bath, wet room, boiling water tap...) goes in "specials" with one of: ${specials}. "wholeHouse" only for items the scope mentions, using: ${whole}. "situation" only if the scope says: ${sits}.
  - "Heating Plant (by system)" (a gas combi boiler): "calc": {"boilerKw": 24|28|30|35, "fit": "replace"|"relocate", "flue": "horizontal"|"vertical"|"existing", "controls": "none"|"programmer"|"smart", "radiators": <number on the system>}. Include only what the scope states; leave out "boilerKw" if no size is given.
  - "Underfloor Heating" (warm water): "calc": {"zones": [{"name": "Kitchen / diner", "areaM2": <m²>, "floor": "screed"|"overlay"|"joisted", "spacingMm": 100|150|200|300, "distanceM": <m to the manifold>}]}. A zone ONLY where the scope states its area; leave out "floor", "spacingMm" and "distanceM" unless stated.
  - "Pipework Runs": "calc": {"situation": "<id>", "runs": [{"name": "", "type": "<run type>", "size": <mm>, "material": "copper"|"plastic", "lengthM": <m>, "route": "<route>", "lagged": false}]}. A run ONLY where the scope states its length. Run types: ${runTypes}. Routes: ${routes}.
  - Plumbing fittings for a room belong in "Plumbing Installation (by room)"; use "Pipework Runs" only for pipe lengths the scope states separately.`
}
