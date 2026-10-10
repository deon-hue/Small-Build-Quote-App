// The words for a strip foundation on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. Type-only import from the engine (see CLAUDE.md).

import type { StripWallBuild } from './strip-foundation'

export interface StripFoundationDescriptionInput {
  lengthM: number
  widthMm: number
  depthMm: number
  concreteThicknessMm: number
  dpcAboveGroundMm: number
  wall: StripWallBuild
  /** e.g. "C25" */
  concreteMix: string
  takeAllSpoilAway: boolean
  /** A trench fill (concrete up to near ground level) instead of a traditional strip. Default 'strip'. */
  variant?: 'strip' | 'trench-fill'
}

const mm = (n: number) => n.toLocaleString('en-GB')

export function describeStripFoundationShort(i: StripFoundationDescriptionInput): string {
  const wall = i.wall === 'solid-flat' ? '215mm solid blockwork' : '300mm cavity blockwork filled with concrete'
  if (i.variant === 'trench-fill') {
    return `Trench fill foundation, ${i.lengthM.toFixed(1)}m long: ${mm(i.widthMm)}mm wide trench, ${mm(i.depthMm)}mm deep, filled with ${i.concreteMix} concrete to ${mm(i.depthMm - i.concreteThicknessMm)}mm below ground, with ${wall} up to DPC.`
  }
  return `Strip foundation, ${i.lengthM.toFixed(1)}m long: ${mm(i.widthMm)}mm wide trench, ${mm(i.depthMm)}mm deep, ${i.concreteThicknessMm}mm of ${i.concreteMix} concrete, with ${wall} up to DPC.`
}

export function describeStripFoundation(i: StripFoundationDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Excavate a trench ${i.lengthM.toFixed(1)}m long, ${mm(i.widthMm)}mm wide and ${mm(i.depthMm)}mm deep by machine, trimming the bottom by hand to a level formation.`)
  if (i.variant === 'trench-fill') lines.push(`Fill the trench with ${i.concreteMix} ready-mixed concrete (${mm(i.concreteThicknessMm)}mm deep) to ${mm(i.depthMm - i.concreteThicknessMm)}mm below finished ground level, levelled to depth pegs.`)
  else lines.push(`Pour ${i.concreteThicknessMm}mm of ${i.concreteMix} ready-mixed concrete in the bottom of the trench, levelled to depth pegs.`)
  if (i.wall === 'solid-flat') {
    lines.push(`Build the wall up from the concrete in 215mm dense concrete blocks laid flat, to a DPC ${i.dpcAboveGroundMm}mm above finished ground level, with the DPC laid on the top course.`)
  } else {
    lines.push(`Build the wall up from the concrete as two 100mm dense concrete block leaves with a 100mm cavity, tied together, the cavity filled with concrete, to a DPC ${i.dpcAboveGroundMm}mm above finished ground level, with the DPC laid across both leaves.`)
  }
  lines.push(i.variant === 'trench-fill' ? 'Backfill and compact the top of the trench round the finished wall.' : 'Backfill round the finished wall in layers and compact it.')
  lines.push(i.takeAllSpoilAway
    ? 'All the soil dug out is taken away from site.'
    : 'The surplus soil (what the concrete and the wall displace) is taken away from site; the rest is used as backfill.')
  lines.push('Not included: the ground floor, any reinforcement or trench support, drainage running through the foundation, or a structural engineer\'s design — the trench size and concrete are to the designer\'s or building control\'s requirements.')
  return lines.join('\n')
}
