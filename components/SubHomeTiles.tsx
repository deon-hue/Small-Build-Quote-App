'use client'

// The big app-style tiles on the subcontractor portal's home screen (Add my time, Job notes, Schedule, Company calendar, Timesheets, Payments),
// in the style the subcontractor has chosen. A plain display component used by BOTH the real portal and the builder's preview of it.

import type { LucideIcon } from 'lucide-react'
import { ClockPlus, Camera, CalendarDays, CalendarRange, ClipboardList, PoundSterling } from 'lucide-react'
import type { LookStyle } from '@/lib/sub-look'

export type SubTileKey = 'time' | 'notes' | 'schedule' | 'calendar' | 'timesheets' | 'payments'

interface TileDef { key: SubTileKey; label: string; Icon: LucideIcon; colour: string }

export const SUB_TILES: TileDef[] = [
  { key: 'time',       label: 'Add my time',      Icon: ClockPlus,     colour: '#7ab533' },
  { key: 'notes',      label: 'Job notes',        Icon: Camera,        colour: '#3b82c4' },
  { key: 'schedule',   label: 'Schedule',         Icon: CalendarDays,  colour: '#d9822b' },
  { key: 'calendar',   label: 'Company calendar', Icon: CalendarRange, colour: '#7c5cc4' },
  { key: 'timesheets', label: 'Timesheets',       Icon: ClipboardList, colour: '#2a9d8f' },
  { key: 'payments',   label: 'Payments',         Icon: PoundSterling, colour: '#c2503f' },
]

const LIME = '#7ab533'

/** The look of one tile: the tile itself, and the box round its icon. "Add my time" (the first tile) is always the lime one. */
export function tileStyle(style: LookStyle, first: boolean, colour: string): { tile: React.CSSProperties; box: React.CSSProperties; iconSize: number } {
  switch (style) {
    case 'solid':
      return {
        tile: { background: '#fff', color: '#1e2022', border: '1px solid #e2e8f0' },
        box: { width: 58, height: 58, borderRadius: 16, background: colour, color: '#fff' }, iconSize: 32,
      }
    case 'line':
      return {
        tile: { background: '#fff', color: '#1e2022', border: '1px solid #e2e8f0', borderBottom: `3px solid ${first ? LIME : '#e4f2cf'}` },
        box: { width: 58, height: 58, color: first ? '#5e8f20' : '#1e2022' }, iconSize: 44,
      }
    case 'dark':
      return {
        tile: { background: first ? LIME : '#1e2022', color: first ? '#1e2022' : '#fff', border: 'none' },
        box: { width: 54, height: 54, borderRadius: '50%', background: first ? 'rgba(30,32,34,0.15)' : 'rgba(155,210,74,0.18)', color: first ? '#1e2022' : '#9bd24a' }, iconSize: 28,
      }
    default: // soft
      return {
        tile: { background: first ? LIME : '#fff', color: first ? '#fff' : '#1e2022', border: first ? 'none' : '1px solid #e2e8f0' },
        box: { width: 50, height: 50, borderRadius: 14, background: first ? 'rgba(255,255,255,0.25)' : '#e4f2cf', color: first ? '#fff' : '#3e6b12' }, iconSize: 28,
      }
  }
}

export default function SubHomeTiles({ style, onSelect, calendarLabel = 'Company calendar' }: {
  style: LookStyle
  onSelect: (key: SubTileKey) => void
  /** plain "Calendar" when the builder has switched the company view off for this person */
  calendarLabel?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      {SUB_TILES.map((t, i) => {
        const s = tileStyle(style, i === 0, t.colour)
        return (
          <button key={t.key} type="button" onClick={() => onSelect(t.key)}
            style={{
              ...s.tile, borderRadius: 18, padding: '16px 10px', minHeight: 112, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 9, fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', lineHeight: 1.2,
            }}>
            <span style={{ ...s.box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><t.Icon size={s.iconSize} strokeWidth={style === 'line' ? 1.6 : 2} /></span>
            {t.key === 'calendar' ? calendarLabel : t.label}
          </button>
        )
      })}
    </div>
  )
}
