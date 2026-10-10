// Raft foundation — one reinforced concrete slab under the whole building, on compacted hardcore and a sand blind with a DPM, formed to its edges and
// optionally thickened round the perimeter (an edge beam) and insulated under and round the edge. Sized from the drawn footprint (its length and width)
// and a few thicknesses. Counts, areas and volumes only: the slab thickness, mesh, edge beams and concrete strength are the engineer's design to confirm —
// this only warns about the usual rules of thumb. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen
// costs these quantities through the shared costLayer with each layer's fixedQty set from the geometry below.

export interface RaftFoundationInput {
  /** The footprint, mm (the drawn shape's bounding box). */
  lengthMm: number
  widthMm: number
  /** Thickness of the concrete slab, mm. Default 200. */
  slabThicknessMm: number
  /** Compacted hardcore under the slab, mm. Default 150. */
  hardcoreMm: number
  /** Sand blinding on the hardcore, mm. Default 50. */
  blindingMm: number
  /** Depth dug below existing ground to the formation (the underside of the hardcore), mm. Default: the slab, hardcore and blinding together. */
  digDepthMm: number
  /** How far beyond the footprint the dig goes each side, for working space and the formwork, mm. Default 300. */
  overdigMm: number
  /** A thickened edge: its width and its total depth (so the extra depth below the slab is depth less the slab), mm. Omit for a flat slab. */
  edgeBeam?: { widthMm: number; depthMm: number } | null
  /** Insulation under the whole slab, mm; 0 = none. */
  underSlabInsulationMm: number
  /** Layers of mesh: 1 or 2. Default 2 (top and bottom). */
  meshLayers: number
}

export interface RaftFoundationGeometry {
  lengthM: number
  widthM: number
  areaM2: number
  perimeterLm: number
  digVolumeM3: number
  /** The soil dug out, bulked up 30% for carting (all of it leaves site: the hardcore and concrete replace it). */
  spoilAwayM3: number
  /** Machine days for the dig, from an output of 40 m³ a day in a wide open dig, in half days (never under half a day). */
  excavatorDays: number
  hardcoreVolumeM3: number
  hardcoreTonnes: number
  /** Days of a compaction plate for the hardcore: one a day for about 50 m² of it, in half days. */
  plateDays: number
  blindingTonnes: number
  /** DPM laid over the blinding, with its laps and turn-ups taken up by the waste allowance. */
  dpmAreaM2: number
  underSlabInsulationM2: number
  /** Mesh: sheets of A393 per layer (each covers about 9 m² once lapped) and the chairs holding it up. */
  meshSheetsPerLayer: number
  meshLayers: number
  chairCount: number
  slabVolumeM3: number
  edgeExtraVolumeM3: number
  concreteVolumeM3: number
  /** The edge formwork and the edge insulation run the whole perimeter. */
  edgeFormworkLm: number
  edgeInsulationLm: number
  warnings: string[]
}

export const RAFT_SPOIL_BULKING = 1.3
export const RAFT_DIG_M3_PER_DAY = 40
export const HARDCORE_T_PER_M3 = 2.1
export const BLINDING_T_PER_M3 = 1.6
export const MESH_M2_PER_SHEET = 9.0
export const CHAIRS_PER_M2 = 4
export const PLATE_M2_PER_DAY = 50

const toM = (mm: number) => mm / 1000
const halfDays = (d: number) => Math.max(0.5, Math.round(d * 2) / 2)

export function calculateRaftFoundationGeometry(input: RaftFoundationInput): RaftFoundationGeometry {
  const { lengthMm, widthMm, slabThicknessMm, hardcoreMm, blindingMm, digDepthMm, overdigMm } = input
  if (!(lengthMm > 0)) throw new Error('The raft length must be greater than zero.')
  if (!(widthMm > 0)) throw new Error('The raft width must be greater than zero.')
  if (!(slabThicknessMm > 0)) throw new Error('The slab thickness must be greater than zero.')
  if (hardcoreMm < 0 || blindingMm < 0) throw new Error('The hardcore and blinding cannot be negative.')
  if (!(digDepthMm > 0)) throw new Error('The dig depth must be greater than zero.')
  if (overdigMm < 0) throw new Error('The extra dig each side cannot be negative.')
  if (input.underSlabInsulationMm < 0) throw new Error('The insulation under the slab cannot be negative.')
  const meshLayers = Math.max(0, Math.min(2, Math.round(input.meshLayers)))

  const L = toM(lengthMm), W = toM(widthMm)
  const area = L * W
  const perimeter = 2 * (L + W)

  const edge = input.edgeBeam && input.edgeBeam.widthMm > 0 && input.edgeBeam.depthMm > slabThicknessMm ? input.edgeBeam : null
  const edgeExtraVolumeM3 = edge ? perimeter * toM(edge.widthMm) * toM(edge.depthMm - slabThicknessMm) : 0

  const digVolumeM3 = (L + 2 * toM(overdigMm)) * (W + 2 * toM(overdigMm)) * toM(digDepthMm) + edgeExtraVolumeM3
  const hardcoreVolumeM3 = area * toM(hardcoreMm)
  const slabVolumeM3 = area * toM(slabThicknessMm)

  const warnings: string[] = []
  if (slabThicknessMm < 150) warnings.push('A raft slab under about 150mm thick is unusual — check the thickness with the engineer.')
  if (digDepthMm < hardcoreMm + blindingMm) warnings.push('The dig is shallower than the hardcore and blinding together, so the slab would sit higher than the ground. Check the levels.')
  if (input.edgeBeam && !edge) warnings.push('The edge beam is not deeper than the slab, so it adds nothing. Make its depth greater than the slab thickness.')
  if (area > 0 && perimeter / Math.sqrt(area) > 6) warnings.push('A very long, narrow raft — check with the engineer whether it needs stiffening.')

  return {
    lengthM: L, widthM: W,
    areaM2: +area.toFixed(4),
    perimeterLm: +perimeter.toFixed(4),
    digVolumeM3: +digVolumeM3.toFixed(4),
    spoilAwayM3: +(digVolumeM3 * RAFT_SPOIL_BULKING).toFixed(4),
    excavatorDays: halfDays(digVolumeM3 / RAFT_DIG_M3_PER_DAY),
    hardcoreVolumeM3: +hardcoreVolumeM3.toFixed(4),
    hardcoreTonnes: +(hardcoreVolumeM3 * HARDCORE_T_PER_M3).toFixed(4),
    plateDays: halfDays(area / PLATE_M2_PER_DAY),
    blindingTonnes: +(area * toM(blindingMm) * BLINDING_T_PER_M3).toFixed(4),
    dpmAreaM2: +area.toFixed(4),
    underSlabInsulationM2: input.underSlabInsulationMm > 0 ? +area.toFixed(4) : 0,
    meshSheetsPerLayer: area / MESH_M2_PER_SHEET,
    meshLayers,
    chairCount: Math.ceil(area * CHAIRS_PER_M2 - 1e-9) * (meshLayers > 0 ? 1 : 0),
    slabVolumeM3: +slabVolumeM3.toFixed(4),
    edgeExtraVolumeM3: +edgeExtraVolumeM3.toFixed(4),
    concreteVolumeM3: +(slabVolumeM3 + edgeExtraVolumeM3).toFixed(4),
    edgeFormworkLm: +perimeter.toFixed(4),
    edgeInsulationLm: +perimeter.toFixed(4),
    warnings,
  }
}
