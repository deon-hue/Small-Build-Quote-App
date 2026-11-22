/**
 * Tests for the door style picker's rules (lib/door-styles.ts), the shared window and door layer (lib/opening-styles.ts), the bi-fold panels on the plan, and how a door's choices reach the Doors calculator (lib/wd-units.ts)
 *
 * Run with:   npx tsx __tests__/door-styles.test.ts
 */

import {
  DOOR_KINDS, DOOR_STYLES, DEFAULT_DOOR_STYLE, DOOR_MATERIALS, DOOR_COLOURS, INTERNAL_FINISHES, doorStylesFor, doorStyleById, isDoorKind, isInternalDoorKind,
} from '../lib/door-styles'
import {
  isStyledKind, styleCards, styleCardOrDefault, defaultStyleId, materialsFor, swatchesFor, colourLabelFor, barsAllowed, isColoured, defaultChoice, cleanOpeningChoice, openingStyleWords,
  styleSize, mullionsFor, panelsFor, defaultMaterialFor,
} from '../lib/opening-styles'
import { openingShape } from '../lib/wall-openings'
import { KINDS, KIND_BY_ID, mergePlanOpenings, openingWords, newOpening, unitPrice, type PlanOpening } from '../lib/wd-units'
import { WINDOW_KINDS } from '../lib/window-styles'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

// ---- the lists
const allDoorKinds = KINDS.filter(k => k.group !== 'Windows').map(k => k.id)
t('every door kind in the calculator has styles', allDoorKinds.every(k => isDoorKind(k) && doorStylesFor(k).length >= 3), allDoorKinds.filter(k => !isDoorKind(k)))
t('no door kind is missing from the style lists', DOOR_KINDS.length === allDoorKinds.length && DOOR_KINDS.every(k => allDoorKinds.includes(k)))
t('every kind (window or door) is styled', KINDS.every(k => isStyledKind(k.id)))
for (const k of DOOR_KINDS) {
  const list = DOOR_STYLES[k]
  const ids = list.map(s => s.id)
  t(k + ': style ids are all different', new Set(ids).size === ids.length, ids)
  t(k + ': the default style exists', !!doorStyleById(k, DEFAULT_DOOR_STYLE[k]))
  t(k + ': a first material is the start', DOOR_MATERIALS[k].length >= 1 && defaultMaterialFor(k) === DOOR_MATERIALS[k][0])
  for (const s of list) {
    t(`${k}/${s.id}: names and words`, s.name.length > 3 && s.words.length > 3)
    t(`${k}/${s.id}: features sit inside the leaf`, s.features.every(f => f.x0 >= 0 && f.x1 <= 1 && f.y0 >= 0 && f.y1 <= 1 && f.x1 >= f.x0 && f.y1 >= f.y0), s.features)
    t(`${k}/${s.id}: a sensible shape`, s.ar > 0.2 && s.ar < 3, s.ar)
    t(`${k}/${s.id}: leaves is 1 or 2`, s.leaves === 1 || s.leaves === 2)
    if (s.w !== undefined || s.h !== undefined) t(`${k}/${s.id}: own size is both sides and sensible`, !!s.w && !!s.h && s.w >= 400 && s.w <= 5000 && s.h >= 1800 && s.h <= 2400, [s.w, s.h])
  }
}
t('front and composite doors share the front styles', DOOR_STYLES['door-front'] === DOOR_STYLES['door-composite'])
t('pocket and single internal doors share styles', DOOR_STYLES['door-int-pocket'] === DOOR_STYLES['door-int-single'])
t('French doors and internal double doors are pairs', DOOR_STYLES['door-french'].every(s => s.leaves === 2) && DOOR_STYLES['door-int-double'].every(s => s.leaves === 2))
t('the bi-fold styles say how many panels', DOOR_STYLES['door-bifold'].map(s => s.panels).join(',') === '2,3,4,5,6')
t('a bi-fold style is about 700 to 900mm a panel wide', DOOR_STYLES['door-bifold'].every(s => s.w! / s.panels! >= 700 && s.w! / s.panels! <= 900), DOOR_STYLES['door-bifold'].map(s => s.w! / s.panels!))
t('bi-fold doors start on the 3000 wide four panels (the calculator\'s own size)', styleSize('door-bifold', undefined)!.w === KIND_BY_ID['door-bifold'].stdW)
t('sliding doors start on the 1800 wide two panels', styleSize('door-sliding', undefined)!.w === KIND_BY_ID['door-sliding'].stdW)
t('the garage door starts on the 2400 wide sectional', styleSize('door-garage', undefined)!.w === KIND_BY_ID['door-garage'].stdW)
t('a leaf door style takes the kind\'s size (none of its own)', styleSize('door-front', 'six-panel') === undefined && styleSize('door-int-single', 'flush') === undefined)
t('a window style has its own size', styleSize('win-casement', 'two-one-opens')!.w === 1200)
t('the stable door has a split line', DOOR_STYLES['door-back'].find(s => s.id === 'stable')!.features.some(f => f.t === 'line'))
t('the roller shutter has louvres', DOOR_STYLES['door-garage'].find(s => s.id === 'roller')!.features.some(f => f.t === 'louvre'))
t('the oval door has an oval light', DOOR_STYLES['door-front'].find(s => s.id === 'oval')!.features.some(f => f.t === 'oval'))

// ---- materials and colours
t('front doors: composite first, then uPVC, timber, aluminium', DOOR_MATERIALS['door-front'].join() === 'composite,upvc,timber,aluminium')
t('a composite door is composite only', materialsFor('door-composite').length === 1 && materialsFor('door-composite')[0].id === 'composite')
t('a security door starts on steel', defaultMaterialFor('door-security') === 'steel')
t('a window offers uPVC and aluminium', materialsFor('win-casement').map(m => m.id).join() === 'upvc,aluminium')
t('internal doors are timber only', DOOR_KINDS.filter(isInternalDoorKind).every(k => DOOR_MATERIALS[k].join() === 'timber'))
t('every material a kind starts on is one the calculator prices', DOOR_KINDS.every(k => ['upvc', 'aluminium', 'timber', 'composite', 'steel'].includes(defaultMaterialFor(k))))
t('external door colours: white first, eight of them', DOOR_COLOURS[0].id === 'white' && DOOR_COLOURS.length === 8)
t('internal finishes: white primed first', INTERNAL_FINISHES[0].id === 'primed' && INTERNAL_FINISHES.length === 5)
t('an external door is offered colours, an internal door finishes', swatchesFor('door-front') === DOOR_COLOURS && swatchesFor('door-int-single') === INTERNAL_FINISHES)
t('the label says colour, finish or frame colour', colourLabelFor('door-front') === 'Door colour' && colourLabelFor('door-int-single') === 'Finish' && colourLabelFor('win-bay') === 'Frame colour')
t('only windows have glazing bars', barsAllowed('win-sash') && !barsAllowed('door-front'))
t('the first colour is plain, anything else is coloured', !isColoured('door-front', 'white') && isColoured('door-front', 'black') && !isColoured('door-int-single', 'primed') && isColoured('door-int-single', 'oak') && !isColoured('win-casement', 'white'))

// ---- a choice made safe
{
  const bad = cleanOpeningChoice('door-front', { style: 'six-lights', material: 'steel', colour: 'pink', bars: 'georgian' })
  t('a door: a style of another kind, a material it does not offer, an unknown colour and bars all fall back', bad.style === 'six-panel' && bad.material === 'composite' && bad.colour === 'white' && bad.bars === 'none', bad)
  const good = cleanOpeningChoice('door-back', { style: 'stable', material: 'timber', colour: 'green' })
  t('a good door choice is kept', good.style === 'stable' && good.material === 'timber' && good.colour === 'green', good)
  t('an internal door falls back to a finish', cleanOpeningChoice('door-int-single', { colour: 'white' }).colour === 'primed')
  t('nothing at all gives the kind\'s own start', JSON.stringify(cleanOpeningChoice('door-bifold', undefined)) === JSON.stringify(defaultChoice('door-bifold')))
  t('the start of a bi-fold: aluminium, white, four panels', defaultChoice('door-bifold').material === 'aluminium' && defaultChoice('door-bifold').style === 'bifold-4')
  const win = cleanOpeningChoice('win-casement', { style: 'two-both-open', material: 'aluminium', colour: 'anthracite', bars: 'georgian' })
  t('a window choice still goes through the window rules', win.style === 'two-both-open' && win.material === 'aluminium' && win.bars === 'georgian')
  t('a door style for a window is the window default', cleanOpeningChoice('win-casement', { style: 'six-panel' }).style === 'two-one-opens')
  t('a kind that is not styled has no cards or default', styleCards('structural').length === 0 && styleCardOrDefault('structural', 'x') === undefined && defaultStyleId('structural') === '')
}

// ---- words
t('an external door style in words', openingStyleWords('door-front', { style: 'half-glazed' }) === 'half-glazed')
t('an internal door says its finish', openingStyleWords('door-int-single', { style: 'four-panel', colour: 'oak' }) === 'four-panel, natural oak finish', openingStyleWords('door-int-single', { style: 'four-panel', colour: 'oak' }))
t('a white primed internal door says so', openingStyleWords('door-int-single', { style: 'flush' }) === 'flush, white primed')
t('a window still says its bars', openingStyleWords('win-casement', { style: 'two-both-open', bars: 'georgian' }).includes('Georgian bars'))
t('a kind with no styles has no words', openingStyleWords('structural', { style: 'x' }) === '')

// ---- on the plan: windows get bars, doors do not; a bi-fold has the style's panels
t('doors have no bars across them', mullionsFor('door-french', 'one-light').length === 0 && mullionsFor('win-casement', 'two-one-opens').length === 1)
t('only a bi-fold has panels', panelsFor('door-bifold', 'bifold-6') === 6 && panelsFor('door-front', 'six-panel') === undefined)
{
  const wall = [{ x: 0, y: 0 }, { x: 1000, y: 0 }]
  const band = { lo: -10, hi: 10, inside: 1 as const }
  const base = { distPx: 300, kind: 'door-bifold' as const, widthMm: 3000, swing: 'in-left' as const }
  const leaves = (n?: number) => openingShape(wall, false, { ...base, panels: n }, 0.01, band)!.prims.filter(p => p.type === 'line' && (p as { style: string }).style === 'leaf').length
  t('a 3000 wide bi-fold with no style has about four panels', leaves() === 4, leaves())
  t('the style\'s panels: 2, 3, 5 and 6', leaves(2) === 2 && leaves(3) === 3 && leaves(5) === 5 && leaves(6) === 6, [leaves(2), leaves(3), leaves(5), leaves(6)])
}

// ---- the calculator is fed the choices
const plan = (over: Partial<PlanOpening> = {}): PlanOpening => ({ id: 'a', ref: 'D1', kind: 'door-front', widthMm: 900, heightMm: 2100, swing: 'in-left', ...over })
{
  const plain = mergePlanOpenings([], [plan()])[0]
  t('a door with no choice keeps the calculator\'s own start', plain.material === 'composite' && plain.coloured === false && !plain.styleText)
  const alu = mergePlanOpenings([], [plan({ material: 'aluminium', coloured: true, colourName: 'Anthracite grey', styleText: 'half-glazed' })])[0]
  t('the material, colour and style reach the calculator', alu.material === 'aluminium' && alu.coloured === true && alu.colourName === 'Anthracite grey' && alu.styleText === 'half-glazed')
  t('aluminium costs more than composite (the sample factor)', unitPrice(alu) > unitPrice({ ...alu, material: 'composite', coloured: true }))
  t('timber costs more than uPVC', unitPrice({ ...alu, material: 'timber', coloured: false }) > unitPrice({ ...alu, material: 'upvc', coloured: false }))
  t('a coloured door costs more than white', unitPrice({ ...alu, material: 'upvc', coloured: true }) > unitPrice({ ...alu, material: 'upvc', coloured: false }))
  const words = openingWords(alu)
  t('the quote words name material, style and colour', words.includes('aluminium') && words.includes('half-glazed') && words.includes('anthracite grey'), words)
  const int = mergePlanOpenings([], [plan({ id: 'b', ref: 'ID1', kind: 'door-int-single', widthMm: 826, heightMm: 2040, material: 'timber', coloured: true, styleText: 'four-panel, natural oak finish' })])[0]
  const iw = openingWords(int)
  t('an internal door\'s words carry its style and finish', iw.includes('(four-panel, natural oak finish)') && iw.startsWith('826 x 2040 internal door'), iw)
  t('an internal door is still priced by size only', unitPrice(int) === unitPrice({ ...int, material: 'aluminium', coloured: false }))
  t('an internal door with no choice reads as before', openingWords(newOpening('x', 'ID1', 'door-int-single')) === '826 x 2040 internal door with lining, architrave and ironmongery', openingWords(newOpening('x', 'ID1', 'door-int-single')))
  t('an external door with no choice reads as before', openingWords(newOpening('x', 'D1', 'door-front')) === '900 x 2100 composite front door, double glazed, white', openingWords(newOpening('x', 'D1', 'door-front')))
}
t('every window kind is still a styled kind', WINDOW_KINDS.every(isStyledKind))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
