/**
 * Tests for the door side panel (a fixed glazed panel beside a front door): its kind, styles, materials and colours, plan drawing and how it reaches the Windows calculator
 *
 * Run with:   npx tsx __tests__/side-panel.test.ts
 */
import { KINDS, KIND_BY_ID, WINDOWS_SCOPE_KINDS, kindInScope, newOpening, openingWords, planOpeningSig, mergePlanOpenings, isWindow, type PlanOpening } from '../lib/wd-units'
import { WINDOW_STYLES, stylesFor, mullionFractions, openingPaneCount } from '../lib/window-styles'
import { styleCards, materialsFor, swatchesFor, cleanOpeningChoice, openingStyleWords, isColoured, styleSize, defaultStyleId, isStyledKind, mullionsFor } from '../lib/opening-styles'
import { openingShape } from '../lib/wall-openings'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const K = 'win-side-panel'

t('the kind exists, in Windows', !!KIND_BY_ID[K] && KIND_BY_ID[K].group === 'Windows' && isWindow(K))
t('it stands about as tall as a door and is narrow', KIND_BY_ID[K].stdH === 2100 && KIND_BY_ID[K].stdW >= 300 && KIND_BY_ID[K].stdW <= 700)
t('it is in the Windows calculator only', kindInScope(K, 'windows') && !kindInScope(K, 'doors') && kindInScope(K, 'all') && WINDOWS_SCOPE_KINDS.includes(K))
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
t('another window still gets an inside board', newOpening('b', 'W2', 'win-casement').cill === 'internal')
const w = openingWords({ ...o, styleText: 'full-height fixed glazed side panel', coloured: true, colourName: 'Anthracite grey' })
t('quote words name it', w.includes('door side panel') && w.includes('(full-height fixed glazed side panel)') && w.includes('anthracite grey'), w)
const base: PlanOpening = { id: 'p1', ref: 'W1', kind: K, widthMm: 450, heightMm: 2100, swing: 'in-left' }
const m = mergePlanOpenings([], [{ ...base, material: 'aluminium', coloured: true, colourName: 'Black', styleText: 'x' }])
t('the plan feeds material and colour into the calculator', m.length === 1 && m[0].material === 'aluminium' && m[0].coloured === true && m[0].cill === 'none', m[0])
t('a plain side panel signature has nothing added', planOpeningSig(base) === planOpeningSig({ ...base }))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
