// Shared registry of which Back Office sub-phases (by canonical_id — stable across renames)
// have a real, working assembly calculator today. Used by four places that all need to
// agree on the same answer:
//   - app/(app)/back-office/components/SectionAssemblies.tsx (renders the built card)
//   - app/(app)/back-office/components/SectionPhasesTasks.tsx (locks editing there instead)
//   - components/QuoteWorkspace.tsx (shows a button to open the calculator from a quote)
//   - lib/back-office-queries.ts (syncBackOfficeFromProduct skips re-seeding these
//     sub-phases' old flat-rate tasks from static code — see built-assembly-ids.ts)
//
// The plain canonical_id keys below MUST match lib/built-assembly-ids.ts's
// BUILT_ASSEMBLY_CANONICAL_IDS set — that file exists so non-UI code can check membership
// without importing the React components this file renders.

import AssemblyWallDemo from '@/components/AssemblyWallDemo'
import AssemblyMasonryWallDemo from '@/components/AssemblyMasonryWallDemo'
import AssemblyCavityWallDemo from '@/components/AssemblyCavityWallDemo'
import AssemblySolidBlockWallDemo from '@/components/AssemblySolidBlockWallDemo'
import AssemblySolidBrickWallDemo from '@/components/AssemblySolidBrickWallDemo'
import AssemblyTimberFrameWallDemo from '@/components/AssemblyTimberFrameWallDemo'
import AssemblyDwarfWallDemo from '@/components/AssemblyDwarfWallDemo'
import AssemblySleeperWallDemo from '@/components/AssemblySleeperWallDemo'
import AssemblyFlatRoofDemo from '@/components/AssemblyFlatRoofDemo'
import AssemblyParapetWallDemo from '@/components/AssemblyParapetWallDemo'
import AssemblyStripFoundationDemo from '@/components/AssemblyStripFoundationDemo'
import AssemblyRaftFoundationDemo from '@/components/AssemblyRaftFoundationDemo'
import AssemblyPadFoundationDemo from '@/components/AssemblyPadFoundationDemo'
import AssemblyPiledFoundationDemo from '@/components/AssemblyPiledFoundationDemo'
import AssemblyUnderpinningDemo from '@/components/AssemblyUnderpinningDemo'
import AssemblyElectricsDemo from '@/components/AssemblyElectricsDemo'
import AssemblyDecorationDemo from '@/components/AssemblyDecorationDemo'
import AssemblyPlasterRoomsDemo from '@/components/AssemblyPlasterRoomsDemo'
import AssemblyRenderDemo from '@/components/AssemblyRenderDemo'
import AssemblyWallInsulationDemo from '@/components/AssemblyWallInsulationDemo'
import AssemblyScreedFloorDemo from '@/components/AssemblyScreedFloorDemo'
import AssemblyFloorOverlayDemo from '@/components/AssemblyFloorOverlayDemo'
import AssemblyConcreteSlabFloorDemo from '@/components/AssemblyConcreteSlabFloorDemo'
import AssemblyBlockBeamFloorDemo from '@/components/AssemblyBlockBeamFloorDemo'
import AssemblySuspendedTimberFloorDemo from '@/components/AssemblySuspendedTimberFloorDemo'
import AssemblyPlumbingDemo from '@/components/AssemblyPlumbingDemo'
import AssemblyHeatingDemo from '@/components/AssemblyHeatingDemo'
import AssemblyUfhDemo from '@/components/AssemblyUfhDemo'
import AssemblyTileFloorDemo from '@/components/AssemblyTileFloorDemo'
import AssemblyTileWallDemo from '@/components/AssemblyTileWallDemo'
import AssemblyTilePrepDemo from '@/components/AssemblyTilePrepDemo'
import AssemblyTileUfhDemo from '@/components/AssemblyTileUfhDemo'
import AssemblyWindowsDoorsDemo from '@/components/AssemblyWindowsDoorsDemo'
import AssemblyTrimDemo from '@/components/AssemblyTrimDemo'
import AssemblyStairsDemo from '@/components/AssemblyStairsDemo'
import AssemblyKitchenFitDemo from '@/components/AssemblyKitchenFitDemo'
import AssemblyPipeworkDemo from '@/components/AssemblyPipeworkDemo'
import AssemblyDrainageDemo from '@/components/AssemblyDrainageDemo'
import AssemblySoakawayDemo from '@/components/AssemblySoakawayDemo'
import AssemblyServicesDemo from '@/components/AssemblyServicesDemo'
import AssemblyWallRemovalDemo from '@/components/AssemblyWallRemovalDemo'
import AssemblyStripOutDemo from '@/components/AssemblyStripOutDemo'
import AssemblyWasteDemo from '@/components/AssemblyWasteDemo'
import AssemblyExternalDemoDemo from '@/components/AssemblyExternalDemoDemo'
import AssemblyRoofStructureDemo from '@/components/AssemblyRoofStructureDemo'
import AssemblyRoofCoveringDemo from '@/components/AssemblyRoofCoveringDemo'
import AssemblyRooflightsDemo from '@/components/AssemblyRooflightsDemo'
import AssemblyFasciaSoffitDemo from '@/components/AssemblyFasciaSoffitDemo'
import { RateLinksProvider } from '@/components/RateLinks'
import { CalcScope } from '@/components/calc-state'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import type { CostedLine } from '@/lib/assembly-calc'
import type { AssemblyBasics } from '@/lib/assembly-basics'
import type { PlanRoom, ElectricsSavedState } from '@/lib/electrics-units'
import type { PlacedRoom } from '@/lib/plumb-points'
import type { PipeSummary } from '@/lib/pipe-network'
import type { PlanOpening } from '@/lib/wd-units'
import type { PlanWallOpening } from '@/lib/wall-openings'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'
import type { BOLabourTrade } from '@/lib/back-office-types'
import type { CalcSize } from '@/lib/calc-size'

export type AssemblyIcon = 'stud-wall' | 'metal-stud-wall' | 'block-wall' | 'cavity-wall' | 'timber-frame-wall' | 'dwarf-wall' | 'sleeper-wall' | 'flat-roof' | 'parapet-wall' | 'roof-covering' | 'gutters' | 'rooflights' | 'fascia-soffit' | 'strip-foundation' | 'raft-foundation' | 'pad-foundation' | 'piled-foundation' | 'underpinning' | 'electrics' | 'decoration' | 'plaster-rooms' | 'render' | 'wall-insulation' | 'screed-floor' | 'floor-overlay' | 'concrete-slab' | 'block-beam' | 'timber-floor' | 'insulated-concrete' | 'plumbing' | 'heating' | 'ufh' | 'pipework' | 'drainage' | 'soakaway' | 'services' | 'wall-removal' | 'strip-out' | 'waste-skips' | 'external-demo' | 'tile-floor' | 'tile-wall' | 'tile-prep' | 'tile-ufh' | 'windows-doors' | 'skirting' | 'stairs' | 'kitchen-fit'

/** Fired when a calculator's "Save & Price" is used from inside a real quote — absent in
 * the Back Office preview context, which has no quote to save into. */
// `description` is the short line for the quote; `detail` (only some calculators write one) is the full
// part-by-part "What's included" text kept as the phase's `scopeDetail`.
export interface AssemblySaveResult { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[]
  /** The profit % the calculator was set to: it becomes the sub-phase's margin in a quote. */
  profitPct?: number
  /** A pitched roof structure with a vaulted ceiling: the quote reminds you to add its insulation and plasterboard lining under Plastering & Boarding. */
  vaultedCeiling?: boolean
  /** A calculator that can't work out its inputs again from a drawn shape (electrics) hands back what it was set to, to be kept with the Take-off item. */
  state?: unknown
  /** What was typed into the calculator, to keep with the quote or Take-off item so it can be opened again and edited. */
  calcState?: CalcStateSnapshot
  /** The length, width or floor area the calculator was left at (lib/calc-size.ts): Take-off scales the drawing to match it. */
  size?: CalcSize }

export interface AssemblyRenderOpts {
  onSave?: (result: AssemblySaveResult) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's traced line length (mm) — live-syncs into the calculator's own length field.
   * Absent everywhere else (Back Office preview, QuoteWorkspace), which have no drawn line. */
  externalLengthMm?: number
  /** A wall's starting height (mm), when something other than the calculator's own default is known, e.g. the size the AI heard. Today only the cavity wall uses it. */
  initialHeightMm?: number
  /** Start with no sample openings (the AI quote does not know about any). Today only the cavity wall uses it. */
  noSampleOpenings?: boolean
  /** A roof's drawn width (the shorter side) — the joists span it. Only roofs use it; walls have no width. */
  externalWidthMm?: number
  /** A floor's drawn area (m²) and perimeter (m): a floor calculator is sized from them, not from a length. */
  externalAreaM2?: number
  externalPerimeterM?: number
  /** Which variant the calculator opens on, where it has more than one — the flat roof's warm/cold,
   * taken from the Take-off Build-Up Type. Ignored by calculators that have no variants. */
  variant?: string
  /** The sizes an AI quote priced it from, so the calculator opens showing what the AI used. */
  basics?: AssemblyBasics
  /** What was kept from the last Save & Price: the calculator opens with these values instead of its defaults. */
  calcState?: CalcStateSnapshot
  /** Electrics only: the points placed on the Take-off plan (as room counts), and what the calculator was last saved as. */
  electrics?: { planRooms?: PlanRoom[]; initialState?: ElectricsSavedState }
  /** the plumbing fittings placed on the Take-off plan, room by room (the Plumbing Installation calculator follows them) */
  /** the name of the room the drawn shape sits in on the Take-off plan, if it is in a named room */
  externalName?: string
  /** a block and beam floor with a beam direction chosen on the plan: the span of its beams, mm (the drawn side the beams run along) */
  externalSpanMm?: number
  plumbPlaced?: PlacedRoom[]
  /** the heating pipe runs drawn on the Take-off plan, sized with their fittings counted (the Plumbing Installation calculator prices them) */
  plumbPipes?: PipeSummary
  /** Windows & Doors only: the doors and windows placed on the Take-off plan, which the calculator adds and follows. */
  planOpenings?: PlanOpening[]
  /** A wall calculator with openings of its own (the cavity wall): the doors and windows drawn on this wall, which it adds and follows. */
  wallOpenings?: PlanWallOpening[]
  /** A by-room calculator: the rooms found on the Take-off plan, which it can add with their sizes and then follows. */
  planRooms?: PlanRoomInfo[]
  /** Tiling Preparation: what the drawing is for (the floor, the walls, or both) */
  prepScope?: 'floor' | 'walls' | 'both'
}

type BuiltAssemblyEntry = {
  icon: AssemblyIcon
  render: (opts?: AssemblyRenderOpts) => React.ReactNode
}

const RAW_BUILT_ASSEMBLIES: Record<string, BuiltAssemblyEntry> = {
  'iw-stud-partition': { icon: 'stud-wall', render: opts => <AssemblyWallDemo system="timber" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'iw-metal-stud': { icon: 'metal-stud-wall', render: opts => <AssemblyWallDemo system="metal" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'iw-block-masonry': { icon: 'block-wall', render: opts => <AssemblyMasonryWallDemo context="partition" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'ew-blockwork-100': { icon: 'block-wall', render: opts => <AssemblyMasonryWallDemo context="external-wall" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'ew-blockwork-215': { icon: 'block-wall', render: opts => <AssemblySolidBlockWallDemo laidDefault="flat" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-solid-brick-victorian': { icon: 'block-wall', render: opts => <AssemblySolidBrickWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-garden-room-timber': { icon: 'timber-frame-wall', render: opts => <AssemblyTimberFrameWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'ew-dwarf-wall': { icon: 'dwarf-wall', render: opts => <AssemblyDwarfWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-sleeper-wall': { icon: 'sleeper-wall', render: opts => <AssemblySleeperWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-parapet-wall': { icon: 'parapet-wall', render: opts => <AssemblyParapetWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'roof-structure': { icon: 'flat-roof', render: opts => <AssemblyRoofStructureDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'roof-covering': { icon: 'roof-covering', render: opts => <AssemblyRoofCoveringDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'roof-rainwater': { icon: 'gutters', render: opts => <AssemblyFlatRoofDemo part="gutters" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} /> },
  'roof-rooflights': { icon: 'rooflights', render: opts => <AssemblyRooflightsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'roof-fascia-soffit': { icon: 'fascia-soffit', render: opts => <AssemblyFasciaSoffitDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} /> },
  'roof-flat': { icon: 'flat-roof', render: opts => <AssemblyFlatRoofDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'ew-cav-partial': { icon: 'cavity-wall', render: opts => <AssemblyCavityWallDemo insulationDefault="pir" planOpenings={opts?.wallOpenings} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initialHeightMm={opts?.initialHeightMm} noSampleOpenings={opts?.noSampleOpenings} /> },
  'fnd-strip': { icon: 'strip-foundation', render: opts => <AssemblyStripFoundationDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initial={opts?.basics} /> },
  'fnd-trench-fill': { icon: 'strip-foundation', render: opts => <AssemblyStripFoundationDemo variant="trench-fill" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initial={opts?.basics} /> },
  'fnd-raft': { icon: 'raft-foundation', render: opts => <AssemblyRaftFoundationDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} initial={opts?.basics} /> },
  'fnd-pad': { icon: 'pad-foundation', render: opts => <AssemblyPadFoundationDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} initial={opts?.basics} /> },
  'fnd-piled': { icon: 'piled-foundation', render: opts => <AssemblyPiledFoundationDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initial={opts?.basics} /> },
  'fnd-underpin': { icon: 'underpinning', render: opts => <AssemblyUnderpinningDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initial={opts?.basics} /> },
  'fs-screeded-floor': { icon: 'screed-floor', render: opts => <AssemblyScreedFloorDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} /> },
  'fs-floor-overlay': { icon: 'floor-overlay', render: opts => <AssemblyFloorOverlayDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} /> },
  'fs-concrete-slab': { icon: 'concrete-slab', render: opts => <AssemblyConcreteSlabFloorDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} /> },
  'fs-block-beam': { icon: 'block-beam', render: opts => <AssemblyBlockBeamFloorDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalSpanMm={opts?.externalSpanMm} /> },
  'fs-suspended-timber': { icon: 'timber-floor', render: opts => <AssemblySuspendedTimberFloorDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} /> },
  'fs-insulated-concrete': { icon: 'insulated-concrete', render: opts => <AssemblyConcreteSlabFloorDemo variant="insulated" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} /> },
  'plumb-install': { icon: 'plumbing', render: opts => <AssemblyPlumbingDemo planRooms={opts?.planRooms} placed={opts?.plumbPlaced} pipes={opts?.plumbPipes} onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'plumb-heating-plant': { icon: 'heating', render: opts => <AssemblyHeatingDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'plumb-ufh': { icon: 'ufh', render: opts => <AssemblyUfhDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalName={opts?.externalName} planRooms={opts?.planRooms} /> },
  'plumb-pipework': { icon: 'pipework', render: opts => <AssemblyPipeworkDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'drain-runs': { icon: 'drainage', render: opts => <AssemblyDrainageDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'drain-soakaway': { icon: 'soakaway', render: opts => <AssemblySoakawayDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'drain-services': { icon: 'services', render: opts => <AssemblyServicesDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'demo-wall-removal-calc': { icon: 'wall-removal', render: opts => <AssemblyWallRemovalDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'demo-strip-out-calc': { icon: 'strip-out', render: opts => <AssemblyStripOutDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'demo-waste-skips-calc': { icon: 'waste-skips', render: opts => <AssemblyWasteDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'demo-external-calc': { icon: 'external-demo', render: opts => <AssemblyExternalDemoDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'wd-schedule': { icon: 'windows-doors', render: opts => <AssemblyWindowsDoorsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} planOpenings={opts?.planOpenings} /> },
  'join-kitchen-fit': { icon: 'kitchen-fit', render: opts => <AssemblyKitchenFitDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'join-stairs-calc': { icon: 'stairs', render: opts => <AssemblyStairsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'join-skirting-rooms': { icon: 'skirting', render: opts => <AssemblyTrimDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalName={opts?.externalName} /> },
  'tile-floor-rooms': { icon: 'tile-floor', render: opts => <AssemblyTileFloorDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} planRooms={opts?.planRooms} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalName={opts?.externalName} /> },
  'tile-wall-rooms': { icon: 'tile-wall', render: opts => <AssemblyTileWallDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalName={opts?.externalName} externalLengthMm={opts?.externalLengthMm} /> },
  'tile-prep-rooms': { icon: 'tile-prep', render: opts => <AssemblyTilePrepDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalLengthMm={opts?.externalLengthMm} externalName={opts?.externalName} drawnFor={opts?.prepScope} /> },
  'tile-ufh-electric': { icon: 'tile-ufh', render: opts => <AssemblyTileUfhDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalAreaM2={opts?.externalAreaM2} externalPerimeterM={opts?.externalPerimeterM} externalName={opts?.externalName} /> },
  'plaster-insul-wall': { icon: 'wall-insulation', render: opts => <AssemblyWallInsulationDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'plaster-render': { icon: 'render', render: opts => <AssemblyRenderDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'plaster-rooms': { icon: 'plaster-rooms', render: opts => <AssemblyPlasterRoomsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} planRooms={opts?.planRooms} /> },
  'deco-internal-walls': { icon: 'decoration', render: opts => <AssemblyDecorationDemo planRooms={opts?.planRooms} onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'elec-install': { icon: 'electrics', render: opts => <AssemblyElectricsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} roomsOnPlan={opts?.planRooms} planRooms={opts?.electrics?.planRooms} initialState={opts?.electrics?.initialState} /> },
  'ew-cav-full': { icon: 'cavity-wall', render: opts => <AssemblyCavityWallDemo insulationDefault="wool" planOpenings={opts?.wallOpenings} onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} initialHeightMm={opts?.initialHeightMm} noSampleOpenings={opts?.noSampleOpenings} /> },
}

/** Every calculator is drawn inside the rate-link provider, so its cost table can link a line to a Back Office product or plant item without each screen knowing about it. */
export const BUILT_ASSEMBLY_CANON_IDS: Record<string, BuiltAssemblyEntry> = Object.fromEntries(
  Object.entries(RAW_BUILT_ASSEMBLIES).map(([id, e]) => [id, { ...e, render: (opts?: AssemblyRenderOpts) => (
    <RateLinksProvider assemblyId={id} frozen={!!(opts?.calcState && opts.calcState.id === id) || !!opts?.electrics?.initialState}>
      <CalcScope assemblyId={id} initial={opts?.calcState} onSave={opts?.onSave}>{os => e.render({ ...opts, onSave: os as AssemblyRenderOpts['onSave'] })}</CalcScope>
    </RateLinksProvider>
  ) }]),
)

export function AssemblyIconGlyph({ icon, size = 24 }: { icon: AssemblyIcon; size?: number }) {
  switch (icon) {
    case 'stud-wall':
      // A framed stud wall in elevation — an outline with evenly-spaced vertical studs.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="20" height="18" rx="1" stroke="#7c3aed" strokeWidth="1.6" />
          <line x1="2" y1="3" x2="2" y2="21" stroke="#7c3aed" strokeWidth="1.6" />
          {[6.8, 11.6, 16.4].map(x => (
            <line key={x} x1={x} y1="3" x2={x} y2="21" stroke="#7c3aed" strokeWidth="1.6" />
          ))}
          <line x1="22" y1="3" x2="22" y2="21" stroke="#7c3aed" strokeWidth="1.6" />
        </svg>
      )
    case 'metal-stud-wall':
      // Same framed-wall outline as the timber icon, in steel blue to tell them apart at a glance.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="20" height="18" rx="1" stroke="#0891b2" strokeWidth="1.6" />
          <line x1="2" y1="3" x2="2" y2="21" stroke="#0891b2" strokeWidth="1.6" />
          {[6.8, 11.6, 16.4].map(x => (
            <line key={x} x1={x} y1="3" x2={x} y2="21" stroke="#0891b2" strokeWidth="1.6" />
          ))}
          <line x1="22" y1="3" x2="22" y2="21" stroke="#0891b2" strokeWidth="1.6" />
        </svg>
      )
    case 'strip-foundation':
      // A section through a strip foundation: ground line, the concrete in the bottom of the trench and the wall standing on it to the DPC.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="10" x2="22.5" y2="10" stroke="#78716c" strokeWidth="1.4" />
          <rect x="6" y="16" width="12" height="5" stroke="#57534e" strokeWidth="1.5" />
          <rect x="9.5" y="4" width="5" height="12" stroke="#57534e" strokeWidth="1.5" />
          <line x1="8" y1="4" x2="16" y2="4" stroke="#0f766e" strokeWidth="2" />
          <path d="M3 13 L3 21 M21 13 L21 21" stroke="#a8a29e" strokeWidth="1.2" />
        </svg>
      )
    case 'raft-foundation':
      // A raft in section: the ground line, hardcore beneath, and a slab with two layers of mesh and a thickened edge.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="8" x2="22.5" y2="8" stroke="#78716c" strokeWidth="1.4" />
          <path d="M3 8 L3 17 L21 17 L21 8" stroke="#57534e" strokeWidth="1.5" fill="none" />
          <rect x="3" y="8" width="18" height="5" stroke="#57534e" strokeWidth="1.5" />
          <line x1="5" y1="10" x2="19" y2="10" stroke="#b91c1c" strokeWidth="1" strokeDasharray="2 1.5" />
          <path d="M5 20 L19 20" stroke="#a8a29e" strokeWidth="2" />
        </svg>
      )
    case 'pad-foundation':
      // Two pads in section: a block of concrete in its pit with a column starter standing out of the top.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="8" x2="22.5" y2="8" stroke="#78716c" strokeWidth="1.4" />
          <rect x="3" y="9" width="7" height="9" stroke="#57534e" strokeWidth="1.5" />
          <rect x="14" y="9" width="7" height="9" stroke="#57534e" strokeWidth="1.5" />
          <line x1="6.5" y1="3" x2="6.5" y2="13" stroke="#0f766e" strokeWidth="1.8" />
          <line x1="17.5" y1="3" x2="17.5" y2="13" stroke="#0f766e" strokeWidth="1.8" />
        </svg>
      )
    case 'piled-foundation':
      // Piles going down from a reinforced ground beam: the ground line, the beam with its cage, and two piles below.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="7" x2="22.5" y2="7" stroke="#78716c" strokeWidth="1.4" />
          <rect x="2" y="5" width="20" height="5" stroke="#57534e" strokeWidth="1.5" />
          <line x1="4" y1="7.5" x2="20" y2="7.5" stroke="#b91c1c" strokeWidth="1" strokeDasharray="2 1.5" />
          <rect x="5" y="10" width="3" height="11" stroke="#57534e" strokeWidth="1.5" />
          <rect x="16" y="10" width="3" height="11" stroke="#57534e" strokeWidth="1.5" />
        </svg>
      )
    case 'electrics':
      // A double socket face plate with a switched light above it: a plate, two socket pin-holes and a rocker switch.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#ca8a04" strokeWidth="1.6" />
          <rect x="8" y="5.5" width="8" height="5" rx="1" stroke="#ca8a04" strokeWidth="1.3" />
          <circle cx="8.5" cy="16" r="2.6" stroke="#ca8a04" strokeWidth="1.3" />
          <circle cx="15.5" cy="16" r="2.6" stroke="#ca8a04" strokeWidth="1.3" />
          <line x1="8.5" y1="15" x2="8.5" y2="17" stroke="#ca8a04" strokeWidth="1.2" />
          <line x1="15.5" y1="15" x2="15.5" y2="17" stroke="#ca8a04" strokeWidth="1.2" />
        </svg>
      )
    case 'decoration':
      // A paint roller: the roller head, its frame and the handle.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="15" height="6" rx="1.5" stroke="#0891b2" strokeWidth="1.6" />
          <path d="M18 6h2.5v5.5H11v3" stroke="#0891b2" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="9.5" y="14.5" width="3" height="7" rx="1" stroke="#0891b2" strokeWidth="1.5" />
        </svg>
      )
    case 'wall-insulation':
      // A wall in section: the masonry, a layer of insulation on it and the board over it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="6" height="18" stroke="#78716c" strokeWidth="1.5" />
          <rect x="9" y="3" width="6" height="18" fill="#fef3c7" stroke="#a16207" strokeWidth="1.4" />
          <rect x="15" y="3" width="3" height="18" stroke="#0891b2" strokeWidth="1.5" />
          <path d="M10.5 6l3 2M10.5 10l3 2M10.5 14l3 2M10.5 18l3 1.5" stroke="#d97706" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )
    case 'render':
      // A wall with a trowel of render being spread across it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="1" stroke="#78716c" strokeWidth="1.5" />
          <path d="M3 9h12M3 15h18M9 3v6M15 9v6M9 15v6" stroke="#d6d3d1" strokeWidth="1" />
          <path d="M8 12l8-4 2 4-8 4z" fill="#fef3c7" stroke="#a16207" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'windows-doors':
      // A window and a door side by side in a wall: the window with its sill lines, the door with its swing.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="9" width="20" height="6" stroke="#78716c" strokeWidth="1.3" />
          <rect x="4" y="9" width="6" height="6" fill="#ffffff" stroke="#2b6cb0" strokeWidth="1.3" />
          <path d="M4 12h6" stroke="#2b6cb0" strokeWidth="1" />
          <path d="M14 15V6M14 6A9 9 0 0 1 21.5 11" stroke="#7c3aed" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'kitchen-fit':
      // A run of kitchen units seen from the front: base units under a worktop, wall units above.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="5" fill="#fef3c7" stroke="#a16207" strokeWidth="1.3" />
          <path d="M9 3v5M15 3v5" stroke="#a16207" strokeWidth="1" />
          <rect x="3" y="12" width="18" height="2" fill="#d6d3d1" stroke="#78716c" strokeWidth="1.2" />
          <rect x="3" y="14" width="18" height="7" fill="#fef3c7" stroke="#a16207" strokeWidth="1.3" />
          <path d="M9 14v7M15 14v7" stroke="#a16207" strokeWidth="1" />
        </svg>
      )
    case 'stairs':
      // A flight of stairs seen from the side: steps climbing to the right, with a handrail along the slope.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 21h4v-4h4v-4h4V9h4V5h2v16z" fill="#fef3c7" stroke="#a16207" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M5 13L18 3" stroke="#78716c" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'skirting':
      // A skirting board along the foot of a wall: the board with its moulded top edge, standing on the floor line.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 4v11" stroke="#d6d3d1" strokeWidth="1" />
          <path d="M3 21h18" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 15.5h18v5.5H3z" fill="#fef3c7" stroke="#a16207" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M3 17.3h18" stroke="#a16207" strokeWidth="1" />
        </svg>
      )
    case 'tile-floor':
      // A floor of tiles: a grid of square tiles with a joint between each.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {[3, 9, 15].flatMap(y => [3, 9, 15].map(x => <rect key={x + '-' + y} x={x} y={y} width="5.5" height="5.5" rx="0.6" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1.3" />))}
        </svg>
      )
    case 'tile-wall':
      // A wall of tiles laid in brick bond: rows of tiles, each row offset from the one below.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="1" stroke="#0f766e" strokeWidth="1.5" />
          <path d="M3 9h18M3 15h18M12 3v6M7.5 9v6M16.5 9v6M12 15v6" stroke="#0f766e" strokeWidth="1.2" />
        </svg>
      )
    case 'tile-prep':
      // Layers under a tile: backer board, a membrane line and the base.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="18" height="4.5" rx="0.8" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1.4" />
          <path d="M3 12c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" stroke="#0891b2" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="3" y="15.5" width="18" height="5" rx="0.8" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.4" />
        </svg>
      )
    case 'tile-ufh':
      // A heating mat: a wire snaking back and forth in a floor.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="#78716c" strokeWidth="1.4" />
          <path d="M6 7h12M18 7v4M18 11H6M6 11v4M6 15h12M18 15v2" stroke="#ea580c" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'plaster-rooms':
      // A plasterer's hawk with a trowel: the flat board and its handle, the trowel laid on it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="13" height="9" rx="1" stroke="#78716c" strokeWidth="1.6" />
          <path d="M9.5 13v8" stroke="#78716c" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14 19.5l7-6.5" stroke="#0891b2" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M6 8h7" stroke="#a8a29e" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'screed-floor':
      // A floor in section: the slab, a layer of insulation on it and the screed on top, with an edge strip against the wall.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="15" width="20" height="6" stroke="#78716c" strokeWidth="1.5" />
          <rect x="2" y="11.5" width="20" height="3.5" stroke="#b45309" strokeWidth="1.4" />
          <rect x="2" y="6" width="20" height="5.5" stroke="#0369a1" strokeWidth="1.5" />
          <line x1="2" y1="2.5" x2="2" y2="11.5" stroke="#57534e" strokeWidth="1.6" />
        </svg>
      )
    case 'floor-overlay':
      // An existing floor with a thin new layer poured over it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="13" width="20" height="8" stroke="#78716c" strokeWidth="1.5" />
          <rect x="2" y="9" width="20" height="4" stroke="#0891b2" strokeWidth="1.5" />
          <path d="M6 5.5c2 -2 4 2 6 0s4 2 6 0" stroke="#0891b2" strokeWidth="1.4" fill="none" />
        </svg>
      )
    case 'concrete-slab':
      // A slab in section: the ground, hardcore, the concrete slab with a line of mesh in it, and the edge strip against the wall.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="17" width="20" height="4" stroke="#a8a29e" strokeWidth="1.5" />
          <rect x="2" y="13.5" width="20" height="3.5" stroke="#78716c" strokeWidth="1.4" />
          <rect x="2" y="6" width="20" height="7.5" stroke="#475569" strokeWidth="1.6" />
          <line x1="5" y1="9.8" x2="19" y2="9.8" stroke="#b91c1c" strokeWidth="1.2" strokeDasharray="2 1.5" />
          <line x1="2" y1="2.5" x2="2" y2="13.5" stroke="#57534e" strokeWidth="1.6" />
        </svg>
      )
    case 'block-beam':
      // Beams with blocks between them, over a void, with a layer of insulation on top.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="5" width="20" height="3.5" stroke="#d97706" strokeWidth="1.4" />
          <rect x="2" y="8.5" width="20" height="4" stroke="#64748b" strokeWidth="1.5" />
          <path d="M5 12.5v4M12 12.5v4M19 12.5v4" stroke="#334155" strokeWidth="2.2" />
          <line x1="2" y1="21" x2="22" y2="21" stroke="#a8a29e" strokeWidth="1.6" />
        </svg>
      )
    case 'timber-floor':
      // Joists in section with decking on top and insulation between them.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="5" width="20" height="2.5" stroke="#b45309" strokeWidth="1.4" />
          <path d="M5 7.5v10M10 7.5v10M15 7.5v10M20 7.5v10" stroke="#92400e" strokeWidth="2.2" />
          <path d="M6.5 10.5h2M11.5 10.5h2M16.5 10.5h2" stroke="#ca8a04" strokeWidth="2" />
          <line x1="2" y1="21" x2="22" y2="21" stroke="#a8a29e" strokeWidth="1.6" />
        </svg>
      )
    case 'insulated-concrete':
      // A slab on a thick layer of insulation, over the ground.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="18" width="20" height="3" stroke="#a8a29e" strokeWidth="1.5" />
          <rect x="2" y="11" width="20" height="7" stroke="#ca8a04" strokeWidth="1.5" />
          <path d="M5 14.5h2M9 14.5h2M13 14.5h2M17 14.5h2" stroke="#ca8a04" strokeWidth="1.5" />
          <rect x="2" y="5" width="20" height="6" stroke="#475569" strokeWidth="1.6" />
          <line x1="2" y1="2.5" x2="2" y2="11" stroke="#57534e" strokeWidth="1.6" />
        </svg>
      )
    case 'plumbing':
      // A tap over a basin, with a pipe run.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3v3.5h6.5a3 3 0 0 1 3 3V11" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="13.2" y="11" width="4.6" height="2.2" rx="0.8" stroke="#0891b2" strokeWidth="1.5" />
          <path d="M15.5 14.5v1.5" stroke="#0891b2" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M4 21h16M6 21l1-4.5h10l1 4.5" stroke="#64748b" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    case 'heating':
      // A boiler with a flame, and a pipe leaving it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="3" width="12" height="15" rx="2" stroke="#dc2626" strokeWidth="1.6" />
          <path d="M10 15c-2 0 -3 -1.5 -3 -3 0 -1.6 1.4 -2.2 1.6 -4 1.4 .9 2.4 2.2 2.4 3.4.4 -.3.7 -.8.8 -1.4 .8 .8 1.2 1.7 1.2 2.6 0 1.4 -1.1 2.4 -3 2.4z" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M16 8h4v10" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 21h6" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'ufh':
      // A floor in section with a looping pipe in it and heat rising.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="12" width="20" height="8" stroke="#78716c" strokeWidth="1.5" />
          <path d="M4 16h3a1.5 1.5 0 0 0 0-3h2.5a1.5 1.5 0 0 1 0 3H12a1.5 1.5 0 0 0 0-3h2.5a1.5 1.5 0 0 1 0 3H17a1.5 1.5 0 0 0 0-3h3" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7 9c0-1.5 1.2-1.5 1.2-3M12 9c0-1.5 1.2-1.5 1.2-3M17 9c0-1.5 1.2-1.5 1.2-3" stroke="#ea580c" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'pipework':
      // Two pipes with an elbow and a tee.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 8h10a3 3 0 0 1 3 3v9" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 15h5M12 15h0" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 11h5" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="1.5" y="6" width="2" height="4" rx="0.6" stroke="#64748b" strokeWidth="1.1" />
        </svg>
      )
    case 'drainage':
      // A drain pipe in a trench with an inspection chamber.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 7h20" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 7v11h18V7" stroke="#a8a29e" strokeWidth="1.4" strokeLinejoin="round" />
          <rect x="3.5" y="13" width="17" height="3.4" rx="1.7" stroke="#92400e" strokeWidth="1.5" />
          <rect x="9.5" y="7" width="5" height="6" stroke="#64748b" strokeWidth="1.4" />
          <path d="M9 7h6" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'soakaway':
      // A raindrop falling on a buried tank, with water seeping out of its base.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.5c2 2.7 3 4.2 3 5.7a3 3 0 0 1-6 0c0-1.5 1-3 3-5.7z" stroke="#0369a1" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M2 11h20" stroke="#78716c" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="5.5" y="13" width="13" height="6" rx="1" stroke="#0369a1" strokeWidth="1.5" />
          <path d="M8 21v1.5M12 21v1.5M16 21v1.5" stroke="#0369a1" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'services':
      // A trench with three service pipes in it: water, gas and a cable duct.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 6h20" stroke="#78716c" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 6v13h16V6" stroke="#a8a29e" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="8" cy="14" r="2.2" stroke="#2563eb" strokeWidth="1.5" />
          <circle cx="12.5" cy="14" r="2.2" stroke="#ca8a04" strokeWidth="1.5" />
          <circle cx="17" cy="14" r="2.2" stroke="#dc2626" strokeWidth="1.5" />
          <path d="M5 9.5h14" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </svg>
      )
    case 'wall-removal':
      // A wall with an opening knocked through and a steel beam over it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="20" height="18" stroke="#78716c" strokeWidth="1.5" />
          <rect x="7" y="8" width="10" height="13" stroke="#dc2626" strokeWidth="1.4" strokeDasharray="2.5 2" />
          <rect x="5.5" y="5" width="13" height="3" stroke="#475569" strokeWidth="1.6" />
          <path d="M3 21h18" stroke="#78716c" strokeWidth="1.4" />
        </svg>
      )
    case 'strip-out':
      // A room with its floor and wall finishes being stripped back.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="18" height="16" stroke="#78716c" strokeWidth="1.5" />
          <path d="M3 15h18" stroke="#78716c" strokeWidth="1.3" />
          <path d="M6 15l2-4M10 15l2-5M15 15l2-4" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M7 8h4M14 8h3" stroke="#a8a29e" strokeWidth="1.4" strokeDasharray="2 2" />
        </svg>
      )
    case 'waste-skips':
      // A skip.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 8h20l-3 11H5L2 8z" stroke="#b45309" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M6 8l1.5-3h9L18 8" stroke="#78716c" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 12l1 4M12 12v4M16 12l-1 4" stroke="#b45309" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'external-demo':
      // A small building with its roof coming off.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="11" width="16" height="9" stroke="#78716c" strokeWidth="1.5" />
          <path d="M3 11l5-5M21 11l-5-5" stroke="#a16207" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M10 5l2-2 2 2" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="9.5" y="14" width="5" height="6" stroke="#78716c" strokeWidth="1.3" />
        </svg>
      )
    case 'underpinning':
      // A wall on its old footing with new concrete pinned underneath it in bays, the two pins either side of a gap.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="6" x2="22.5" y2="6" stroke="#78716c" strokeWidth="1.4" />
          <rect x="8" y="1.5" width="8" height="7" stroke="#57534e" strokeWidth="1.5" />
          <rect x="5" y="8.5" width="14" height="3" stroke="#57534e" strokeWidth="1.5" />
          <rect x="5" y="12" width="4.5" height="9" stroke="#57534e" strokeWidth="1.5" />
          <rect x="14.5" y="12" width="4.5" height="9" stroke="#57534e" strokeWidth="1.5" />
        </svg>
      )
    case 'block-wall':
      // A running-bond block course pattern — staggered horizontal joints, not vertical
      // studs, so it reads as masonry rather than a framed wall at a glance.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="20" height="18" rx="1" stroke="#b45309" strokeWidth="1.6" />
          <line x1="2" y1="9" x2="22" y2="9" stroke="#b45309" strokeWidth="1.4" />
          <line x1="2" y1="15" x2="22" y2="15" stroke="#b45309" strokeWidth="1.4" />
          <line x1="12" y1="3" x2="12" y2="9" stroke="#b45309" strokeWidth="1.4" />
          <line x1="7" y1="9" x2="7" y2="15" stroke="#b45309" strokeWidth="1.4" />
          <line x1="17" y1="9" x2="17" y2="15" stroke="#b45309" strokeWidth="1.4" />
          <line x1="12" y1="15" x2="12" y2="21" stroke="#b45309" strokeWidth="1.4" />
        </svg>
      )
    case 'flat-roof':
      // A roof in section: the covering line on top, the deck and joists beneath it, and a lantern
      // standing on a kerb — blue, so a roof reads apart from the walls at a glance.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1.5" y1="9" x2="22.5" y2="9" stroke="#0369a1" strokeWidth="1.8" />
          <rect x="1.5" y="9" width="21" height="2.5" stroke="#0369a1" strokeWidth="1.3" />
          {[4.5, 9, 13.5, 18.5].map(x => (
            <rect key={x} x={x} y="11.5" width="2" height="8" stroke="#0369a1" strokeWidth="1.3" />
          ))}
          <path d="M8 9 L10 4.5 L14 4.5 L16 9" stroke="#0369a1" strokeWidth="1.4" fill="none" />
          <line x1="12" y1="4.5" x2="12" y2="9" stroke="#0369a1" strokeWidth="1" />
        </svg>
      )
    case 'roof-covering':
      // Layers of a roof covering laid over a deck, with a trim at the edge — blue, like the flat roof.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 8.5 L20 8.5 L22 6.5" stroke="#0369a1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="2" y="8.5" width="18" height="3" stroke="#0369a1" strokeWidth="1.4" />
          <rect x="2" y="11.5" width="18" height="3" stroke="#0369a1" strokeWidth="1.4" />
          <line x1="2" y1="19" x2="20" y2="19" stroke="#0369a1" strokeWidth="1.4" strokeDasharray="2.5 2" />
          <line x1="2" y1="16.5" x2="20" y2="16.5" stroke="#0369a1" strokeWidth="1.4" />
        </svg>
      )
    case 'gutters':
      // A gutter trough along an eaves line with a downpipe dropping from it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 5 L2 8 Q2 10 4 10 L14 10 Q16 10 16 8 L16 5" stroke="#0369a1" strokeWidth="1.6" fill="none" />
          <line x1="2" y1="5" x2="16" y2="5" stroke="#0369a1" strokeWidth="1.4" />
          <rect x="17" y="8" width="3" height="13" stroke="#0369a1" strokeWidth="1.5" />
          <line x1="14.5" y1="10" x2="18" y2="10" stroke="#0369a1" strokeWidth="1.4" />
        </svg>
      )
    case 'rooflights':
      // A pitched glazed lantern sat in an opening — blue, like the other roof icons, distinguished by shape.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10 L12 4 L20 10 Z" stroke="#0369a1" strokeWidth="1.6" strokeLinejoin="round" />
          <line x1="12" y1="4" x2="12" y2="10" stroke="#0369a1" strokeWidth="1.2" />
          <line x1="8" y1="7" x2="8" y2="10" stroke="#0369a1" strokeWidth="1" />
          <line x1="16" y1="7" x2="16" y2="10" stroke="#0369a1" strokeWidth="1" />
          <rect x="4" y="10" width="16" height="9" stroke="#0369a1" strokeWidth="1.6" />
        </svg>
      )
    case 'fascia-soffit':
      // A fascia and soffit boxing in an eaves, with a barge board angled up the verge beside it.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 14 L10 4 L18 14" stroke="#b45309" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
          <rect x="9" y="14" width="14" height="3" fill="#0f766e" />
          <rect x="9" y="17" width="14" height="4" stroke="#0f766e" strokeWidth="1.4" />
        </svg>
      )
    case 'parapet-wall':
      // A wall standing above a roof line, with its coping stone on top and the tray at the roof — brown, like the masonry walls.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="2.5" width="12" height="3" stroke="#b45309" strokeWidth="1.6" />
          <rect x="8" y="5.5" width="8" height="9" stroke="#b45309" strokeWidth="1.6" />
          <line x1="8" y1="10" x2="16" y2="10" stroke="#b45309" strokeWidth="1.2" />
          <line x1="1.5" y1="14.5" x2="22.5" y2="14.5" stroke="#0f766e" strokeWidth="1.8" />
          <rect x="8" y="14.5" width="8" height="6" stroke="#b45309" strokeWidth="1.6" />
        </svg>
      )
    case 'sleeper-wall':
      // A low wall on its footing with a hole through it, and the ends of two beams resting on top —
      // teal, apart from the dwarf wall's brown, so a floor-support wall reads differently.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="9.5" height="3.5" stroke="#0e7490" strokeWidth="1.5" />
          <rect x="12.5" y="4" width="9.5" height="3.5" stroke="#0e7490" strokeWidth="1.5" />
          <rect x="6" y="7.5" width="12" height="8" stroke="#0e7490" strokeWidth="1.6" />
          <circle cx="12" cy="11.5" r="1.9" stroke="#0e7490" strokeWidth="1.3" />
          <rect x="3" y="15.5" width="18" height="4.5" stroke="#0e7490" strokeWidth="1.6" />
        </svg>
      )
    case 'dwarf-wall':
      // A short wall on its foundation, in section — the wall above ground level (dashed) sitting
      // on blockwork and a wider concrete footing, so it reads apart from the taller walls.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="4" width="8" height="8" stroke="#a16207" strokeWidth="1.6" />
          <line x1="8" y1="8" x2="16" y2="8" stroke="#a16207" strokeWidth="1.2" />
          <line x1="1" y1="12" x2="23" y2="12" stroke="#a16207" strokeWidth="1.4" strokeDasharray="2.5 1.8" />
          <rect x="8" y="12" width="8" height="5" stroke="#a16207" strokeWidth="1.6" />
          <rect x="4" y="17" width="16" height="4" stroke="#a16207" strokeWidth="1.6" />
        </svg>
      )
    case 'timber-frame-wall':
      // A wall in section, green to match the garden room — cladding boards on the outside,
      // studs with insulation between, lining inside — distinct from the stud partition's frame.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="3" height="18" stroke="#15803d" strokeWidth="1.6" />
          <rect x="5" y="3" width="13" height="18" stroke="#15803d" strokeWidth="1.6" />
          <line x1="7.5" y1="3" x2="7.5" y2="21" stroke="#15803d" strokeWidth="1.2" />
          <line x1="12" y1="3" x2="12" y2="21" stroke="#15803d" strokeWidth="1.2" strokeDasharray="2 1.5" />
          <line x1="16" y1="3" x2="16" y2="21" stroke="#15803d" strokeWidth="1.2" />
          <rect x="18" y="3" width="4" height="18" stroke="#15803d" strokeWidth="1.6" />
        </svg>
      )
    case 'cavity-wall':
      // A wall in section — inner leaf, the insulated cavity between (dashed), outer leaf —
      // so a cavity wall reads differently from a solid block wall at a glance.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="6" height="18" stroke="#b45309" strokeWidth="1.6" />
          <rect x="16" y="3" width="6" height="18" stroke="#b45309" strokeWidth="1.6" />
          <line x1="8" y1="8" x2="16" y2="8" stroke="#0d9488" strokeWidth="1.4" strokeDasharray="2 1.5" />
          <line x1="8" y1="16" x2="16" y2="16" stroke="#0d9488" strokeWidth="1.4" strokeDasharray="2 1.5" />
        </svg>
      )
  }
}
