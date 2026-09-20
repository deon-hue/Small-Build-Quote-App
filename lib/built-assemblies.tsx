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
import type { CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'

export type AssemblyIcon = 'stud-wall' | 'metal-stud-wall' | 'block-wall' | 'cavity-wall' | 'timber-frame-wall' | 'dwarf-wall' | 'sleeper-wall'

/** Fired when a calculator's "Save & Price" is used from inside a real quote — absent in
 * the Back Office preview context, which has no quote to save into. */
export interface AssemblySaveResult { name: string; qty: number; location: string; description: string; lines: CostedLine[] }

export interface AssemblyRenderOpts {
  onSave?: (result: AssemblySaveResult) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's traced line length (mm) — live-syncs into the calculator's own length field.
   * Absent everywhere else (Back Office preview, QuoteWorkspace), which have no drawn line. */
  externalLengthMm?: number
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
