/**
 * Tests for resizing a door or window placed on a wall by dragging its end (lib/wall-openings.ts resizeOpeningEdge, openingShape ends) and for the standard door sizes (lib/wd-units.ts standardSizesFor)
 *
 * Run with:   npx tsx __tests__/opening-resize.test.ts
 */

import { resizeOpeningEdge, openingShape, pointAtDist } from '../lib/wall-openings'
import { standardSizesFor, matchStandardSize, KINDS } from '../lib/wd-units'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) < e

// a straight wall 10 m long drawn left to right at 10 mm a pixel (mpp 0.01): 1000 px; an 826 door centred at 3 m (300 px)
const mpp = 0.01
const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
const door = { distPx: 300, widthMm: 826 }
const px = (mm: number) => mm / (mpp * 1000)

// ---- dragging the far end out: the start end (300 - 41.3 = 258.7 px) stays put
{
  const startEdge = 300 - px(826) / 2
  const r = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: 400, y: 5 }, { stepMm: 10 })!
  t('far end: width follows the pointer', r.widthMm === Math.round((400 - startEdge) / px(1) / 10) * 10 || near(r.widthMm, (400 - startEdge) * mpp * 1000, 10), r)
  t('far end: start jamb did not move', near(r.distPx - px(r.widthMm) / 2, startEdge, 0.5), r)
}
// ---- dragging the start end in: the far end stays put
{
  const farEdge = 300 + px(826) / 2
  const r = resizeOpeningEdge(wall, false, door, mpp, 'start', { x: 280, y: 0 }, { stepMm: 10 })!
  t('start end: far jamb did not move', near(r.distPx + px(r.widthMm) / 2, farEdge, 0.5), r)
  t('start end: narrower', r.widthMm < 826, r)
}
// ---- the minimum and maximum
{
  const tiny = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: 0, y: 0 })!
  t('dragged past the other jamb: the minimum width (300)', tiny.widthMm === 300, tiny)
  const huge = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: 9999, y: 0 }, { maxMm: 3000 })!
  t('a limit of 3000 holds', huge.widthMm === 3000, huge)
}
// ---- it never runs off the end of the wall
{
  const near0 = { distPx: 60, widthMm: 826 }   // start edge at 60 - 41.3 = 18.7 px from the wall's end
  const r = resizeOpeningEdge(wall, false, near0, mpp, 'start', { x: -500, y: 0 })!
  const startEdge = r.distPx - px(r.widthMm) / 2
  t('start end stops at the wall end', startEdge >= -1e-6, r)
  const end = { distPx: 950, widthMm: 826 }
  const r2 = resizeOpeningEdge(wall, false, end, mpp, 'end', { x: 5000, y: 0 })!
  t('far end stops at the wall end', r2.distPx + px(r2.widthMm) / 2 <= 1000 + 1e-6, r2)
}
// ---- rounding and standard sizes
{
  const startEdge = 300 - px(826) / 2
  const r = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: startEdge + px(907), y: 0 })!
  t('rounded to 10mm', r.widthMm % 10 === 0, r)
  const sn = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: startEdge + px(920), y: 0 }, { snapTo: [726, 826, 926], snapTolMm: 15 })!
  t('within 15mm of 926 snaps to 926', sn.widthMm === 926, sn)
  const nosn = resizeOpeningEdge(wall, false, door, mpp, 'end', { x: startEdge + px(880), y: 0 }, { snapTo: [726, 826, 926], snapTolMm: 15 })!
  t('880 is not near a standard width', nosn.widthMm === 880, nosn)
}
// ---- a wall that turns a corner: the opening stays on its own straight length
{
  const L = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }]
  const r = resizeOpeningEdge(L, false, { distPx: 400, widthMm: 826 }, mpp, 'end', { x: 800, y: 0 })!
  t('does not wrap the corner', r.distPx + px(r.widthMm) / 2 <= 500 + 1e-6, r)
  // an opening on the second leg, dragged with a pointer on that leg's line
  const r2 = resizeOpeningEdge(L, false, { distPx: 750, widthMm: 826 }, mpp, 'end', { x: 500, y: 300 })!
  t('second leg resizes along its own line', r2 !== null && r2.widthMm > 826, r2)
}
// ---- a closed (rectangle) wall
{
  const R = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]
  const r = resizeOpeningEdge(R, true, { distPx: 200, widthMm: 826 }, mpp, 'start', { x: 120, y: 0 })!
  t('closed wall: resizes', r !== null && r.widthMm > 826, r)
}
// ---- bad input
t('no scale gives null', resizeOpeningEdge(wall, false, door, 0, 'end', { x: 1, y: 1 }) === null)
t('no wall gives null', resizeOpeningEdge([{ x: 0, y: 0 }], false, door, mpp, 'end', { x: 1, y: 1 }) === null)

// ---- the shape gives the two jamb ends on the wall's line, one door-width apart
{
  const s = openingShape(wall, false, { distPx: 300, kind: 'door-int-single', widthMm: 826, swing: 'in-left' }, mpp, { lo: -10, hi: 10, inside: 1 })!
  t('ends: two points', s.ends.length === 2)
  t('ends: one width apart', near(Math.hypot(s.ends[1].x - s.ends[0].x, s.ends[1].y - s.ends[0].y), px(826), 1e-6), s.ends)
  t('ends: start is the smaller distance', s.ends[0].x < s.ends[1].x, s.ends)
  const mid = pointAtDist(wall, false, 300)!
  t('ends: centred on the opening', near((s.ends[0].x + s.ends[1].x) / 2, mid.x, 1e-6))
  // a wider opening is drawn wider (the leaf's swing arc grows with it)
  const wide = openingShape(wall, false, { distPx: 300, kind: 'door-int-single', widthMm: 926, swing: 'in-left' }, mpp, { lo: -10, hi: 10, inside: 1 })!
  const arc = (sh: typeof s) => sh.prims.find(p => p.type === 'arc') as { r: number } | undefined
  t('a wider door has a bigger swing arc', arc(wide)!.r > arc(s)!.r, [arc(wide), arc(s)])
}

// ---- the standard sizes
{
  const single = standardSizesFor('door-int-single')
  t('internal door: metric and imperial sizes', single.some(s => s.system === 'Metric') && single.some(s => s.system === 'Imperial'))
  t('internal door: 826 x 2040 is in the list', single.some(s => s.widthMm === 826 && s.heightMm === 2040))
  t('internal door: 2\'6" x 6\'6" is 762 x 1981', single.some(s => s.widthMm === 762 && s.heightMm === 1981 && s.label.includes(`2'6"`)))
  t('the starting size of an internal door is a standard one', !!matchStandardSize('door-int-single', 826, 2040))
  t('fire door and pocket door have the same list', standardSizesFor('door-int-fire').length === single.length && standardSizesFor('door-int-pocket').length === single.length)
  const pairs = standardSizesFor('door-int-double')
  t('pairs: 2 x 826 = 1652', pairs.some(s => s.widthMm === 1652 && s.heightMm === 2040))
  t('pairs: every width is two leaves', pairs.every(s => s.widthMm % 2 === 0))
  t('no standard sizes for a window or an external door', standardSizesFor('win-casement').length === 0 && standardSizesFor('door-front').length === 0)
  t('the ids of a list are all different', new Set(single.map(s => s.id)).size === single.length)
  t('no match for a made-up size', !matchStandardSize('door-int-single', 800, 2000))
  t('every kind answers without error', KINDS.every(k => Array.isArray(standardSizesFor(k.id))))
}

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
