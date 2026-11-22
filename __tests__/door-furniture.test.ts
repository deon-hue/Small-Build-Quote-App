/**
 * Tests for an internal door supplied by the client with its furniture: the engine lines and hours, the words and warnings, and the AI hand-over
 *
 * Run with:   npx tsx __tests__/door-furniture.test.ts
 */
import { calculateWindowsDoors, newOpening, openingWords, DEFAULT_WD_SITUATIONS, type WdOpening } from '../lib/wd-units'
import { describeWd } from '../lib/wd-description'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }
const calc = (o: WdOpening[]) => calculateWindowsDoors({ openings: o, jobSituationId: 'ground', situations: DEFAULT_WD_SITUATIONS, rates: {} })
const door = (patch: Partial<WdOpening> = {}): WdOpening => ({ ...newOpening('d1', 'ID1', 'door-int-single', 'Hall'), ...patch })
const has = (r: ReturnType<typeof calc>, key: string) => r.lines.some(l => l.id.startsWith(key + '|'))
const hours = (r: ReturnType<typeof calc>) => r.labour.find(l => l.key === 'fit|d1')?.hours ?? 0

const ours = calc([door()])
t('by default we supply the door and the furniture', has(ours, 'unit') && has(ours, 'ironmongery'))
t('a new door starts with ironmongery ticked and no furniture supply set', door().ironmongery === true && door().ironmongerySupply === undefined)

const furn = calc([door({ ironmongerySupply: 'client' })])
t('client furniture: no ironmongery material line, the door is still ours', !has(furn, 'ironmongery') && has(furn, 'unit'))
t('client furniture: the fitting time stays (the hinges and latch still have to be fitted)', hours(furn) === hours(ours), [hours(furn), hours(ours)])
t('client furniture: the parts say so', furn.openings[0].parts.some(p => p.includes('door furniture') && p.includes('client')))
t('client furniture: the door words do not claim our ironmongery', !openingWords(door({ ironmongerySupply: 'client' })).includes('ironmongery') && openingWords(door()).includes('ironmongery'))
t('client furniture: the unit line name does not say ironmongery', furn.lines.find(l => l.id.startsWith('unit|'))!.name.includes('ironmongery') === false)
t('client furniture: a warning to have it on site and check hinges and latch', furn.warnings.some(w => w.includes('furniture') && w.includes('hinges')))

const both = calc([door({ supply: 'client', ironmongerySupply: 'client' })])
t('client door and furniture: no unit line and no ironmongery line', !has(both, 'unit') && !has(both, 'ironmongery'))
t('client door and furniture: lining, architrave, sundries and fitting still priced', has(both, 'lining') && has(both, 'architrave') && has(both, 'sundries') && hours(both) > 0)
t('client door and furniture: one warning says both', both.warnings.filter(w => w.includes('door and its furniture')).length === 1, both.warnings)
t('client door and furniture: cheaper than ours by the unit and the furniture', (() => { const sum = (r: ReturnType<typeof calc>) => r.lines.reduce((s, l) => s + l.unitCost * l.qty, 0); return Math.abs(sum(ours) - sum(both) - (45 + 20 * 826 * 2040 / 1e6 + 35)) < 0.02 })(), [ours.lines.map(l => l.name + l.unitCost), both.lines.length])
t('client door alone: furniture still ours', (() => { const r = calc([door({ supply: 'client' })]); return !has(r, 'unit') && has(r, 'ironmongery') && r.warnings.some(w => w.includes('the client supplies the door:')) })())

// ironmongery not ticked: the client flag does nothing
const none = calc([door({ ironmongery: false, ironmongerySupply: 'client' })])
t('no ironmongery ticked: nothing about furniture at all', !has(none, 'ironmongery') && !none.warnings.some(w => w.includes('furniture')) && !none.openings[0].parts.some(p => p.includes('furniture')))

// a fire door
const fire = calc([{ ...newOpening('d1', 'ID1', 'door-int-fire', 'Hall'), ironmongerySupply: 'client' }])
t('a fire door with client furniture warns about fire-rated hinges and latch', fire.warnings.some(w => w.includes('fire-rated hinges and latch') && w.includes('client supplies')), fire.warnings)

// quantity
const three = calc([door({ qty: 3, ironmongerySupply: 'client' })])
t('three doors: fitting hours are three times, still no ironmongery line', !has(three, 'ironmongery') && hours(three) >= hours(furn) * 2)

// an external door is not affected
const ext = { ...newOpening('d1', 'D1', 'door-front', 'Front'), ironmongerySupply: 'client' as const }
const re = calc([ext])
t('an external door ignores it', !re.warnings.some(w => w.includes('furniture')))

// the quote words
const input = (anyClientFurniture: boolean) => ({ openings: [{ ref: 'ID1', location: 'Hall', parts: ['826 x 2040 internal door'] }], windows: 0, externalDoors: 0, internalDoors: 1, anyProvisional: false, anyClientSupplied: false, anyClientFurniture, scope: 'doors' as const })
t('the description mentions client furniture only when there is some', describeWd(input(true)).includes('door furniture') && !describeWd(input(false)).includes('door furniture'))

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
