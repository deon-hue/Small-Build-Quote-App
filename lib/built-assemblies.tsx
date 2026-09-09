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
import type { CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'

export type AssemblyIcon = 'stud-wall' | 'metal-stud-wall' | 'block-wall'

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
  }
}
