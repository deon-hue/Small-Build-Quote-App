'use client'

/**
 * Assembly Calculator — Roof Structure (Roof → Roof Structure).
 *
 * The roof's structure only: for a flat roof its joists, ledger and wall plates, trimmers, firrings, deck and
 * rooflight kerbs. The roof type is chosen here; each type designs its own structure. Flat roofs are built;
 * mono-pitch (lean-to), gable and hip roofs are the next to come, each with its own calculator behind this
 * same drop-down. The covering, the gutters and the parapet wall are separate calculators.
 */

import React, { useState } from 'react'
import AssemblyFlatRoofDemo from '@/components/AssemblyFlatRoofDemo'
import type { CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput } from '@/components/assembly-ui'

export type RoofStructureType = 'flat' | 'mono' | 'gable' | 'hip'

const ROOF_TYPES: { id: RoofStructureType; label: string; built: boolean }[] = [
  { id: 'flat',  label: 'Flat roof', built: true },
  { id: 'mono',  label: 'Mono-pitch / lean-to roof (coming next)', built: false },
  { id: 'gable', label: 'Pitched roof — gable ends (coming next)', built: false },
  { id: 'hip',   label: 'Pitched roof — hipped (coming next)', built: false },
]

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  externalWidthMm?: number
  buildUpDefault?: 'warm' | 'cold'
}

export default function AssemblyRoofStructureDemo(props: Props) {
  const [type, setType] = useState<RoofStructureType>('flat')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Roof type</label>
        <select value={type} onChange={e => setType(e.target.value as RoofStructureType)} style={{ ...propInput, width: 'auto', minWidth: 260 }}>
          {ROOF_TYPES.map(t => <option key={t.id} value={t.id} disabled={!t.built}>{t.label}</option>)}
        </select>
      </div>
      {type === 'flat' && <AssemblyFlatRoofDemo part="structure" {...props} />}
    </div>
  )
}
