// The words for a soakaway and rainwater fittings on the quote: a short line (printed on the quote) and a full description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface SoakawayDescriptionInput {
  /** how many soakaways, 0 if none */
  count: number
  /** e.g. "soakaway crates", "a stone-filled soakaway pit", "a concrete ring soakaway" */
  kindWords: string
  kind: 'crates' | 'stone' | 'rings'
  roofAreaM2: number
  pavedAreaM2: number
  storageM3: number
  channelLightLm: number
  channelHeavyLm: number
  gullies: number
  downpipeConnections: number
  waterButts: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeSoakawayShort(i: SoakawayDescriptionInput): string {
  const parts: string[] = []
  if (i.count > 0 && i.storageM3 > 0) parts.push(`${plural(i.count, 'soakaway', 'soakaways')} holding ${i.storageM3.toFixed(1)}m³`)
  const channel = i.channelLightLm + i.channelHeavyLm
  if (channel > 0) parts.push(`${channel}m of channel drain`)
  if (i.gullies > 0) parts.push(plural(i.gullies, 'gully', 'gullies'))
  if (i.downpipeConnections > 0) parts.push(`${plural(i.downpipeConnections, 'downpipe connection', 'downpipe connections')}`)
  if (i.waterButts > 0) parts.push(plural(i.waterButts, 'water butt', 'water butts'))
  return parts.length === 0 ? 'Soakaway and rainwater drainage.' : `Rainwater drainage: ${parts.join(', ')}.`
}

export function describeSoakaway(i: SoakawayDescriptionInput): string {
  const lines: string[] = []
  if (i.count > 0 && i.storageM3 > 0) {
    const area = [i.roofAreaM2 > 0 ? `${i.roofAreaM2.toFixed(0)}m² of roof` : '', i.pavedAreaM2 > 0 ? `${i.pavedAreaM2.toFixed(0)}m² of paving` : ''].filter(Boolean).join(' and ')
    lines.push(`Excavate and build ${plural(i.count, 'soakaway', 'soakaways')} from ${i.kindWords}, holding ${i.storageM3.toFixed(1)}m³ in all${area ? ` for ${area}` : ''}, wrapped in geotextile${i.kind === 'rings' ? ' round the stone surround' : ''}, with a silt chamber at each inlet, backfilled and the surplus soil taken away.`)
  }
  if (i.channelLightLm > 0) lines.push(`Lay ${i.channelLightLm}m of light-duty channel drain on a concrete bed and haunching, with end caps and outlets.`)
  if (i.channelHeavyLm > 0) lines.push(`Lay ${i.channelHeavyLm}m of heavy-duty channel drain on a concrete bed and haunching, with end caps and outlets.`)
  if (i.gullies > 0) lines.push(`Fit ${plural(i.gullies, 'yard or rainwater gully', 'yard or rainwater gullies')} with gratings.`)
  if (i.downpipeConnections > 0) lines.push(`Connect ${plural(i.downpipeConnections, 'downpipe', 'downpipes')} to the drain.`)
  if (i.waterButts > 0) lines.push(`Supply and fit ${plural(i.waterButts, 'water butt', 'water butts')} with diverter kits.`)
  lines.push('Not included: the drain pipes between the downpipes and the soakaway (priced as drainage runs), the infiltration test and the designer\'s calculations, or the roof gutters and downpipes.')
  return lines.join('\n')
}
