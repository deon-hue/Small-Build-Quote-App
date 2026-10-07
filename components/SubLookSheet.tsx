'use client'

// "Your look": a sheet that slides up from the bottom of the subcontractor's screen. They pick one of four tile styles and a text size (saved on
// their phone), and can sign out from here.

import { X, LogOut, Check } from 'lucide-react'
import { LOOK_STYLES, type LookStyle } from '@/lib/sub-look'
import { SUB_TILES, tileStyle } from '@/components/SubHomeTiles'
import { useSubLook } from '@/contexts/SubLookContext'

function MiniTiles({ style }: { style: LookStyle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
      {SUB_TILES.slice(0, 3).map((t, i) => {
        const s = tileStyle(style, i === 0, t.colour)
        const box: React.CSSProperties = { ...s.box, width: Math.round(Number(s.box.width) * 0.55), height: Math.round(Number(s.box.height) * 0.55), display: 'flex', alignItems: 'center', justifyContent: 'center' }
        return (
          <div key={t.key} style={{ ...s.tile, borderRadius: 10, padding: '8px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
            <span style={box}><t.Icon size={Math.round(s.iconSize * 0.55)} strokeWidth={style === 'line' ? 1.8 : 2} /></span>
          </div>
        )
      })}
    </div>
  )
}

export default function SubLookSheet({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const { look, setLook } = useSubLook()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div role="dialog" aria-label="Your look" onClick={e => e.stopPropagation()}
        style={{ background: '#f1f3f5', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', borderRadius: '22px 22px 0 0', padding: '18px 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#1e2022' }}>Your look</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#e2e6ea', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1e2022' }}><X size={20} /></button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#5b6570', margin: '0 0 8px' }}>Tile style</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LOOK_STYLES.map(s => {
            const on = look.style === s.key
            return (
              <button key={s.key} type="button" onClick={() => setLook({ style: s.key })} aria-pressed={on}
                style={{ textAlign: 'left', background: '#fff', border: `2px solid ${on ? '#7ab533' : 'transparent'}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 16, fontWeight: 600, color: '#1e2022' }}>
                  {s.name}{on && <span style={{ color: '#3e6b12', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}><Check size={18} />Chosen</span>}
                </div>
                <MiniTiles style={s.key} />
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#5b6570', margin: '18px 0 8px' }}>Text size</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([['normal', 'Normal', 16], ['large', 'Large', 20]] as const).map(([k, label, px]) => {
            const on = look.size === k
            return (
              <button key={k} type="button" onClick={() => setLook({ size: k })} aria-pressed={on}
                style={{ background: '#fff', border: `2px solid ${on ? '#7ab533' : 'transparent'}`, borderRadius: 14, padding: '14px 10px', fontSize: px, fontWeight: 600, color: '#1e2022', cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            )
          })}
        </div>

        <button type="button" onClick={onSignOut}
          style={{ width: '100%', marginTop: 22, padding: '14px', background: '#fff', border: '1px solid #d9dee3', borderRadius: 14, fontSize: 16, fontWeight: 600, color: '#1e2022', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LogOut size={20} />Sign out
        </button>
      </div>
    </div>
  )
}
