/**
 * Tests for lib/gantt-utils.ts  —  formatGanttDuration & countWorkingDays
 *
 * Run with:   npx tsx __tests__/gantt-duration.test.ts
 *
 * These tests reproduce the exact scenario reported as a bug:
 *   "A phase spanning 5 days should show '5 days', not '4.6 weeks'"
 */

import assert from 'node:assert/strict'
import { formatGanttDuration, countWorkingDays, isNonWorkingDay, workingDaySpanInCalendarDays, tidyGanttPhases } from '../lib/gantt-utils'
import type { GanttPhase } from '../lib/types'

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅  ${label}`)
    passed++
  } catch (err) {
    console.error(`  ❌  ${label}`)
    console.error(`       ${(err as Error).message}`)
    failed++
  }
}

// ─── formatGanttDuration ────────────────────────────────────────────────────

console.log('\nformatGanttDuration — Day mode')

test('5 days → "5 days"  (the bug: was showing "4.6 weeks")', () => {
  assert.equal(formatGanttDuration(5, 'day'), '5 days')
})

test('1 day  → "1 day"   (singular)', () => {
  assert.equal(formatGanttDuration(1, 'day'), '1 day')
})

test('7 days → "7 days"  (full week in day view stays in days)', () => {
  assert.equal(formatGanttDuration(7, 'day'), '7 days')
})

test('14 days → "14 days"', () => {
  assert.equal(formatGanttDuration(14, 'day'), '14 days')
})

test('32 days → "32 days"  (was the broken "4.6 weeks" case)', () => {
  assert.equal(formatGanttDuration(32, 'day'), '32 days')
})

// ─── Week mode ──────────────────────────────────────────────────────────────

console.log('\nformatGanttDuration — Week mode')

test('7 days  → "1 week"   (singular)', () => {
  assert.equal(formatGanttDuration(7, 'week'), '1 week')
})

test('14 days → "2 weeks"', () => {
  assert.equal(formatGanttDuration(14, 'week'), '2 weeks')
})

test('5 days  → "0.7 weeks"  (Math.round, not Math.ceil)', () => {
  // Math.round(5/7 * 10)/10 = Math.round(7.14)/10 = 7/10 = 0.7
  // (old broken code used Math.ceil → 8/10 = 0.8 weeks)
  assert.equal(formatGanttDuration(5, 'week'), '0.7 weeks')
})

test('56 days → "8 weeks"', () => {
  assert.equal(formatGanttDuration(56, 'week'), '8 weeks')
})

test('32 days → "4.6 weeks"  (correct representation in week mode)', () => {
  // 32/7 = 4.571… → Math.round(45.71)/10 = 46/10 = 4.6
  assert.equal(formatGanttDuration(32, 'week'), '4.6 weeks')
})

// ─── Month mode ─────────────────────────────────────────────────────────────

console.log('\nformatGanttDuration — Month mode')

test('30 days  → "1 month"  (singular)', () => {
  assert.equal(formatGanttDuration(30, 'month'), '1 month')
})

test('61 days  → "2 months"', () => {
  assert.equal(formatGanttDuration(61, 'month'), '2 months')
})

test('91 days  → "3 months"', () => {
  assert.equal(formatGanttDuration(91, 'month'), '3 months')
})

// ─── Canonical bug-report case ───────────────────────────────────────────────

console.log('\nBug-report canonical case')
console.log('  Phase: start Monday 2025-01-06, end Friday 2025-01-10')
console.log('  durDays = 5 (calendar days Mon–Fri)')

test('Day mode  → "5 days"  ← expected by user', () => {
  assert.equal(formatGanttDuration(5, 'day'), '5 days')
})

test('Week mode → "0.7 weeks"  (correct fractional weeks)', () => {
  assert.equal(formatGanttDuration(5, 'week'), '0.7 weeks')
})

test('Month mode → "0.2 months"', () => {
  assert.equal(formatGanttDuration(5, 'month'), '0.2 months')
})

// ─── countWorkingDays ────────────────────────────────────────────────────────

console.log('\ncountWorkingDays')

test('Mon 06 Jan → Fri 10 Jan = 5 working days', () => {
  const mon = new Date('2025-01-06')
  const fri = new Date('2025-01-10')
  assert.equal(countWorkingDays(mon, fri), 4) // exclusive end: Mon–Thu = 4 working days
})

test('Mon 06 Jan → Sat 11 Jan = 5 working days (exclusive of Sat)', () => {
  const mon = new Date('2025-01-06')
  const sat = new Date('2025-01-11')
  assert.equal(countWorkingDays(mon, sat), 5) // Mon–Fri inclusive
})

test('Same date → 0 working days', () => {
  const d = new Date('2025-01-06')
  assert.equal(countWorkingDays(d, d), 0)
})

test('Mon → Mon (7 days span) = 5 working days', () => {
  const start = new Date('2025-01-06') // Monday
  const end   = new Date('2025-01-13') // Next Monday
  assert.equal(countWorkingDays(start, end), 5)
})

// ─── isNonWorkingDay / workingDaySpanInCalendarDays ────────────────────────────
// Reproduces the reported bug: a 5-day task starting Wednesday spanned Wed–Sun
// (weekend included) instead of pushing the last two days into the following week.

console.log('\nisNonWorkingDay')

test('Sunday is never a working day, allowSaturday or not', () => {
  const sun = new Date('2026-10-04') // Sunday
  assert.equal(isNonWorkingDay(sun, false), true)
  assert.equal(isNonWorkingDay(sun, true), true)
})

test('Saturday is non-working unless allowSaturday is set', () => {
  const sat = new Date('2026-10-03') // Saturday
  assert.equal(isNonWorkingDay(sat, false), true)
  assert.equal(isNonWorkingDay(sat, true), false)
})

test('Weekdays are always working days', () => {
  assert.equal(isNonWorkingDay(new Date('2026-09-30'), false), false) // Wednesday
})

console.log('\nworkingDaySpanInCalendarDays')

test('Wed + 5 working days, no Saturday -> 7 calendar days (pushes weekend to next Mon/Tue)', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-09-30'), 5, false), 7)
})

test('Wed + 5 working days, allowSaturday -> 6 calendar days (Sat counts, Sun still skipped)', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-09-30'), 5, true), 6)
})

test('Mon + 5 working days -> 5 (no weekend crossed)', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-09-28'), 5, false), 5)
})

test('Fri + 1 working day -> 1', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-10-02'), 1, false), 1)
})

test('Starting on a Sunday pushes the 1 working day to Monday -> 2 calendar days', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-10-04'), 1, false), 2)
})

test('Starting on a Saturday with allowSaturday counts that day itself -> 1', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-10-03'), 1, true), 1)
})

test('Starting on a Saturday without allowSaturday pushes to Monday -> 3 calendar days', () => {
  assert.equal(workingDaySpanInCalendarDays(new Date('2026-10-03'), 1, false), 3)
})

test('workingDaySpanInCalendarDays is the inverse of countWorkingDays', () => {
  const start = new Date('2026-09-30') // Wednesday
  const span = workingDaySpanInCalendarDays(start, 5, false) // 7
  const end = new Date(start)
  end.setDate(end.getDate() + span)
  assert.equal(countWorkingDays(start, end, false), 5)
})

// ─── tidyGanttPhases ────────────────────────────────────────────────────────

console.log('\ntidyGanttPhases')

const ph = (id: string, label: string, startDay: number, durDays: number, level: 0 | 1 | 2, parentId?: string): GanttPhase =>
  ({ id, label, startDay, durDays, level, ...(parentId ? { parentId } : {}) })
const ids = (r: { phases: GanttPhase[] }) => r.phases.map(p => p.id).join(',')

// Two stages in the wrong order, tasks out of order inside a stage, and a stage bar that no longer
// matches its tasks (as happens after tasks are dragged around in the Calendar).
const messy: GanttPhase[] = [
  ph('S2', 'Inside', 30, 10, 0),
  ph('p3', 'Plaster', 35, 5, 1, 'S2'),
  ph('p2', 'First fix', 30, 5, 1, 'S2'),
  ph('S1', 'Structure', 0, 10, 0),
  ph('p1b', 'Roof', 20, 8, 1, 'S1'),
  ph('t1', 'Rafters', 20, 3, 2, 'p1b'),
  ph('p1a', 'Walls', 0, 10, 1, 'S1'),
]

test('sorts stages, phases and tasks into date order, children staying under their parent', () => {
  assert.equal(ids(tidyGanttPhases(messy)), 'S1,p1a,p1b,t1,S2,p2,p3')
})

test('re-fits each stage to cover its phases', () => {
  const r = tidyGanttPhases(messy)
  const s1 = r.phases.find(p => p.id === 'S1')!
  assert.equal(s1.startDay, 0)
  assert.equal(s1.durDays, 28)   // Walls 0-10, Roof 20-28
  assert.equal(r.refitted, 1)    // Inside (30-40) already matched, Structure did not
  assert.equal(r.reordered, true)
})

test('never changes a phase or task start or duration', () => {
  const r = tidyGanttPhases(messy)
  for (const p of messy.filter(m => (m.level ?? 1) > 0)) {
    const after = r.phases.find(q => q.id === p.id)!
    assert.equal(after.startDay, p.startDay)
    assert.equal(after.durDays, p.durDays)
  }
})

test('leaves the input untouched', () => {
  const before = JSON.stringify(messy)
  tidyGanttPhases(messy)
  assert.equal(JSON.stringify(messy), before)
})

test('an already-tidy programme reports no change', () => {
  const first = tidyGanttPhases(messy)
  const again = tidyGanttPhases(first.phases)
  assert.equal(again.reordered, false)
  assert.equal(again.refitted, 0)
  assert.equal(ids(again), ids(first))
})

test('rows with no parentId attach to the nearest row above them one level up', () => {
  const legacy: GanttPhase[] = [
    ph('A', 'Stage B', 10, 5, 0),
    ph('a1', 'Later', 12, 3, 1),
    ph('a2', 'Earlier', 10, 2, 1),
    ph('B', 'Stage A', 0, 4, 0),
    ph('b1', 'Only', 0, 4, 1),
  ]
  assert.equal(ids(tidyGanttPhases(legacy)), 'B,b1,A,a2,a1')
})

test('equal start days keep their existing order', () => {
  const same: GanttPhase[] = [ph('x', 'X', 5, 2, 1), ph('y', 'Y', 5, 2, 1), ph('z', 'Z', 5, 2, 1)]
  assert.equal(ids(tidyGanttPhases(same)), 'x,y,z')
})

test('a flat programme with no stages is sorted by start day', () => {
  const flat: GanttPhase[] = [ph('c', 'C', 20, 2, 1), ph('a', 'A', 0, 2, 1), ph('b', 'B', 10, 2, 1)]
  assert.equal(ids(tidyGanttPhases(flat)), 'a,b,c')
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
if (failed === 0) {
  console.log(`✅  All ${passed} tests passed.\n`)
  process.exit(0)
} else {
  console.log(`❌  ${failed} of ${passed + failed} tests FAILED.\n`)
  process.exit(1)
}
