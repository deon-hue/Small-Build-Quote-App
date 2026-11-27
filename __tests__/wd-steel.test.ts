/**
 * Tests for the steel over a door or window in Windows and Doors (lib/wd-units.ts with lib/wall-steel.ts)
 *
 * Run with:   npx tsx __tests__/wd-steel.test.ts
 */
import { calculateWindowsDoors, newOpening, defaultWork, withSteel, openingSteel, beamListName, DEFAULT_WD_SITUATIONS, mergePlanOpenings, type WdOpening, type OpeningWork } from '../lib/wd-units'
import { priceWallSteel, cleanWallSteel, newWallMember, type WallSteel } from '../lib/wall-steel'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.011) => Math.abs(a - b) <= e
const run = (o: WdOpening | WdOpening[], extra: object = {}) => calculateWindowsDoors({ openings: Array.isArray(o) ? o : [o], jobSituationId: 'ground', situations: DEFAULT_WD_SITUATIONS, rates: {}, ...extra })
const line = (r: ReturnType<typeof run>, re: RegExp) => r.lines.find(l => re.test(l.id))
const hrs = (r: ReturnType<typeof run>, trade: string) => r.labour.filter(l => l.trade === trade).reduce((s, l) => s + l.hours, 0)

const bifold = (formed: 'new-wall' | 'cut-existing', id = 'a'): WdOpening => ({ ...newOpening(id, 'D1', 'door-bifold'), widthMm: 3000, heightMm: 2100, work: defaultWork('door-bifold', 3000, formed) })

// ---- what it starts with
const cutO = bifold('cut-existing'), newO = bifold('new-wall')
t('a wide opening starts on a steel beam with the steel calculators options', cutO.work!.lintel === 'steel-beam' && !!cutO.work!.steel && !!newO.work!.steel)
t('cased in an existing wall, primed in a new one', cleanWallSteel(cutO.work!.steel).members[0].finish === 'cased' && cleanWallSteel(newO.work!.steel).members[0].finish === 'primed')
t('a narrow opening takes a lintel and no steel', !defaultWork('win-casement', 1200, 'new-wall').steel)
t('choosing a steel beam later gives it the steel options, once', (() => { const w = withSteel({ ...defaultWork('win-casement', 1200, 'new-wall'), lintel: 'steel-beam' }); return !!w.steel && withSteel(w).steel === w.steel })())
t('the old short list names map to the shared list', beamListName('UB 178x102x19') === '178 × 102 UB 19' && beamListName('UB 305x165x40') === '305 × 165 UB 40' && beamListName('anything') === 'auto')

// ---- priced like the steel calculators
const r = run(cutO)
const direct = priceWallSteel([{ id: 'a', ref: 'D1', widthMm: 3000, heightMm: 2100, steel: cutO.work!.steel as WallSteel }], 300)
const beam = line(r, /^st-steel-/)!
t('the beam costs what the steel calculators charge', !!beam && near(beam.unitCost, direct.lines.find(l => l.id.startsWith('steel|'))!.unitCost) && near(beam.qty, 3.3), [beam])
t('no single-beam line or separate padstones as well', !r.lines.some(l => /^(beam|padstones)\|/.test(l.id)))
t('its padstones and casing', line(r, /^st-padstone-/)?.qty === 2 && !!line(r, /^st-case-board-/))
t('still the unit, props, rubble, make good, engineer, tray and closers', ['unit', 'props', 'rubble', 'makegood', 'engineer', 'tray', 'closers'].every(k => !!line(r, new RegExp('^' + k + '\\|'))), r.lines.map(l => l.id))
t('every line belongs to the opening', r.lines.every(l => l.roomId === 'a'))
t('the words name the steel', r.openings[0].parts.join(' ').includes('steel beam over'), r.openings[0].parts)
t('the steel hours are added: bricklayer, labourer and carpenter', hrs(r, 'bricklayer') > 0 && hrs(r, 'carpenter') >= 4 && hrs(r, 'labourer') > hrs(run({ ...cutO, work: { ...cutO.work!, lintel: 'none', steel: undefined } }), 'labourer'), r.labour.map(l => [l.trade, l.hours]))
const rNew = run(newO)
t('in a new wall too, without props or rubble', !!line(rNew, /^st-steel-/) && !line(rNew, /^props\|/) && !line(rNew, /^rubble\|/))
t('fire protection warning only for bare steel in a load-bearing cut', !r.warnings.some(w => w.includes('no fire protection')) && run({ ...cutO, work: { ...cutO.work!, steel: openingSteel('new-wall') } }).warnings.some(w => w.includes('no fire protection')))

const two = run({ ...cutO, qty: 2 })
t('two openings: twice the steel and about twice its hours', near(line(two, /^st-steel-/)!.qty, 6.6) && line(two, /^st-padstone-/)!.qty === 4 && hrs(two, 'carpenter') >= hrs(r, 'carpenter') * 2 - 0.5, [line(two, /^st-steel-/), two.labour.map(l => [l.trade, l.hours])])

const spec = cleanWallSteel(cutO.work!.steel); spec.members.push(newWallMember('column'), { ...newWallMember('beam', '152 × 89 UB 16') })
const mix = run({ ...cutO, work: { ...cutO.work!, steel: spec } })
t('a column with its pad and a second beam size', mix.lines.filter(l => /^st-steel-/.test(l.id)).length === 3 && !!line(mix, /^st-pad-concrete-/))

const pair = [bifold('cut-existing', 'a'), bifold('cut-existing', 'b')]
const st = run(pair, { stock: { barsMm: [6100, 9100, 12200], offcutPct: 100 } })
t('whole bars: shared between openings, the offcut its own line', !!line(st, /^offcut-/) && st.cutting.length > 0 && st.cutting[0].bars.length === 1, st.cutting)
t('and none without it', !line(run(pair), /^offcut-/) && run(pair).cutting.length === 0)

// ---- openings saved before keep the single beam
const old: WdOpening = { ...cutO, work: { ...(cutO.work as OpeningWork), steel: undefined, beamSize: 'UB 203x133x25' } }
const ro = run(old)
t('an older opening: one beam from the short list at its old price, and padstones', line(ro, /^beam\|/)?.unitCost === 52 && line(ro, /^padstones\|/)?.qty === 2 && !ro.lines.some(l => l.id.startsWith('st-')), ro.lines.map(l => [l.id, l.unitCost]))
t('the plan following an opening keeps its steel', (() => { const p = { id: 'p', ref: 'D1', kind: 'door-bifold' as const, widthMm: 3000, heightMm: 2100, swing: 'in-left' as const }; const fed = mergePlanOpenings([], [p]); const withWork = [{ ...fed[0], work: cutO.work }]; const moved = mergePlanOpenings(withWork, [{ ...p, widthMm: 3600 }]); return !!moved[0].work?.steel && moved[0].widthMm === 3600 })())

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
