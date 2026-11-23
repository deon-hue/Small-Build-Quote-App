/**
 * Tests for the fabrication processes on a steel member (lib/steel-processes.ts, the engine in lib/structural-steel-units.ts, the wall steel in lib/wall-steel.ts)
 *
 * Run with:   npx tsx __tests__/steel-processes.test.ts
 */
import { flangeWidthMm, newProcess, cleanProcesses, priceProcess, holeHours, processWords, processesFor, type MemberProcess } from '../lib/steel-processes'
import { calculateSteelwork, newMember, DEFAULT_STRUCTURAL_SITUATIONS, type SteelMember } from '../lib/structural-steel-units'
import { priceWallSteel, newWallSteel, newWallMember, cleanWallSteel, wallSteelWords, type WallSteel } from '../lib/wall-steel'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) <= e

const calc = (members: SteelMember[]) => calculateSteelwork({ members, jobSituationId: 'clear', situations: DEFAULT_STRUCTURAL_SITUATIONS, engineer: false, buildingControl: false, hiabVisits: 0, rates: {} })
const beam = (procs?: MemberProcess[], patch: Partial<SteelMember> = {}): SteelMember => ({ ...newMember('b1', 'B1', 'beam'), processes: procs, ...patch })
const line = (r: ReturnType<typeof calc>, startsWith: string) => r.lines.find(l => l.id.startsWith(startsWith))
const fab = 55 // RATES.fabPerHour, the fabricator's rate (a sample)

const base = calc([beam()])
const P = (kind: Parameters<typeof newProcess>[1], patch: Partial<MemberProcess> = {}, steel: Parameters<typeof newProcess>[2] = 'beam'): MemberProcess => ({ ...newProcess('p-' + kind, kind, steel), ...patch })

// ---- the flange width from a section's name
t('flange width: 203 x 133 UB 25 is 133', flangeWidthMm('203 × 133 UB 25') === 133)
t('flange width: 152 x 152 UC 23 is 152', flangeWidthMm('152 × 152 UC 23') === 152)
t('flange width: 406 x 178 UB 54 is 178', flangeWidthMm('406 × 178 UB 54') === 178)
t('flange width: a hollow section or timber has none', flangeWidthMm('100 × 100 × 5 SHS') === null && flangeWidthMm('LVL 2 × 45 × 200 (doubled)') === null && flangeWidthMm('auto') === null && flangeWidthMm('') === null)

// ---- holes
const h4 = calc([beam([P('holes')])])
t('holes: 4 x 22mm in the web = 4 x (0.03 + 0.0025 x 22) hours at the fabrication rate', near(line(h4, 'proc-holes')!.qty, 4 * holeHours(22, 'web'), 0.002) && line(h4, 'proc-holes')!.unitCost === fab && line(h4, 'proc-holes')!.category === 'subcontractors', line(h4, 'proc-holes'))
t('holes: 0.085h a hole is about £4.68 each', near(holeHours(22, 'web') * fab, 4.675, 0.01))
t('holes: the line says how many, the size and where', line(h4, 'proc-holes')!.name.includes('4 holes of 22mm in the web'), line(h4, 'proc-holes')!.name)
t('holes: through the flange takes half as long again', near(holeHours(22, 'flange'), holeHours(22, 'web') * 1.5, 1e-9))
t('holes: a bigger hole takes longer', holeHours(33, 'web') > holeHours(14, 'web'))
const hq = calc([beam([P('holes', { count: 3 })], { qty: 2 })])
t('holes: a pair of beams has the holes in each (3 x 2 = 6)', near(line(hq, 'proc-holes')!.qty, 6 * holeHours(22, 'web'), 0.002) && line(hq, 'proc-holes')!.name.includes('on each of the 2 steel beams'), line(hq, 'proc-holes'))
t('holes: no material line (no steel is added)', !line(h4, 'proc-holes-mat'))
t('holes: the steel weight and the other lines do not move', h4.totalSteelKg === base.totalSteelKg && h4.lines.length === base.lines.length + 1)
t('holes: the summary says it', h4.members[0].parts[0].includes('four 22mm holes drilled in the web'), h4.members[0].parts)
t('holes: through the wall of a hollow section', (() => { const r = calc([{ ...newMember('p1', 'P1', 'hollow'), processes: [P('holes', {}, 'hollow')] }]); return line(r, 'proc-holes')!.name.includes('through the wall of the section') })())
t('holes: in the flange is worded as the flange', calc([beam([P('holes', { where: 'flange' })])]).members[0].parts[0].includes('in the flange'))
t('holes: a 50mm hole is flagged', calc([beam([P('holes', { diaMm: 50 })])]).warnings.some(w => w.includes('50mm hole') && w.includes('outside the usual')))
t('holes: the engineer must approve them', h4.warnings.some(w => w.includes('the engineer must approve the position and size')))
t('holes: and the sample price warning', h4.warnings.some(w => w.includes('Fabrication processes') && w.includes('sample prices')))

// ---- mitre
const mt = calc([beam([P('mitre', { count: 2, angleDeg: 30 })])])
t('mitre: 2 cuts at 0.3h each', near(line(mt, 'proc-mitre')!.qty, 0.6) && line(mt, 'proc-mitre')!.name.includes('2 mitre cuts at 30°'), line(mt, 'proc-mitre'))
t('mitre: no material and no engineer warning for a cut that does not weaken it', !line(mt, 'proc-mitre-mat') && !mt.warnings.some(w => w.includes('Holes, notches and splices')))
t('mitre: the words', mt.members[0].parts[0].includes('two 30° mitre cuts'), mt.members[0].parts)
t('mitre: 10 degrees is flagged as very sharp', calc([beam([P('mitre', { angleDeg: 10 })])]).warnings.some(w => w.includes('10° mitre')))
const refused = (angleDeg: number) => { try { calc([beam([P('mitre', { angleDeg })])]); return false } catch (e: any) { return e.message.includes('angle') } }
t('mitre: an angle of 90 or 0 is refused', refused(90) && refused(0))

// ---- the others
const nt = calc([beam([P('notch', { count: 2 })])])
t('notch: 2 x 0.6h and the engineer warning', near(line(nt, 'proc-notch')!.qty, 1.2) && nt.warnings.some(w => w.includes('Holes, notches and splices')))
const cl = calc([beam([P('cleat', { count: 2 })])])
t('cleat: 2 x 0.4h fabrication and 2 x £22 of steel as one materials line', near(line(cl, 'proc-cleat')!.qty, 0.8) && near(line(cl, 'proc-cleat-mat')!.unitCost, 44) && line(cl, 'proc-cleat-mat')!.category === 'materials', [line(cl, 'proc-cleat'), line(cl, 'proc-cleat-mat')])
const st = calc([beam([P('stiffener', { count: 1 })])])
t('stiffener: a pair is 0.5h and £30', near(line(st, 'proc-stiffener')!.qty, 0.5) && near(line(st, 'proc-stiffener-mat')!.unitCost, 30) && st.members[0].parts[0].includes('one pair of bearing stiffeners'), st.members[0].parts)
const sp = calc([beam([P('splice', { count: 1 })])])
t('splice: 0.8h and £85, and the engineer warning', near(line(sp, 'proc-splice')!.qty, 0.8) && near(line(sp, 'proc-splice-mat')!.unitCost, 85) && sp.warnings.some(w => w.includes('Holes, notches and splices')))
t('splice: also goes on a column', (() => { const r = calc([{ ...newMember('c1', 'C1', 'column'), processes: [P('splice', {}, 'column')] }]); return !!line(r, 'proc-splice') })())
t('notch and cleat do not go on a column: they are left out, not priced', (() => { const r = calc([{ ...newMember('c1', 'C1', 'column'), processes: [P('notch', {}, 'column'), P('cleat', {}, 'column')] }]); return !line(r, 'proc-notch') && !line(r, 'proc-cleat') })())
t('which processes each member can have', processesFor('beam').length === 8 && processesFor('column').map(p => p.id).join() === 'holes,mitre,splice,blast,other' && processesFor('hollow').map(p => p.id).join() === 'holes,mitre,blast,other', [processesFor('column').map(p => p.id), processesFor('hollow').map(p => p.id)])

// ---- shot blasting is by the surface
const bl = calc([beam([P('blast')], { lengthMm: 4000, qty: 2 })])
const surf = 0.78 * 4 * 2 // 203 x 133 UB 25 surface m2 per m (sample) x 4m x 2 beams
t('blast: priced by the surface of the steel (hours and a little material per m²)', (() => { const l = line(bl, 'proc-blast')!, m = line(bl, 'proc-blast-mat')!; return l.qty > 0 && near(m.unitCost, l.qty / 0.1 * 2, 0.02) && l.name.includes('shot blasting') })(), [line(bl, 'proc-blast'), line(bl, 'proc-blast-mat'), surf])
t('blast: the words', bl.members[0].parts[0].includes('shot blasted before painting'))

// ---- other fabrication by the hour
const ot = calc([beam([P('other', { count: 2.5, material: 40, note: 'camber the beam' })], { qty: 2 })])
t('other: hours each x number of members at the fabrication rate, and the £ allowance per member', near(line(ot, 'proc-other')!.qty, 5) && near(line(ot, 'proc-other-mat')!.unitCost, 80) && line(ot, 'proc-other')!.name.includes('camber the beam'), [line(ot, 'proc-other'), line(ot, 'proc-other-mat')])
t('other: with no note it is just other fabrication', calc([beam([P('other', { note: '' })])]).members[0].parts[0].includes('other fabrication'))
t('other: no allowance means no materials line', !line(calc([beam([P('other')])]), 'proc-other-mat'))

// ---- several at once, a contractor, timber
const many = calc([beam([P('holes'), P('mitre'), P('cleat'), P('blast')])])
t('several processes: each its own line', ['proc-holes', 'proc-mitre', 'proc-cleat', 'proc-blast'].every(k => !!line(many, k)))
t('several processes: the words join them with and', (() => { const w = many.members[0].parts[0]; return w.includes('hole') && w.includes('mitre') && w.includes(' and shot blasted before painting') })(), many.members[0].parts)
t('a contractor-fixed beam still has the extras priced as the fabricator\'s lines', !!line(calc([beam([P('holes')], { by: 'sub' })]), 'proc-holes'))
t('timber has no processes: they are ignored', (() => { const r = calc([{ ...newMember('l1', 'B1', 'lvl'), processes: [P('holes')] }]); return !r.lines.some(l => l.id.startsWith('proc-')) })())
t('no processes (undefined or an empty list) is exactly as before', calc([beam([])]).lines.length === base.lines.length && calc([beam(undefined)]).lines.length === base.lines.length)
t('a zero count is refused', (() => { try { calc([beam([P('holes', { count: 0 })])]); return false } catch (e: any) { return e.message.includes('above zero') } })())

// ---- a hand-worked total: 4 holes + 2 cleats on a 3.6m 203 x 133 UB 25
const hand = calc([beam([P('holes'), P('cleat', { count: 2 })])])
const extra = hand.lines.filter(l => l.id.startsWith('proc-')).reduce((s, l) => s + l.unitCost * l.qty, 0)
t('hand-worked: 4 holes (£18.70) + 2 cleats (0.8h = £44 + £44 steel) = £106.70', near(extra, 4 * 0.085 * fab + 0.8 * fab + 44, 0.05), extra)

// ---- with stock bars the processes do not change the bars
t('stock bars: processes do not change the cutting list', (() => { const a = calculateSteelwork({ members: [beam([P('holes')])], jobSituationId: 'clear', situations: DEFAULT_STRUCTURAL_SITUATIONS, engineer: false, buildingControl: false, hiabVisits: 0, rates: {}, stock: { barsMm: [6100, 9100, 12200], offcutPct: 100 } }); return a.cutting.length === 1 && a.cutting[0].bars.length === 1 })())

// ---- cleaning what was saved
t('clean: not a list is nothing', cleanProcesses(null, 'beam').length === 0 && cleanProcesses('x', 'beam').length === 0 && cleanProcesses({}, 'beam').length === 0)
t('clean: timber (no steel kind) has none', cleanProcesses([{ kind: 'holes', count: 2 }], null).length === 0)
t('clean: unknown kinds, ones that cannot go on this member and repeats are dropped', cleanProcesses([{ kind: 'bogus', count: 1 }, { kind: 'notch', count: 1 }, { kind: 'holes', count: 2 }, { kind: 'holes', count: 5 }], 'column').map(p => p.kind).join() === 'holes')
t('clean: rubbish counts, sizes and angles go back to the usual', (() => { const r = cleanProcesses([{ kind: 'holes', count: -3, diaMm: 'x', where: 'sideways' }, { kind: 'mitre', count: 'two', angleDeg: 200 }], 'beam'); return r[0].count === 4 && r[0].diaMm === 22 && r[0].where === 'web' && r[1].count === 1 && r[1].angleDeg === 45 })())
t('clean: a count is a whole number and hours are in halves', (() => { const r = cleanProcesses([{ kind: 'holes', count: 3.7 }, { kind: 'other', count: 2.3, material: -5, note: '  hello  ' }], 'beam'); return r[0].count === 4 && r[1].count === 2.5 && r[1].material === 0 && r[1].note === 'hello' })())
t('clean: at most 12 and a long note is cut', cleanProcesses([{ kind: 'other', count: 1, note: 'x'.repeat(500) }], 'beam')[0].note!.length === 80)
t('clean: keeps good values as they are', (() => { const r = cleanProcesses([{ id: 'abc', kind: 'holes', count: 6, diaMm: 18, where: 'flange' }], 'beam')[0]; return r.id === 'abc' && r.count === 6 && r.diaMm === 18 && r.where === 'flange' })())

// ---- the words
t('words: nothing gives an empty string', processWords([], 1, 'beam', 'beam') === '')
t('words: one process', processWords([P('mitre')], 1, 'beam', 'beam') === 'a 45° mitre cut')

// ---- inside a wall calculator
const wallPrice = (steel: WallSteel) => priceWallSteel([{ id: 'a', ref: 'Door 1', widthMm: 2700, heightMm: 2100, steel }], 300)
const w0 = wallPrice(newWallSteel())
const withProc = (procs: MemberProcess[]): WallSteel => { const s = newWallSteel(); s.members[0].processes = procs; return s }
const w1 = wallPrice(withProc([P('holes'), P('stiffener')]))
t('wall: a new member has no processes', newWallMember('beam').processes.length === 0 && newWallMember('column').processes.length === 0)
t('wall: processes reach the engine as lines (holes and stiffener)', w1.lines.some(l => l.id.startsWith('proc-holes')) && w1.lines.some(l => l.id.startsWith('proc-stiffener')) && w1.lines.length === w0.lines.length + 3, w1.lines.map(l => l.id))
t('wall: the words on the quote name them', w1.byOpening.a.words.includes('four 22mm holes drilled in the web') && w1.byOpening.a.words.includes('one pair of bearing stiffeners'), w1.byOpening.a.words)
t('wall: no processes, nothing changes', JSON.stringify(w0.lines.map(l => [l.name, l.unitCost, l.qty])) === JSON.stringify(wallPrice(withProc([])).lines.map(l => [l.name, l.unitCost, l.qty])))
t('wall: a steel column in a wall can have holes', (() => { const s = newWallSteel(); const c = newWallMember('column'); c.processes = [P('holes', {}, 'column')]; s.members.push(c); return wallPrice(s).lines.some(l => l.id.startsWith('proc-holes')) })())
t('wall: timber members never carry processes (cleaned away)', (() => { const c = cleanWallSteel({ members: [{ kind: 'lvl', section: 'LVL 2 × 45 × 200 (doubled)', qty: 1, processes: [{ kind: 'holes', count: 2 }] }] }); return c.members[0].processes.length === 0 })())
t('wall: processes saved with the wall come back cleaned', (() => { const c = cleanWallSteel({ members: [{ kind: 'beam', section: 'auto', qty: 1, processes: [{ kind: 'holes', count: 6, diaMm: 22, where: 'web' }, { kind: 'zzz', count: 1 }, { kind: 'notch', count: 'x' }] }] }); return c.members[0].processes.length === 2 && c.members[0].processes[0].count === 6 && c.members[0].processes[1].count === 1 })())
t('wall: a wall saved before processes opens with none', (() => { const c = cleanWallSteel({ members: [{ kind: 'beam', section: 'auto', qty: 1 }], loadAbove: 'floor' }); return Array.isArray(c.members[0].processes) && c.members[0].processes.length === 0 })())
t('wall: words for steel with no processes are as before', wallSteelWords(newWallSteel(), 2700, 300) === wallSteelWords(withProc([]), 2700, 300))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
