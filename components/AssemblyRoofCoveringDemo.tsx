'use client'

/**
 * Assembly Calculator — Roof Coverings (Roof → Roof Coverings).
 *
 * The roof's insulation and covering. Flat roof coverings are built — GRP (Cure It), EPDM and single-ply, with
 * their trims, edgings and accessories worked out from the roof's edges. Pitched roof coverings (tiles and slate
 * with their battens, felt, ridge, hips and verges) are next, behind this same drop-down. The structure, the
 * gutters and the parapet wall are separate calculators.
 */

import React, { useState } from 'react'
import AssemblyFlatRoofDemo from '@/components/AssemblyFlatRoofDemo'
import type { CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput } from '@/components/assembly-ui'

export type RoofCoveringFamily = 'flat' | 'pitched'

const FAMILIES: { id: RoofCoveringFamily; label: string; built: boolean }[] = [
  { id: 'flat',    label: 'Flat roof covering — GRP, EPDM, single-ply', built: true },
  { id: 'pitched', label: 'Pitched roof covering — tiles and slate (coming next)', built: false },
]

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  externalWidthMm?: number
  buildUpDefault?: 'warm' | 'cold'
}

export default function AssemblyRoofCoveringDemo(props: Props) {
  const [family, setFamily] = useState<RoofCoveringFamily>('flat')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Covering for</label>
        <select value={family} onChange={e => setFamily(e.target.value as RoofCoveringFamily)} style={{ ...propInput, width: 'auto', minWidth: 300 }}>
          {FAMILIES.map(f => <option key={f.id} value={f.id} disabled={!f.built}>{f.label}</option>)}
        </select>
      </div>
      {family === 'flat' && <AssemblyFlatRoofDemo part="covering" {...props} />}
    </div>
  )
}
