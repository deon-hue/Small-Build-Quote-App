'use client'

// The "Leads" part of a client picker's list (New Quote, Quick Quote): the leads that match what was typed, below the clients, each with its stage, so a lead can be picked like a client. Picking one fills the customer's boxes
// from the lead (name, email, phone and the address as the lead keeps it). Lists are cut to `max` so a long list of leads does not bury the clients.

import React from 'react'
import type { LeadOption } from '@/lib/lead-options'

export default function LeadPickRows({ leads, onPick, max = 6 }: { leads: LeadOption[]; onPick: (l: LeadOption) => void; max?: number }) {
  if (leads.length === 0) return null
  const shown = leads.slice(0, max)
  return (
    <div style={{ borderTop: '1px solid #e5e7eb' }}>
      <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#64748b', background: '#f8fafc' }}>
        Leads (not clients yet){leads.length > shown.length ? ` · ${shown.length} of ${leads.length}: type to narrow` : ''}
      </div>
      {shown.map(l => (
        <div key={l.id} onMouseDown={e => { e.preventDefault(); onPick(l) }}
          style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#e0f2fe', color: '#0369a1', whiteSpace: 'nowrap' }}>LEAD · {l.stageLabel}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{l.name}</span>
            {(l.phone || l.email) && <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>{l.phone || l.email}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
