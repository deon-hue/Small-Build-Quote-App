/**
 * Tests for the door side panel (a fixed glazed panel beside a front door): its kind, styles, materials and colours, plan drawing and how it reaches the Doors calculator
 *
 * Run with:   npx tsx __tests__/side-panel.test.ts
 */
import { KINDS, KIND_BY_ID, currentKind, WINDOWS_SCOPE_KINDS, kindInScope, newOpening, openingWords, planOpeningSig, mergePlanOpenings, isWindow, type PlanOpening } from '../lib/wd-units'
import { WINDOW_STYLES, stylesFor, mullionFractions, openingPaneCount } from '../lib/window-styles'
import { styleCards, materialsFor, swatchesFor, cleanOpeningChoice, openingStyleWords, isColoured, styleSize, defaultStyleId, isStyledKind, mullionsFor } from '../lib/opening-styles'
import { openingShape, snapBesideNeighbour, snapsBeside, panelsAttachedTo, moveWithPanels } from '../lib/wall-openings'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const K = 'door-side-panel' as const

t('the kind exists, in External doors (not Windows)', !!KIND_BY_ID[K] && KIND_BY_ID[K].group === 'External doors' && !isWindow(K))
t('it stands about as tall as a door and is narrow', KIND_BY_ID[K].stdH === 2100 && KIND_BY_ID[K].stdW >= 300 && KIND_BY_ID[K].stdW <= 700)
t('it is in the Doors calculator only', kindInScope(K, 'doors') && !kindInScope(K, 'windows') && kindInScope(K, 'all') && !WINDOWS_SCOPE_KINDS.includes(K))
t('the old win- id still finds it', KIND_BY_ID['win-side-panel'] === KIND_BY_ID[K] && currentKind('win-side-panel') === K && currentKind('win-bay') === 'win-bay')
t('every kind is in exactly one scope', KINDS.every(k => kindInScope(k.id, 'windows') !== kindInScope(k.id, 'doors')))
t('it is a styled kind with six styles', isStyledKind(K) && styleCards(K).length === 6 && stylesFor(K).length === 6)
t('its default style exists', styleCards(K).some(s => s.id === defaultStyleId(K)))
t('no pane of a side panel opens', WINDOW_STYLES[K].every(s => s.panes.every(p => p.t === 'F' || p.t === 'S')))
t('openingPaneCount ignores solid panels', openingPaneCount(WINDOW_STYLES[K].find(s => s.id === 'sp-glass-over-solid')!) === 0)
t('a glass-over-solid style has a solid pane and a glazed one', (() => { const s = WINDOW_STYLES[K].find(x => x.id === 'sp-glass-over-solid')!; return s.panes.some(p => p.t === 'S') && s.panes.some(p => p.t === 'F') })())
t('panes of each style fill the frame (the heights add to 1)', WINDOW_STYLES[K].every(s => Math.abs(s.panes.reduce((a, p) => a + (Math.max(...p.p.map(q => q[1])) - Math.min(...p.p.map(q => q[1]))) * (Math.max(...p.p.map(q => q[0])) - Math.min(...p.p.map(q => q[0]))), 0) - 1) < 1e-9))
t('no vertical bars across a side panel (the plan draws none)', WINDOW_STYLES[K].every(s => mullionFractions(K, s.id).length === 0))
{
  const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
  const sh = openingShape(wall, false, { distPx: 300, kind: K, widthMm: 450, swing: 'in-left' } as never, 0.01, { lo: -10, hi: 10, inside: 1 })!
  t('plan shape: two frame lines, two glass lines, no bars', sh.prims.filter(p => (p as { style?: string }).style === 'frame').length === 2 && sh.prims.filter(p => (p as { style?: string }).style === 'glass').length === 2)
}

// materials and colours match the door
t('materials: uPVC first, then aluminium, timber, composite', JSON.stringify(materialsFor(K).map(m => m.id)) === '["upvc","aluminium","timber","composite"]')
t('colours are the door colours, white first', swatchesFor(K).length === 8 && swatchesFor(K)[0].id === 'white')
t('other windows still offer uPVC or aluminium only', JSON.stringify(materialsFor('win-casement').map(m => m.id)) === '["upvc","aluminium"]' && swatchesFor('win-casement').length === 5)
const c1 = cleanOpeningChoice(K, { style: 'sp-top-light', material: 'composite', colour: 'racing-green' })
t('a composite racing green choice is kept when the door has it', c1.material === 'composite' && c1.style === 'sp-top-light' && (c1.colour === 'racing-green' || swatchesFor(K).every(s => s.id !== 'racing-green')), c1)
const c2 = cleanOpeningChoice(K, { style: 'two-one-opens', material: 'steel', colour: 'purple' })
t('wrong style, material and colour fall back to the start', c2.style === 'sp-full-glass' && c2.material === 'upvc' && c2.colour === 'white', c2)
t('a casement choice with timber still falls back to uPVC', cleanOpeningChoice('win-casement', { material: 'timber' }).material === 'upvc')
t('white is not priced as coloured, anything else is', !isColoured(K, 'white') && isColoured(K, swatchesFor(K)[2].id))
t('a style carries its own size', styleSize(K, 'sp-wide')?.w === 650 && styleSize(K, 'sp-full-glass')?.h === 2100)
t('words for the quote', openingStyleWords(K, { style: 'sp-glass-over-solid' }) === 'fixed glazed side panel over a solid lower panel', openingStyleWords(K, { style: 'sp-glass-over-solid' }))

// the calculator
const o = newOpening('a', 'W1', K)
t('a new side panel has no cill or window board', o.cill === 'none' && o.widthMm === 450 && o.heightMm === 2100)
t('a window still gets an inside board and a side panel a D reference', newOpening('b', 'W2', 'win-casement').cill === 'internal' && openingShape([{ x: 0, y: 0 }, { x: 1000, y: 0 }], false, { distPx: 300, kind: K, widthMm: 450, swing: 'in-left' } as never, 0.01, { lo: -10, hi: 10, inside: 1 })!.prims.length > 0)
const w = openingWords({ ...o, styleText: 'full-height fixed glazed side panel', coloured: true, colourName: 'Anthracite grey' })
t('quote words name it', w.includes('door side panel') && w.includes('(full-height fixed glazed side panel)') && w.includes('anthracite grey'), w)
const base: PlanOpening = { id: 'p1', ref: 'W1', kind: K, widthMm: 450, heightMm: 2100, swing: 'in-left' }
const m = mergePlanOpenings([], [{ ...base, material: 'aluminium', coloured: true, colourName: 'Black', styleText: 'x' }])
t('the plan feeds material and colour into the calculator', m.length === 1 && m[0].material === 'aluminium' && m[0].coloured === true && m[0].cill === 'none', m[0])
t('a plain side panel signature has nothing added', planOpeningSig(base) === planOpeningSig({ ...base }))

// snapping flush against a door (1 plan pixel = 10mm here)
{
  const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
  const door = { distPx: 500, widthMm: 900, kind: 'door-front' }
  const snap = (kind: string, w: number, d: number, nb = [door], reach = 25, path = wall) => snapBesideNeighbour(path, false, nb, kind, w, d, 0.01, reach)
  t('which kinds snap together', snapsBeside(K, 'door-front') && snapsBeside(K, 'door-french') && snapsBeside('door-front', K) && !snapsBeside(K, 'door-int-single') && !snapsBeside(K, 'win-casement') && !snapsBeside(K, K) && !snapsBeside('door-front', 'door-back') && !snapsBeside('win-casement', 'door-front'))
  t('a panel just right of the door snaps edge to edge (door ends at 545, panel is 45 wide)', snap(K, 450, 575) === 567.5, snap(K, 450, 575))
  t('and just left of it', snap(K, 450, 420) === 432.5, snap(K, 450, 420))
  t('the snapped panel exactly touches the door', (() => { const d = snap(K, 450, 575)!; return Math.abs((d - 22.5) - (500 + 45)) < 1e-9 })())
  t('too far away: no snap', snap(K, 450, 640) === null)
  t('just inside the reach snaps', snap(K, 450, 567.5 + 24) === 567.5 && snap(K, 450, 567.5 + 26) === null)
  t('with the cursor over the door itself there is nothing to snap to (the panel is too far from either edge)', snap(K, 450, 500) === null && snap(K, 450, 440) === 432.5 && snap(K, 450, 560) === 567.5)
  t('a window beside it does not snap', snap(K, 450, 575, [{ ...door, kind: 'win-casement' }]) === null)
  t('an internal door does not snap', snap(K, 450, 575, [{ ...door, kind: 'door-int-single' }]) === null)
  t('a wider panel keeps flush: 650 wide', snap(K, 650, 600) === 500 + 45 + 32.5)
  t('a door placed beside a side panel snaps to it too', snap('door-front', 900, 590, [{ distPx: 500, widthMm: 450, kind: K }]) === 500 + 22.5 + 45, snap('door-front', 900, 590, [{ distPx: 500, widthMm: 450, kind: K }]))
  t('it will not snap where the panel would run off the wall end', snap(K, 450, 990, [{ distPx: 955, widthMm: 900, kind: 'door-front' }]) === null ? true : snap(K, 450, 990, [{ distPx: 955, widthMm: 900, kind: 'door-front' }])! <= 1000 - 22.5)
  t('and when only the far side fits it snaps to that one', snap(K, 450, 990, [{ distPx: 955, widthMm: 900, kind: 'door-front' }], 120) === 955 - 45 - 22.5)
  const bent = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }]
  t('it never snaps round a corner (the right side would not fit before the bend, so the left side is used)', snap(K, 450, 600, [{ distPx: 540, widthMm: 900, kind: 'door-front' }], 150, bent) === 540 - 45 - 22.5, snap(K, 450, 600, [{ distPx: 540, widthMm: 900, kind: 'door-front' }], 150, bent))
  t('no scale: no snap', snapBesideNeighbour(wall, false, [door], K, 450, 575, 0, 25) === null)
  t('no neighbours: no snap', snap(K, 450, 575, []) === null)
}

// a door carries the side panels standing against it (1 plan pixel = 10mm)
{
  type P = { id: string; wallId: string; distPx: number; widthMm: number; kind: string }
  const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
  const wall2 = [{ x: 0, y: 500 }, { x: 800, y: 500 }]
  const door: P = { id: 'd', wallId: 'w1', distPx: 500, widthMm: 900, kind: 'door-front' }
  const left: P = { id: 'l', wallId: 'w1', distPx: 432.5, widthMm: 450, kind: K }       // flush on the door's left
  const right: P = { id: 'r', wallId: 'w1', distPx: 567.5, widthMm: 450, kind: K }      // flush on its right
  const far: P = { id: 'f', wallId: 'w1', distPx: 800, widthMm: 450, kind: K }          // a panel elsewhere on the wall
  const win: P = { id: 'x', wallId: 'w1', distPx: 432.5, widthMm: 450, kind: 'win-casement' }
  const ids = (a: { id: string }[]) => a.map(p => p.id).sort().join(',')
  t('panels attached: the ones flush against the door, either side', ids(panelsAttachedTo([door, left, right, far], 'd', 0.01)) === 'l,r')
  t('a panel a hand away is not attached; one 20mm out still is', ids(panelsAttachedTo([door, { ...left, distPx: 400 }], 'd', 0.01)) === '' && ids(panelsAttachedTo([door, { ...left, distPx: 430.5 }], 'd', 0.01)) === 'l')
  t('a panel on another wall, a window, or a door asked for a panel is not attached', ids(panelsAttachedTo([door, { ...left, wallId: 'w2' }, win], 'd', 0.01)) === '' && panelsAttachedTo([door, left], 'l', 0.01).length === 0 && panelsAttachedTo([{ ...door, kind: 'door-int-single' }, left], 'd', 0.01).length === 0)
  const moved = moveWithPanels([door, left, right, far], 'd', 'w1', wall, false, 300, 0.01)
  const at = (l: P[], i: string) => l.find(q => q.id === i)!.distPx
  t('moving the door moves both panels by the same amount', at(moved, 'd') === 300 && at(moved, 'l') === 232.5 && at(moved, 'r') === 367.5, moved.map(q => q.distPx))
  t('a panel elsewhere on the wall stays', at(moved, 'f') === 800)
  t('the panels are still flush after the move', Math.abs((at(moved, 'r') - 22.5) - (at(moved, 'd') + 45)) < 1e-9 && Math.abs((at(moved, 'l') + 22.5) - (at(moved, 'd') - 45)) < 1e-9)
  const nearEnd = moveWithPanels([door, left, right], 'd', 'w1', wall, false, 990, 0.01)
  t('near the wall end the whole group stops with its outer panel on the wall (door at 1000 - 45 - 45)', at(nearEnd, 'd') === 910 && at(nearEnd, 'r') === 977.5 && at(nearEnd, 'l') === 842.5, nearEnd.map(q => q.distPx))
  const toWall2 = moveWithPanels([door, left, right], 'd', 'w2', wall2, false, 400, 0.01)
  t('moving the door to another wall takes the panels to it with their places beside it', toWall2.every(q => q.wallId === 'w2') && at(toWall2, 'd') === 400 && at(toWall2, 'l') === 332.5 && at(toWall2, 'r') === 467.5, toWall2)
  const bent = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }]
  const bentMove = moveWithPanels([door, right], 'd', 'w1', bent, false, 560, 0.01)
  t('the group never wraps a corner: the door stops short so its panel stays on the same length', Math.abs(at(bentMove, 'r') + 22.5 - 600) < 1e-9 && at(bentMove, 'r') - at(bentMove, 'd') === 67.5 && at(bentMove, 'd') === 510, bentMove.map(q => q.distPx))
  const alone = moveWithPanels([door], 'd', 'w1', wall, false, 300, 0.01)
  t('a door with no panel moves alone and is kept on the wall as before', at(alone, 'd') === 300 && at(moveWithPanels([door], 'd', 'w1', wall, false, 2000, 0.01), 'd') === 955)
  const panelOnly = moveWithPanels([door, left], 'l', 'w1', wall, false, 100, 0.01)
  t('moving a side panel moves only the panel (it leaves the door)', at(panelOnly, 'l') === 100 && at(panelOnly, 'd') === 500)
  t('moving a window next to a door does not carry anything', at(moveWithPanels([door, win], 'x', 'w1', wall, false, 100, 0.01), 'd') === 500)
  t('the list is unchanged for an unknown id or no scale', moveWithPanels([door], 'zzz', 'w1', wall, false, 100, 0.01)[0].distPx === 500 && moveWithPanels([door], 'd', 'w1', wall, false, 100, 0)[0].distPx === 500)
}

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
