// Heating pipework drawn on a Take-off plan: runs of pipe drawn from a boiler (or the first point) out to the radiators. From the drawing this works out the pipe's real length in each size, the pipe size of every
// stretch from the heat it has to carry (a pipe carries the heat of every radiator beyond it), and the fittings: an ELBOW where a run bends, a TEE where a run branches off another or a radiator is teed off it, a reducing
// tee where the sizes differ. Pure (no imports), so it can be tested with plain Node.
//
// THESE ARE ESTIMATES TO PRICE FROM, NOT A HEATING DESIGN: the sizes come from the simple rule of thumb of how much heat each size of pipe carries at normal flow speeds (about 11 degrees between flow and return);
// a heating engineer's design replaces them.

export interface Pt { x: number; y: number }

export interface NetRun { id: string; points: Pt[] }
export interface NetRadiator { id: string; x: number; y: number; watts: number }
export interface NetInput {
  runs: NetRun[]
  radiators: NetRadiator[]
  /** the boiler or manifold the pipes start from, if one is marked; otherwise the first point of the first run in each connected group */
  source?: Pt | null
  /** metres per plan pixel */
  mpp: number
}

/** The heat each size of pipe carries (watts), at normal flow speeds: sample figures. */
export const PIPE_SIZES: { mm: number; maxW: number }[] = [
  { mm: 15, maxW: 6000 },
  { mm: 22, maxW: 13000 },
  { mm: 28, maxW: 27000 },
  { mm: 35, maxW: 48000 },
]

/** The smallest size that carries the load; `over` when even the biggest does not. */
export function pipeSizeForLoad(watts: number): { mm: number; over: boolean } {
  for (const s of PIPE_SIZES) if (watts <= s.maxW) return { mm: s.mm, over: false }
  return { mm: PIPE_SIZES[PIPE_SIZES.length - 1].mm, over: true }
}

export type FittingKind = 'elbow' | 'bend45' | 'tee' | 'reducing-tee'
export const FITTING_LABEL: Record<FittingKind, string> = { elbow: 'Elbow (90°)', bend45: 'Bend (45°)', tee: 'Equal tee', 'reducing-tee': 'Reducing tee' }

export interface NetFitting { kind: FittingKind; sizeMm: number; /** the smallest size on a reducing tee */ branchMm?: number; x: number; y: number }
export interface NetEdge { a: Pt; b: Pt; lengthM: number; loadW: number; sizeMm: number; runId: string }

export interface NetResult {
  edges: NetEdge[]
  fittings: NetFitting[]
  /** metres of drawn pipe (one pipe: flow and return are double) by size, keyed by mm */
  lengthBySize: Record<string, number>
  totalLengthM: number
  connectedRadiatorIds: string[]
  unconnectedRadiatorIds: string[]
  totalLoadW: number
  warnings: string[]
}

/** How close (metres) two pipe ends have to be to count as joined, and how close a radiator has to be to a pipe to be on it. */
const JOIN_M = 0.12
const RAD_M = 0.45

interface Node { x: number; y: number; rads: string[]; source: boolean }
interface Edge { u: number; v: number; runId: string }

export function buildPipeNetwork(input: NetInput): NetResult {
  const warnings: string[] = []
  const mpp = input.mpp > 0 ? input.mpp : 0.01
  const joinPx = JOIN_M / mpp, radPx = RAD_M / mpp
  const nodes: Node[] = []
  const parent: number[] = []
  const rep = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (a: number, b: number) => { const ra = rep(a), rb = rep(b); if (ra !== rb) parent[rb] = ra }
  const addNode = (p: Pt): number => { nodes.push({ x: p.x, y: p.y, rads: [], source: false }); parent.push(nodes.length - 1); return nodes.length - 1 }
  const findNode = (p: Pt, tol: number): number => {
    let best = -1, bd = tol
    for (let i = 0; i < nodes.length; i++) { const d = Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y); if (d <= bd) { bd = d; best = i } }
    return best
  }

  // 1. every vertex of every run is a node (vertices within JOIN of one another are one node)
  interface Seg { runId: string; ai: number; bi: number; a: Pt; b: Pt; splits: { t: number; node: number }[] }
  const segs: Seg[] = []
  const endNodes: number[] = []
  const runs = input.runs.filter(r => r.points.length >= 2)
  for (const run of runs) {
    let prev = -1
    run.points.forEach((p, k) => {
      let n = findNode(p, joinPx)
      if (n < 0) n = addNode(p)
      if (prev >= 0 && rep(prev) !== rep(n)) segs.push({ runId: run.id, ai: prev, bi: n, a: { x: nodes[prev].x, y: nodes[prev].y }, b: { x: nodes[n].x, y: nodes[n].y }, splits: [] })
      if (k === 0 || k === run.points.length - 1) endNodes.push(n)
      prev = n
    })
  }

  // 2. a point that lies on the side of a pipe (not at its ends) splits that pipe there
  const project = (p: Pt, s: Seg) => {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy
    if (l2 === 0) return null
    const t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2
    const q = { x: s.a.x + t * dx, y: s.a.y + t * dy }
    return { t, q, d: Math.hypot(p.x - q.x, p.y - q.y), len: Math.sqrt(l2) }
  }
  /** the node a point is on: an existing node, or a new one on the side of the nearest pipe; -1 if nothing is near */
  const attach = (p: Pt, tol: number, ownNode = -1): number => {
    // (a pipe end looking for a pipe to join already merged with every other node near it when the nodes were made)
    const near = ownNode >= 0 ? -1 : findNode(p, tol)
    let bestSeg: { s: Seg; pr: NonNullable<ReturnType<typeof project>> } | null = null
    for (const s of segs) {
      if (ownNode >= 0 && (rep(s.ai) === rep(ownNode) || rep(s.bi) === rep(ownNode))) continue
      const pr = project(p, s)
      if (!pr || pr.d > tol || pr.t * pr.len <= joinPx || (1 - pr.t) * pr.len <= joinPx) continue
      if (!bestSeg || pr.d < bestSeg.pr.d) bestSeg = { s, pr }
    }
    if (near >= 0 && (!bestSeg || Math.hypot(nodes[near].x - p.x, nodes[near].y - p.y) <= bestSeg.pr.d)) return near
    if (!bestSeg) return near
    const { s, pr } = bestSeg
    const existing = s.splits.find(x => Math.abs(x.t - pr.t) * pr.len <= joinPx)
    if (existing) return existing.node
    const n = addNode(pr.q)
    s.splits.push({ t: pr.t, node: n })
    return n
  }

  // a pipe that ends on the side of another pipe is joined to it (a branch)
  for (const e of endNodes) {
    const n = rep(e)
    const at = attach({ x: nodes[n].x, y: nodes[n].y }, joinPx, n)
    if (at >= 0 && rep(at) !== n) union(at, n)
  }
  // the boiler / manifold
  let sourceNode = -1
  if (input.source) {
    const at = attach(input.source, radPx)
    if (at >= 0) { sourceNode = at; nodes[at].source = true } else warnings.push('The boiler is not on a pipe run: draw a run to it. Pipes are sized from the first point of each run instead.')
  }
  // the radiators
  const connected: string[] = [], unconnected: string[] = []
  for (const r of input.radiators) {
    const at = attach({ x: r.x, y: r.y }, radPx)
    if (at >= 0) { nodes[at].rads.push(r.id); connected.push(r.id) } else unconnected.push(r.id)
  }
  if (unconnected.length) warnings.push(`${unconnected.length} radiator${unconnected.length === 1 ? ' is' : 's are'} not on a pipe run: draw a pipe to ${unconnected.length === 1 ? 'it' : 'them'}.`)

  // 3. the edges: each run side cut at the points that split it
  const edges: Edge[] = []
  for (const s of segs) {
    const chain = [s.ai, ...s.splits.sort((p, q) => p.t - q.t).map(x => x.node), s.bi]
    for (let i = 1; i < chain.length; i++) {
      const u = rep(chain[i - 1]), v = rep(chain[i])
      if (u !== v) edges.push({ u, v, runId: s.runId })
    }
  }
  // rads and source flags live on the representative
  const radsAt = new Map<number, string[]>()
  const srcAt = new Set<number>()
  nodes.forEach((n, i) => { const r = rep(i); if (n.rads.length) radsAt.set(r, [...(radsAt.get(r) ?? []), ...n.rads]); if (n.source) srcAt.add(r) })
  const wattsOf = new Map(input.radiators.map(r => [r.id, r.watts]))
  const adj = new Map<number, number[]>()
  edges.forEach((e, i) => { adj.set(e.u, [...(adj.get(e.u) ?? []), i]); adj.set(e.v, [...(adj.get(e.v) ?? []), i]) })
  const posOf = (i: number): Pt => ({ x: nodes[i].x, y: nodes[i].y })

  // 4. loads: from the boiler (or the first point of the first run of the group) outwards; a pipe carries all the radiators beyond it
  const load = new Map<number, number>()
  const treeParent = new Map<number, { edge: number; from: number }>()
  const seen = new Set<number>()
  let usedFallbackRoot = false
  const order: number[] = []
  const rootCandidates: number[] = []
  if (sourceNode >= 0) rootCandidates.push(rep(sourceNode))
  for (const run of runs) { const p = run.points[0]; const n = findNode(p, joinPx * 2); if (n >= 0) rootCandidates.push(rep(n)) }
  for (const root of rootCandidates) {
    if (seen.has(root) || !adj.has(root)) continue
    if (root !== (sourceNode >= 0 ? rep(sourceNode) : -1)) usedFallbackRoot = true
    const queue = [root]; seen.add(root)
    while (queue.length) {
      const n = queue.shift()!
      order.push(n)
      for (const ei of adj.get(n) ?? []) {
        const e = edges[ei]; const o = e.u === n ? e.v : e.u
        if (!seen.has(o)) { seen.add(o); treeParent.set(o, { edge: ei, from: n }); queue.push(o) }
      }
    }
  }
  // anything not reached (cannot happen: every edge belongs to a run whose first point is a candidate) is sized from nothing
  for (const n of [...order].reverse()) {
    let l = (load.get(n) ?? 0) + (radsAt.get(n) ?? []).reduce((s, id) => s + (wattsOf.get(id) ?? 0), 0)
    load.set(n, l)
    const tp = treeParent.get(n)
    if (tp) load.set(tp.from, (load.get(tp.from) ?? 0) + l)
  }
  if (usedFallbackRoot && runs.length > 0) warnings.push('No boiler is marked on the plan, so each group of pipes is sized from the first point you drew. Place a boiler / heat source on the end of the main run.')

  const treeEdges = new Set<number>()
  treeParent.forEach(v => treeEdges.add(v.edge))
  let cycleWarned = false
  const outEdges: NetEdge[] = []
  const sizeOfEdge: number[] = []
  const lengthBySize: Record<string, number> = {}
  let total = 0
  edges.forEach((e, i) => {
    const tp = [...treeParent.entries()].find(([, v]) => v.edge === i)
    let w: number
    if (tp) w = load.get(tp[0]) ?? 0
    else {
      w = Math.max(load.get(e.u) ?? 0, load.get(e.v) ?? 0)
      if (!cycleWarned) { warnings.push('Some pipes make a loop. Each pipe is still counted, sized for the heat beyond it.'); cycleWarned = true }
    }
    const sz = pipeSizeForLoad(w)
    if (sz.over) warnings.push(`A pipe carries ${(w / 1000).toFixed(0)} kW, more than ${PIPE_SIZES[PIPE_SIZES.length - 1].mm}mm pipe does: it needs a heating engineer's design.`)
    const a = posOf(e.u), b = posOf(e.v)
    const lengthM = Math.hypot(a.x - b.x, a.y - b.y) * mpp
    total += lengthM
    lengthBySize[sz.mm] = +((lengthBySize[sz.mm] ?? 0) + lengthM).toFixed(4)
    sizeOfEdge[i] = sz.mm
    outEdges.push({ a, b, lengthM: +lengthM.toFixed(4), loadW: Math.round(w), sizeMm: sz.mm, runId: e.runId })
  })

  // 5. fittings at each joint
  const fittings: NetFitting[] = []
  let deadEnds = 0
  for (const [n, list] of adj) {
    const deg = list.length
    const rads = (radsAt.get(n) ?? []).length
    const src = srcAt.has(n) ? 1 : 0
    const arms = deg + rads + src
    const at = posOf(n)
    const sizes = list.map(i => sizeOfEdge[i])
    if (arms <= 2) {
      if (deg === 2 && rads + src === 0) {
        const dirs = list.map(i => { const e = edges[i]; const o = posOf(e.u === n ? e.v : e.u); return { x: o.x - at.x, y: o.y - at.y } })
        const la = Math.hypot(dirs[0].x, dirs[0].y), lb = Math.hypot(dirs[1].x, dirs[1].y)
        if (la > 0 && lb > 0) {
          const cos = (dirs[0].x * dirs[1].x + dirs[0].y * dirs[1].y) / (la * lb)
          const between = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI   // 180 = straight on
          const turn = 180 - between
          if (turn >= 67.5) fittings.push({ kind: 'elbow', sizeMm: Math.max(...sizes), ...at })
          else if (turn >= 15) fittings.push({ kind: 'bend45', sizeMm: Math.max(...sizes), ...at })
        }
      } else if (deg === 1 && rads + src === 0) deadEnds++
      continue
    }
    const all = [...sizes, ...Array(rads).fill(15), ...(src ? [Math.max(...sizes)] : [])]
    const big = Math.max(...all), small = Math.min(...all)
    const tees = arms - 2
    for (let k = 0; k < tees; k++) fittings.push(big === small ? { kind: 'tee', sizeMm: big, ...at } : { kind: 'reducing-tee', sizeMm: big, branchMm: small, ...at })
    if (arms > 4) warnings.push('More than three pipes meet at one point: check the drawing.')
  }
  if (deadEnds > 0) warnings.push(`${deadEnds} pipe${deadEnds === 1 ? ' ends' : 's end'} where there is no radiator or boiler: check the drawing (the pipe is still counted).`)

  const totalLoadW = connected.reduce((s, id) => s + (wattsOf.get(id) ?? 0), 0)
  return {
    edges: outEdges, fittings, lengthBySize, totalLengthM: +total.toFixed(3),
    connectedRadiatorIds: connected, unconnectedRadiatorIds: unconnected, totalLoadW: Math.round(totalLoadW), warnings,
  }
}

// ── What the calculator is handed: all the networks together ────────────────────────────────────

export interface PipeFittingCount { kind: FittingKind; sizeMm: number; branchMm?: number; count: number }
export interface PipeSummary {
  /** metres of drawn pipe by size (one pipe: the calculator doubles it for flow and return) */
  lengthBySize: Record<string, number>
  totalLengthM: number
  fittings: PipeFittingCount[]
  connectedRadiatorIds: string[]
  unconnectedRadiatorIds: string[]
  totalLoadW: number
  runCount: number
  warnings: string[]
}

export function summariseNetworks(results: NetResult[], runCount: number): PipeSummary {
  const lengthBySize: Record<string, number> = {}
  const fit = new Map<string, PipeFittingCount>()
  const warnings: string[] = []
  let total = 0, load = 0
  const connectedRadiatorIds: string[] = [], unconnectedRadiatorIds: string[] = []
  for (const r of results) {
    for (const [k, v] of Object.entries(r.lengthBySize)) lengthBySize[k] = +((lengthBySize[k] ?? 0) + v).toFixed(3)
    total += r.totalLengthM; load += r.totalLoadW
    connectedRadiatorIds.push(...r.connectedRadiatorIds); unconnectedRadiatorIds.push(...r.unconnectedRadiatorIds)
    for (const f of r.fittings) {
      const key = `${f.kind}|${f.sizeMm}|${f.branchMm ?? 0}`
      const cur = fit.get(key)
      if (cur) cur.count++; else fit.set(key, { kind: f.kind, sizeMm: f.sizeMm, ...(f.branchMm ? { branchMm: f.branchMm } : {}), count: 1 })
    }
    for (const w of r.warnings) if (!warnings.includes(w)) warnings.push(w)
  }
  const fittings = Array.from(fit.values()).sort((a, b) => a.kind.localeCompare(b.kind) || a.sizeMm - b.sizeMm || (a.branchMm ?? 0) - (b.branchMm ?? 0))
  return { lengthBySize, totalLengthM: +total.toFixed(3), fittings, connectedRadiatorIds, unconnectedRadiatorIds, totalLoadW: load, runCount, warnings }
}
