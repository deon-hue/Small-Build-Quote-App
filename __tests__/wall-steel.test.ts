/**
 * Tests for the steel over a wall opening, priced by the Structural Openings engine (lib/wall-steel.ts)
 *
 * Run with:   npx tsx __tests__/wall-steel.test.ts
 */
import { newWallSteel, cleanWallSteel, priceWallSteel, type WallSteel } from '../lib/wall-steel'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const price = (steel: WallSteel, widthMm = 2700) => priceWallSteel([{ id: 'o1', ref: 'Door 2.70m', widthMm, heightMm: 2100, steel }], 300)
const line = (r: ReturnType<typeof price>, key: string) => r.lines.find(l => l.id.startsWith(key + '|'))
const near = (a: number, b: number) => Math.abs(a - b) < 0.011

const d = price(newWallSteel())
t('default: one beam picked from the span (2.7m, a floor above: 203 x 133 UB 25), 3.0m with bearings at weight x 2.40', (() => { const b = line(d, 'beam'); return !!b && b.name.includes('203 × 133 UB 25') && near(b.qty, 3) && near(b.unitCost, 60) })(), d.lines.map(l => l.id + l.name))
t('default: two padstones, no casing, no plate, no posts, no connections', near(line(d, 'padstone')?.qty ?? 0, 2) && !line(d, 'case-board') && !line(d, 'plate') && !line(d, 'post') && d.lines.length === 2, d.lines.map(l => l.id))
t('default: no warning about fire protection or other calculators, the engineer note stays', !d.warnings.some(w => w.includes('no fire protection') || w.includes("A new wall's own calculator") || w.includes('Not included: the door')) && d.warnings.some(w => w.includes("engineer")), d.warnings)
t('default: steel weight is 25kg/m over 3.0m', d.totalSteelKg === 75 && d.byOpening.o1.steelKg === 75 && d.byOpening.o1.beamLabel === '203 × 133 UB 25')
t('default: the hours are for setting the steel by the bricklayer and a labourer', d.hours.bricklayer > 0 && d.hours.labourer > 0 && d.hours.carpenter === 0, d.hours)

const big = price({ ...newWallSteel('406 × 178 UB 54') })
t('a chosen section is priced by its weight: 54kg/m x 2.40 = 129.60 a metre', near(line(big, 'beam')!.unitCost, 129.6) && big.byOpening.o1.beamLabel === '406 × 178 UB 54')
t('a span beyond the table with auto says the engineer must specify', price(newWallSteel(), 12000).warnings.some(w => w.includes('beyond the sample table')))

const pair = price({ ...newWallSteel(), beams: 2 })
t('a pair of beams doubles the steel and the padstones', near(line(pair, 'beam')!.qty, 6) && near(line(pair, 'padstone')!.qty, 4) && pair.totalSteelKg === 150, pair.lines.map(l => l.id + l.qty))

const pl = price({ ...newWallSteel(), plate: { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null } })
t('a welded plate adds the steel plate (as wide as the wall) and the welding', (() => { const p = line(pl, 'plate'); const w = line(pl, 'plate-weld'); return !!p && !!w && w.category === 'subcontractors' && p.name.includes('300mm') && pl.totalSteelKg > 75 })(), pl.lines.map(l => l.id + l.name))
t('a plate carries the engineer note', pl.warnings.some(w => w.includes('welded plate')))

const cn = price({ ...newWallSteel(), connections: [{ kind: 'end-plate', qty: 2 }, { kind: 'fabrication', qty: 3 }] })
t('connections: end plates as materials, fabrication hours as a subcontract line', near(line(cn, 'conn-end-plate')!.qty, 2) && line(cn, 'conn-fabrication')!.category === 'subcontractors' && near(line(cn, 'conn-fabrication')!.qty, 3), cn.lines.map(l => l.id))

const ps = price({ ...newWallSteel(), posts: 2, postRole: 'ends', connections: [] })
t('posts: steel posts, base plate sets, pads and padstones (a post carrying a beam end takes the place of a padstone)', !!line(ps, 'post') && near(line(ps, 'post')!.qty, 2) && !!line(ps, 'plates') && !!line(ps, 'pad-concrete') && !line(ps, 'padstone'), ps.lines.map(l => l.id + l.qty))
t('posts carry the pad note', ps.warnings.some(w => w.includes('concrete pad')))

const sub = price({ ...newWallSteel(), steelBy: 'sub' })
t('a steelwork contractor: one per-kilo subcontract line and no beam line, no setting hours', !!line(sub, 'steel-sub') && !line(sub, 'beam') && line(sub, 'steel-sub')!.category === 'subcontractors' && sub.hours.bricklayer < d.hours.bricklayer, sub.lines.map(l => l.id))

const cased = price({ ...newWallSteel(), finish: 'board' })
t('casing in fire board adds battens and board and carpenter hours', !!line(cased, 'case-board') && !!line(cased, 'case-batten') && cased.hours.carpenter > 0)
t('intumescent is a subcontract line', line(price({ ...newWallSteel(), finish: 'intumescent' }), 'intumescent')?.category === 'subcontractors')
t('a Hiab is a plant line', line(price({ ...newWallSteel(), hiab: true }), 'hiab')?.category === 'plant')
t('padstones typed over', near(line(price({ ...newWallSteel(), padstones: 6 }), 'padstone')!.qty, 6) && !line(price({ ...newWallSteel(), padstones: 0 }), 'padstone'))
t('no beams: no steel lines', price({ ...newWallSteel(), beams: 0 }).lines.length === 0)

const two = priceWallSteel([{ id: 'a', ref: 'Door 2.70m', widthMm: 2700, heightMm: 2100, steel: newWallSteel() }, { id: 'b', ref: 'Bi-fold 4.00m', widthMm: 4000, heightMm: 2100, steel: newWallSteel() }], 300)
t('two openings are priced separately, each with its own lines', two.lines.filter(l => l.id.startsWith('beam|')).length === 2 && !!two.byOpening.a && !!two.byOpening.b && two.byOpening.b.steelKg > two.byOpening.a.steelKg)
t('nothing in, nothing out', priceWallSteel([], 300).lines.length === 0)

// rubbish is made safe
const junk = cleanWallSteel({ section: 'nonsense', beams: 99, loadAbove: 'x', posts: -3, postSection: 'x', steelBy: 'y', finish: 'z', hiab: 'yes', connections: [{ kind: 'bogus', qty: 3 }, { kind: 'cleat', qty: 2 }, { kind: 'splice', qty: -1 }], plate: { position: 'sideways', thicknessMm: 10, widthMm: null, lengthMm: null }, padstones: 'many' })
t('rubbish reads as the start', junk.section === 'auto' && junk.beams === 1 && junk.loadAbove === 'floor' && junk.posts === 0 && junk.steelBy === 'us' && junk.finish === 'none' && junk.hiab === false && junk.plate === null && junk.padstones === null, junk)
t('only real connections survive', junk.connections.length === 1 && junk.connections[0].kind === 'cleat')
t('a missing value is the start', JSON.stringify(cleanWallSteel(undefined)) === JSON.stringify(newWallSteel()) && JSON.stringify(cleanWallSteel(null)) === JSON.stringify(newWallSteel()))
t('a saved good one is kept as it is', JSON.stringify(cleanWallSteel(pl.lines.length ? { ...newWallSteel('406 × 178 UB 54'), beams: 2, plate: { position: 'both', thicknessMm: 12, widthMm: 300, lengthMm: null } } : null)) === JSON.stringify({ ...newWallSteel('406 × 178 UB 54'), beams: 2, plate: { position: 'both', thicknessMm: 12, widthMm: 300, lengthMm: null } }))

// the steel in words for the quote
const words = (steel: WallSteel, w = 2700) => price(steel, w).byOpening.o1?.words ?? ''
t('words: the default is one beam over on two padstones', words(newWallSteel()) === 'one 203 × 133 UB 25 steel beam over, on two padstones', words(newWallSteel()))
const full = words({ ...newWallSteel('406 × 178 UB 54'), beams: 2, posts: 2, finish: 'board', steelBy: 'sub', hiab: true, connections: [{ kind: 'end-plate', qty: 4 }, { kind: 'fabrication', qty: 3 }], plate: { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null } })
t('words: a pair, padstones less the posts, the plate (as wide as the wall), connections, posts, casing, contractor and Hiab', full.startsWith('two 406 × 178 UB 54 steel beams over, on two padstones, with a 10mm x 300mm steel plate welded to the underside of each beam to spread the load over the wall,') && full.includes('4 end plates and 3 hours of fabrication') && full.includes('two 152 × 152 UC 23 steel posts on concrete pads') && full.includes('the steel cased in two layers of fire-resisting board') && full.includes('supplied and fixed by a steelwork contractor') && full.includes('lifted in by Hiab'), full)
t('words: a section picked from the span is named in them', words(newWallSteel(), 3600).includes('steel beam over') && !words(newWallSteel(), 3600).includes('auto'))
t('words: intumescent and a single plate on top', words({ ...newWallSteel(), finish: 'intumescent', plate: { position: 'top', thicknessMm: 8, widthMm: 215, lengthMm: null } }).includes('an 8mm x 215mm steel plate welded to the top of the beam') && words({ ...newWallSteel(), finish: 'intumescent' }).includes('an intumescent coating to the steel'))
t('words: no beams and no posts say nothing', words({ ...newWallSteel(), beams: 0 }) === '')
t('words: posts without a beam', words({ ...newWallSteel(), beams: 0, posts: 1 }).startsWith('steel posts, one 152 × 152 UC 23 steel post on concrete pads'))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
