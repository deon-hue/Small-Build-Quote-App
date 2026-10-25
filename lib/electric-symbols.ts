// Plan symbols for the electrical points placed on a Take-off drawing: a socket looks like a socket, a switch like a switch, a downlight like the usual circle with a cross. They are drafting symbols (a little larger than the
// real plate so they read on a plan): a few simple shapes, 1 unit = 10mm, the middle at 0,0 and the BACK (the side against the wall) at the top, -y, so a wall-mounted point can be turned to face its wall. The group colour
// (sockets blue, switches violet, lighting amber...) is applied by the screen to the 'accent' shapes. Pure (type-only import), so it can be tested with plain Node.

import type { SymShape, SymRole, PlumbSymbol } from './plumb-symbols'

const rect = (x: number, y: number, w: number, h: number, role: SymRole, r?: number): SymShape => ({ k: 'rect', x, y, w, h, role, ...(r != null ? { r } : {}) })
const circle = (cx: number, cy: number, r: number, role: SymRole): SymShape => ({ k: 'circle', cx, cy, r, role })
const path = (d: string, role: SymRole): SymShape => ({ k: 'path', d, role })

const SYMBOLS: Record<string, PlumbSymbol> = {
  'sgl-socket': { w: 20, h: 12, shapes: [rect(-10, -6, 20, 12, 'body', 2), circle(0, 0, 3.6, 'accent')] },
  'dbl-socket': { w: 32, h: 12, shapes: [rect(-16, -6, 32, 12, 'body', 2), circle(-7, 0, 3.6, 'accent'), circle(7, 0, 3.6, 'accent')] },
  'usb-socket': { w: 32, h: 12, shapes: [rect(-16, -6, 32, 12, 'body', 2), circle(-7, 0, 3.6, 'accent'), rect(2, -3, 10, 6, 'accent', 1)] },
  'fused-spur': { w: 22, h: 14, shapes: [rect(-11, -7, 22, 14, 'body', 2), rect(-5, -4, 10, 8, 'inner', 1), path('M-8 0H-5M5 0H8', 'accentLine')] },
  'outside-socket': { w: 26, h: 16, shapes: [rect(-13, -8, 26, 16, 'body', 2), rect(-10, -5, 20, 10, 'inner', 1), circle(0, 0, 3.4, 'accent')] },
  '1g-switch': { w: 14, h: 14, shapes: [rect(-7, -7, 14, 14, 'body', 2), path('M0 1L5 -5', 'accentLine'), circle(0, 1, 1.8, 'accent')] },
  '2g-switch': { w: 26, h: 14, shapes: [rect(-13, -7, 26, 14, 'body', 2), path('M-6 1L-1 -5M6 1L11 -5', 'accentLine'), circle(-6, 1, 1.8, 'accent'), circle(6, 1, 1.8, 'accent')] },
  '2way-switch': { w: 14, h: 14, shapes: [rect(-7, -7, 14, 14, 'body', 2), path('M0 2L5 -4M0 2L-5 -4', 'accentLine'), circle(0, 2, 1.8, 'accent')] },
  dimmer: { w: 14, h: 14, shapes: [rect(-7, -7, 14, 14, 'body', 2), circle(0, 0, 4, 'inner'), path('M0 0V-4', 'accentLine')] },
  'pull-cord': { w: 14, h: 24, shapes: [circle(0, -6, 5, 'body'), path('M0 -1V8', 'accentLine'), circle(0, 9, 1.8, 'accent')] },
  downlight: { w: 14, h: 14, shapes: [circle(0, 0, 7, 'body'), path('M-4.2 -4.2L4.2 4.2M4.2 -4.2L-4.2 4.2', 'accentLine')] },
  pendant: { w: 22, h: 22, shapes: [circle(0, 0, 7, 'body'), circle(0, 0, 2, 'accent'), path('M0 -7V-11M0 7V11M-7 0H-11M7 0H11', 'accentLine')] },
  'wall-light': { w: 18, h: 10, shapes: [path('M-8 -5A8 8 0 0 0 8 -5Z', 'body'), path('M0 -5V1', 'accentLine')] },
  'under-cab': { w: 40, h: 6, shapes: [rect(-20, -3, 40, 6, 'body', 1), path('M-14 0H14', 'accentLine')] },
  'led-batten': { w: 60, h: 8, shapes: [rect(-30, -4, 60, 8, 'body', 1.5), path('M-24 0H24', 'accentLine'), circle(-27, 0, 1.2, 'accent'), circle(27, 0, 1.2, 'accent')] },
  'outside-light': { w: 20, h: 20, shapes: [circle(0, 0, 6, 'body'), path('M0 -7V-10M0 7V10M-7 0H-10M7 0H10M-5 -5L-7.5 -7.5M5 -5L7.5 -7.5M-5 5L-7.5 7.5M5 5L7.5 7.5', 'accentLine'), circle(0, 0, 2, 'accent')] },
  'cooker-switch': { w: 20, h: 14, shapes: [rect(-10, -7, 20, 14, 'body', 2), circle(-4, -2, 2.2, 'accentLine'), circle(4, -2, 2.2, 'accentLine'), circle(-4, 3, 2.2, 'accentLine'), circle(4, 3, 2.2, 'accentLine')] },
  extractor: { w: 18, h: 18, shapes: [circle(0, 0, 9, 'body'), path('M0 0L6 -3M0 0L-6 3M0 0L3 6M0 0L-3 -6', 'accentLine'), circle(0, 0, 1.4, 'accent')] },
  'towel-rail': { w: 20, h: 12, shapes: [rect(-10, -6, 20, 12, 'body', 2), path('M-6 -3H6M-6 0H6M-6 3H6', 'accentLine')] },
  shaver: { w: 16, h: 14, shapes: [rect(-8, -7, 16, 14, 'body', 2), circle(0, 0, 3.6, 'inner'), circle(-2, 0, 1, 'accent'), circle(2, 0, 1, 'accent')] },
  ufh: { w: 30, h: 20, shapes: [rect(-15, -10, 30, 20, 'body', 1), path('M-11 -6H11V-2H-11V2H11V6H-11', 'accentLine')] },
  'ev-charger': { w: 14, h: 22, shapes: [rect(-7, -11, 14, 22, 'body', 3), path('M2 -7L-3 1H1L-2 8', 'accentLine')] },
  smoke: { w: 18, h: 18, shapes: [circle(0, 0, 9, 'body'), circle(0, 0, 5.5, 'inner'), path('M3 -3C0 -5 -3 -4 -3 -1C-3 1 3 0 3 3C3 5 0 5 -3 3', 'accentLine')] },
  heat: { w: 18, h: 18, shapes: [circle(0, 0, 9, 'body'), circle(0, 0, 5.5, 'inner'), path('M-2.5 -3.5V3.5M2.5 -3.5V3.5M-2.5 0H2.5', 'accentLine')] },
  'co-alarm': { w: 18, h: 18, shapes: [circle(0, 0, 9, 'body'), circle(0, 0, 5.5, 'inner'), path('M3 -2.5A3.6 3.6 0 1 0 3 2.5', 'accentLine')] },
  'tv-point': { w: 20, h: 14, shapes: [rect(-10, -7, 20, 14, 'body', 2), path('M-5 -3L0 2L5 -3M0 2V5', 'accentLine')] },
  'data-point': { w: 20, h: 14, shapes: [rect(-10, -7, 20, 14, 'body', 2), rect(-5, -3, 10, 7, 'inner', 1), path('M-3 4V1M0 4V1M3 4V1', 'accentLine')] },
}

/** The symbol for a kind of electrical point, or null when there is none (the screen then draws its old dot). */
export function electricSymbol(typeId: string): PlumbSymbol | null {
  const s = SYMBOLS[typeId]
  return s ? { w: s.w, h: s.h, shapes: s.shapes.map(sh => ({ ...sh })) } : null
}
