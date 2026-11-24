/**
 * Tests for the section spec data and rows (lib/steel-section-data.ts) and the grade (the engine and the wall steel words)
 *
 * Run with:   npx tsx __tests__/steel-section-data.test.ts
 */
import { SECTION_SPECS, sectionSpec, specRows, areaCm2, isSteelGrade, STEEL_GRADES } from '../lib/steel-section-data'
import { STEEL_BEAMS, STEEL_COLUMNS, STEEL_HOLLOW, calculateSteelwork, newMember, DEFAULT_STRUCTURAL_SITUATIONS, type SteelMember } from '../lib/structural-steel-units'
import { newWallSteel, wallSteelWords, cleanWallSteel, priceWallSteel } from '../lib/wall-steel'
import { flangeWidthMm } from '../lib/steel-processes'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const near = (a: number, b: number, e = 0.001) => Math.abs(a - b) <= e

// ---- the table covers every section the calculators offer, and each is believable
const all = [...STEEL_BEAMS, ...STEEL_COLUMNS, ...STEEL_HOLLOW]
t('every section the calculators offer has a spec', all.every(s => !!sectionSpec(s.label)), all.filter(s => !sectionSpec(s.label)).map(s => s.label))
t('and nothing in the table is a section the calculators do not offer', SECTION_SPECS.every(s => all.some(a => a.label === s.label)), SECTION_SPECS.filter(s => !all.some(a => a.label === s.label)).map(s => s.label))
t('labels are unique', new Set(SECTION_SPECS.map(s => s.label)).size === SECTION_SPECS.length)
t('the catalogue weight is within 0.5 kg/m of the weight the calculators price', all.every(s => Math.abs(sectionSpec(s.label)!.kgPerM - s.kgPerM) <= 0.5), all.filter(s => Math.abs(sectionSpec(s.label)!.kgPerM - s.kgPerM) > 0.5).map(s => [s.label, s.kgPerM, sectionSpec(s.label)!.kgPerM]))
t('the depth and width in the name match the table (203 × 133 is 203mm deep and 133mm wide, to the nearest 10mm)', SECTION_SPECS.filter(s => s.family !== 'SHS').every(s => { const m = /^(\d+) × (\d+) /.exec(s.label)!; return Math.abs(+m[1] - s.depthMm) < 8 && Math.abs(+m[2] - s.widthMm) < 8 }), SECTION_SPECS.map(s => s.label))
t('the flange width the plate uses is the width in the table', SECTION_SPECS.filter(s => s.family !== 'SHS').every(s => Math.abs(flangeWidthMm(s.label)! - s.widthMm) < 8))
// a check of the hand-typed figures against geometry: the area of two flanges and a web is within 12% of the catalogue's, and Ixx of an I-shape within 8% (the root radius adds a little)
const I = SECTION_SPECS.filter(s => s.family !== 'SHS')
t('area from the dimensions is within 12% of the weight over the density (catches a mis-typed figure)', I.every(s => { const a = 2 * s.widthMm * s.flangeMm + (s.depthMm - 2 * s.flangeMm) * s.webMm; const cat = areaCm2(s.kgPerM) * 100; return Math.abs(a - cat) / cat < 0.12 }), I.map(s => { const a = 2 * s.widthMm * s.flangeMm + (s.depthMm - 2 * s.flangeMm) * s.webMm; return [s.label, Math.round(a), Math.round(areaCm2(s.kgPerM) * 100)] }))
t('Ixx from the dimensions is within 8% of the table (catches a mis-typed figure)', I.every(s => { const i = (s.widthMm * s.depthMm ** 3 - (s.widthMm - s.webMm) * (s.depthMm - 2 * s.flangeMm) ** 3) / 12 / 1e4; return Math.abs(i - s.ixxCm4!) / s.ixxCm4! < 0.08 }), I.map(s => { const i = (s.widthMm * s.depthMm ** 3 - (s.widthMm - s.webMm) * (s.depthMm - 2 * s.flangeMm) ** 3) / 12 / 1e4; return [s.label, Math.round(i), s.ixxCm4] }))
t('Wel is about Ixx over half the depth, and Wpl is 8 to 25% above Wel', I.every(s => Math.abs(s.welCm3! - s.ixxCm4! / (s.depthMm / 20)) / s.welCm3! < 0.03 && s.wplCm3! / s.welCm3! > 1.08 && s.wplCm3! / s.welCm3! < 1.25), I.map(s => [s.label, s.welCm3, Math.round(s.ixxCm4! / (s.depthMm / 20)), (s.wplCm3! / s.welCm3!).toFixed(2)]))
t('web is thinner than the flange on every beam and column', I.every(s => s.webMm < s.flangeMm))
t('a hollow section is square with its wall thickness as web and flange and no Ixx', SECTION_SPECS.filter(s => s.family === 'SHS').every(s => s.depthMm === s.widthMm && s.webMm === s.flangeMm && s.ixxCm4 === undefined))
t('a name that is not a section has no spec (timber, auto, empty)', sectionSpec('auto') === null && sectionSpec('') === null && sectionSpec('LVL 2 × 45 × 200 (doubled)') === null)

// ---- the rows for the panel
const r = specRows(sectionSpec('203 × 133 UB 25')!, 25, 4200, 1)
const get = (rows: ReturnType<typeof specRows>, label: string) => rows.find(x => x.label.startsWith(label))?.value
t('rows: depth, width, web, flange for a beam', get(r, 'Depth') === '203.2mm' && get(r, 'Width') === '133.2mm' && get(r, 'Web') === '5.7mm' && get(r, 'Flange') === '7.8mm', r)
t('rows: weight priced, area, Ixx, moduli', get(r, 'Weight priced') === '25 kg/m' && get(r, 'Area') === '32 cm²' && get(r, 'Second moment')!.startsWith('2,340') && get(r, 'Elastic')!.startsWith('230') && get(r, 'Plastic')!.startsWith('258'), r)
t('rows: the member itself weighs 25 x 4.2 = 105kg', get(r, 'This member weighs') === '105kg')
const r2 = specRows(sectionSpec('203 × 133 UB 25')!, 25, 4200, 3)
t('rows: three beams say each and all together', get(r2, 'Each of the 3 weighs') === '105kg' && get(r2, 'All together') === '315kg')
const r3 = specRows(sectionSpec('100 × 100 × 5 SHS')!, 14.7, 2700, 1)
t('rows: a hollow section has an outside size and wall, and no Ixx or moduli', get(r3, 'Outside size') === '100 × 100mm' && get(r3, 'Wall thickness') === '5mm' && !get(r3, 'Second moment') && !get(r3, 'Elastic'), r3)
t('rows: no length gives no weight rows', !get(specRows(sectionSpec('203 × 133 UB 25')!, 25, 0, 1), 'This member weighs'))

// ---- the grade
t('grades are S275 and S355 only', STEEL_GRADES.join() === 'S275,S355' && isSteelGrade('S355') && isSteelGrade('S275') && !isSteelGrade('S235') && !isSteelGrade(undefined) && !isSteelGrade(355))
const calc = (m: SteelMember) => calculateSteelwork({ members: [m], jobSituationId: 'clear', situations: DEFAULT_STRUCTURAL_SITUATIONS, engineer: false, buildingControl: false, hiabVisits: 0, rates: {} })
const plain = calc(newMember('b1', 'B1', 'beam'))
const g355 = calc({ ...newMember('b1', 'B1', 'beam'), grade: 'S355' })
const g275 = calc({ ...newMember('b1', 'B1', 'beam'), grade: 'S275' })
t('grade: the words name it', g355.members[0].parts[0].includes('203 × 133 UB 25 S355 steel beam') && g275.members[0].parts[0].includes('203 × 133 UB 25 S275 steel beam'), [g355.members[0].parts, g275.members[0].parts])
t('grade: no grade chosen leaves the words as before', !/S\d{3}/.test(plain.members[0].parts[0]))
t('grade: it does not change the price', JSON.stringify(plain.lines.map(l => [l.id, l.unitCost, l.qty])) === JSON.stringify(g355.lines.map(l => [l.id, l.unitCost, l.qty])) && plain.totalSteelKg === g275.totalSteelKg)
t('grade: a column says it too', calc({ ...newMember('c1', 'C1', 'column'), grade: 'S355' }).members[0].parts[0].includes('152 × 152 UC 23 S355 steel column'))
t('grade: a beam bolted through end plates says it too', calc({ ...newMember('b1', 'B1', 'beam'), ends: 'steel', grade: 'S355' }).members[0].parts[0].includes('S355 steel beam'))
t('grade: timber has none', !/S\d{3}/.test(calc({ ...newMember('l1', 'B1', 'lvl'), grade: 'S355' }).members[0].parts[0]))

// ---- in a wall
const ws = newWallSteel(); ws.members[0].grade = 'S355'
t('wall: the quote words name the grade on the beam', wallSteelWords(ws, 2700, 300).includes('one 203 × 133 UB 25 S355 steel beam over'), wallSteelWords(ws, 2700, 300))
t('wall: no grade, the words are as before', wallSteelWords(newWallSteel(), 2700, 300).includes('one 203 × 133 UB 25 steel beam over'))
t('wall: a grade is kept when saved and an unknown one is dropped', cleanWallSteel({ members: [{ kind: 'beam', section: 'auto', qty: 1, grade: 'S275' }] }).members[0].grade === 'S275' && cleanWallSteel({ members: [{ kind: 'beam', section: 'auto', qty: 1, grade: 'S999' }] }).members[0].grade === undefined)
t('wall: timber never carries a grade', cleanWallSteel({ members: [{ kind: 'lvl', section: 'LVL 2 × 45 × 200 (doubled)', qty: 1, grade: 'S355' }] }).members[0].grade === undefined)
t('wall: the grade does not change the price', (() => { const a = priceWallSteel([{ id: 'a', ref: 'D1', widthMm: 2700, heightMm: 2100, steel: newWallSteel() }], 300); const b = priceWallSteel([{ id: 'a', ref: 'D1', widthMm: 2700, heightMm: 2100, steel: ws }], 300); return JSON.stringify(a.lines.map(l => [l.name, l.unitCost, l.qty])) === JSON.stringify(b.lines.map(l => [l.name, l.unitCost, l.qty])) })())

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
