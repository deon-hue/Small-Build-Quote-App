// A soakaway, and the rainwater fittings that feed it (Drainage & Services → Soakaway & Rainwater). The soakaway is sized from the area of roof and paving that drains to it: the effective area (all of
// the roof, 80% of the paving) times how much rain it has to hold (a depth in mm, 20 to begin with), divided by the void ratio of what it is built from (crates about 95%, a stone-filled pit about 35%,
// concrete rings the whole inside of the ring). That gives the storage, the size of hole (with working room round it), the crates, stone or rings, the geotextile wrap, the silt chamber at the inlet, the soil
// taken away and the digging. Channel drains, yard gullies, downpipe connections to the drain and water butts are counted separately. The pipes between the downpipes and the soakaway are priced as surface
// water runs in the Underground Drainage calculator, not here. Counts and prices only: the real size comes from an infiltration test (BRE Digest 365), the soil, the water table and the designer.
// Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node. All rates are samples to be checked against real prices.

export type SoakawayKind = 'crates' | 'stone' | 'rings'
export interface SoakawayKindInfo { label: string; short: string; /** the share of the installed volume that stores water */ voidRatio: number }
export const SOAKAWAY_KINDS: Record<SoakawayKind, SoakawayKindInfo> = {
  crates: { label: 'Soakaway crates (plastic cells wrapped in geotextile)', short: 'soakaway crates', voidRatio: 0.95 },
  stone: { label: 'Stone-filled pit (clean stone wrapped in geotextile)', short: 'a stone-filled soakaway pit', voidRatio: 0.35 },
  rings: { label: 'Perforated concrete rings (1.5m) with a cover slab', short: 'a concrete ring soakaway', voidRatio: 1 },
}

export const PAVING_RUNOFF = 0.8
export const WORKING_ROOM = 1.25            // the hole is this much bigger than what goes in it
export const CRATES_PER_M3 = 260            // crates and their connectors, per m³ installed
export const STONE_PER_M3 = 38              // 40–50mm clean stone
export const WRAP_PER_M2 = 2.5              // geotextile wrap
export const RING_STORAGE_M3 = 1.767        // one 1m high, 1.5m wide ring
export const RING_EACH = 180
export const COVER_SLAB_EACH = 240
export const RING_SURROUND_STONE_M3 = 1.5   // stone round each ring
export const RING_HOLE_M3 = 3.46            // the hole for one ring, with its stone surround
export const SILT_CHAMBER_EACH = 120        // a silt chamber or catchpit at the inlet, one for each soakaway
export const MUCKAWAY_PER_M3 = 28
export const SPOIL_BULKING = 1.3
export const DIG_M3_PER_DAY = 25

export type ChannelKind = 'light' | 'heavy'
export const CHANNELS: Record<ChannelKind, { label: string; perLm: number; haunchPerLm: number }> = {
  light: { label: 'Channel drain, light duty (paths and patios)', perLm: 35, haunchPerLm: 9 },
  heavy: { label: 'Channel drain, heavy duty (driveways)', perLm: 62, haunchPerLm: 14 },
}
export const CHANNEL_OUTLET_EACH = 20       // an end cap and outlet for each run of channel
export const GULLY_EACH = 75
export const DOWNPIPE_CONNECTION_EACH = 35
export const WATER_BUTT_EACH = 65           // with a diverter kit

export interface SoakawayInput {
  roofAreaM2: number
  pavedAreaM2: number
  /** how much rain the soakaway must hold, mm over the effective area */
  storageDepthMm: number
  /** a storage volume from the designer, m³, replacing the sum above (null = work it out) */
  storageOverrideM3: number | null
  kind: SoakawayKind
  /** how many soakaways the storage is shared between */
  count: number
  channelLightLm: number
  channelHeavyLm: number
  gullies: number
  downpipeConnections: number
  waterButts: number
}

export interface SoakawayLine { id: string; name: string; category: 'materials' | 'other'; unit: string; unitCost: number; qty: number; wastePct?: number }

export interface SoakawayResult {
  lines: SoakawayLine[]
  effectiveAreaM2: number
  storageM3: number
  /** per soakaway */
  storageEachM3: number
  installedM3: number
  holeM3: number
  /** days the machine digs the holes (the screen turns this into days on site) */
  excavatorDays: number
  spoilAwayM3: number
  rings: number
  wrapM2: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateSoakaway(i: SoakawayInput): SoakawayResult {
  for (const [k, v] of Object.entries({ roofAreaM2: i.roofAreaM2, pavedAreaM2: i.pavedAreaM2, storageDepthMm: i.storageDepthMm, channelLightLm: i.channelLightLm, channelHeavyLm: i.channelHeavyLm, gullies: i.gullies, downpipeConnections: i.downpipeConnections, waterButts: i.waterButts })) {
    if (!(v >= 0)) throw new Error(`The ${k === 'roofAreaM2' ? 'roof area' : k === 'pavedAreaM2' ? 'paved area' : k === 'storageDepthMm' ? 'storage depth' : 'quantity'} cannot be negative.`)
  }
  if (!(i.count >= 0)) throw new Error('The number of soakaways cannot be negative.')
  if (i.storageOverrideM3 !== null && !(i.storageOverrideM3 >= 0)) throw new Error('The storage volume cannot be negative.')
  const warnings: string[] = []
  const lines: SoakawayLine[] = []
  const effective = i.roofAreaM2 + PAVING_RUNOFF * i.pavedAreaM2
  const wanted = i.storageOverrideM3 ?? (effective * i.storageDepthMm) / 1000
  const count = Math.round(i.count)
  const info = SOAKAWAY_KINDS[i.kind]

  let installed = 0, hole = 0, rings = 0, wrapM2 = 0, spoilM3 = 0, excavatorDays = 0
  const storage = count > 0 ? wanted : 0
  if (count > 0 && storage > 0) {
    const each = storage / count
    if (i.kind === 'rings') {
      const ringsEach = Math.max(1, Math.ceil(each / RING_STORAGE_M3))
      rings = ringsEach * count
      installed = rings * RING_STORAGE_M3
      hole = rings * RING_HOLE_M3
      lines.push({ id: 'rings', name: 'Perforated concrete rings, 1.5m wide and 1m high', category: 'materials', unit: 'nr', unitCost: RING_EACH, qty: rings })
      lines.push({ id: 'cover-slab', name: 'Cover slab with access opening', category: 'materials', unit: 'nr', unitCost: COVER_SLAB_EACH, qty: count })
      lines.push({ id: 'stone', name: 'Clean stone surround to the rings', category: 'materials', unit: 'm³', unitCost: STONE_PER_M3, qty: round2(rings * RING_SURROUND_STONE_M3), wastePct: 5 })
    } else {
      installed = storage / info.voidRatio
      hole = installed * WORKING_ROOM
      const side = Math.cbrt(hole / count)
      wrapM2 = round1(count * 6 * side * side * 1.1)
      if (i.kind === 'crates') lines.push({ id: 'crates', name: 'Soakaway crates and connectors', category: 'materials', unit: 'm³', unitCost: CRATES_PER_M3, qty: round2(installed) })
      else lines.push({ id: 'stone', name: 'Clean 40–50mm stone, filling the pit', category: 'materials', unit: 'm³', unitCost: STONE_PER_M3, qty: round2(installed), wastePct: 5 })
      lines.push({ id: 'wrap', name: 'Geotextile wrap round the soakaway', category: 'materials', unit: 'm²', unitCost: WRAP_PER_M2, qty: wrapM2, wastePct: 5 })
    }
    lines.push({ id: 'silt', name: 'Silt chamber at the inlet, one for each soakaway', category: 'materials', unit: 'nr', unitCost: SILT_CHAMBER_EACH, qty: count })
    // the soil that cannot go back: what the soakaway itself takes up
    spoilM3 = installed * SPOIL_BULKING
    lines.push({ id: 'spoil', name: 'Surplus soil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: round2(spoilM3) })
    excavatorDays = Math.max(0.5, Math.round((hole / DIG_M3_PER_DAY) * 2) / 2)
    if (each > 15) warnings.push(`Each soakaway holds about ${round1(each)} m³: a store that big is better as two or more, spread out, and needs the designer.`)
  } else if (count === 0 && (i.roofAreaM2 > 0 || i.pavedAreaM2 > 0)) {
    warnings.push('There are no soakaways: the roof and paving are assumed to drain somewhere else (a sewer or a watercourse).')
  }

  const cl = i.channelLightLm, ch = i.channelHeavyLm
  if (cl > 0) {
    lines.push({ id: 'channel-light', name: CHANNELS.light.label, category: 'materials', unit: 'lm', unitCost: CHANNELS.light.perLm, qty: cl, wastePct: 3 })
    lines.push({ id: 'haunch-light', name: 'Concrete bed and haunching to the channel (light duty)', category: 'materials', unit: 'lm', unitCost: CHANNELS.light.haunchPerLm, qty: cl })
  }
  if (ch > 0) {
    lines.push({ id: 'channel-heavy', name: CHANNELS.heavy.label, category: 'materials', unit: 'lm', unitCost: CHANNELS.heavy.perLm, qty: ch, wastePct: 3 })
    lines.push({ id: 'haunch-heavy', name: 'Concrete bed and haunching to the channel (heavy duty)', category: 'materials', unit: 'lm', unitCost: CHANNELS.heavy.haunchPerLm, qty: ch })
  }
  if (cl > 0 || ch > 0) lines.push({ id: 'channel-outlet', name: 'Channel end caps and outlets', category: 'materials', unit: 'nr', unitCost: CHANNEL_OUTLET_EACH, qty: (cl > 0 ? 1 : 0) + (ch > 0 ? 1 : 0) })
  if (i.gullies > 0) lines.push({ id: 'gullies', name: 'Yard or rainwater gully with grating', category: 'materials', unit: 'nr', unitCost: GULLY_EACH, qty: Math.round(i.gullies) })
  if (i.downpipeConnections > 0) lines.push({ id: 'downpipe-connections', name: 'Downpipe connection to the drain (shoe, back inlet or gully)', category: 'materials', unit: 'nr', unitCost: DOWNPIPE_CONNECTION_EACH, qty: Math.round(i.downpipeConnections) })
  if (i.waterButts > 0) lines.push({ id: 'water-butts', name: 'Water butt with diverter kit', category: 'materials', unit: 'nr', unitCost: WATER_BUTT_EACH, qty: Math.round(i.waterButts) })

  if (lines.length === 0) warnings.push('Nothing to price yet: give the roof or paving area that drains to the soakaway, or add channel drains, gullies, downpipe connections or water butts.')
  warnings.push('The size of a soakaway comes from an infiltration test (BRE Digest 365), the soil, the water table and the design: it must be at least 5m from a building and not near a boundary or a slope without checks. The pipes from the downpipes to it are priced as surface water runs in Underground Drainage.')
  return { lines, effectiveAreaM2: round1(effective), storageM3: round2(storage), storageEachM3: count > 0 ? round2(storage / count) : 0, installedM3: round2(installed), holeM3: round2(hole), excavatorDays, spoilAwayM3: round2(spoilM3), rings, wrapM2, warnings }
}

export function soakawaySubtotal(lines: SoakawayLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost * (1 + (l.wastePct ?? 0) / 100), 0))
}
