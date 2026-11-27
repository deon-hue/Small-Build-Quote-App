/**
 * Tests for Structural Openings with the steel calculators' options and lintels (lib/structural-openings-steel.ts)
 *
 * Run with:   npx tsx __tests__/structural-openings-full.test.ts
 */
import { priceOpenings, priceOpeningSteel, newFullOpening, toFullOpening, changeOpening, mergePlanFull, newOpeningSteel, mirrorSteel } from '../lib/structural-openings-steel'
import { calculateStructuralOpenings, newStructuralOpening, DEFAULT_STRUCTURAL_SITUATIONS, defaultOver, usualLintels, type StructuralOpening, type PlanStructural } from '../lib/structural-openings-units'
import { cleanWallSteel, newWallMember, priceWallSteel } from '../lib/wall-steel'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.011) => Math.abs(a - b) <= e
const base = { jobSituationId: 'clear', situations: DEFAULT_STRUCTURAL_SITUATIONS, buildingControl: false, dustProtection: false, rates: {} }
const run = (o: StructuralOpening | StructuralOpening[], extra: object = {}) => priceOpenings({ ...base, openings: Array.isArray(o) ? o : [o], ...extra })
const line = (r: ReturnType<typeof run>, re: RegExp) => r.lines.find(l => re.test(l.id))
const hrs = (r: ReturnType<typeof run>, trade: string) => r.labour.filter(l => l.trade === trade).reduce((s, l) => s + l.hours, 0)

// ---- what a new opening starts with
const n = newFullOpening('a', 'SO1')
t('a new 2.4m opening starts with steel, one cased beam picked from the span', n.over === 'steel' && cleanWallSteel(n.steelSpec).members.length === 1 && cleanWallSteel(n.steelSpec).members[0].finish === 'cased' && n.beams === 1)
t('small openings start on a lintel, wide or heavy ones on steel', defaultOver('solid', 1200, 'floor') === 'concrete' && defaultOver('cavity', 1500, 'floor') === 'steel-cavity' && defaultOver('solid', 1600, 'floor') === 'steel' && defaultOver('solid', 900, 'heavy') === 'steel')
t('lintels side by side: one for each leaf', usualLintels('cavity', 300) === 2 && usualLintels('solid', 215) === 2 && usualLintels('solid', 330) === 3 && usualLintels('block', 100) === 1)

// ---- the steel comes from the steel calculators
const r = run(n)
const direct = priceWallSteel([{ id: 'a', ref: 'SO1', widthMm: 2400, heightMm: 2100, steel: cleanWallSteel(n.steelSpec) }], 215)
const beam = line(r, /^st-steel-/)
t('the beam costs what the steel calculators charge', !!beam && near(beam!.unitCost, direct.lines.find(l => l.id.startsWith('steel|'))!.unitCost) && near(beam!.qty, 2.7), [beam, direct.lines.map(l => l.id)])
t('203 × 133 UB 25 at £2.40 a kg is £60 a metre', beam!.unitCost === 60)
t('casing, padstones, props, rubble, make good and the engineer', !!line(r, /^st-case-board/) && line(r, /^st-padstone/)?.qty === 2 && !!line(r, /^props\|/) && !!line(r, /^rubble\|/) && !!line(r, /^makegood\|/) && !!line(r, /^engineer\|/), r.lines.map(l => l.id))
t('no older steel lines as well', !r.lines.some(l => /^(beam|padstone|case-board|plates|post)\|/.test(l.id)))
t('every line belongs to the opening', r.lines.every(l => l.roomId === 'a' && l.id.endsWith('|a')))
t('the words name the steel', r.openings[0].parts[0].includes('one 203 × 133 UB 25 steel beam over') && r.openings[0].parts[0].includes('load-bearing'), r.openings[0].parts)
t('steel weight and labour', r.totalSteelKg === 68 && hrs(r, 'bricklayer') > 0 && hrs(r, 'carpenter') > 0, [r.totalSteelKg, r.labour])

// number of openings
const two = run({ ...n, qty: 2 })
t('two openings: twice the steel, lines and weight', near(line(two, /^st-steel-/)!.qty, 5.4) && line(two, /^st-padstone/)!.qty === 4 && Math.abs(two.totalSteelKg - 135) <= 1, [line(two, /^st-steel-/), two.totalSteelKg])
t('two openings: about twice the hours', hrs(two, 'bricklayer') >= hrs(r, 'bricklayer') * 2 - 0.5 && hrs(two, 'carpenter') >= hrs(r, 'carpenter') * 2 - 0.5, [hrs(r, 'bricklayer'), hrs(two, 'bricklayer')])

// a mix of members, which the older fields could not do
const spec = newOpeningSteel(215)
spec.members.push({ ...newWallMember('beam', '152 × 89 UB 16'), finish: 'cased' }, newWallMember('hollow', '100 × 100 × 5 SHS'), newWallMember('lvl'))
const mix = run({ ...n, widthMm: 4800, steelSpec: spec })
t('a mix: two beam sizes, a box section post and a timber beam on one opening', mix.lines.filter(l => /^st-steel-/.test(l.id)).length === 3 && !!line(mix, /^st-timber-/) && !!line(mix, /^st-pad-concrete/), mix.lines.map(l => l.name))
const big = newOpeningSteel(215); big.members[0] = { ...big.members[0], section: '610 × 229 UB 140' }
t('a very large section prices by its weight', near(line(run({ ...n, widthMm: 7000, steelSpec: big }), /^st-steel-/)!.unitCost, 140 * 2.4))

// posts: split the span, and take padstones when they carry the ends
const posts = newOpeningSteel(215); posts.members.push({ ...newWallMember('column'), qty: 2 })
t('posts carrying the ends take the place of padstones', !line(run({ ...n, steelSpec: posts }), /^st-padstone/))
const mid = newOpeningSteel(215); mid.members.push({ ...newWallMember('column'), qty: 1 })
t('a post under the beam splits the span for the section picked', priceOpeningSteel({ ...n, widthMm: 5000, postRole: 'mid', steelSpec: mid }).beamLabel === '203 × 133 UB 25' && priceOpeningSteel({ ...n, widthMm: 5000, postRole: 'ends', steelSpec: mid }).beamLabel !== '203 × 133 UB 25', [priceOpeningSteel({ ...n, widthMm: 5000, postRole: 'mid', steelSpec: mid }).beamLabel])

// fire protection warning
const bare = newOpeningSteel(215); bare.members[0].finish = 'primed'
t('primed only: it says no fire protection is priced', run({ ...n, steelSpec: bare }).warnings.some(w => w.includes('no fire protection')) && !r.warnings.some(w => w.includes('no fire protection')))

// ---- lintels
const small = changeOpening(n, { widthMm: 1200 })
t('narrowing to 1.2m moves it to a concrete lintel', small.over === 'concrete' && small.beams === 0)
const rl = run(small)
t('two concrete lintels across a 215 wall, 1.5m with bearings, £38 each', line(rl, /^lintel\|/)?.qty === 2 && line(rl, /^lintel\|/)?.unitCost === 38 && !rl.lines.some(l => l.id.startsWith('st-')), rl.lines)
t('a lintel opening still has props, rubble, make good and the engineer', !!line(rl, /^props\|/) && !!line(rl, /^rubble\|/) && !!line(rl, /^engineer\|/))
t('words', rl.openings[0].parts[0].includes('two precast concrete lintels over'), rl.openings[0].parts)
t('padstones and lintel count can be typed', line(run({ ...small, lintelPads: 2, lintelQty: 1 }), /^lintelpads\|/)?.qty === 2 && line(run({ ...small, lintelQty: 1 }), /^lintel\|/)?.qty === 1)
t('a lintel over a wide opening warns', run({ ...small, widthMm: 3000, over: 'concrete' }).warnings.some(w => w.includes('normally needs a steel beam')))
const cav = changeOpening(small, { wall: 'cavity', thicknessMm: 300 })
t('a small cavity opening takes a steel cavity lintel and the cavity work', cav.over === 'steel-cavity' && cav.cavityWork === true)
const rc = run(cav)
t('cavity lintel: closers, no separate tray', line(rc, /^lintel\|/)?.unitCost === 68 && near(line(rc, /^closers\|/)!.qty, 4.2) && !line(rc, /^tray\|/), rc.lines.map(l => l.id))
const rcs = run(changeOpening(cav, { widthMm: 3000 }))
t('wide again: back to steel, with tray, weeps and closers', !!line(rcs, /^tray\|/) && !!line(rcs, /^weeps\|/) && !!line(rcs, /^closers\|/) && !!line(rcs, /^st-steel-/))
t('a pair of beams across the cavity wall', cleanWallSteel(changeOpening(n, { wall: 'cavity', thicknessMm: 300 }).steelSpec).members[0].qty === 2)
const chosen = changeOpening({ ...n, over: 'concrete' }, { widthMm: 3000 })
t('a choice made by hand stays when the width changes', chosen.over === 'concrete')
t('nothing over it says so', run({ ...n, over: 'none' }).warnings.some(w => w.includes('nothing is priced over this opening')))
t('anything else is priced for each opening', (() => { const x = run({ ...n, qty: 2, extras: [{ name: 'Strongboy props', qty: 3, unitCost: 15, category: 'plant' }] }); const l = line(x, /^extra0\|/); return l?.qty === 6 && l?.unitCost === 15 && l?.category === 'plant' && x.openings[0].parts[0].includes('Strongboy props') })())

// ---- whole bars
const pair = [{ ...n, id: 'a', ref: 'SO1', widthMm: 3000 }, { ...n, id: 'b', ref: 'SO2', widthMm: 3000 }]
const st = run(pair, { stock: { barsMm: [6100, 9100, 12200], offcutPct: 100 } })
t('whole bars: the two openings share a bar and the offcut is its own line', st.cutting.length > 0 && !!line(st, /^offcut-/) && st.lines.filter(l => /^st-steel-/.test(l.id)).length === 2, [st.cutting.map(c => [c.section, c.buyMm, c.cutMm]), st.lines.map(l => l.id)])
t('without it there is no offcut', !line(run(pair), /^offcut-/) && run(pair).cutting.length === 0)

// ---- openings saved before: priced exactly as they were, and moved only when asked
const old = { ...newStructuralOpening('o', 'SO9'), widthMm: 3000, beams: 2, posts: 2 }
const oldDirect = calculateStructuralOpenings({ ...base, openings: [old] })
const oldNow = run(old)
t('an older opening prices as before', JSON.stringify(oldDirect.lines) === JSON.stringify(oldNow.lines) && oldNow.lines.some(l => l.id === 'beam|o'))
const moved = toFullOpening(old)
const ms = cleanWallSteel(moved.steelSpec)
t('moving it keeps the same steel: two beams, two columns, cased, same pads', ms.members[0].qty === 2 && ms.members[1].kind === 'column' && ms.members[1].qty === 2 && ms.members[0].finish === 'cased' && ms.members[1].padDepthMm === 300 && moved.over === 'steel')
const movedBeam = run(moved).lines.find(l => /^st-steel-/.test(l.id))!, oldBeam = oldNow.lines.find(l => l.id === 'beam|o')!
t('and the same beam price', near(movedBeam.unitCost, oldBeam.unitCost) && near(movedBeam.qty, oldBeam.qty), [movedBeam, oldBeam])
const oldTwo = calculateStructuralOpenings({ ...base, openings: [{ ...old, qty: 2 }] })
t('older openings: two of them now count the steel setting twice (it was counted once)', oldTwo.labour.find(l => l.trade === 'bricklayer')!.hours >= oldDirect.labour.find(l => l.trade === 'bricklayer')!.hours * 2 - 0.5)

// ---- from the drawing
const plan: PlanStructural = { id: 'p1', ref: 'SO1', widthMm: 2400, heightMm: 2100, thicknessMm: 300, struct: { beams: 2, section: '254 × 146 UB 31', posts: 2 } }
const fed = mergePlanFull([], [plan])
const fs0 = cleanWallSteel(fed[0].steelSpec)
t('an opening from the drawing has the steel chosen there', fed[0].over === 'steel' && fed[0].cavityWork === true && fs0.members[0].section === '254 × 146 UB 31' && fs0.members[0].qty === 2 && fs0.members[1]?.qty === 2 && fed[0].beams === 2 && fed[0].posts === 2)
t('unchanged on the drawing: left alone', mergePlanFull(fed, [plan])[0] === fed[0])
const extra = { ...fed[0], steelSpec: { ...fs0, members: [...fs0.members, newWallMember('lvl')] } }
const re = mergePlanFull([extra], [{ ...plan, widthMm: 3600, struct: { ...plan.struct, section: '305 × 165 UB 40' } }])
const rs = cleanWallSteel(re[0].steelSpec)
t('changed on the drawing: the size and chosen section follow, what was added stays', re[0].widthMm === 3600 && rs.members[0].section === '305 × 165 UB 40' && rs.members.some(m => m.kind === 'lvl') && re[0].beams === 3, [rs.members.map(m => [m.kind, m.section, m.qty])])
t('an older opening from the drawing still follows the older way', (() => { const leg = { ...newStructuralOpening('so-p1', 'SO1'), planId: 'p1', fromPlan: 'x' }; const m = mergePlanFull([leg], [plan])[0]; return m.over === undefined && m.beams === 2 })())
t('deleted on the drawing: it goes', mergePlanFull(fed, []).length === 0)
t('a lintel opening mirrors no beams to the drawing', mirrorSteel({ ...n, over: 'concrete' }).beams === 0)

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
