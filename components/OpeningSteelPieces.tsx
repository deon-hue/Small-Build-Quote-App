'use client'

/**
 * Pieces shared by the calculators that put steel over an opening (Structural Openings, Windows and Doors): the one-line summary of an opening's steel with the button that opens the steel pop-up, and the whole-bar
 * stock lengths with the cutting list. The steel itself is set up in components/WallSteelFields.tsx inside components/WallSteelModal.tsx and priced by lib/wall-steel.ts.
 */

import React from 'react'
import { miniInput } from '@/components/assembly-ui'
import type { CuttingGroup } from '@/lib/structural-steel-units'

export const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SteelSummaryRow({ words, kg, cost, onOpen }: { words: string; kg?: number; cost?: number; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}>
      <span style={{ fontSize: 11.5, color: '#334155', flex: '1 1 220px', lineHeight: 1.45 }}>
        <b>Steel:</b> {words || 'none set up yet'}{kg ? ` · ${kg}kg` : ''}{cost ? ` · ${money(cost)}` : ''}
      </span>
      <button type="button" data-open-opening-steel onClick={onOpen} style={{ ...miniInput, width: 'auto', cursor: 'pointer', padding: '5px 14px', background: '#eff6ff', borderColor: '#bfdbfe', fontWeight: 600 }}>Set up the steel…</button>
    </div>
  )
}

export interface SteelStockState { on: boolean; bars: string; offcutPct: number }
export const NO_STOCK: SteelStockState = { on: false, bars: '6100, 9100, 12200', offcutPct: 100 }

export function StockBarsFields({ stock, onChange, cutting }: { stock: SteelStockState; onChange: (s: SteelStockState) => void; cutting: CuttingGroup[] }) {
  return (
    <div style={{ fontSize: 11.5, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', marginTop: 6, lineHeight: 1.5 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={stock.on} onChange={e => onChange({ ...stock, on: e.target.checked })} style={{ width: 'auto' }} />
        Buy the steel in stock lengths (cuts of the same section share bars across these openings, and the offcut is paid for)
      </label>
      {stock.on && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>BAR LENGTHS (MM)</span>
          <input value={stock.bars} onChange={e => onChange({ ...stock, bars: e.target.value })} style={{ ...miniInput, width: 150 }} />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>OFFCUT CHARGED (%)</span>
          <input type="number" min={0} max={100} value={stock.offcutPct} onChange={e => onChange({ ...stock, offcutPct: Math.min(100, Math.max(0, +e.target.value || 0)) })} style={{ ...miniInput, width: 60 }} />
        </div>
      )}
      {stock.on && cutting.map(g => (
        <div key={g.section} style={{ marginTop: 4 }}>
          <b>{g.section}</b>: {g.bars.length === 0 ? 'nothing to order from stock' : `${g.bars.length} bar${g.bars.length === 1 ? '' : 's'} (${g.bars.map(b => (b.lengthMm / 1000).toFixed(2) + 'm').join(', ')}), ${(g.cutMm / 1000).toFixed(2)}m cut, ${(g.offcutMm / 1000).toFixed(2)}m left over${g.offcutCost > 0 ? `, ${money(g.offcutCost)} charged` : ''}`}
          {g.tooLong.length > 0 && <span style={{ color: '#b45309' }}> {g.tooLong.map(c => (c / 1000).toFixed(2) + 'm').join(', ')} is longer than the longest bar: priced by cut length (needs a splice).</span>}
        </div>
      ))}
    </div>
  )
}
