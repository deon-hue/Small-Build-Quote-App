'use client'

// The dashboard's "Needs your attention" card: new notes subcontractors have sent from their portal (not opened yet) and the timesheets waiting
// for the builder's review. Shows nothing at all when there is nothing to do. Reads only the builder's own data (row security).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { unseenSubNotes, snippet } from '@/lib/note-attention'
import { jobDisplayTitle } from '@/lib/utils'

interface PendingRow { name: string; count: number }

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${Math.max(1, mins)} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export default function NeedsAttentionCard() {
  const { jobNotes, jobs, clients, invoices } = useApp()
  const [pending, setPending] = useState<PendingRow[]>([])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const sb = createClient()
        const { data: entries } = await sb.from('sub_time_entries').select('id, contact_id, sub_contract_id').eq('status', 'submitted')
        if (!entries || entries.length === 0) { if (alive) setPending([]); return }
        const contractIds = [...new Set(entries.map(e => e.sub_contract_id).filter(Boolean))] as string[]
        const contractContact: Record<string, string> = {}
        if (contractIds.length) {
          const { data: cs } = await sb.from('sub_contracts').select('id, contact_id').in('id', contractIds)
          for (const c of cs ?? []) contractContact[c.id as string] = c.contact_id as string
        }
        const counts: Record<string, number> = {}
        for (const e of entries) {
          const cid = (e.contact_id as string | null) || (e.sub_contract_id ? contractContact[e.sub_contract_id as string] : '') || 'unknown'
          counts[cid] = (counts[cid] ?? 0) + 1
        }
        const nameOf = (id: string) => clients.find(c => c.id === id)?.name ?? 'A subcontractor'
        if (alive) setPending(Object.entries(counts).map(([id, count]) => ({ name: nameOf(id), count })).sort((a, b) => b.count - a.count))
      } catch { if (alive) setPending([]) }
    }
    void load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [clients])

  const newNotes = unseenSubNotes(jobNotes)
  const pendingTotal = pending.reduce((s, p) => s + p.count, 0)
  const overdueInv = invoices.filter(i => i.status === 'overdue')
  const overdueTotal = overdueInv.reduce((a, i) => a + (Number(i.total) || 0), 0)
  // nothing to do: a calm card rather than no card, so it keeps its place on the dashboard
  if (newNotes.length === 0 && pendingTotal === 0 && overdueInv.length === 0) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #7ab533' }}>
        <div className="card-hd">Needs your attention</div>
        <div style={{ padding: '10px 16px 14px', fontSize: 13, color: 'var(--muted)' }}>✓ Nothing needs your attention right now.</div>
      </div>
    )
  }

  const jobLabel = (id: string) => { const j = jobs.find(x => x.id === id); return j ? jobDisplayTitle(j) : 'A job' }

  return (
    <div className="card" style={{ borderLeft: '4px solid #c0392b' }}>
      <div className="card-hd" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Needs your attention
        <span style={{ background: '#c0392b', color: '#fff', borderRadius: 99, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{newNotes.length + (pendingTotal > 0 ? 1 : 0) + (overdueInv.length > 0 ? 1 : 0)}</span>
      </div>
      <div style={{ padding: '4px 16px 12px' }}>
        {newNotes.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)', margin: '8px 0 4px' }}>New site notes</div>
            {newNotes.slice(0, 6).map(n => (
              <Link key={n.id} href={`/jobs?notes=${encodeURIComponent(n.jobId)}`}
                style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <strong>👷 {n.authorName || 'Subcontractor'} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {jobLabel(n.jobId)}</span></strong>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(n.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{snippet(n.note)}</div>
              </Link>
            ))}
            {newNotes.length > 6 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 0' }}>and {newNotes.length - 6} more — open each job’s Notes.</div>}
          </>
        )}
        {pendingTotal > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)', margin: '10px 0 4px' }}>Timesheets waiting for review</div>
            <Link href="/subcontractors" style={{ display: 'block', padding: '8px 0', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{pendingTotal} timesheet entr{pendingTotal === 1 ? 'y' : 'ies'}</strong>
                <span style={{ color: 'var(--muted)' }}> from {pending.map(p => `${p.name} (${p.count})`).join(', ')}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sky, #2a7ab0)', marginTop: 2 }}>Open Subcontractors to approve →</div>
            </Link>
          </>
        )}
        {overdueInv.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)', margin: '10px 0 4px' }}>Overdue invoices</div>
            <Link href="/invoices" style={{ display: 'block', padding: '8px 0', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{overdueInv.length} overdue invoice{overdueInv.length === 1 ? '' : 's'}</strong>
                <span style={{ color: 'var(--muted)' }}> · £{overdueTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sky, #2a7ab0)', marginTop: 2 }}>Open Invoices to chase →</div>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
