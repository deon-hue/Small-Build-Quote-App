// Pricing the four Tiling & Finishes calculators from what the AI quote heard in the scope (see lib/tiling-ai.ts for the checking). Each uses the calculator's own engine, its own labour suggestions
// (priced at the company's trades), standard settings and sample rates, with the 20% profit line, exactly as the screen does before anything is edited. It also returns the calculator's saved state
// (`calcState`), so opening the calculator from the quote shows the same rooms, and a plain-English review note saying what was priced and what was assumed. Kept next to the screens (not in lib/)
// because it uses the same costing helpers they do.

import type { AssemblyLayerDef } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { suggestTilingLabour } from '@/lib/flat-roof-labour'
import { costFromBasics } from '@/components/assembly-basics-pricing'
import type { PricedCalc } from '@/components/ai-drainage-pricing'
import { DEFAULT_TILING_SITUATIONS } from '@/lib/tiling-common'
import { calculateTileFloor } from '@/lib/tile-floor-units'
import { calculateTileWall } from '@/lib/tile-wall-units'
import { calculateTilePrep } from '@/lib/tile-prep-units'
import { calculateTileUfh } from '@/lib/tile-ufh-units'
import { describeTileFloor, describeTileFloorShort, describeTileWall, describeTileWallShort, describeTilePrep, describeTilePrepShort, describeTileUfh, describeTileUfhShort } from '@/lib/tiling-description'
import { tileFloorFromScope, tileWallFromScope, tilePrepFromScope, tileUfhFromScope } from '@/lib/tiling-ai'
import { plural } from '@/lib/ai-spec'

export const TILING_AI_IDS = new Set(['tile-floor-rooms', 'tile-wall-rooms', 'tile-prep-rooms', 'tile-ufh-electric'])

type RawLine = { id: string; name: string; category: AssemblyLayerDef['category']; unit: string; unitCost: number; qty: number }
const asLayers = (lines: RawLine[]): AssemblyLayerDef[] =>
  lines.map(l => ({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: 0 }))

const typicalSentence = (typical: string[]) => (typical.length > 0 ? ` No size was given for ${typical.join(', ')}.` : '')
const assumedSentence = (assumed: string[]) => (assumed.length > 0 ? ` Assumed, because the scope did not say: ${assumed.join('; ')}.` : '')
const TILE_NOTE = 'Tiles are priced at a sample allowance per m² unless the scope gave a price or said the client supplies them.'

/** Prices the Tiling & Finishes calculator `canonicalId` from the AI's "calc" object. Null when the scope described nothing for it (or it did not check out). */
export function priceTilingCalcFromScope(o: { canonicalId: string; spec: unknown; labourTrades: BOLabourTrade[] }): PricedCalc | null {
  try {
    switch (o.canonicalId) {
      case 'tile-floor-rooms': {
        const ai = tileFloorFromScope(o.spec)
        if (!ai) return null
        const r = calculateTileFloor({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestTilingLabour(r.labour), labourTrades: o.labourTrades })
        const d = { rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })), occupied: ai.jobSituationId === 'occupied', clientTiles: ai.rooms.every(x => x.clientSupplies) }
        return {
          name: 'Floor tiling', qty: 1, location: '', description: describeTileFloorShort(d), detail: describeTileFloor(d), lines,
          calcState: { id: 'tile-floor-rooms', values: { AssemblyTileFloorDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the floor tiling calculator from the rooms in your scope (${ai.rooms.map(x => x.name).join(', ')}: ${r.totalAreaM2}m² of floor, about ${Math.round(r.totalTilerHours)} tiler hours) with the calculator's standard settings and sample rates.${typicalSentence(ai.typicalRooms)}${assumedSentence(ai.assumed)} ${TILE_NOTE} The floor base (levelling, backer board, waterproofing) is Tiling Preparation, not here. Open the calculator to check the rooms and tiles.`,
        }
      }
      case 'tile-wall-rooms': {
        const ai = tileWallFromScope(o.spec)
        if (!ai) return null
        const r = calculateTileWall({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestTilingLabour(r.labour), labourTrades: o.labourTrades })
        const d = { rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })), occupied: ai.jobSituationId === 'occupied', clientTiles: ai.rooms.every(x => x.clientSupplies) }
        return {
          name: 'Wall tiling', qty: 1, location: '', description: describeTileWallShort(d), detail: describeTileWall(d), lines,
          calcState: { id: 'tile-wall-rooms', values: { AssemblyTileWallDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the wall tiling calculator from the rooms in your scope (${ai.rooms.map(x => x.name).join(', ')}: ${r.totalAreaM2}m² of wall, about ${Math.round(r.totalTilerHours)} tiler hours) with the calculator's standard settings and sample rates.${assumedSentence(ai.assumed)} ${TILE_NOTE} Backer board and waterproofing behind the tiles are Tiling Preparation, not here. Open the calculator to check the tiled areas and tiles.`,
        }
      }
      case 'tile-prep-rooms': {
        const ai = tilePrepFromScope(o.spec)
        if (!ai) return null
        const r = calculateTilePrep({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestTilingLabour(r.labour), labourTrades: o.labourTrades })
        const d = { rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })), occupied: ai.jobSituationId === 'occupied' }
        return {
          name: 'Tiling preparation', qty: 1, location: '', description: describeTilePrepShort(d), detail: describeTilePrep(d), lines,
          calcState: { id: 'tile-prep-rooms', values: { AssemblyTilePrepDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId } } },
          note: `Priced by the tiling preparation calculator from the rooms in your scope (${ai.rooms.map(x => x.name).join(', ')}: ${r.totalFloorM2}m² of floor prepared, ${r.totalWallM2}m² of wall board, ${r.totalTankedM2}m² waterproofed, ${r.totalCeilingM2}m² of ceiling board) with the calculator's standard settings and sample rates.${typicalSentence(ai.typicalRooms)}${assumedSentence(ai.assumed)} Open the calculator to check what each floor, wall and ceiling gets.`,
        }
      }
      case 'tile-ufh-electric': {
        const ai = tileUfhFromScope(o.spec)
        if (!ai) return null
        const r = calculateTileUfh({ rooms: ai.rooms, jobSituationId: ai.jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {}, electricianIncluded: ai.electricianIncluded })
        const lines = costFromBasics({ layers: asLayers(r.lines), suggestions: suggestTilingLabour(r.labour), labourTrades: o.labourTrades })
        const d = { rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })), occupied: ai.jobSituationId === 'occupied', electricianByOthers: !ai.electricianIncluded }
        return {
          name: 'Electric underfloor heating', qty: 1, location: '', description: describeTileUfhShort(d), detail: describeTileUfh(d), lines,
          calcState: { id: 'tile-ufh-electric', values: { AssemblyTileUfhDemo: { rooms: ai.rooms, jobSituationId: ai.jobSituationId, electricianIncluded: ai.electricianIncluded } } },
          note: `Priced by the electric underfloor heating calculator from the rooms in your scope (${plural(ai.rooms.length, 'room', 'rooms')}: ${r.totalHeatedM2}m² of heating, ${(r.totalWatts / 1000).toFixed(2)}kW, ${plural(r.thermostats, 'thermostat', 'thermostats')}) with the calculator's standard settings and sample rates.${typicalSentence(ai.typicalRooms)} ${ai.electricianIncluded ? "The electrician's connection, test and certificate is included as a subcontract line." : "The electrical connection is by others, as the scope says: it is not priced."} The tiles and the floor base are priced in their own lines. Open the calculator to check the heated areas and kits.`,
        }
      }
      default: return null
    }
  } catch { return null }
}
