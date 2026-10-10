// The words for pad foundations on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface PadDescriptionGroup { count: number; lengthMm: number; widthMm: number; depthMm: number }

export interface PadDescriptionInput {
  groups: PadDescriptionGroup[]
  blindingMm: number
  /** e.g. "C30" */
  concreteMix: string
  formwork: boolean
  rebar: boolean
  starters: boolean
}

const sizeOf = (g: PadDescriptionGroup) => `${g.lengthMm} × ${g.widthMm} × ${g.depthMm}mm`

function listSizes(groups: PadDescriptionGroup[]): string {
  const used = groups.filter(g => g.count > 0)
  if (used.length === 1) return `${used[0].count} pad${used[0].count === 1 ? '' : 's'}, each ${sizeOf(used[0])}`
  return used.map(g => `${g.count} at ${sizeOf(g)}`).join(', ')
}

export function describePadFoundationShort(i: PadDescriptionInput): string {
  return `Pad foundations — ${listSizes(i.groups)}: ${i.concreteMix} ${i.rebar ? 'reinforced ' : ''}concrete on ${i.blindingMm}mm of blinding.`
}

export function describePadFoundation(i: PadDescriptionInput): string {
  const lines: string[] = []
  lines.push(`Excavate a pit for each pad (${listSizes(i.groups)}) by machine, taking the surplus soil away from site.`)
  lines.push(`Lay ${i.blindingMm}mm of blinding concrete in the bottom of each pit.`)
  if (i.formwork) lines.push('Fix formwork to the sides of each pad.')
  if (i.rebar) lines.push('Fix the reinforcement to each pad, to the engineer\'s design.')
  if (i.starters) lines.push('Set holding-down bolts or column starter bars in each pad.')
  lines.push(`Pour ${i.concreteMix} ready-mixed concrete to each pad and level it.`)
  if (i.formwork) lines.push('Strike the formwork once the concrete has gone off, and backfill and compact round each pad.')
  lines.push('Not included: the engineer\'s design, any reinforcement or sizes they require beyond what is shown, ground beams linking the pads, or the columns and steelwork on top of them.')
  return lines.join('\n')
}
