/**
 * Tests for the shared steel section list (lib/steel-sections.ts): the dimensions are checked against each size's own weight, and the sizes priced before keep their figures
 *
 * Run with:   npx tsx __tests__/steel-sections.test.ts
 */
import { ALL_SECTIONS, UB_SECTIONS, UC_SECTIONS, SHS_SECTIONS, SECTION_BY_LABEL, iProperties } from '../lib/steel-sections'
import { BEAM_CHOICES, BEAM_SECTIONS, POST_SECTIONS, beamFor, lighterThanChart } from '../lib/structural-openings-units'
import { STEEL_BEAMS, STEEL_COLUMNS, STEEL_HOLLOW } from '../lib/structural-steel-units'
import { SECTION_SPECS } from '../lib/steel-section-data'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

t('a good range: 52 beams, 18 columns, 12 box sections', UB_SECTIONS.length === 52 && UC_SECTIONS.length === 18 && SHS_SECTIONS.length === 12, [UB_SECTIONS.length, UC_SECTIONS.length, SHS_SECTIONS.length])
t('names are unique', new Set(ALL_SECTIONS.map(s => s.label)).size === ALL_SECTIONS.length)
// every I-section: the weight worked out from its dimensions matches its own weight a metre. A mistyped depth, width or thickness shows here.
const off = [...UB_SECTIONS, ...UC_SECTIONS].map(s => { const kg = iProperties(s).areaCm2 * 0.785; return [s.label, +kg.toFixed(2), s.kgPerM, +(((kg - s.kgPerM) / s.kgPerM) * 100).toFixed(1)] as const }).filter(r => Math.abs(r[3]) > 3.2)
t('every beam and column weighs what its dimensions say (within 3%)', off.length === 0, off)
const offH = SHS_SECTIONS.map(s => { const b = s.widthMm, w = s.webMm; const kg = (4 * w * (b - w)) * 0.00785 * 0.985; return [s.label, +kg.toFixed(2), s.kgPerM] as const }).filter(r => Math.abs(r[1] - r[2]) / r[2] > 0.08)
t('every box section weighs what its size and wall say (within 8%)', offH.length === 0, offH)
t('depth and width match the name', [...UB_SECTIONS, ...UC_SECTIONS].every(s => { const m = /^(\d+) × (\d+) /.exec(s.label)!; return Math.abs(+m[1] - s.depthMm) < 30 && Math.abs(+m[2] - s.widthMm) < 8 }))
t('web thinner than flange', [...UB_SECTIONS, ...UC_SECTIONS].every(s => s.webMm < s.flangeMm))
t('beams and columns are in order of size then weight', [UB_SECTIONS, UC_SECTIONS].every(list => list.every((s, i) => i === 0 || parseInt(list[i - 1].label) <= parseInt(s.label))))

// the column from Deon's merchant quote, as the merchant's own panel gave it
const c44 = SECTION_BY_LABEL['152 × 152 UC 44']
t('152 × 152 UC 44 is there, as the merchant lists it', !!c44 && c44.depthMm === 166 && c44.widthMm === 155.9 && c44.webMm === 9.5 && c44.flangeMm === 13.6 && c44.kgPerM === 44)

// every calculator reads the one list
t('openings, steel calculator and panel offer the same beams', BEAM_CHOICES.map(b => b.label).join() === UB_SECTIONS.map(b => b.label).join() && STEEL_BEAMS.map(b => b.label).join() === BEAM_CHOICES.map(b => b.label).join())
t('columns and box sections too', STEEL_COLUMNS.length === 18 && POST_SECTIONS.length === 18 && STEEL_HOLLOW.length === 12 && POST_SECTIONS[0].label === '152 × 152 UC 23')
t('every size has section details', ALL_SECTIONS.every(s => SECTION_SPECS.some(x => x.label === s.label)))

// what was priced before keeps its figures
const same = (label: string, kg: number, surf: number, girth: number) => { const s = SECTION_BY_LABEL[label]; return s.kgPerM === kg && s.surfaceM2PerM === surf && s.boxGirthMm === girth }
t('the sizes priced before keep their weight, coating surface and casing girth', same('152 × 89 UB 16', 16, 0.53, 493) && same('203 × 133 UB 25', 25, 0.78, 639) && same('533 × 210 UB 82', 82, 1.87, 1366) && same('152 × 152 UC 23', 23, 0.92, 700) && same('305 × 305 UC 97', 97, 1.82, 1330) && same('80 × 80 × 5 SHS', 11.3, 0.32, 620) && same('200 × 200 × 8 SHS', 47, 0.8, 1100))
t('the span chart is unchanged (nine sizes, same picks)', BEAM_SECTIONS.length === 9 && beamFor(1.2, 'floor').section.label === '152 × 89 UB 16' && beamFor(2.7, 'floor').section.label === '203 × 133 UB 25' && beamFor(20, 'floor').beyond)

// a hand-picked beam lighter than the chart suggests
const pick = (l: string) => BEAM_CHOICES.find(b => b.label === l)!
t('lighter than the chart: a tiny beam over a wide span warns', lighterThanChart(pick('127 × 76 UB 13'), 3, 'floor') && lighterThanChart(pick('254 × 102 UB 22'), 5, 'floor'))
t('a big new size over a small span does not', !lighterThanChart(pick('610 × 229 UB 101'), 3, 'floor') && !lighterThanChart(pick('203 × 102 UB 23'), 1.5, 'light'))
t('the sizes that had a sample span keep it', !lighterThanChart(pick('406 × 178 UB 54'), 7.9, 'floor') && lighterThanChart(pick('406 × 178 UB 54'), 8.1, 'floor'))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
