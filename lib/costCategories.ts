// Shared cost-category config used across EstimatorBreakdown, Back Office, Quote Builder, etc.
// Single source of truth for icons, colours, and labels.

import {
  HardHat,    // Labour — construction worker / tradesperson
  Package,    // Materials
  Tractor,    // Plant Hire — digger / machinery
  Users,      // Subcontractors — external team / specialist
  ClipboardList, // Other — fees / provisional sums
  type LucideIcon,
} from 'lucide-react'

export interface CostCategory {
  id: 'labour' | 'materials' | 'plant' | 'sub' | 'other'
  label: string
  shortLabel: string
  Icon: LucideIcon
  color: string        // text colour (dark)
  bg: string           // chip background
  border: string       // chip border
  bar: string          // progress-bar / accent colour
}

export const COST_CATEGORIES: CostCategory[] = [
  {
    id: 'labour',
    label: 'Labour',
    shortLabel: 'Lab',
    Icon: HardHat,
    color: '#1e40af',
    bg: 'rgba(59,130,246,0.09)',
    border: 'rgba(59,130,246,0.22)',
    bar: '#3b82f6',
  },
  {
    id: 'materials',
    label: 'Materials',
    shortLabel: 'Mat',
    Icon: Package,
    color: '#92400e',
    bg: 'rgba(245,158,11,0.09)',
    border: 'rgba(245,158,11,0.28)',
    bar: '#f59e0b',
  },
  {
    id: 'plant',
    label: 'Plant',
    shortLabel: 'Plant',
    Icon: Tractor,
    color: '#166534',
    bg: 'rgba(34,197,94,0.09)',
    border: 'rgba(34,197,94,0.25)',
    bar: '#22c55e',
  },
  {
    id: 'sub',
    label: 'Subcontractors',
    shortLabel: 'Sub',
    Icon: Users,
    color: '#4c1d95',
    bg: 'rgba(139,92,246,0.09)',
    border: 'rgba(139,92,246,0.25)',
    bar: '#8b5cf6',
  },
  {
    id: 'other',
    label: 'Other',
    shortLabel: 'Other',
    Icon: ClipboardList,
    color: '#374151',
    bg: 'rgba(107,117,128,0.09)',
    border: 'rgba(107,117,128,0.22)',
    bar: '#6b7280',
  },
]

/** Look up a category by its id — returns undefined if not found. */
export function getCostCategory(id: CostCategory['id']): CostCategory | undefined {
  return COST_CATEGORIES.find(c => c.id === id)
}
