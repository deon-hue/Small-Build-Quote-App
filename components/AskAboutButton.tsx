'use client'

import React from 'react'

/** The small "Ask" button beside a phase heading or a scope-of-works heading in the client's quote view: it takes them to the Questions & Replies box with that heading chosen. */
export default function AskAboutButton({ label, onAsk }: { label: string; onAsk: (label: string) => void }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onAsk(label) }} title={`Ask a question about "${label}"`}
      style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 9px', cursor: 'pointer', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
      💬 Ask
    </button>
  )
}
