// The parapet wall calculator's choices that aren't geometry: what caps the wall, the customer's description of
// it, and the bricklayer's labour. Kept apart so they can be tested. Coping products are GENERIC with SAMPLE
// rates — editable in the calculator's breakdown like every calculator here.

import type { ParapetBuildType } from './assembly-calc'

export type CopingType = 'concrete' | 'stone-recon' | 'stone-natural' | 'brick-on-edge' | 'aluminium' | 'lead'

export const COPING_LABEL: Record<CopingType, string> = {
  'concrete':      'Concrete coping stones',
  'stone-recon':   'Reconstituted stone coping',
  'stone-natural': 'Natural stone coping',
  'brick-on-edge': 'Bricks on edge (soldier course)',
  'aluminium':     'Aluminium coping (powder-coated)',
  'lead':          'Lead capping on a ply base',
}

/** How the capping reads in the customer's description. */
export const COPING_DESCRIPTION: Record<CopingType, string> = {
  'concrete':      'concrete coping stones',
  'stone-recon':   'reconstituted stone coping',
  'stone-natural': 'natural stone coping',
  'brick-on-edge': 'a course of bricks laid on edge',
  'aluminium':     'a powder-coated aluminium coping',
  'lead':          'a Code 4 lead capping on a plywood base',
}

export const COPING_TYPES = Object.keys(COPING_LABEL) as CopingType[]

export const BUILD_LABEL: Record<ParapetBuildType, string> = {
  'cavity-brick-block': 'Cavity — brick outer, block inner',
  'solid-block':        'Solid block laid flat, rendered',
  'solid-brick':        'Solid brick 215mm',
}
const BUILD_DESCRIPTION: Record<ParapetBuildType, string> = {
  'cavity-brick-block': 'in brick and block cavity construction',
  'solid-block':        'in solid blockwork, rendered',
  'solid-brick':        'in solid brickwork',
}

export interface ParapetDescriptionInput {
  lengthM: number
  heightAboveRoofMm: number
  build: ParapetBuildType
  coping: CopingType
  outletOpenings: number
}

export function describeParapetWallShort(i: ParapetDescriptionInput): string {
  return `Parapet wall, ${i.lengthM.toFixed(1)}m long, ${i.heightAboveRoofMm}mm above the roof — ${BUILD_LABEL[i.build].split(' — ')[0].toLowerCase()} build with ${COPING_LABEL[i.coping].toLowerCase()}.`
}

export function describeParapetWall(i: ParapetDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Supply and build ${i.lengthM.toFixed(1)}m of parapet wall ${BUILD_DESCRIPTION[i.build]}, standing ${i.heightAboveRoofMm}mm above the finished roof.`)
  lines.push(`Damp proofing: a DPC and cavity tray at the base of the wall where the roof covering is dressed up its inner face.`)
  lines.push(`Capping: the wall is finished with ${COPING_DESCRIPTION[i.coping]}${i.coping === 'brick-on-edge' ? ' bedded in mortar over a DPC' : i.coping === 'aluminium' || i.coping === 'lead' ? '' : ', bedded on a DPC and pointed'}, with a drip so that water is thrown clear of the face.`)
  if (i.outletOpenings > 0) lines.push(`Outlets: ${i.outletOpenings} ${i.outletOpenings === 1 ? 'opening is' : 'openings are'} formed through the wall for the rainwater and overflow outlets, which are supplied and fitted with the roof drainage.`)
  lines.push('Not included: the roof structure, covering and drainage, which are priced separately.')
  return lines.join('\n')
}
