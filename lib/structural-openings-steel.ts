// Structural Openings with the steel calculators' options: an opening set up with "what goes over the opening" prices its steel with the Steel Beams, Columns & Posts engine (through lib/wall-steel.ts, as a wall calculator
// does), so any number of beams, columns, box section posts and timber members, plates, processes and connections cost the same everywhere. A lintel, the cavity work, the cutting out, props, rubble, engineer and anything
// else are the openings engine's (lib/structural-openings-units.ts). This module joins the two, keeps an opening's choices sensible as its size or wall changes, and keeps it in step with the Take-off drawing. Pure.

import {
  calculateStructuralOpenings, newStructuralOpening, mergePlanStructural, steelFromPlan, usualBeams, defaultOver, OVER_FOR,
  type StructuralOpening, type StructuralInput, type StructuralResult, type OpeningSteelPriced, type PlanStructural, type OpeningFormed,
} from './structural-openings-units'
import { priceWallSteel, cleanWallSteel, newWallSteel, newWallMember, type WallSteel, type WallMember, type WallSteelItem } from './wall-steel'
import { KIND_BY_ID, type CuttingGroup } from './structural-steel-units'

/** warnings from the steel engine that the openings engine already gives for the whole job */
const SAID_ALREADY = ['Every structural member needs the structural engineer']

const isPost = (m: WallMember) => KIND_BY_ID[m.kind].post
const postCount = (s: WallSteel) => s.members.filter(isPost).reduce((t, m) => t + m.qty, 0)

/** The steel a new opening starts with: beams picked from the span (a pair across a wall of 300mm or more), cased in fire-resisting board, on padstones */
export function newOpeningSteel(thicknessMm: number): WallSteel {
  const s = newWallSteel()
  s.members[0] = { ...s.members[0], qty: usualBeams(thicknessMm), finish: 'cased' }
  return s
}

/** The steel fields the Take-off drawing reads (how many beams and posts, the section, the plate, the connections), copied from what is set up, so the plan draws and labels the opening as it is priced */
export function mirrorSteel(o: StructuralOpening): StructuralOpening {
  if (o.over === undefined) return o
  if (o.over !== 'steel') return { ...o, beams: 0, posts: 0, connections: [], plate: null }
  const s = cleanWallSteel(o.steelSpec)
  const beams = s.members.filter(m => !isPost(m))
  const column = s.members.find(m => m.kind === 'column')
  return {
    ...o, beams: beams.reduce((t, m) => t + m.qty, 0), section: beams[0]?.section ?? 'auto', posts: postCount(s), postSection: column?.section ?? o.postSection,
    connections: s.connections, plate: beams[0]?.plate ?? null, loadAbove: s.loadAbove,
  }
}

/** A new opening: a 2.4m opening starts with steel over it, with every choice open */
export function newFullOpening(id: string, ref: string, formed: OpeningFormed = 'cut-existing'): StructuralOpening {
  const o = newStructuralOpening(id, ref, formed)
  return mirrorSteel({ ...o, over: defaultOver(o.wall, o.widthMm, o.loadAbove), steelSpec: newOpeningSteel(o.thicknessMm), lintelQty: null, lintelPads: 0, cavityWork: o.wall === 'cavity' && formed === 'cut-existing', extras: [] })
}

/** An opening saved with the older beam and post fields, moved to the steel calculators' options with the same steel (its figures then follow those calculators) */
export function toFullOpening(o: StructuralOpening): StructuralOpening {
  if (o.over !== undefined) return o
  const s = cleanWallSteel({ beams: o.beams, posts: o.posts, section: o.section, postSection: o.postSection, postHeightMm: o.postHeightMm, postRole: o.postRole, padstones: o.padstones, steelBy: o.steelBy, finish: o.finish, plate: o.plate ?? null, loadAbove: o.loadAbove, hiab: o.hiab, connections: o.connections ?? [] })
  const members = s.members.map(m => (isPost(m) ? { ...m, padLengthMm: o.padLengthMm, padWidthMm: o.padWidthMm, padDepthMm: o.padDepthMm } : m))
  return mirrorSteel({ ...o, over: 'steel', steelSpec: { ...s, members }, lintelQty: null, lintelPads: 0, cavityWork: false, extras: [] })
}

/** A change to an opening's size, wall, load or whether it is cut: whatever was still the usual for the old one follows to the usual for the new one, and what was chosen stays */
export function changeOpening(o: StructuralOpening, patch: Partial<StructuralOpening>): StructuralOpening {
  const n: StructuralOpening = { ...o, ...patch }
  if (o.over === undefined) {
    // an older opening: only its number of beams follows the wall, as before
    if (n.thicknessMm !== o.thicknessMm && o.beams === usualBeams(o.thicknessMm)) n.beams = usualBeams(n.thicknessMm)
    return n
  }
  if (patch.over === undefined) {
    const wasUsual = o.over === defaultOver(o.wall, o.widthMm, o.loadAbove)
    if (wasUsual || !OVER_FOR[n.wall].includes(o.over)) n.over = defaultOver(n.wall, n.widthMm, n.loadAbove)
  }
  const s = cleanWallSteel(o.steelSpec ?? newOpeningSteel(o.thicknessMm))
  if (n.thicknessMm !== o.thicknessMm) {
    const i = s.members.findIndex(m => m.kind === 'beam')
    if (i >= 0 && s.members[i].qty === usualBeams(o.thicknessMm)) s.members[i] = { ...s.members[i], qty: usualBeams(n.thicknessMm) }
  }
  if (patch.loadAbove !== undefined) s.loadAbove = patch.loadAbove
  n.steelSpec = patch.steelSpec ?? s
  const usualCavity = (x: StructuralOpening) => x.wall === 'cavity' && x.formed === 'cut-existing'
  if (patch.cavityWork === undefined && !!o.cavityWork === usualCavity(o)) n.cavityWork = usualCavity(n)
  return mirrorSteel(n)
}

/** The steel chosen for an opening on the drawing, put into what is set up: the first beam's section, number and plate, the columns, what is above and the connections. Everything else set up stays. */
function planSteelInto(spec: WallSteel, struct: PlanStructural['struct']): WallSteel {
  const p = steelFromPlan(struct)
  let members = [...spec.members]
  if (p.beams === 0) members = members.filter(m => m.kind !== 'beam')
  else if (p.beams !== undefined || p.section !== undefined || p.plate !== undefined) {
    let i = members.findIndex(m => m.kind === 'beam')
    if (i < 0) { members.unshift({ ...newWallMember('beam'), finish: 'cased' }); i = 0 }
    members[i] = { ...members[i], ...(p.beams !== undefined ? { qty: p.beams } : {}), ...(p.section !== undefined ? { section: p.section } : {}), ...(p.plate !== undefined ? { plate: p.plate } : {}) }
  }
  if (p.posts !== undefined) {
    const others = members.filter(isPost).filter(m => m.kind !== 'column').reduce((t, m) => t + m.qty, 0)
    const want = Math.max(0, p.posts - others)
    const i = members.findIndex(m => m.kind === 'column')
    if (want === 0) members = members.filter(m => m.kind !== 'column')
    else if (i < 0) members.push({ ...newWallMember('column'), qty: want, finish: 'cased' })
    else members = members.map((m, j) => (j === i ? { ...m, qty: want } : m.kind === 'column' ? null : m)).filter((m): m is WallMember => !!m)
  }
  return { ...spec, members: members.slice(0, 8), loadAbove: p.loadAbove ?? spec.loadAbove, connections: p.connections ?? spec.connections }
}

/**
 * The calculator's openings brought in step with the drawing: an opening placed on a wall is added with the steel calculators' options, one already there follows the drawing when the drawing's opening changes (its size,
 * reference, room, wall, and the steel chosen on the plan) and is otherwise left as set up, and one deleted on the drawing goes. Openings saved with the older fields keep working as they did.
 */
export function mergePlanFull(existing: StructuralOpening[], plan: PlanStructural[]): StructuralOpening[] {
  const before = new Map(existing.map(o => [o.id, o]))
  return mergePlanStructural(existing, plan).map(m => {
    if (!m.planId) return m
    const prev = before.get(m.id)
    if (!prev) {
      const full = toFullOpening(m)
      return { ...full, cavityWork: full.wall === 'cavity' && full.formed === 'cut-existing' }
    }
    if (prev === m || m.over === undefined) return m
    const p = plan.find(q => q.id === m.planId)
    // the width or wall changed on the drawing: the usual choices follow it, then the steel chosen on the plan goes in
    const followed = changeOpening({ ...prev, ref: m.ref, location: m.location }, { widthMm: m.widthMm, heightMm: m.heightMm, wall: m.wall, thicknessMm: m.thicknessMm })
    const spec = planSteelInto(cleanWallSteel(followed.steelSpec), p?.struct)
    return mirrorSteel({ ...followed, steelSpec: spec, postRole: m.postRole, planId: m.planId, fromPlan: m.fromPlan })
  })
}

/** The steel of an opening as it is priced: posts standing under the beam split the span a beam is picked for, and a post carrying a beam end takes the place of a padstone */
function itemFor(o: StructuralOpening): WallSteelItem {
  const s = cleanWallSteel(o.steelSpec ?? newOpeningSteel(o.thicknessMm))
  const posts = postCount(s)
  const spanMm = o.postRole === 'mid' && posts > 0 ? o.widthMm / (posts + 1) : undefined
  let taken = o.postRole === 'ends' ? posts : 0
  const members = s.members.map(m => {
    if (m.kind !== 'beam' || m.ends !== 'masonry' || m.padstones !== null || taken <= 0) return m
    const pads = Math.max(0, 2 * m.qty - taken)
    taken = 0
    return { ...m, padstones: pads }
  })
  const label = `${o.ref.trim() || 'Opening'}${o.location.trim() ? ` (${o.location.trim()})` : ''}`
  return { id: o.id, ref: label, widthMm: o.widthMm, heightMm: o.heightMm, steel: { ...s, members }, spanMm }
}

const usesSteel = (o: StructuralOpening) => o.over === 'steel' && o.widthMm > 0 && o.heightMm > 0 && o.thicknessMm > 0

/** The steel of ONE of this opening, priced */
export function priceOpeningSteel(o: StructuralOpening): OpeningSteelPriced {
  const item = itemFor(o)
  const r = priceWallSteel([item], o.thicknessMm)
  const by = r.byOpening[o.id]
  const warnings = r.warnings.filter(w => !SAID_ALREADY.some(x => w.includes(x)))
  if (item.steel.members.some(m => KIND_BY_ID[m.kind].steel && (m.finish === 'primed' || m.finish === 'galvanised'))) warnings.push(`${item.ref}: no fire protection is priced to some of the steel: confirm with the engineer and Building Control whether it needs any (a floor above usually does).`)
  return {
    lines: r.lines.map(l => { const [key, rest] = l.id.split('|'); return { id: `st-${key}-${rest ?? ''}`, name: l.name, category: l.category, unit: l.unit, unitCost: l.unitCost, qty: l.qty } }),
    hours: r.hours, words: by?.words ?? '', beamLabel: by?.beamLabel ?? '', steelKg: by?.steelKg ?? 0, warnings,
  }
}

export type OpeningsInput = StructuralInput & { stock?: { barsMm: number[]; offcutPct: number } }
export type OpeningsResult = StructuralResult & { cutting: CuttingGroup[] }

/** The whole job: each opening with its steel from the steel calculators, and, when the steel is bought in whole bars, the offcut of the bars the openings share */
export function priceOpenings(input: OpeningsInput): OpeningsResult {
  const steel: Record<string, OpeningSteelPriced> = {}
  for (const o of input.openings) if (usesSteel(o)) steel[o.id] = priceOpeningSteel(o)
  const r = calculateStructuralOpenings({ ...input, steel })
  let cutting: CuttingGroup[] = []
  if (input.stock) {
    const items: WallSteelItem[] = []
    for (const o of input.openings) {
      if (!usesSteel(o)) continue
      for (let i = 0; i < Math.min(50, o.qty); i++) items.push({ ...itemFor(o), id: `${o.id}#${i}` })
    }
    if (items.length > 0) {
      const all = priceWallSteel(items, input.openings[0].thicknessMm, input.stock)
      cutting = all.cutting
      for (const l of all.lines) if (l.id.startsWith('offcut|')) r.lines.push({ id: `offcut-${l.id.slice(7)}|job`, name: l.name, category: 'materials', unit: l.unit, unitCost: l.unitCost, qty: l.qty })
      for (const w of all.warnings) if (w.includes('longer than the longest bar') && !r.warnings.includes(w)) r.warnings.push(w)
    }
  }
  return { ...r, cutting }
}
