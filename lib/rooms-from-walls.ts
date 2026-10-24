// Rooms made from the walls drawn in Take-off & Draw. The walls (each one a band at its real thickness, joined where they meet) and the gaps of the doors and windows in them are filled in on a fine grid (10mm cells); the
// empty space that does not reach the edge of the drawing is a room. Pure (plan pixels in, plan pixels out), so it can be tested; the screen only paints the rooms and the panel lists them.
// A door or a window in a wall does NOT make a room run on into the next: the opening is filled in like the wall round it.

export interface Pt { x: number; y: number }

export interface DetectedRoom {
  /** the outline of the room's floor (the faces of the walls round it), plan pixels */
  polygon: Pt[]
  /** the floor area: the space between the walls, less anything standing in it (a chimney breast, a column) */
  areaM2: number
  /** the length of wall round the room (the outline) */
  perimeterM: number
  /** the middle of the roomiest part of it, where its name goes */
  labelAt: Pt
  /** the length and width of the box round it, metres (the long side first) */
  lengthM: number
  widthM: number
}

export interface DetectResult {
  rooms: DetectedRoom[]
  /** the cell size used, mm (larger than asked only when the drawing is huge) */
  cellMm: number
  /** how many walls and openings were filled in */
  solids: number
}

const ringArea = (p: Pt[]) => {
  let a = 0
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y }
  return a / 2
}
const ringLength = (p: Pt[]) => p.reduce((s, q, i) => s + Math.hypot(p[(i + 1) % p.length].x - q.x, p[(i + 1) % p.length].y - q.y), 0)

/** Is a point inside an outline (the even-odd rule) */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Which room (its index) a point is in, or -1 */
export function roomIndexAt(rooms: { polygon: Pt[] }[], p: Pt): number {
  return rooms.findIndex(r => pointInPolygon(p, r.polygon))
}

/** Douglas-Peucker on a closed outline: the staircase a grid leaves on a slanted wall becomes one straight edge, and a rectangle stays four corners. */
function simplifyClosed(pts: Pt[], tol: number): Pt[] {
  // take out points on a straight run first (exact)
  const keep: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) keep.push(b)
  }
  const p = keep.length >= 3 ? keep : pts
  if (p.length <= 4) return p
  // split the loop at its first point and the point farthest from it
  let far = 0, fd = -1
  p.forEach((q, i) => { const d = Math.hypot(q.x - p[0].x, q.y - p[0].y); if (d > fd) { fd = d; far = i } })
  const dp = (a: number, b: number, out: boolean[]) => {   // indices a..b (b may wrap) of the loop
    let idx = -1, md = tol
    const A = p[a % p.length], B = p[b % p.length]
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1
    for (let i = a + 1; i < b; i++) {
      const Q = p[i % p.length]
      const d = Math.abs((B.x - A.x) * (A.y - Q.y) - (A.x - Q.x) * (B.y - A.y)) / L
      if (d > md) { md = d; idx = i }
    }
    if (idx >= 0) { out[idx % p.length] = true; dp(a, idx, out); dp(idx, b, out) }
  }
  const flag: boolean[] = new Array(p.length).fill(false)
  flag[0] = true; flag[far] = true
  dp(0, far, flag)
  dp(far, p.length, flag)
  const out = p.filter((_, i) => flag[i])
  return out.length >= 3 ? out : p
}

/**
 * The rooms the walls make. `solids` is every filled shape: each is a list of rings filled with the even-odd rule (an open wall is one ring; a closed outline such as a house ring is two, the outer and the inner face), and the
 * gaps of doors and windows go in as solids too. `mpp` is the plan's metres per pixel.
 */
export function detectRooms(solids: Pt[][][], o: { mpp: number; cellMm?: number; minAreaM2?: number }): DetectResult {
  const mpp = o.mpp
  const empty: DetectResult = { rooms: [], cellMm: o.cellMm ?? 10, solids: solids.length }
  if (!(mpp > 0) || solids.length === 0) return empty
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of solids) for (const r of s) for (const p of r) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
  if (!Number.isFinite(minX)) return empty
  let cellMm = o.cellMm ?? 10
  // a huge drawing gets bigger cells rather than a huge grid
  for (;;) {
    const c = cellMm / (mpp * 1000)
    if (((maxX - minX) / c + 6) * ((maxY - minY) / c + 6) <= 6_000_000) break
    cellMm *= 1.5
  }
  const c = cellMm / (mpp * 1000)       // a cell in plan pixels
  const ox = minX - 2 * c, oy = minY - 2 * c
  const W = Math.ceil((maxX - minX) / c) + 5, H = Math.ceil((maxY - minY) / c) + 5
  const grid = new Uint8Array(W * H)

  // fill in the walls: for each row of cell centres, between the crossings of the rings (even-odd)
  for (const solid of solids) {
    let sy0 = Infinity, sy1 = -Infinity
    for (const r of solid) for (const p of r) { if (p.y < sy0) sy0 = p.y; if (p.y > sy1) sy1 = p.y }
    const r0 = Math.max(0, Math.floor((sy0 - oy) / c - 0.5)), r1 = Math.min(H - 1, Math.ceil((sy1 - oy) / c - 0.5))
    for (let row = r0; row <= r1; row++) {
      const yc = oy + (row + 0.5) * c
      const xs: number[] = []
      for (const ring of solid) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length]
          if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y))
        }
      }
      xs.sort((p, q) => p - q)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((xs[i] - ox) / c - 0.5)), c1 = Math.min(W - 1, Math.ceil((xs[i + 1] - ox) / c - 0.5) - 1)
        for (let col = c0; col <= c1; col++) grid[row * W + col] = 1
      }
    }
  }

  // label the empty space: the outside (reaches the edge) and then each enclosed piece
  const label = new Int32Array(W * H)   // 0 = not visited (or a wall), 1 = outside, 2.. = a room
  const stack: number[] = []
  const flood = (start: number, id: number): number => {
    let n = 0
    stack.length = 0; stack.push(start); label[start] = id
    while (stack.length) {
      const i = stack.pop()!
      n++
      const x = i % W, y = (i - x) / W
      if (x > 0 && !grid[i - 1] && !label[i - 1]) { label[i - 1] = id; stack.push(i - 1) }
      if (x < W - 1 && !grid[i + 1] && !label[i + 1]) { label[i + 1] = id; stack.push(i + 1) }
      if (y > 0 && !grid[i - W] && !label[i - W]) { label[i - W] = id; stack.push(i - W) }
      if (y < H - 1 && !grid[i + W] && !label[i + W]) { label[i + W] = id; stack.push(i + W) }
    }
    return n
  }
  flood(0, 1)   // the corner is padding, so always empty and outside
  const pieces: { id: number; cells: number; first: number }[] = []
  for (let i = 0; i < W * H; i++) {
    if (!grid[i] && !label[i]) { const id = pieces.length + 2; const n = flood(i, id); pieces.push({ id, cells: n, first: i }) }
  }

  const minArea = o.minAreaM2 ?? 0.5
  const cellM2 = (c * mpp) * (c * mpp)
  const rooms: DetectedRoom[] = []
  for (const piece of pieces) {
    const areaM2 = piece.cells * cellM2
    if (areaM2 < minArea) continue
    // the outline: the edges of the cells of this piece that face something else, walked round (the piece on the right as the edges run clockwise on screen)
    const next = new Map<number, number[]>()      // vertex -> the vertices its outgoing edges go to
    const V = W + 1
    const add = (a: number, b: number) => { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]) }
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (label[i] !== piece.id) continue
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y
        const tl = y * V + x, tr = tl + 1, bl = (y + 1) * V + x, br = bl + 1
        if (y === 0 || label[i - W] !== piece.id) add(tl, tr)
        if (x === W - 1 || label[i + 1] !== piece.id) add(tr, br)
        if (y === H - 1 || label[i + W] !== piece.id) add(br, bl)
        if (x === 0 || label[i - 1] !== piece.id) add(bl, tl)
      }
    }
    let best: Pt[] = [], bestA = 0
    while (next.size) {
      const startKey = next.keys().next().value as number
      const loop: Pt[] = []
      let cur = startKey
      for (let guard = 0; guard < 4_000_000; guard++) {
        const outs = next.get(cur)
        if (!outs || outs.length === 0) break
        const to = outs.pop()!
        if (outs.length === 0) next.delete(cur)
        loop.push({ x: cur % V, y: Math.floor(cur / V) })
        cur = to
        if (cur === startKey) break
      }
      next.delete(startKey)
      const a = ringArea(loop)
      if (a > bestA) { bestA = a; best = loop }
    }
    if (best.length < 3) continue
    const outline = simplifyClosed(best, 2).map(p => ({ x: ox + p.x * c, y: oy + p.y * c }))

    // where the name goes: the cell farthest from any wall (a distance map over the piece)
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1
    const d = new Int32Array(bw * bh)
    const inPiece = (x: number, y: number) => label[(by0 + y) * W + bx0 + x] === piece.id
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!inPiece(x, y)) continue
      d[y * bw + x] = 1 + Math.min(x > 0 ? d[y * bw + x - 1] : 0, y > 0 ? d[(y - 1) * bw + x] : 0)
    }
    let bestD = 0, bestI = 0, bestFar = Infinity
    const midX = (bw - 1) / 2, midY = (bh - 1) / 2
    for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) {
      if (!inPiece(x, y)) continue
      const v = Math.min(d[y * bw + x], 1 + Math.min(x < bw - 1 ? d[y * bw + x + 1] : 0, y < bh - 1 ? d[(y + 1) * bw + x] : 0))
      d[y * bw + x] = v
      // the roomiest cell; of those as roomy, the one nearest the middle of the room
      const far = Math.hypot(x - midX, y - midY)
      if (v > bestD || (v === bestD && far < bestFar)) { bestD = v; bestI = y * bw + x; bestFar = far }
    }
    const lx = bestI % bw, ly = Math.floor(bestI / bw)
    const labelAt = { x: ox + (bx0 + lx + 0.5) * c, y: oy + (by0 + ly + 0.5) * c }
    const w = (bx1 - bx0 + 1) * c * mpp, h = (by1 - by0 + 1) * c * mpp
    rooms.push({ polygon: outline, areaM2, perimeterM: ringLength(outline) * mpp, labelAt, lengthM: Math.max(w, h), widthM: Math.min(w, h) })
  }
  rooms.sort((a, b) => (Math.abs(a.labelAt.y - b.labelAt.y) > 1 / mpp ? a.labelAt.y - b.labelAt.y : a.labelAt.x - b.labelAt.x))
  return { rooms, cellMm, solids: solids.length }
}

// ── Naming and describing the rooms ──────────────────────────────────────────────────────────────────────────────────

export interface RoomKind { id: string; label: string; /** a room that gets wet: tiled and tanked */ wet: boolean }
export const ROOM_KINDS: RoomKind[] = [
  { id: 'kitchen', label: 'Kitchen', wet: false }, { id: 'living', label: 'Living room', wet: false }, { id: 'dining', label: 'Dining room', wet: false },
  { id: 'bedroom', label: 'Bedroom', wet: false }, { id: 'bathroom', label: 'Bathroom', wet: true }, { id: 'ensuite', label: 'En-suite', wet: true },
  { id: 'wc', label: 'WC / cloakroom', wet: true }, { id: 'utility', label: 'Utility room', wet: true }, { id: 'hall', label: 'Hall / landing', wet: false },
  { id: 'study', label: 'Study / office', wet: false }, { id: 'garage', label: 'Garage', wet: false }, { id: 'other', label: 'Other', wet: false },
]
export const ROOM_KIND_BY_ID: Record<string, RoomKind> = Object.fromEntries(ROOM_KINDS.map(k => [k.id, k]))

/** A name (and kind) given to the room that contains this point; it follows the room if the walls are changed. */
export interface RoomLabel { id: string; x: number; y: number; name: string; kind?: string; /** the ceiling height, m (2.4 when not given) */ heightM?: number }
export const DEFAULT_ROOM_HEIGHT_M = 2.4

/** The label that belongs to each room (the first whose point is inside it), by room index; -1 where a room has none. */
export function labelIndexForRooms(rooms: { polygon: Pt[] }[], labels: RoomLabel[]): number[] {
  return rooms.map(r => labels.findIndex(l => pointInPolygon(l, r.polygon)))
}

/** A room as the by-room calculators are given it */
export interface PlanRoomInfo {
  /** stable while the room keeps its name: the label's id */
  id: string
  name: string
  kind?: string
  areaM2: number
  perimeterM: number
  lengthM: number
  widthM: number
  heightM: number
  doors: number
  windows: number
  /** the total width of the doors, m, and their area, m² */
  doorWidthM: number
  doorAreaM2: number
  /** the total area of the windows, m² */
  windowAreaM2: number
}

export interface RoomWithOpenings { doors: number; windows: number; doorWidthM: number; doorAreaM2: number; windowAreaM2: number }

/** Every room with its name (or "Room 3"), kind, height and the doors and windows that open into it. Rooms with no label get an id from where they are, so they can still be fed to a calculator. */
export function describeRooms(rooms: DetectedRoom[], labels: RoomLabel[], openings: RoomWithOpenings[]): PlanRoomInfo[] {
  const li = labelIndexForRooms(rooms, labels)
  return rooms.map((r, i) => {
    const l = li[i] >= 0 ? labels[li[i]] : undefined
    const o = openings[i] ?? { doors: 0, windows: 0, doorWidthM: 0, doorAreaM2: 0, windowAreaM2: 0 }
    return {
      id: l?.id ?? `auto-${Math.round(r.labelAt.x / 10)}-${Math.round(r.labelAt.y / 10)}`,
      name: l?.name?.trim() || `Room ${i + 1}`,
      kind: l?.kind,
      areaM2: +r.areaM2.toFixed(2), perimeterM: +r.perimeterM.toFixed(2), lengthM: +r.lengthM.toFixed(2), widthM: +r.widthM.toFixed(2),
      heightM: l?.heightM && l.heightM > 0 ? l.heightM : DEFAULT_ROOM_HEIGHT_M,
      doors: o.doors, windows: o.windows, doorWidthM: +o.doorWidthM.toFixed(2), doorAreaM2: +o.doorAreaM2.toFixed(2), windowAreaM2: +o.windowAreaM2.toFixed(2),
    }
  })
}
