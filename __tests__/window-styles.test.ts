/**
 * Tests for the window style picker's rules (lib/window-styles.ts), the plan drawing of a style's bars (lib/wall-openings.ts) and how a window's choices reach the Windows calculator (lib/wd-units.ts)
 *
 * Run with:   npx tsx __tests__/window-styles.test.ts
 */

import {
  WINDOW_STYLES, WINDOW_KINDS, DEFAULT_STYLE, FRAME_COLOURS, stylesFor, styleById, styleOrDefault, cleanChoice, styleWords, mullionFractions, isWindowKind, DEFAULT_CHOICE,
} from '../lib/window-styles'
import { openingShape } from '../lib/wall-openings'
import { mergePlanOpenings, planOpeningSig, openingWords, newOpening, unitPrice, KINDS, type PlanOpening } from '../lib/wd-units'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

// ---- the lists
t('every window kind has styles', WINDOW_KINDS.every(k => stylesFor(k).length >= 4))
t('the five kinds are exactly the Windows calculator kinds', WINDOW_KINDS.length === 5 && WINDOW_KINDS.every(k => KINDS.some(x => x.id === k && x.group === 'Windows')))
t('doors have no styles (yet)', stylesFor('door-front').length === 0 && stylesFor('door-int-single').length === 0 && !isWindowKind('door-front'))
for (const k of WINDOW_KINDS) {
  const ids = WINDOW_STYLES[k].map(s => s.id)
  t(k + ': style ids are all different', new Set(ids).size === ids.length, ids)
  t(k + ': the default style exists', !!styleById(k, DEFAULT_STYLE[k]))
  for (const s of WINDOW_STYLES[k]) {
    t(`${k}/${s.id}: has panes`, s.panes.length > 0)
    t(`${k}/${s.id}: every pane is a polygon inside the frame`, s.panes.every(p => p.p.length >= 3 && p.p.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)))
    t(`${k}/${s.id}: sensible size`, s.w >= 300 && s.w <= 4000 && s.h >= 300 && s.h <= 2400)
    t(`${k}/${s.id}: the shape ratio is the size's`, Math.abs(s.ar - s.w / s.h) < 0.45, [s.ar, s.w / s.h])
    t(`${k}/${s.id}: words are not empty`, s.words.length > 5 && s.name.length > 3)
  }
}
t('sash windows only have sliding panes', WINDOW_STYLES['win-sash'].every(s => s.panes.every(p => p.t === 'SU' || p.t === 'SD')))
t('tilt-and-turn windows have a tilt-and-turn pane', WINDOW_STYLES['win-tilt-turn'].every(s => s.panes.some(p => p.t === 'TL' || p.t === 'TR')))
t('fixed windows include one with no opener', WINDOW_STYLES['win-fixed'].some(s => s.panes.every(p => p.t === 'F')))
t('the bow bay has five panes', WINDOW_STYLES['win-bay'].find(s => s.id === 'bay-bow-5')!.panes.length === 5)
t('casement starts on two-pane, one opens (the kind size 1200 x 1200)', styleOrDefault('win-casement', undefined)!.id === 'two-one-opens' && styleOrDefault('win-casement', undefined)!.w === 1200)

// ---- a style belongs to its kind
t('a casement style given to a bay window is the bay default', styleOrDefault('win-bay', 'two-one-opens')!.id === 'bay-splay-3')
t('an unknown style is the default', styleOrDefault('win-casement', 'nope')!.id === 'two-one-opens')
t('no style for a door', styleOrDefault('door-front', 'x') === undefined)

// ---- cleaning a choice
{
  const c = cleanChoice('win-casement', { style: 'bay-splay-3', material: 'timber', colour: 'pink', bars: 'zigzag' })
  t('bad style, material, colour and bars all fall back', c.style === 'two-one-opens' && c.material === 'upvc' && c.colour === 'white' && c.bars === 'none', c)
  const d = cleanChoice('win-sash', { style: 'sash-6-6', material: 'aluminium', colour: 'anthracite', bars: 'georgian' })
  t('a good choice is kept', d.style === 'sash-6-6' && d.material === 'aluminium' && d.colour === 'anthracite' && d.bars === 'georgian', d)
  t('nothing at all gives the plain start', JSON.stringify(cleanChoice('win-fixed', undefined)) === JSON.stringify(DEFAULT_CHOICE('win-fixed')))
  t('the plain start is uPVC, white, no bars', DEFAULT_CHOICE('win-casement').material === 'upvc' && DEFAULT_CHOICE('win-casement').colour === 'white' && DEFAULT_CHOICE('win-casement').bars === 'none')
}
t('frame colours: white first, five of them', FRAME_COLOURS[0].id === 'white' && FRAME_COLOURS.length === 5)

// ---- the words
t('style words, no bars', styleWords('win-casement', { style: 'two-both-open' }) === 'two-pane, both opening')
t('style words with Georgian bars', styleWords('win-casement', { style: 'two-both-open', bars: 'georgian' }) === 'two-pane, both opening, with Georgian bars', styleWords('win-casement', { style: 'two-both-open', bars: 'georgian' }))
t('style words with astragal bars', styleWords('win-sash', { style: 'sash-1-1', bars: 'astragal' }).includes('astragal glazing bars'))
t('no words for a door', styleWords('door-front', { style: 'x' }) === '')

// ---- the dividing bars across a window on the plan
t('a single pane has no bars across it', mullionFractions('win-casement', 'single-side').length === 0)
t('two panes: one bar in the middle', JSON.stringify(mullionFractions('win-casement', 'two-one-opens')) === '[0.5]')
t('three panes: two bars', JSON.stringify(mullionFractions('win-casement', 'three-side-openers')) === '[0.3,0.7]', mullionFractions('win-casement', 'three-side-openers'))
t('a splayed bay: bars where the sides meet the centre', JSON.stringify(mullionFractions('win-bay', 'bay-splay-3')) === '[0.27,0.73]')
t('a bow bay has four bars', mullionFractions('win-bay', 'bay-bow-5').length === 4)
t('top lights do not add bars across the width', JSON.stringify(mullionFractions('win-casement', 'top-light-opener')) === '[]')
t('a door has none', mullionFractions('door-front', 'x').length === 0)
{
  const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
  const base = { distPx: 300, kind: 'win-casement' as const, widthMm: 1800, swing: 'in-left' as const }
  const plain = openingShape(wall, false, base, 0.01, { lo: -10, hi: 10, inside: 1 })!
  const three = openingShape(wall, false, { ...base, mullions: [0.3, 0.7] }, 0.01, { lo: -10, hi: 10, inside: 1 })!
  const framePrims = (s: typeof plain) => s.prims.filter(p => p.type === 'line' && p.style === 'frame').length
  t('two bars across the frame add two frame lines', framePrims(three) === framePrims(plain) + 2, [framePrims(plain), framePrims(three)])
  const bar = three.prims.filter(p => p.type === 'line' && p.style === 'frame' && Math.abs((p as { a: { x: number } }).a.x - (p as { b: { x: number } }).b.x) < 1e-6) as { a: { x: number; y: number }; b: { x: number; y: number } }[]
  const left = three.ends[0].x, width = three.ends[1].x - three.ends[0].x
  t('the bars sit at 30% and 70% of the width', bar.length === 2 && bar.every(b => [0.3, 0.7].some(f => Math.abs(b.a.x - (left + width * f)) < 1e-6)), bar)
  t('a door is not given bars', openingShape(wall, false, { ...base, kind: 'door-front', mullions: [0.5] }, 0.01, { lo: -10, hi: 10, inside: 1 })!.prims.length === openingShape(wall, false, { ...base, kind: 'door-front' }, 0.01, { lo: -10, hi: 10, inside: 1 })!.prims.length)
}

// ---- the calculator is fed the choices
const plan = (over: Partial<PlanOpening> = {}): PlanOpening => ({ id: 'a', ref: 'W1', kind: 'win-casement', widthMm: 1200, heightMm: 1200, swing: 'in-left', ...over })
{
  const plain = mergePlanOpenings([], [plan()])[0]
  t('a window with no choice keeps the calculator\'s own start (uPVC, white)', plain.material === 'upvc' && plain.coloured === false && !plain.styleText)
  const alu = mergePlanOpenings([], [plan({ material: 'aluminium', coloured: true, colourName: 'Anthracite grey', styleText: 'two-pane, both opening' })])[0]
  t('aluminium reaches the calculator', alu.material === 'aluminium')
  t('a coloured frame reaches the calculator', alu.coloured === true && alu.colourName === 'Anthracite grey')
  t('the style words reach the calculator', alu.styleText === 'two-pane, both opening')
  t('aluminium costs more than uPVC (the sample factor)', unitPrice(alu) > unitPrice({ ...alu, material: 'upvc', coloured: true }))
  t('a coloured frame costs more than white', unitPrice({ ...alu, material: 'upvc', coloured: true }) > unitPrice({ ...alu, material: 'upvc', coloured: false }))
  const words = openingWords(alu)
  t('the quote words name material, style and colour', words.includes('aluminium') && words.includes('two-pane, both opening') && words.includes('anthracite grey'), words)
  t('white window words say white', openingWords(mergePlanOpenings([], [plan({ material: 'upvc', coloured: false, styleText: 'single side-hung opening light' })])[0]).endsWith(', white'))
  t('a window with no picker words reads as before', openingWords(newOpening('x', 'W1', 'win-casement')) === '1200 x 1200 uPVC casement window, double glazed, white', openingWords(newOpening('x', 'W1', 'win-casement')))
}
{
  // follows the drawing when the choice changes, is otherwise left as typed
  const first = mergePlanOpenings([], [plan({ material: 'upvc', coloured: false, styleText: 'a' })])
  const typed = [{ ...first[0], glazing: 'triple' as const }]
  const same = mergePlanOpenings(typed, [plan({ material: 'upvc', coloured: false, styleText: 'a' })])[0]
  t('nothing changed on the plan: what was typed in the calculator stays', same.glazing === 'triple')
  const changed = mergePlanOpenings(typed, [plan({ material: 'aluminium', coloured: false, styleText: 'a' })])[0]
  t('the material changed on the plan: the calculator follows', changed.material === 'aluminium' && changed.glazing === 'triple', changed)
  const typedMat = [{ ...first[0], material: 'timber' as const }]
  t('a material typed in the calculator stays while the plan is unchanged', mergePlanOpenings(typedMat, [plan({ material: 'upvc', coloured: false, styleText: 'a' })])[0].material === 'timber')
  // a window saved before the picker: same signature, so nothing is overwritten
  const old = plan()
  t('an opening with no choice has the signature it always had', planOpeningSig(old) === 'win-casement|1200|1200|in-left|W1|', planOpeningSig(old))
  t('a choice changes the signature', planOpeningSig(plan({ material: 'aluminium' })) !== planOpeningSig(old))
  t('each part of the choice changes it', new Set([planOpeningSig(plan({ material: 'aluminium' })), planOpeningSig(plan({ coloured: true })), planOpeningSig(plan({ colourName: 'Black' })), planOpeningSig(plan({ styleText: 'x' }))]).size === 4)
  const saved = [{ ...newOpening('op-a', 'W1', 'win-casement'), planId: 'a', fromPlan: planOpeningSig(old), material: 'aluminium' as const }]
  t('a window saved before the picker keeps what was typed in its calculator', mergePlanOpenings(saved, [old])[0].material === 'aluminium')
}

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
