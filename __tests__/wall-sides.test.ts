/**
 * Tests that what is cut into a wall (doors, windows, structural openings) is cut on the side the wall is PAINTED (lib/wall-drawing.ts paintedSides)
 *
 * Run with:   npx tsx __tests__/wall-sides.test.ts
 */
import { chainWalls, wallDrawing, wallBand, paintedSides, totalMm, type WallPiece, type WallSpec } from '../lib/wall-drawing'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

type Pt = { x: number; y: number }
const P = (x: number, y: number): Pt => ({ x, y })
const mpp = 0.01
const spec: WallSpec = { label: '300 cavity', layers: [{ kind: 'brick', mm: 100 }, { kind: 'cavity', mm: 100 }, { kind: 'block', mm: 100 }] }
const reachPx = (1.5 * totalMm(spec.layers)) / (mpp * 1000)

const inPoly = (p: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c } return c }

/** Is the middle of the opening band of each wall inside what is painted? (the band as the screen works it out: wallBand with the painted side) */
function misplaced(pieces: WallPiece[]): string[] {
  const sides = paintedSides(pieces, 3)
  const out: string[] = []
  for (const ch of chainWalls(pieces, 3)) {
    const wd = wallDrawing(ch.points, spec, mpp, { ref: 'outer', closed: ch.closed, flip: ch.flip })!
    for (const id of ch.ids) {
      const w = pieces.find(p => p.id === id)!
      const band = wallBand(w.points, spec, mpp, { ref: 'outer', closed: false, flip: sides.get(id) === -1 })!
      const a = w.points[0], b = w.points[1], l = Math.hypot(b.x - a.x, b.y - a.y)
      const N = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
      const mid = (band.lo + band.hi) / 2
      // look at a point part way along, clear of the corners
      for (const f of [0.37, 0.61]) {
        const q = { x: a.x + (b.x - a.x) * f + N.x * mid, y: a.y + (b.y - a.y) * f + N.y * mid }
        const inside = wd.rings.reduce((n, r) => n + (inPoly(q, r) ? 1 : 0), 0) % 2 === 1
        if (!inside) { out.push(id); break }
      }
    }
  }
  return out
}

// the house below the line y = 300 and an extension above it, as on Deon's plan
const base: [string, Pt, Pt, string][] = [
  ['H-top', P(0, 300), P(700, 300), 'house'], ['H-right', P(700, 300), P(700, 600), 'house'], ['H-bottom', P(700, 600), P(0, 600), 'house'], ['H-left', P(0, 600), P(0, 300), 'house'],
  ['E-left', P(150, 300), P(150, 100), 'ext'], ['E-top', P(150, 100), P(700, 100), 'ext'], ['E-right', P(700, 100), P(700, 300), 'ext'],
]
const split: [string, Pt, Pt, string][] = [['H-a', P(0, 300), P(150, 300), 'house'], ['H-top', P(150, 300), P(700, 300), 'house'], ...base.slice(1)]

// every way round each wall can be drawn, in both orders, same and different make-up, with and without a flip on the house top wall
for (const [name, set] of [['one house wall', base], ['house wall split at the extension', split]] as const) {
  let wrong = 0, tried = 0, example = ''
  for (const sameMake of [false, true]) for (const flipTop of [false, true]) for (let mask = 0; mask < (1 << set.length); mask++) {
    const walls: WallPiece[] = set.map(([id, a, b, make], i) => ({ id, points: mask & (1 << i) ? [b, a] : [a, b], closed: false, flip: flipTop && id === 'H-top', group: '2-ext|outer|' + (sameMake ? 'same' : make), reachPx }))
    for (const order of [walls, walls.slice().reverse()]) {
      tried++
      const m = misplaced(order)
      if (m.length) { wrong++; if (!example) example = `mask ${mask} same ${sameMake} flip ${flipTop}: ${m.join()}` }
    }
  }
  t(`${name}: openings sit inside the painted wall in all ${tried} layouts`, wrong === 0, { wrong, example })
}

// the plain cases
const one = (a: Pt, b: Pt, flip = false): WallPiece => ({ id: 'w', points: [a, b], closed: false, flip, group: 'g', reachPx })
t('a lone wall: painted to the right of the way it was drawn', paintedSides([one(P(0, 0), P(500, 0))]).get('w') === 1)
t('a lone flipped wall: to the left', paintedSides([one(P(0, 0), P(500, 0), true)]).get('w') === -1)
const ring = (cw: boolean): WallPiece[] => { const c = cw ? [P(0, 0), P(500, 0), P(500, 400), P(0, 400)] : [P(0, 0), P(0, 400), P(500, 400), P(500, 0)]; return c.map((p, i) => ({ id: 's' + i, points: [p, c[(i + 1) % 4]], closed: false, flip: false, group: 'g', reachPx })) }
t('a house drawn clockwise: every side to the right (inward)', [...paintedSides(ring(true)).values()].every(v => v === 1) && paintedSides(ring(true)).size === 4)
t('a house drawn anticlockwise: every side to the left (still inward)', [...paintedSides(ring(false)).values()].every(v => v === -1) && paintedSides(ring(false)).size === 4)
t('the anticlockwise house: openings are inside the painted wall', misplaced(ring(false)).length === 0)
t('a rectangle wall is left to its own outline (not in the map)', paintedSides([{ id: 'r', points: [P(0, 0), P(500, 0), P(500, 400), P(0, 400)], closed: true, flip: false, group: 'g' }]).size === 0)
t('no walls, nothing', paintedSides([]).size === 0)

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
