// What the AI quote can hand to the Solid Brick Wall (Victorian) calculator: the one wall the scope describes, checked here and turned into the calculator's own inputs. Only what the scope says:
// a wall with no stated length is left out (never invented), openings are only the ones with a stated width and height, and anything not stated (the height, how many bricks thick, the face brick,
// the mortar, the lintel) takes the calculator's own starting value and is reported, so the estimator checks it. Whatever the AI sends back is untrusted, so every value is checked.
// Pure (apart from the calculator's own tables).

import { BRICK_THICKNESS, BRICK_BOND_LABEL, FACING_BRICK, BRICK_MORTAR_LABEL, BRICK_LINTEL_LABEL, type BrickThickness, type BrickBond, type FacingBrick, type BrickMortar, type BrickLintel } from './solid-brick-wall'
import type { AssemblyOpening } from './assembly-calc'
import { isObj, between, whole } from './ai-spec'

export interface AiSolidBrick {
  lengthMm: number
  heightMm: number
  thickness: BrickThickness
  bond: BrickBond
  facing: FacingBrick
  backing: 'commons' | 'all-facing'
  mortar: BrickMortar
  lintel: BrickLintel
  openings: AssemblyOpening[]
  /** what the scope did not say, so the calculator's standard was used: for the review note */
  assumed: string[]
}

let seq = 0

/** One, one and a half or two bricks from a thickness in mm (215 / 9 inch, 330 / 13 inch or 14 inch, 440 / 18 inch). */
export function thicknessFromMm(mm: number): BrickThickness {
  if (mm <= 260) return 'one'
  if (mm <= 380) return 'one-half'
  return 'two'
}

export function solidBrickFromScope(spec: unknown): AiSolidBrick | null {
  if (!isObj(spec)) return null
  const lengthM = between(spec.lengthM, 0, 100)
  if (lengthM === null) return null   // never invent the length of the wall
  const assumed: string[] = []

  const h = between(spec.heightM, 0, 10)
  if (h === null) assumed.push('the wall height (taken as 2.7m)')
  const heightMm = Math.round((h ?? 2.7) * 1000)

  let thickness: BrickThickness
  if (typeof spec.thickness === 'string' && spec.thickness in BRICK_THICKNESS) thickness = spec.thickness as BrickThickness
  else {
    const mm = between(spec.thicknessMm, 0, 1500)
    if (mm !== null) thickness = thicknessFromMm(mm)
    else { thickness = 'one-half'; assumed.push('how many bricks thick it is (taken as one and a half bricks, the usual Victorian wall)') }
  }

  const bond: BrickBond = typeof spec.bond === 'string' && spec.bond in BRICK_BOND_LABEL && spec.bond !== 'unstated' ? (spec.bond as BrickBond) : 'unstated'

  let facing: FacingBrick
  if (typeof spec.facing === 'string' && spec.facing in FACING_BRICK) facing = spec.facing as FacingBrick
  else { facing = 'stock-new'; assumed.push(`the face brick (taken as ${FACING_BRICK['stock-new'].label})`) }

  const backing: 'commons' | 'all-facing' = spec.backing === 'all-facing' ? 'all-facing' : 'commons'

  let mortar: BrickMortar
  if (typeof spec.mortar === 'string' && spec.mortar in BRICK_MORTAR_LABEL) mortar = spec.mortar as BrickMortar
  else { mortar = 'lime'; assumed.push('the mortar (taken as lime mortar, as suits an old solid wall)') }

  // openings: only those with a stated width and height, a count of each
  const wanted: { kind: AssemblyOpening['kind']; widthMm: number; heightMm: number }[] = []
  const list = Array.isArray(spec.openings) ? spec.openings.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const w = between(raw.widthM, 0, 10), oh = between(raw.heightM, 0, 6)
    if (w === null || oh === null) continue   // never invent an opening's size
    const k = typeof raw.kind === 'string' ? raw.kind.toLowerCase().replace(/[^a-z]/g, '') : ''
    const kind: AssemblyOpening['kind'] = k === 'door' ? 'door' : k === 'bifold' ? 'bifold' : 'window'
    const count = whole(raw.count, 1, 20) ?? 1
    for (let i = 0; i < count; i++) wanted.push({ kind, widthMm: Math.round(w * 1000), heightMm: Math.round(oh * 1000) })
  }
  // spread them along the wall (the scope does not say where): equal gaps, side by side with the wall's own length if they do not all fit
  const lengthMm = Math.round(lengthM * 1000)
  const totalW = wanted.reduce((s, o) => s + o.widthMm, 0)
  const gap = wanted.length > 0 ? Math.max(0, (lengthMm - totalW) / (wanted.length + 1)) : 0
  let x = gap
  const openings: AssemblyOpening[] = wanted.map(o => {
    const op: AssemblyOpening = {
      id: 'ai-open-' + ++seq, kind: o.kind, widthMm: o.widthMm, heightMm: o.heightMm, offsetMm: Math.round(x),
      sillHeightMm: o.kind === 'window' ? Math.max(0, Math.min(800, heightMm - o.heightMm)) : 0,
    }
    x += o.widthMm + gap
    return op
  })
  if (openings.length > 0) assumed.push('where the openings sit along the wall (spread evenly)')

  let lintel: BrickLintel = 'concrete'
  if (typeof spec.lintel === 'string' && spec.lintel in BRICK_LINTEL_LABEL) lintel = spec.lintel as BrickLintel
  else if (openings.length > 0) assumed.push('what goes over the openings (taken as precast concrete lintels)')

  return { lengthMm, heightMm, thickness, bond, facing, backing, mortar, lintel, openings, assumed }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for the solid brick wall calculator line, with the exact words it may use. */
export function solidBrickPromptGuide(): string {
  const thick = (Object.keys(BRICK_THICKNESS) as BrickThickness[]).map(k => `${k} = ${BRICK_THICKNESS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const facings = (Object.keys(FACING_BRICK) as FacingBrick[]).map(k => `${k} = ${FACING_BRICK[k].label.toLowerCase()}`).join('; ')
  const lintels = (Object.keys(BRICK_LINTEL_LABEL) as BrickLintel[]).map(k => `${k} = ${BRICK_LINTEL_LABEL[k].split(' (')[0].toLowerCase()}`).join('; ')
  return `For the solid brick wall calculator line ("Solid Brick Wall – Victorian (1½ brick)"), add "calc": {"lengthM": <m>, "heightM": <m>, "thickness": "<one of>", "thicknessMm": <mm>, "bond": "english"|"flemish"|"english-garden", "facing": "<one of>", "backing": "commons"|"all-facing", "mortar": "lime"|"cement", "lintel": "<one of>", "openings": [{"kind": "window"|"door"|"bifold", "widthM": <m>, "heightM": <m>, "count": <n>}]}. ONE wall only (the main one). "lengthM" is required: if the scope states no length, leave "calc" out. Every other field only if the scope states it; leave it out otherwise (never guess). "thickness" is one of: ${thick}; give "thicknessMm" instead if the scope gives a thickness in mm or inches (a 9 inch wall is 225mm, a 13 or 14 inch wall about 330-350mm, a "12 inch" wall about 300mm). "facing" is one of: ${facings}. "backing" is "all-facing" only if facing bricks go all the way through, otherwise leave it out. "lintel" is one of: ${lintels}. List an opening ONLY if the scope states its size (width and height), once per kind with a "count". Use this line for any NEW solid brick wall with no cavity (an old-fashioned wall as on a Victorian house, matching existing brickwork), not for a cavity wall and not for taking a wall down or repairing one.`
}
