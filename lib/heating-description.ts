// The words for a heating plant on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface HeatingDescriptionInput {
  /** e.g. "28kW combi" */
  boilerLabel: string
  fit: 'replace' | 'relocate'
  flue: 'horizontal' | 'vertical' | 'existing'
  coreDrill: boolean
  plumeKit: boolean
  controls: 'none' | 'programmer' | 'smart'
  magneticFilter: boolean
  flush: boolean
  removeOld: boolean
  commission: boolean
  condensatePump: boolean
  gasPipeLm: number
  heatingPipeLm: number
  condensateLm: number
}

export function describeHeatingShort(i: HeatingDescriptionInput): string {
  const parts: string[] = []
  if (i.controls === 'smart') parts.push('with a smart thermostat')
  if (i.flush) parts.push('system cleaned')
  if (i.commission) parts.push('commissioned')
  const tail = parts.length === 0 ? '' : parts.length === 1 ? `, ${parts[0]}` : `, ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${i.fit === 'replace' ? 'Replace the boiler with a' : 'Install a'} ${i.boilerLabel} gas boiler${i.fit === 'relocate' ? ' in a new position' : ''}${tail}.`
}

export function describeHeating(i: HeatingDescriptionInput): string {
  const lines: string[] = []
  if (i.removeOld) lines.push('Drain down the system and remove the old boiler, taking it away from site.')
  lines.push(`Supply and fit a ${i.boilerLabel} gas boiler${i.fit === 'relocate' ? ' in its new position' : ' in place of the old one'}, connected to the gas, water and heating pipework.`)
  if (i.fit === 'relocate' || i.gasPipeLm > 0 || i.heatingPipeLm > 0) {
    const parts: string[] = []
    if (i.gasPipeLm > 0) parts.push(`${i.gasPipeLm}m of gas pipework`)
    if (i.heatingPipeLm > 0) parts.push(`${i.heatingPipeLm}m of flow and return pipework`)
    if (parts.length > 0) lines.push(`Run ${parts.join(' and ')} to the boiler.`)
  }
  if (i.flue === 'horizontal') lines.push(`Fit a horizontal flue through the external wall${i.coreDrill ? ', core drilling the wall and making good' : ''}${i.plumeKit ? ', with a plume management kit' : ''}.`)
  if (i.flue === 'vertical') lines.push(`Fit a vertical flue through the roof${i.plumeKit ? ', with a plume management kit' : ''}.`)
  if (i.flue === 'existing') lines.push('Connect the boiler to the existing flue.')
  lines.push(`Run the condensate pipe${i.condensateLm > 0 ? ` (${i.condensateLm}m)` : ''} to a suitable drain${i.condensatePump ? ', with a condensate pump' : ''}.`)
  if (i.magneticFilter) lines.push('Fit a magnetic system filter.')
  if (i.flush) lines.push('Clean the heating system with a chemical cleaner and add inhibitor.')
  if (i.controls === 'programmer') lines.push('Fit a programmable room thermostat.')
  if (i.controls === 'smart') lines.push('Fit a smart thermostat and connect it.')
  if (i.commission) lines.push('Commission the boiler, issue the benchmark certificate and notify Building Control. The work is carried out by a Gas Safe registered engineer.')
  lines.push('Not included: the electrical connection to the boiler, the radiators and towel rails (priced with the plumbing), a new hot water cylinder or heat pump, or making good plaster and decoration.')
  return lines.join('\n')
}
