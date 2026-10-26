// The words for the Kitchen Installation calculator on the quote: a short line (printed on the quote) and the full kitchen-by-kitchen description (the "What's included" text). Pure, so they follow the kitchens until
// edited by hand. No imports needed from the engine: the screen passes in each kitchen already worded (its `parts`).

export interface KitchenDescriptionKitchen {
  name: string
  /** plain phrases from the engine: "8 base units, 5 wall units, supplied by the client and fitted by us", "7m of laminate worktop, cut and fitted with 1 joint and 2 cut-outs" */
  parts: string[]
  units: number
  worktopLm: number
}
export interface KitchenDescriptionInput {
  kitchens: KitchenDescriptionKitchen[]
  anyClientUnits: boolean
  anyStone: boolean
  occupied: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: KitchenDescriptionInput) => i.kitchens.filter(k => k.parts.length > 0)

export function describeKitchenShort(i: KitchenDescriptionInput): string {
  const ks = withParts(i)
  if (ks.length === 0) return 'Kitchen installation.'
  return `Kitchen installation: ${list(ks.map(k => `${k.name}${k.units > 0 || k.worktopLm > 0 ? ` (${[k.units > 0 && `${k.units} unit${k.units === 1 ? "" : "s"}`, k.worktopLm > 0 && `${k.worktopLm}m of worktop`].filter(Boolean).join(", ")})` : ""}`))}.`
}

export function describeKitchen(i: KitchenDescriptionInput): string {
  const ks = withParts(i)
  if (ks.length === 0) return 'Kitchen installation.'
  const lines: string[] = ['Fit the kitchen below: the units set out, levelled and fixed to the walls and floor, the worktops, plinth and finishing trims, and the appliances fitted into their housings.']
  for (const k of ks) lines.push(`${k.name}: ${k.parts.join('; ')}.`)
  if (i.anyClientUnits) lines.push('Where the units are delivered by the client or the supplier, we fit them as delivered: every part is to be checked on delivery, and a missing or damaged part can delay the fitting.')
  if (i.anyStone) lines.push('A stone worktop is templated once the units are fitted and levelled, and is made and fitted by a specialist a week or two later.')
  if (i.occupied) lines.push('The house is lived in: floors and furniture are protected and the work is cleared up each day.')
  lines.push('Not included: the sink, tap and appliance plumbing, the wiring and gas connections, ducting for an extractor, the splashback tiling, taking out the old kitchen, floor finishes, painting and decorating, or making good.')
  return lines.join('\n')
}
