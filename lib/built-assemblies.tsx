// Shared registry of which Back Office sub-phases (by canonical_id — stable across renames)
// have a real, working assembly calculator today. Used by three places that all need to
// agree on the same answer:
//   - app/(app)/back-office/components/SectionAssemblies.tsx (renders the built card)
//   - app/(app)/back-office/components/SectionPhasesTasks.tsx (locks editing there instead)
//   - components/QuoteWorkspace.tsx (shows a button to open the calculator from a quote)

import AssemblyWallDemo from '@/components/AssemblyWallDemo'
import type { CostedLine } from '@/lib/assembly-calc'

export type AssemblyIcon = 'stud-wall'

/** Fired when a calculator's "Save & Price" is used from inside a real quote — absent in
 * the Back Office preview context, which has no quote to save into. */
export interface AssemblySaveResult { name: string; qty: number; lines: CostedLine[] }

export const BUILT_ASSEMBLY_CANON_IDS: Record<string, {
  icon: AssemblyIcon
  render: (opts?: { onSave?: (result: AssemblySaveResult) => void }) => React.ReactNode
}> = {
  'iw-stud-partition': { icon: 'stud-wall', render: opts => <AssemblyWallDemo onSave={opts?.onSave} /> },
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
  }
}
