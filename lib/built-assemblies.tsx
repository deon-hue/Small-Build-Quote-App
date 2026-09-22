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
import AssemblyTimberFrameWallDemo from '@/components/AssemblyTimberFrameWallDemo'
import AssemblyDwarfWallDemo from '@/components/AssemblyDwarfWallDemo'
import AssemblySleeperWallDemo from '@/components/AssemblySleeperWallDemo'
import AssemblyFlatRoofDemo from '@/components/AssemblyFlatRoofDemo'
import AssemblyParapetWallDemo from '@/components/AssemblyParapetWallDemo'
import AssemblyRoofStructureDemo from '@/components/AssemblyRoofStructureDemo'
import AssemblyRoofCoveringDemo from '@/components/AssemblyRoofCoveringDemo'
import AssemblyRooflightsDemo from '@/components/AssemblyRooflightsDemo'
import AssemblyFasciaSoffitDemo from '@/components/AssemblyFasciaSoffitDemo'
import type { CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'

export type AssemblyIcon = 'stud-wall' | 'metal-stud-wall' | 'block-wall' | 'cavity-wall' | 'timber-frame-wall' | 'dwarf-wall' | 'sleeper-wall' | 'flat-roof' | 'parapet-wall' | 'roof-covering' | 'gutters' | 'rooflights' | 'fascia-soffit'

/** Fired when a calculator's "Save & Price" is used from inside a real quote — absent in
 * the Back Office preview context, which has no quote to save into. */
// `description` is the short line for the quote; `detail` (only some calculators write one) is the full
// part-by-part "What's included" text kept as the phase's `scopeDetail`.
export interface AssemblySaveResult { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }

export interface AssemblyRenderOpts {
  onSave?: (result: AssemblySaveResult) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's traced line length (mm) — live-syncs into the calculator's own length field.
   * Absent everywhere else (Back Office preview, QuoteWorkspace), which have no drawn line. */
  externalLengthMm?: number
  /** A roof's drawn width (the shorter side) — the joists span it. Only roofs use it; walls have no width. */
  externalWidthMm?: number
  /** Which variant the calculator opens on, where it has more than one — the flat roof's warm/cold,
   * taken from the Take-off Build-Up Type. Ignored by calculators that have no variants. */
  variant?: string
}

export const BUILT_ASSEMBLY_CANON_IDS: Record<string, {
  icon: AssemblyIcon
  render: (opts?: AssemblyRenderOpts) => React.ReactNode
}> = {
  'iw-stud-partition': { icon: 'stud-wall', render: opts => <AssemblyWallDemo system="timber" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'iw-metal-stud': { icon: 'metal-stud-wall', render: opts => <AssemblyWallDemo system="metal" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'iw-block-masonry': { icon: 'block-wall', render: opts => <AssemblyMasonryWallDemo context="partition" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-blockwork-100': { icon: 'block-wall', render: opts => <AssemblyMasonryWallDemo context="external-wall" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-blockwork-215': { icon: 'block-wall', render: opts => <AssemblySolidBlockWallDemo laidDefault="flat" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-garden-room-timber': { icon: 'timber-frame-wall', render: opts => <AssemblyTimberFrameWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-dwarf-wall': { icon: 'dwarf-wall', render: opts => <AssemblyDwarfWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-sleeper-wall': { icon: 'sleeper-wall', render: opts => <AssemblySleeperWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-parapet-wall': { icon: 'parapet-wall', render: opts => <AssemblyParapetWallDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'roof-structure': { icon: 'flat-roof', render: opts => <AssemblyRoofStructureDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'roof-covering': { icon: 'roof-covering', render: opts => <AssemblyRoofCoveringDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'roof-rainwater': { icon: 'gutters', render: opts => <AssemblyFlatRoofDemo part="gutters" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} /> },
  'roof-rooflights': { icon: 'rooflights', render: opts => <AssemblyRooflightsDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} /> },
  'roof-fascia-soffit': { icon: 'fascia-soffit', render: opts => <AssemblyFasciaSoffitDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} /> },
  'roof-flat': { icon: 'flat-roof', render: opts => <AssemblyFlatRoofDemo onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} externalWidthMm={opts?.externalWidthMm} buildUpDefault={opts?.variant === 'cold' ? 'cold' : 'warm'} /> },
  'ew-cav-partial': { icon: 'cavity-wall', render: opts => <AssemblyCavityWallDemo insulationDefault="pir" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
  'ew-cav-full': { icon: 'cavity-wall', render: opts => <AssemblyCavityWallDemo insulationDefault="wool" onSave={opts?.onSave} labourTrades={opts?.labourTrades} externalLengthMm={opts?.externalLengthMm} /> },
}

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
