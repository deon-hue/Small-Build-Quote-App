// The cost lines a vaulted ceiling and a join to an existing roof add to a pitched roof structure calculator's breakdown. Used by the gable, hip and mono-pitch screens, so each prices them the same way.
// The covering's side of a join (lead flashing, valley lead, the existing tiling made good) is priced in Roof Coverings, not here.

import type { AssemblyLayerDef } from './assembly-calc'
import { RIDGE_BEAM, RIDGE_BEAM_BEARING_EACH, JOIN_RATES, type RidgeBeamKind, type RoofJoinGeometry } from './roof-extras'

const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

/** A vaulted roof's ridge beam (instead of a ridge board) and its bearings. */
export function ridgeBeamLayers(ridgeLm: number, kind: RidgeBeamKind, wastePct: number): AssemblyLayerDef[] {
  if (!(ridgeLm > 0)) return []
  const b = RIDGE_BEAM[kind]
  return [
    fixed({ id: 'ridge_beam', name: `${b.label}, the length of the ridge`, category: 'materials', unit: 'lm', unitCost: b.perLm, wastePct, qty: ridgeLm }),
    fixed({ id: 'ridge_bearings', name: 'Bearings for the ridge beam (padstone or post, each end)', category: 'materials', unit: 'nr', unitCost: RIDGE_BEAM_BEARING_EACH, roundToWhole: true, qty: 2 }),
  ]
}

/** What one join to an existing roof needs from the structure. `tag` makes its line ids its own ('joinA', 'joinB', 'joinHigh'); `label` says which join it is. */
export function roofJoinLayers(tag: string, label: string, g: RoofJoinGeometry, wastePct: number): AssemblyLayerDef[] {
  const L: AssemblyLayerDef[] = []
  if (g.bearerLm > 0) L.push(fixed({ id: `${tag}-bearer`, name: `Bearer 100×50 treated fixed to the existing rafters (${label})`, category: 'materials', unit: 'lm', unitCost: JOIN_RATES.bearerPerLm, wastePct, qty: g.bearerLm }))
  if (g.fixingCount > 0) L.push(fixed({ id: `${tag}-fixings`, name: `Rafter ties, hangers and cleats tying the new roof to the old (${label})`, category: 'materials', unit: 'nr', unitCost: JOIN_RATES.fixingEach, roundToWhole: true, qty: g.fixingCount }))
  if (g.valleyRafterLm > 0) L.push(fixed({ id: `${tag}-valley`, name: `Valley rafters 47×225 C24, ${g.valleyCount} valleys (${label})`, category: 'materials', unit: 'lm', unitCost: JOIN_RATES.valleyRafterPerLm, wastePct, qty: g.valleyRafterLm }))
  if (g.trimmerLm > 0) L.push(fixed({ id: `${tag}-trimmers`, name: `Doubled trimmers and headers in the existing roof (${label})`, category: 'materials', unit: 'lm', unitCost: JOIN_RATES.trimmerPerLm, wastePct, qty: g.trimmerLm }))
  if (g.protectionM2 > 0) L.push(fixed({ id: `${tag}-protect`, name: `Temporary weather protection over the opened-up roof (${label})`, category: 'materials', unit: 'm²', unitCost: JOIN_RATES.protectionPerM2, wastePct: 10, qty: g.protectionM2 }))
  return L
}
