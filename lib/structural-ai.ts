// What the AI quote can hand to two structural calculators: External Walls → Timber Frame with Brick Outer Leaf (one wall: its length, height, frame, insulation and openings) and Structural Frame → Structural
// Openings (by opening) (the openings cut in an existing wall or formed in a new one, with the steel over them). Only what the scope says: a wall with no stated length, or an opening with no stated width, is
// left out (never invented); anything else not stated takes the calculator's own starting value and is reported, so the estimator checks it. Whatever the AI sends back is untrusted, so every value is checked and
// anything that does not check out is treated as "not stated". Pure (apart from the engines' own tables), so it can be tested.

import { isObj, between, whole, str } from './ai-spec'
import type { AssemblyOpening } from './assembly-calc'
import * as TFB from './timber-frame-brick-wall'
import * as SO from './structural-openings-units'

export const STRUCTURAL_AI_IDS = ['ew-timber-frame-brick', 'sf-openings-calc'] as const
export const STRUCTURAL_AI_SET: ReadonlySet<string> = new Set<string>(STRUCTURAL_AI_IDS)

export interface AiStructural {
  /** the calculator's own saved values by the name its screen keeps its state under */
  values: Record<string, Record<string, unknown>>
  /** plain words for what was priced, for the review note ("a 6.0m timber frame wall with 2 openings") */
  what: string
  /** what the scope did not say and the calculator's standard was used: for the review note */
  assumed: string[]
  /** the wall as the engine reads it, for the labour guide (timber frame wall only) */
  wall?: { input: TFB.TimberFrameBrickInput; insulation: TFB.FrameInsulation; vcl: boolean; lining: TFB.FrameLining }
}

const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const items = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : [])
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const situation = (v: unknown, valid: string[], start: string): string => (typeof v === 'string' && valid.includes(v) ? v : start)

let seq = 0

// ── Timber frame wall with a brick outer leaf ─────────────────────────────────────────

/** the stud sections a stated depth reads as (the nearest the calculator has) */
function studKeyFor(depthMm: number): string {
  const keys = Object.keys(TFB.STUD_SECTIONS)
  return keys.reduce((best, k) => (Math.abs(TFB.STUD_SECTIONS[k].depthMm - depthMm) < Math.abs(TFB.STUD_SECTIONS[best].depthMm - depthMm) ? k : best), keys[0])
}
const nearest = (n: number, options: number[]) => options.reduce((b, o) => (Math.abs(o - n) < Math.abs(b - n) ? o : b), options[0])

function timberFrameBrick(spec: Record<string, unknown>): AiStructural | null {
  const lengthM = between(spec.lengthM, 0, 100)
  if (lengthM === null) return null   // never invent the length of the wall
  const assumed: string[] = []
  const h = between(spec.heightM, 0, 10)
  if (h === null) assumed.push('the wall height (taken as 2.4m, one storey)')
  const heightMm = Math.round((h ?? 2.4) * 1000)
  const lengthMm = Math.round(lengthM * 1000)

  let brick: TFB.LeafBrick
  if (typeof spec.brick === 'string' && spec.brick in TFB.LEAF_BRICK_LABEL) brick = spec.brick as TFB.LeafBrick
  else { brick = 'machine'; assumed.push(`the brick (taken as ${TFB.LEAF_BRICK_LABEL.machine.toLowerCase()})`) }
  const mortar: TFB.BrickMortar = spec.mortar === 'lime' ? 'lime' : 'cement'

  const sd = between(spec.studDepthMm, 0, 400)
  const studKey = sd !== null ? studKeyFor(sd) : TFB.DEFAULT_STUD
  if (sd === null) assumed.push('the studs (taken as 38 × 140 C16)')
  const sc = between(spec.studCentresMm, 0, 1200)
  const studCentresMm = sc !== null ? nearest(sc, [400, 600]) : 400
  const cv = between(spec.cavityMm, 0, 300)
  const cavityMm = cv !== null ? Math.max(TFB.MIN_CAVITY_MM, Math.round(cv)) : TFB.MIN_CAVITY_MM
  const sheathing: TFB.FrameSheathing = spec.sheathing === 'ply' ? 'ply' : 'osb'
  const ins = pick(spec.insulation, ['mineral', 'pir', 'none'] as const)
  const insulation: TFB.FrameInsulation = ins ?? 'mineral'
  if (!ins) assumed.push('the insulation between the studs (taken as mineral wool)')
  const oi = between(spec.outerInsulationMm, 0, 200)
  const outerInsulationMm = oi !== null ? nearest(oi, [0, 25, 40, 50, 75]) : 0
  const vclStated = bool(spec.vcl)
  const vcl = vclStated ?? true
  const lin = pick(spec.lining, ['none', 'one', 'two'] as const)
  const lining: TFB.FrameLining = lin ?? 'one'
  if (!lin) assumed.push('the lining inside (taken as one layer of plasterboard)')
  const mj = between(spec.movementJointSpacingM, 0, 50)
  const movementJointSpacingMm = mj !== null ? Math.round(mj * 1000) : 0

  // the openings: only those with a stated width and height, a count of each, spread along the wall (the scope does not say where)
  const wanted: { kind: AssemblyOpening['kind']; widthMm: number; heightMm: number }[] = []
  for (const raw of items(spec.openings, 30)) {
    const w = between(raw.widthM, 0, 10), oh = between(raw.heightM, 0, 6)
    if (w === null || oh === null) continue
    const k = typeof raw.kind === 'string' ? raw.kind.toLowerCase().replace(/[^a-z]/g, '') : ''
    const kind: AssemblyOpening['kind'] = k === 'door' ? 'door' : k === 'bifold' ? 'bifold' : 'window'
    const count = whole(raw.count, 1, 20) ?? 1
    for (let i = 0; i < count; i++) wanted.push({ kind, widthMm: Math.round(w * 1000), heightMm: Math.round(oh * 1000) })
  }
  const totalW = wanted.reduce((s, o) => s + o.widthMm, 0)
  const gap = wanted.length > 0 ? Math.max(0, (lengthMm - totalW) / (wanted.length + 1)) : 0
  let x = gap
  const openings: AssemblyOpening[] = wanted.map(o => {
    const op: AssemblyOpening = { id: 'ai-open-' + ++seq, kind: o.kind, widthMm: o.widthMm, heightMm: o.heightMm, offsetMm: Math.round(x), sillHeightMm: o.kind === 'window' ? Math.max(0, Math.min(900, heightMm - o.heightMm)) : 0 }
    x += o.widthMm + gap
    return op
  })
  if (openings.length > 0) assumed.push('where the openings sit along the wall (spread evenly), and a window sill at 900mm')

  const values = { lengthMm, heightMm, brick, mortar, studKey, studCentresMm, cavityMm, sheathing, insulation, outerInsulationMm, vcl, lining, movementJointSpacingMm, openings }
  return {
    values: { AssemblyTimberFrameBrickWallDemo: values },
    what: `a timber frame wall ${lengthM.toFixed(2).replace(/\.?0+$/, '')}m long with a brick outer leaf${openings.length > 0 ? ` and ${plural(openings.length, 'opening', 'openings')}` : ''}`,
    assumed,
    wall: { input: { lengthMm, heightMm, openings, studKey, studCentresMm, cavityMm, outerInsulationMm, movementJointSpacingMm }, insulation, vcl, lining },
  }
}

// ── Structural openings ─────────────────────────────────────────────────────────────────

function structuralOpenings(spec: Record<string, unknown>): AiStructural | null {
  const raws = items(spec.openings, 20)
  if (raws.length === 0) return null
  const assumed: string[] = []
  const noWall: string[] = [], noLoad: string[] = [], noHeight: string[] = []
  const out: SO.StructuralOpening[] = []
  raws.forEach((raw, i) => {
    const w = between(raw.widthM, 0.3, 12)
    if (w === null) return   // never invent the width of an opening
    const formed = pick(raw.formed, Object.keys(SO.FORMED_LABEL) as SO.OpeningFormed[]) ?? 'cut-existing'
    const o = SO.newStructuralOpening(`so-ai${i + 1}`, `SO${out.length + 1}`, formed)
    o.location = str(raw.location, 40)
    o.widthMm = Math.round(w * 1000)
    const h = between(raw.heightM, 0, 6)
    if (h !== null) o.heightMm = Math.round(h * 1000); else noHeight.push(o.ref)
    const q = whole(raw.qty, 1, 20); if (q !== null) o.qty = q
    const wall = pick(raw.wall, Object.keys(SO.WALL_LABEL) as SO.OpeningWallKind[])
    if (wall) { o.wall = wall; o.thicknessMm = SO.WALL_THICKNESS[wall] } else noWall.push(o.ref)
    const t = between(raw.thicknessMm, 50, 700); if (t !== null) o.thicknessMm = Math.round(t)
    const load = pick(raw.loadAbove, Object.keys(SO.LOAD_LABEL) as SO.LoadAbove[])
    if (load) o.loadAbove = load; else noLoad.push(o.ref)
    const lb = bool(raw.loadBearing); if (lb !== null) { o.loadBearing = lb; o.engineer = lb && formed === 'cut-existing' }
    const beams = whole(raw.beams, 0, 4); o.beams = beams !== null ? beams : SO.usualBeams(o.thicknessMm)
    const posts = whole(raw.posts, 0, 6); if (posts !== null) o.posts = posts
    const role = pick(raw.postRole, Object.keys(SO.POST_ROLE_LABEL) as SO.PostRole[]); if (role) o.postRole = role
    const by = pick(raw.steelBy, ['us', 'sub'] as const); if (by) o.steelBy = by
    const fin = pick(raw.finish, Object.keys(SO.FINISH_LABEL) as SO.SteelFinish[]); if (fin) o.finish = fin
    if (bool(raw.hiab) === true) o.hiab = true
    const eng = bool(raw.engineer); if (eng !== null && o.loadBearing) o.engineer = eng
    const pw = between(raw.propWeeks, 0, 26); if (pw !== null) o.propWeeks = pw
    if (bool(raw.makeGood) !== null) o.makeGood = raw.makeGood as boolean
    out.push(o)
  })
  if (out.length === 0) return null
  if (noWall.length) assumed.push(`what kind of wall ${list(noWall)} ${noWall.length === 1 ? 'is' : 'are'} in (taken as a solid brick wall)`)
  if (noLoad.length) assumed.push(`what is above ${list(noLoad)} (taken as one floor and the roof)`)
  if (noHeight.length) assumed.push(`the height of ${list(noHeight)} (taken as 2.1m, a door)`)
  const total = out.reduce((s, o) => s + o.qty, 0)
  return {
    values: { AssemblyStructuralOpeningsDemo: {
      openings: out, jobSituationId: situation(spec.situation, SO.DEFAULT_STRUCTURAL_SITUATIONS.map(s => s.id), 'clear'),
      buildingControl: bool(spec.buildingControl) ?? true, dustProtection: bool(spec.dustProtection) ?? false,
    } },
    what: plural(total, 'structural opening', 'structural openings'), assumed,
  }
}

/** Checks the "calc" object the AI gave for one of these calculator lines and returns what its calculator should be opened on, or null when the scope gave nothing usable for it. */
export function structuralFromScope(canonicalId: string, spec: unknown): AiStructural | null {
  if (!STRUCTURAL_AI_SET.has(canonicalId) || !isObj(spec)) return null
  return canonicalId === 'ew-timber-frame-brick' ? timberFrameBrick(spec) : structuralOpenings(spec)
}

// ── What the AI is told ──────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for the two lines, with the exact words it may use. */
export function structuralPromptGuide(): string {
  const bricks = Object.keys(TFB.LEAF_BRICK_LABEL).join('|')
  const studs = Object.values(TFB.STUD_SECTIONS).map(s => s.depthMm).join('|')
  return `For the "Timber Frame with Brick Outer Leaf" line (one external wall at a time), add "calc": {"lengthM": <m>, "heightM": <m>, "brick": "${bricks}", "mortar": "cement"|"lime", "studDepthMm": <${studs}>, "studCentresMm": 400|600, "cavityMm": <mm, 50 or more>, "sheathing": "osb"|"ply", "insulation": "mineral"|"pir"|"none", "outerInsulationMm": <mm of PIR over the sheathing>, "vcl": true|false, "lining": "none"|"one"|"two" (layers of plasterboard), "movementJointSpacingM": <m>, "openings": [{"kind": "window"|"door"|"bifold", "widthM": <m>, "heightM": <m>, "count": <n>}]}. Give a wall ONLY with a stated length; for a two-storey extension give one object per wall per floor only if the scope separates them. Only openings with a stated width and height.
  For the "Structural Openings (by opening)" line (an opening cut through an existing wall, or formed in a new one, with the steel over it), add "calc": {"situation": "clear"|"occupied"|"hard", "buildingControl": true|false, "openings": [{"location": "kitchen to dining room", "formed": "cut-existing"|"new-wall", "wall": "cavity"|"solid"|"block", "thicknessMm": <mm>, "widthM": <m, the span: required>, "heightM": <m>, "qty": <n>, "loadAbove": "light"|"floor"|"heavy", "loadBearing": true|false, "beams": <n>, "posts": <n>, "postRole": "ends"|"mid", "steelBy": "us"|"sub", "finish": "board"|"intumescent"|"none", "hiab": true|false, "engineer": true|false}]}. Only openings with a stated width. Do NOT use this line for taking out a whole wall (Demolition) or for the door or window itself (Windows & Doors).`
}
