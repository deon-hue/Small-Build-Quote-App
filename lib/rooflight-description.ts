// The customer-facing description of a set of roof lanterns and rooflights (Roof → Rooflights & Dormers) —
// what's supplied and fitted, part by part. The roof structure has already formed and trimmed the opening
// and built the kerb (Roof Structure), and the covering has already dressed up to it (Roof Coverings); this
// only describes the glazed unit (or the hatch) that goes in. Kept as its own pure function so its wording
// can be tested, and so the calculator's own screen stays about the calculator.

import type { RooflightItem, RooflightKind, VeluxPreset } from './rooflight-units'

// Its own copy of the labels — every `lib/*-description.ts` module here only takes *type* imports from the
// engine it describes (see `lib/flat-roof-description.ts`'s own `KIND_PHRASE`), so it can be run and tested
// on its own with `node --experimental-strip-types`, which can't resolve this repo's extension-less relative
// imports across files at runtime. Keep in step with `ROOFLIGHT_KIND_LABEL` / `VELUX_PRESET` in `rooflight-units.ts`.
const KIND_LABEL: Record<RooflightKind, string> = {
  lantern: 'Roof lantern',
  'roof-window': 'Roof window',
  'flat-rooflight': 'Fixed flat rooflight',
  dome: 'Dome rooflight',
  hatch: 'Access hatch',
}
const VELUX_LABEL: Record<Exclude<VeluxPreset, 'bespoke'>, string> = {
  mk04: 'MK04 (78 × 98cm)',
  mk06: 'MK06 (78 × 118cm)',
  sk06: 'SK06 (114 × 118cm)',
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Two list rows for the same kind, size and options are one thing on the quote, not two — group them and
 * sum their quantities before describing anything (a click of "+ Roof window" twice reads the same as one
 * row with qty 2). */
function groupItems(items: RooflightItem[]): RooflightItem[] {
  const byKey = new Map<string, RooflightItem>()
  for (const item of items) {
    if (item.qty <= 0) continue
    const key = [item.kind, item.widthMm, item.depthMm, item.veluxPreset, item.opening, item.glazing, item.walkOn, item.skin].join(':')
    const existing = byKey.get(key)
    if (existing) existing.qty += item.qty
    else byKey.set(key, { ...item })
  }
  return [...byKey.values()]
}

function itemPhrase(item: RooflightItem): string {
  const size = `${item.widthMm} × ${item.depthMm}mm`
  if (item.kind === 'roof-window') {
    const preset = item.veluxPreset && item.veluxPreset !== 'bespoke' ? VELUX_LABEL[item.veluxPreset] : null
    const name = preset ?? `bespoke, ${size}`
    return `${item.qty} × ${name} roof window${item.qty === 1 ? '' : 's'} (${item.opening === 'electric' ? 'electric' : 'manual'} opening)`
  }
  if (item.kind === 'lantern') return `${item.qty} × ${size} roof lantern${item.qty === 1 ? '' : 's'} (${item.glazing === 'triple' ? 'triple' : 'double'} glazed)`
  if (item.kind === 'flat-rooflight') return `${item.qty} × ${size} fixed flat rooflight${item.qty === 1 ? '' : 's'}${item.walkOn ? ', walk-on' : ''}`
  if (item.kind === 'dome') return `${item.qty} × ${size} ${item.skin ?? 'twin'}-skin dome rooflight${item.qty === 1 ? '' : 's'}`
  return `${item.qty} × ${size} access hatch${item.qty === 1 ? '' : 'es'}`
}

/** The one-line version for the quote's phase line, e.g. "Rooflights — 1 roof lantern (2.00 × 1.50m) and
 * 2 MK04 roof windows." */
export function describeRooflightsShort(items: RooflightItem[]): string {
  const used = groupItems(items)
  if (used.length === 0) return 'Rooflights — none yet.'
  const list = used.map(itemPhrase)
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  return `Rooflights — ${joined}.`
}

export function describeRooflights(items: RooflightItem[]): string {
  const used = groupItems(items)
  if (used.length === 0) return 'No rooflights are included yet.'
  const lines: string[] = []
  lines.push(
    'Supply and fit the rooflights below. The opening, its trimmers and its kerb are formed under Roof Structure, ' +
    'and the roof covering is dressed up to the kerb under Roof Coverings — this covers the unit itself and its flashing kit.',
  )
  for (const item of used) {
    const label = KIND_LABEL[item.kind]
    if (item.kind === 'roof-window') {
      const preset = item.veluxPreset && item.veluxPreset !== 'bespoke' ? VELUX_LABEL[item.veluxPreset] : null
      lines.push(
        `${label}${item.qty === 1 ? '' : 's'} (${item.qty}): ${preset ?? `bespoke, ${item.widthMm} × ${item.depthMm}mm`}, ` +
        `${item.opening === 'electric' ? 'electrically operated' : 'manually operated'}, with its flashing kit and internal lining.`,
      )
    } else if (item.kind === 'lantern') {
      lines.push(
        `${label}${item.qty === 1 ? '' : 's'} (${item.qty}): ${item.widthMm} × ${item.depthMm}mm, an aluminium-framed lantern with ` +
        `${item.glazing === 'triple' ? 'triple' : 'double'}-glazed self-cleaning, solar-control panels, on jacking legs to the kerb.`,
      )
    } else if (item.kind === 'flat-rooflight') {
      lines.push(
        `${label}${item.qty === 1 ? '' : 's'} (${item.qty}): ${item.widthMm} × ${item.depthMm}mm, ` +
        `${item.glazing === 'triple' ? 'triple' : 'double'}-glazed${item.walkOn ? ', rated for foot traffic' : ''}, with its flashing kit.`,
      )
    } else if (item.kind === 'dome') {
      lines.push(`${label}${item.qty === 1 ? '' : 's'} (${item.qty}): ${item.widthMm} × ${item.depthMm}mm, ${item.skin ?? 'twin'}-skin polycarbonate, with its flashing kit.`)
    } else {
      lines.push(`${label}${item.qty === 1 ? '' : 's'} (${item.qty}): ${item.widthMm} × ${item.depthMm}mm, insulated, with its flashing kit.`)
    }
  }
  const totalQty = used.reduce((s, i) => s + i.qty, 0)
  lines.push(`Not included: ${plural(totalQty, 'the opening, kerb and covering, which are', 'the openings, kerbs and covering, which are')} priced under Roof Structure and Roof Coverings.`)
  return lines.join('\n')
}
