/**
 * Tests for the steel over a wall opening, priced by the Steel Beams, Columns & Posts engine (lib/wall-steel.ts)
 *
 * Run with:   npx tsx __tests__/wall-steel.test.ts
 */
import { newWallSteel, newWallMember, cleanWallSteel, priceWallSteel, type WallSteel, type WallMember } from '../lib/wall-steel'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const price = (steel: WallSteel, widthMm = 2700) => priceWallSteel([{ id: 'o1', ref: 'Door 2.70m', widthMm, heightMm: 2100, steel }], 300)
const line = (r: ReturnType<typeof price>, key: string) => r.lines.find(l => l.id.startsWith(key + '|'))
const near = (a: number, b: number) => Math.abs(a - b) < 0.011
const withMembers = (...members: WallMember[]): WallSteel => ({ ...newWallSteel(), members })
const beam = (patch: Partial<WallMember> = {}): WallMember => ({ ...newWallMember('beam'), ...patch })
const mem = (kind: Parameters<typeof newWallMember>[0], patch: Partial<WallMember> = {}): WallMember => ({ ...newWallMember(kind), ...patch })

// ---- a beam over the opening
const d = price(newWallSteel())
t('default: one steel beam picked from the span (2.7m, a floor above: 203 x 133 UB 25), 3.0m with bearings at weight x 2.40 a metre', (() => { const b = line(d, 'steel'); return !!b && b.name.includes('203 × 133 UB 25') && near(b.qty, 3) && near(b.unitCost, 60) })(), d.lines.map(l => l.id + l.name))
t('default: two padstones, sundries, nothing else (no plate, casing, posts)', near(line(d, 'padstone')?.qty ?? 0, 2) && !!line(d, 'sundries') && !line(d, 'plate') && !line(d, 'case-board') && !line(d, 'pad-concrete') && d.lines.length === 3, d.lines.map(l => l.id))
t('default: 75kg of steel, the section named', d.totalSteelKg === 75 && d.byOpening.o1.steelKg === 75 && d.byOpening.o1.beamLabel === '203 × 133 UB 25')
t('default: the hours are for setting the steel by the bricklayer and a labourer', d.hours.bricklayer > 0 && d.hours.labourer > 0 && d.hours.carpenter === 0, d.hours)
t('default: the engineer note stays, the note about Structural Openings does not', d.warnings.some(w => w.includes('engineer')) && !d.warnings.some(w => w.includes('priced with the opening in Structural Openings')), d.warnings)
t('default: the words', d.byOpening.o1.words === 'one 203 × 133 UB 25 steel beam over, on two padstones', d.byOpening.o1.words)

const big = price(withMembers(beam({ section: '406 × 178 UB 54' })))
t('a chosen section is priced by its weight: 54kg/m x 2.40 = 129.60 a metre', near(line(big, 'steel')!.unitCost, 129.6) && big.byOpening.o1.beamLabel === '406 × 178 UB 54')
t('a span beyond the table picks the largest section (the engineer specifies the real one)', price(newWallSteel(), 12000).byOpening.o1.beamLabel === '305 × 165 UB 54')
t('a different load above picks another section', price({ ...newWallSteel(), loadAbove: 'heavy' }, 2700).byOpening.o1.beamLabel !== d.byOpening.o1.beamLabel)
t('a typed length is used instead of the opening', near(line(price(withMembers(beam({ lengthMm: 4000 }))), 'steel')!.qty, 4))

const pair = price(withMembers(beam({ qty: 2 })))
t('a pair of beams (number 2) doubles the steel and the padstones', near(line(pair, 'steel')!.qty, 6) && near(line(pair, 'padstone')!.qty, 4) && pair.totalSteelKg === 150, pair.lines.map(l => l.id + l.qty))

const pl = price(withMembers(beam({ plate: { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null } })))
t('a welded plate is as wide as the wall unless typed, with its welding as a subcontract line', (() => { const p = line(pl, 'plate'); const w = line(pl, 'plate-weld'); return !!p && !!w && w.category === 'subcontractors' && p.name.includes('300mm') && pl.totalSteelKg > 75 })(), pl.lines.map(l => l.id + l.name))
t('a typed plate width is kept', line(price(withMembers(beam({ plate: { position: 'top', thicknessMm: 8, widthMm: 215, lengthMm: null } }))), 'plate')!.name.includes('215mm'))
t('a plate carries the engineer note', pl.warnings.some(w => w.includes('welded plate')))

const ep = price(withMembers(beam({ ends: 'steel' })))
t('bolted ends: end plates and no padstones', near(line(ep, 'endplates')!.qty, 2) && !line(ep, 'padstone'))
t('padstones typed over', near(line(price(withMembers(beam({ padstones: 6 }))), 'padstone')!.qty, 6) && !line(price(withMembers(beam({ padstones: 0 }))), 'padstone'))
t('props are a plant line', line(price(withMembers(beam({ propped: true }))), 'props')?.category === 'plant')

// ---- columns, box sections, timber
const col = price(withMembers(beam(), mem('column', { qty: 2 })))
t('a steel column: as tall as the opening by default, a base plate set, a concrete pad and soil away each', (() => { const c = line(col, 'plates'); const pc = line(col, 'pad-concrete'); const st = col.lines.filter(l => l.id.startsWith('steel|')).find(l => l.name.includes('UC')); return !!c && near(c.qty, 2) && !!pc && !!line(col, 'pad-spoil') && !!st && st.name.includes('2.10m') })(), col.lines.map(l => l.name))
const box = price(withMembers(mem('hollow', { section: '100 × 100 × 5 SHS', lengthMm: 2400 })))
t('a box section (square hollow) post is priced by its weight: 14.7kg/m x 2.40', (() => { const b = line(box, 'steel'); return !!b && b.name.includes('100 × 100 × 5 SHS') && near(b.unitCost, 35.28) && near(b.qty, 2.4) })(), box.lines.map(l => l.name + l.unitCost))
t('a column on no pad has no pad lines and a note', !line(price(withMembers(mem('column', { pad: false }))), 'pad-concrete') && price(withMembers(mem('column', { pad: false }))).warnings.some(w => w.includes('no pad')))
const lvl = price(withMembers(mem('lvl', { lengthMm: 3200 })))
t('an engineered timber beam is a per-metre timber line with fixings, no steel kilos', !!line(lvl, 'timber') && !!line(lvl, 'fixings') && lvl.totalSteelKg === 0 && lvl.hours.carpenter > 0, lvl.lines.map(l => l.id))
t('a timber post', !!line(price(withMembers(mem('timber-post'))), 'timber'))

// ---- who supplies it, finishes, Hiab
const sub = price(withMembers(beam({ by: 'sub' })))
t('a steelwork contractor: one per-kilo subcontract line, no steel line, fewer setting hours', !!line(sub, 'steel-sub') && !line(sub, 'steel') && line(sub, 'steel-sub')!.category === 'subcontractors' && sub.hours.bricklayer < d.hours.bricklayer, sub.lines.map(l => l.id))
t('galvanised adds the galvanising per kilo', near(line(price(withMembers(beam({ finish: 'galvanised' }))), 'galv')!.qty, 75))
const cased = price(withMembers(beam({ finish: 'cased' })))
t('casing in fire board adds battens and board and carpenter hours', !!line(cased, 'case-board') && !!line(cased, 'case-batten') && cased.hours.carpenter > 0)
t('intumescent is a subcontract line', line(price(withMembers(beam({ finish: 'intumescent' }))), 'intumescent')?.category === 'subcontractors')
t('a Hiab is one plant line for the job', line(price({ ...newWallSteel(), hiab: true }), 'hiab')?.category === 'plant')
t('no members: no lines', price(withMembers()).lines.length === 0 && priceWallSteel([], 300).lines.length === 0)

// ---- connections (an extra on the opening)
const cn = price({ ...newWallSteel(), connections: [{ kind: 'end-plate', qty: 2 }, { kind: 'fabrication', qty: 3 }] })
t('connections: end plates as materials, fabrication hours as a subcontract line, with a sample-prices note', near(line(cn, 'conn-end-plate')!.qty, 2) && line(cn, 'conn-end-plate')!.category === 'materials' && line(cn, 'conn-fabrication')!.category === 'subcontractors' && near(line(cn, 'conn-fabrication')!.qty, 3) && cn.warnings.some(w => w.includes('Connections and fabrications')), cn.lines.map(l => l.id))
t('connections add bricklayer time for fitting', cn.hours.bricklayer > d.hours.bricklayer)

// ---- two openings, separate
const two = priceWallSteel([{ id: 'a', ref: 'Door 2.70m', widthMm: 2700, heightMm: 2100, steel: newWallSteel() }, { id: 'b', ref: 'Bi-fold 4.00m', widthMm: 4000, heightMm: 2100, steel: newWallSteel() }], 300)
t('two openings are priced separately, each with its own lines', two.lines.filter(l => l.id.startsWith('steel|')).length === 2 && !!two.byOpening.a && !!two.byOpening.b && two.byOpening.b.steelKg > two.byOpening.a.steelKg)

// ---- words
const full = price({ ...withMembers(beam({ section: '406 × 178 UB 54', qty: 2, finish: 'cased', by: 'sub', plate: { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null } }), mem('column', { qty: 2 })), connections: [{ kind: 'end-plate', qty: 4 }, { kind: 'fabrication', qty: 3 }], hiab: true }).byOpening.o1.words
t('words: a pair, padstones, the plate (as wide as the wall), connections, columns on pads, casing, contractor and Hiab', full.startsWith('two 406 × 178 UB 54 steel beams over, on four padstones, with a 10mm x 300mm steel plate welded to the underside of each beam to spread the load over the wall,') && full.includes('4 end plates and 3 hours of fabrication') && full.includes('two 152 × 152 UC 23 steel columns on concrete pads') && full.includes('the steel cased in two layers of fire-resisting board') && full.includes('supplied and fixed by a steelwork contractor') && full.includes('lifted in by Hiab'), full)
t('words: a box section post and a timber beam', price(withMembers(beam(), mem('hollow', { section: '100 × 100 × 5 SHS' }))).byOpening.o1.words.includes('one 100 × 100 × 5 SHS steel post on concrete pads') && price(withMembers(mem('lvl'))).byOpening.o1.words.startsWith('one LVL 2 × 45 × 200 (doubled) engineered timber beam over'))
t('words: no members say nothing', price(withMembers()).byOpening.o1.words === '')
t('words: posts only', price(withMembers(mem('column'))).byOpening.o1.words.startsWith('steel: one 152 × 152 UC 23 steel column on concrete pads'))

// ---- what was saved is made safe
const old = cleanWallSteel({ section: '203 × 133 UB 25', beams: 2, loadAbove: 'floor', posts: 2, postSection: '152 × 152 UC 23', postRole: 'ends', postHeightMm: 2400, steelBy: 'sub', finish: 'board', hiab: true, connections: [{ kind: 'cleat', qty: 2 }], plate: { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null }, padstones: null })
t('the first version is read as members: a pair of beams (padstones made explicit, less one for each post), the posts as columns', old.members.length === 2 && old.members[0].kind === 'beam' && old.members[0].qty === 2 && old.members[0].padstones === 2 && old.members[0].finish === 'cased' && old.members[0].by === 'sub' && old.members[0].plate?.thicknessMm === 10 && old.members[1].kind === 'column' && old.members[1].qty === 2 && old.members[1].lengthMm === 2400 && old.hiab === true && old.connections.length === 1, old)
t('the first version with one beam and nothing else still prices the same beam line', (() => { const o = cleanWallSteel({ section: '406 × 178 UB 54', beams: 1, posts: 0, steelBy: 'us', finish: 'none', padstones: null }); const r = price(o); return near(line(r, 'steel')!.unitCost, 129.6) && near(line(r, 'padstone')!.qty, 2) })())
const junk = cleanWallSteel({ members: [{ kind: 'bogus', section: 'nonsense', qty: 999, finish: 'x', ends: 'y', plate: { position: 'sideways', thicknessMm: 10, widthMm: null, lengthMm: null }, padstones: 'many' }, null, 5], loadAbove: 'x', hiab: 'yes', connections: [{ kind: 'bogus', qty: 3 }, { kind: 'cleat', qty: 2 }, { kind: 'splice', qty: -1 }] })
t('rubbish reads as the start', junk.members.length === 3 && junk.members[0].kind === 'beam' && junk.members[0].section === 'auto' && junk.members[0].qty === 1 && junk.members[0].finish === 'primed' && junk.members[0].ends === 'masonry' && junk.members[0].plate === null && junk.members[0].padstones === null && junk.loadAbove === 'floor' && junk.hiab === false, junk)
t('only real connections survive', junk.connections.length === 1 && junk.connections[0].kind === 'cleat')
t('a section from the wrong kind is replaced by the kind\'s usual one', cleanWallSteel({ members: [{ kind: 'column', section: '203 × 133 UB 25' }] }).members[0].section === '152 × 152 UC 23')
t('a missing value is the start (one beam)', (() => { const a = cleanWallSteel(undefined); return a.members.length === 1 && a.members[0].kind === 'beam' && a.members[0].section === 'auto' })())
t('a saved good one is kept as it is', (() => { const g = withMembers(beam({ section: '406 × 178 UB 54', qty: 2, plate: { position: 'both', thicknessMm: 12, widthMm: 300, lengthMm: null } }), mem('hollow', { section: '150 × 150 × 6.3 SHS', lengthMm: 2100 })); return JSON.stringify(cleanWallSteel(g)) === JSON.stringify(g) })())

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
