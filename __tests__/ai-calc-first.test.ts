/**
 * Tests for lib/ai-calc-first.ts  —  the AI quote always uses the new calculators unless a sub-phase has none
 *
 * Run with:   npx tsx __tests__/ai-calc-first.test.ts
 */

import { OLD_TO_CALC, oldPhasesToHide, redirectOldPhases } from '../lib/ai-calc-first'
import { BUILT_ASSEMBLY_CANONICAL_IDS } from '../lib/built-assembly-ids'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

// every calculator a redirect points at is a real, registered calculator, and no old id is itself a calculator
for (const [old, targets] of Object.entries(OLD_TO_CALC)) {
  t(`${old}: is not itself a calculator`, !BUILT_ASSEMBLY_CANONICAL_IDS.has(old))
  for (const c of targets) t(`${old} -> ${c}: the target is a registered calculator`, BUILT_ASSEMBLY_CANONICAL_IDS.has(c) || c.startsWith('demo-') && BUILT_ASSEMBLY_CANONICAL_IDS.has(c), c)
}
// things with NO calculator are never hidden
for (const keep of ['plaster-ceiling', 'sf-timber-frame', 'sf-masonry', 'roof-flashings', 'drain-above-ground', 'drain-cap-off', 'plumb-boiler-heating', 'deco-specialist', 'deco-external', 'deco-floor-finishes', 'iw-party-wall', 'site_scaffold'])
  t(`${keep} has no calculator, so it is not redirected`, !(keep in OLD_TO_CALC))

const sub = (name: string, canonical_id: string) => ({ name, canonical_id })
const full = [
  sub('Internal Wall Plastering', 'plaster-internal'), sub('Internal Plastering & Boarding (by room)', 'plaster-rooms'),
  sub('Ceiling Plastering & Boarding', 'plaster-ceiling'),
  sub('Wall Tiling', 'tile-wall'), sub('Wall Tiling (by room)', 'tile-wall-rooms'),
  sub('Flashings & Weathertightness', 'roof-flashings'),
  sub('Structural Steelwork', 'sf-steelwork'), sub('Steel Beams, Columns & Posts (by member)', 'sf-steel-calc'),
  sub('Kitchen', 'elec-kitchen'), sub('Kitchen', 'plumb-kitchen'), sub('Electrical Installation (by room)', 'elec-install'), sub('Plumbing Installation (by room)', 'plumb-install'),
]
const hide = oldPhasesToHide(full)
t('internal plastering is hidden, replaced by the room calculator', hide.get('Internal Wall Plastering') === 'Internal Plastering & Boarding (by room)', [...hide])
t('wall tiling is hidden, replaced by wall tiling by room', hide.get('Wall Tiling') === 'Wall Tiling (by room)')
t('ceiling plastering stays (vaulted ceilings live there)', !hide.has('Ceiling Plastering & Boarding'))
t('flashings stay (no calculator)', !hide.has('Flashings & Weathertightness'))
t('structural steelwork is hidden, replaced by the steel calculator', hide.get('Structural Steelwork') === 'Steel Beams, Columns & Posts (by member)')
t('calculators themselves are never hidden', !hide.has('Wall Tiling (by room)') && !hide.has('Electrical Installation (by room)'))
t('the two old Kitchens (electrics and plumbing) are both hidden when both calculators exist', hide.get('Kitchen') === 'Electrical Installation (by room)' || hide.get('Kitchen') === 'Plumbing Installation (by room)', [...hide])

// a company whose Back Office has NOT got the calculator yet keeps the old line
const noCalc = oldPhasesToHide([sub('Wall Tiling', 'tile-wall'), sub('Internal Wall Plastering', 'plaster-internal'), sub('Internal Plastering & Boarding (by room)', 'plaster-rooms')])
t('no wall tiling calculator in Back Office: the old Wall Tiling is kept', !noCalc.has('Wall Tiling'))
t('but the plastering one is still hidden', noCalc.has('Internal Wall Plastering'))
// a name shared by an old sub-phase and one with no calculator is kept
const clash = oldPhasesToHide([sub('Kitchen', 'elec-kitchen'), sub('Kitchen', 'plumb-kitchen'), sub('Electrical Installation (by room)', 'elec-install')])
t('Kitchen is kept when only electrics has its calculator (plumbing Kitchen would be lost)', !clash.has('Kitchen'), [...clash])
t('no sub-phases at all hides nothing', oldPhasesToHide([]).size === 0)
t('a sub-phase with no canonical id (the company\'s own) is never hidden', !oldPhasesToHide([{ name: 'My own wall tiling' }, sub('Wall Tiling (by room)', 'tile-wall-rooms')]).has('My own wall tiling'))
// several targets: the first one the company has
const demo = oldPhasesToHide([sub('External Demolition', 'demo-external-demo'), sub('External Works: surfaces, walls and fences (calculator)', 'demo-external-works-calc')])
t('external demolition goes to whichever of its calculators exists', demo.get('External Demolition') === 'External Works: surfaces, walls and fences (calculator)', [...demo])

// redirecting the AI's answer
const parentOf = { 'Internal Plastering & Boarding (by room)': 'Phase 6 – Plastering & Boarding', 'Wall Tiling (by room)': 'Phase 9 – Tiling & Finishes' }
const answer = [
  { parentPhase: 'Phase 1', phase: 'Preliminaries', selectedTasks: ['A'] },
  { parentPhase: 'x', phase: 'Internal Wall Plastering', selectedTasks: ['Skim', 'Patch'], extraTasks: [{ name: 'e' }] },
  { parentPhase: 'y', phase: 'Wall Tiling', selectedTasks: ['Tile'] },
  { parentPhase: 'z', phase: 'Ceiling Plastering & Boarding', selectedTasks: ['Skim ceiling'] },
]
const rep = redirectOldPhases(answer, hide, parentOf)
t('a named old phase becomes its calculator, with no tasks and the right main phase', rep.phases[1].phase === 'Internal Plastering & Boarding (by room)' && rep.phases[1].selectedTasks!.length === 0 && (rep.phases[1].extraTasks ?? []).length === 0 && rep.phases[1].parentPhase === 'Phase 6 – Plastering & Boarding', rep.phases[1])
t('the tiling one too', rep.phases[2].phase === 'Wall Tiling (by room)')
t('a phase with no calculator is left alone with its tasks', rep.phases[3].phase === 'Ceiling Plastering & Boarding' && rep.phases[3].selectedTasks!.length === 1 && rep.phases[0].selectedTasks!.length === 1)
t('two swaps are reported', rep.swapped.length === 2 && rep.swapped[0].from === 'Internal Wall Plastering', rep.swapped)
t('the answer keeps its length when nothing repeats', rep.phases.length === 4)
// the calculator line already in the answer is not repeated; extra data (the calc object) on it is kept
const twice = redirectOldPhases([{ phase: 'Internal Plastering & Boarding (by room)', selectedTasks: [], calc: { rooms: [1] } }, { phase: 'Internal Wall Plastering', selectedTasks: ['Skim'] }], hide, parentOf)
t('no duplicate calculator line', twice.phases.length === 1 && !!(twice.phases[0] as { calc?: unknown }).calc, twice.phases)
const twiceOld = redirectOldPhases([{ phase: 'Internal Wall Plastering', selectedTasks: ['Skim'] }, { phase: 'Internal Wall Plastering', selectedTasks: ['Patch'] }], hide, parentOf)
t('the same old phase named twice becomes one calculator line', twiceOld.phases.length === 1, twiceOld.phases)
t('nothing to hide leaves the answer as it is', redirectOldPhases(answer, new Map(), parentOf).phases.length === 4)
t('the input is not changed', answer[1].phase === 'Internal Wall Plastering' && answer[1].selectedTasks!.length === 2)

console.log(`ai calc first: ${ok} ok, ${bad} failed`)
if (bad > 0) process.exit(1)
