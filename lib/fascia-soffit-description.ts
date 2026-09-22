// The customer-facing description of the fascia, soffit and barge boards (Roof → Fascias, Soffits & Barge
// Boards) — what's supplied and fitted, part by part. Kept as its own pure function so its wording can be
// tested, and so the calculator's own screen stays about the calculator.

import type { BoardMaterial, FasciaDepth, SoffitWidth } from './fascia-soffit-units'

// Its own copy of the labels — see lib/rooflight-description.ts for why: every lib/*-description.ts module
// here only takes type imports from the engine it describes.
const MATERIAL_LABEL: Record<BoardMaterial, string> = {
  upvc: 'uPVC',
  timber: 'timber, painted',
  composite: 'composite (fibre cement)',
}

export interface FasciaSoffitDescriptionInput {
  eavesLm: number
  vergeLm: number
  fasciaMaterial: BoardMaterial
  fasciaDepthMm: FasciaDepth
  soffitMaterial: BoardMaterial
  soffitVented: boolean
  soffitWidthMm: SoffitWidth
  bargeMaterial: BoardMaterial
}

export function describeFasciaSoffitShort(i: FasciaSoffitDescriptionInput): string {
  const bits: string[] = []
  if (i.eavesLm > 0) bits.push(`${MATERIAL_LABEL[i.fasciaMaterial]} fascia and ${i.soffitVented ? 'vented ' : ''}soffit, ${i.eavesLm.toFixed(1)}m`)
  if (i.vergeLm > 0) bits.push(`${MATERIAL_LABEL[i.bargeMaterial]} barge board, ${i.vergeLm.toFixed(1)}m`)
  if (bits.length === 0) return 'Fascias, soffits and barge boards — none set yet.'
  return `${bits.join(' and ')}.`
}

export function describeFasciaSoffit(i: FasciaSoffitDescriptionInput): string {
  if (i.eavesLm === 0 && i.vergeLm === 0) return 'No edges are set to eaves or verge yet, so nothing is included here.'
  const lines: string[] = []
  if (i.eavesLm > 0) {
    lines.push(
      `Fascia: ${i.eavesLm.toFixed(1)}m of ${MATERIAL_LABEL[i.fasciaMaterial]} fascia board, ${i.fasciaDepthMm}mm deep, fixed along the eaves — the gutter is fixed to it, priced separately.`,
    )
    lines.push(
      `Soffit: ${i.eavesLm.toFixed(1)}m of ${MATERIAL_LABEL[i.soffitMaterial]} soffit board, ${i.soffitWidthMm}mm wide, boxing in the underside of the eaves` +
      `${i.soffitVented ? ', with a continuous vent strip for roof ventilation' : ''}.`,
    )
  }
  if (i.vergeLm > 0) {
    lines.push(`Barge board: ${i.vergeLm.toFixed(1)}m of ${MATERIAL_LABEL[i.bargeMaterial]} barge board to the verge.`)
  }
  lines.push('Corner trims, end caps and joint trims are included where the runs meet or stop.')
  lines.push('Not included: the roof structure, covering and drainage, which are priced separately.')
  return lines.join('\n')
}
