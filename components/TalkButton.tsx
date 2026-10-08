'use client'

// The green "Talk" button (red while listening) used next to the subcontractor portal's text boxes. `compact` is just the microphone, for beside a one-line box.

import { Mic, Square } from 'lucide-react'

export default function TalkButton({ listening, onClick, compact }: { listening: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Talk instead of typing'}
      style={{
        padding: compact ? 0 : '11px 16px', width: compact ? 46 : undefined, height: compact ? 46 : undefined, flexShrink: 0,
        border: listening ? '1px solid #dc2626' : '1px solid #7ab533', borderRadius: 10,
        background: listening ? '#dc2626' : '#f4f9ea', color: listening ? '#fff' : '#3e6b12',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit',
      }}>
      {listening ? <Square size={18} /> : <Mic size={18} />}
      {!compact && (listening ? 'Listening… tap to stop' : 'Talk')}
    </button>
  )
}
