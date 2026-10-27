// Plan symbols for the drainage chambers, manholes, gullies and connections placed on a Take-off drawing, in the usual drawing conventions: a manhole is a circle with a cross, an inspection chamber a square with a circle
// in it, a rodding eye a small triangle, a gully a small square or circle with its grating, a connection a circle with a branch. Each is a few simple shapes in plan view at the size of the real thing (1 unit = 10mm,
// the middle at 0,0), so the screen only has to scale them to the plan. The 'accent' parts take the colour of the kind's group (chambers brown, gullies blue, connections purple). Pure, so it can be tested with plain Node.

import type { PlumbSymbol, SymShape, SymRole } from './plumb-symbols'

const rect = (x: number, y: number, w: number, h: number, role: SymRole, r?: number): SymShape => ({ k: 'rect', x, y, w, h, role, ...(r != null ? { r } : {}) })
const circle = (cx: number, cy: number, r: number, role: SymRole): SymShape => ({ k: 'circle', cx, cy, r, role })
const path = (d: string, role: SymRole): SymShape => ({ k: 'path', d, role })

// the keys are the kinds of lib/drain-items-units.ts
const SYMBOLS: Record<string, () => PlumbSymbol> = {
  // 450mm inspection chamber: a square with its round cover in it
  ic: () => ({ w: 50, h: 50, shapes: [rect(-25, -25, 50, 50, 'body', 2), circle(0, 0, 17, 'inner'), circle(0, 0, 17, 'line'), path('M-17 0H17M0 -17V17', 'faint'), circle(0, 0, 3, 'accent')] }),
  // 1050mm manhole: a big circle with a cross, its cover ring inside
  manhole: () => ({ w: 110, h: 110, shapes: [circle(0, 0, 55, 'body'), circle(0, 0, 40, 'inner'), circle(0, 0, 28, 'line'), path('M-28 0H28M0 -28V28', 'line'), circle(0, 0, 5, 'accent')] }),
  // a rodding eye: a small triangle
  'rodding-eye': () => ({ w: 26, h: 26, shapes: [path('M0 -13L13 11H-13Z', 'accent'), path('M0 -13L13 11H-13Z', 'line')] }),
  // trapped gully: a round gully with its trap marked
  'gully-trapped': () => ({ w: 34, h: 34, shapes: [circle(0, 0, 17, 'body'), circle(0, 0, 11, 'inner'), path('M-8 0H8', 'faint'), circle(0, 0, 3, 'accent')] }),
  // yard or rainwater gully: a square with its grating
  'gully-yard': () => ({ w: 36, h: 36, shapes: [rect(-18, -18, 36, 36, 'body', 2), rect(-13, -13, 26, 26, 'inner', 1), path('M-13 -6H13M-13 0H13M-13 6H13', 'faint'), circle(0, 0, 3, 'accent')] }),
  // road gully: a longer grating with bars across it
  'gully-road': () => ({ w: 56, h: 44, shapes: [rect(-28, -22, 56, 44, 'body', 2), rect(-23, -17, 46, 34, 'inner', 1), path('M-14 -17V17M-5 -17V17M5 -17V17M14 -17V17', 'line'), circle(0, 0, 3, 'accent')] }),
  // connection to an existing drain: a circle with a branch joining it
  'connect-existing': () => ({ w: 40, h: 40, shapes: [circle(0, 0, 14, 'body'), circle(0, 0, 8, 'inner'), path('M0 -14V-20M-8 -20H8', 'line'), circle(0, 0, 3, 'accent')] }),
  // connection to the public sewer: a circle crossed by the line of the sewer
  'connect-sewer': () => ({ w: 46, h: 46, shapes: [circle(0, 0, 16, 'body'), circle(0, 0, 9, 'accent'), path('M-23 14L23 -14', 'line')] }),
}

/** The symbol for a kind of drainage item at the size of the real one, or null when there is none (the screen then draws a dot) */
export function drainSymbol(kind: string): PlumbSymbol | null {
  const make = SYMBOLS[kind]
  return make ? make() : null
}

/** The colour of each group on the plan and in the panel */
export const DRAIN_GROUP_COLOUR: Record<'chamber' | 'gully' | 'connection', string> = { chamber: '#92400e', gully: '#2563eb', connection: '#7c3aed' }
