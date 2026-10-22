// Name tags for the drawings on a Take-off plan: a small solid pill with the drawing's name and measurement, kept the same size on SCREEN at any zoom (so every size here is divided by the zoom to give
// plan pixels), set above the thing it names with a leader line, pushed down past any tag already there, and movable (the user's own offset, saved on the drawing, is applied after). Pure rules, tested.

export interface Pt { x: number; y: number }

/** The point half way along a line of several points. */
export function polylineMidpoint(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return pts[0]
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let left = total / 2
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (seg >= left && seg > 0) { const t = left / seg; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t } }
    left -= seg
  }
  return pts[pts.length - 1]
}

/** White or near-black text, whichever reads better on this #rgb / #rrggbb colour. */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return '#ffffff'
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#111111' : '#ffffff'
}

/** The tag's text: the name, cut short if long, then the measurement. */
export function tagText(name: string, measure: string, maxName = 26): string {
  const n = (name ?? '').trim()
  const short = n.length > maxName ? n.slice(0, maxName - 1).trimEnd() + '…' : n
  return [short, measure].filter(Boolean).join(' · ')
}

export const TAG_HEIGHT_PX = 20
const CHAR_PX = 7.4
const PAD_PX = 14
const GAP_PX = 3
const LIFT_PX = 16

export const tagWidthPx = (text: string): number => Math.round(text.length * CHAR_PX + PAD_PX)

export interface TagInput { id: string; text: string; ax: number; ay: number; dx?: number; dy?: number }
export interface TagBox { id: string; text: string; ax: number; ay: number; x: number; y: number; w: number; h: number; moved: boolean }

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Places every tag: above its anchor, moved down past tags already placed (a tag the user has moved is exactly where they put it). All sizes are screen pixels / zoom. */
export function layoutTags(inputs: TagInput[], zoom: number): TagBox[] {
  const z = zoom > 0 ? zoom : 1
  const h = TAG_HEIGHT_PX / z
  const placed: TagBox[] = []
  // the tags somebody moved are fixed points; place them first so the others make room round them
  const order = [...inputs.filter(i => i.dx != null || i.dy != null), ...inputs.filter(i => i.dx == null && i.dy == null)]
  for (const t of order) {
    const w = tagWidthPx(t.text) / z
    const moved = t.dx != null || t.dy != null
    let box = { x: t.ax - w / 2 + (t.dx ?? 0), y: t.ay - h - LIFT_PX / z + (t.dy ?? 0), w, h }
    if (!moved) {
      for (let tries = 0; tries < 14 && placed.some(p => overlaps(box, p)); tries++) box = { ...box, y: box.y + h + GAP_PX / z }
    }
    placed.push({ id: t.id, text: t.text, ax: t.ax, ay: t.ay, ...box, moved })
  }
  return inputs.map(i => placed.find(p => p.id === i.id)!)
}
