'use client'

// "Pick from a customer's or lead's files": a window for a quote that lists the pictures and PDFs already filed for the customer (their contact card, their other quotes and their jobs) and for a lead (the plans and
// photos you added or that came with it), so a plan is attached to this quote without going back to the computer's folders. The ones you tick are handed back as Files, exactly as if they had been chosen from the
// computer, so the caller's own checks and upload run unchanged (the quote gets its own copy). The customer and the lead start as the ones this quote is for and can be changed.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { quotesForClient, jobsForClient } from '@/lib/client-match'
import { fetchClientFileGroups, isPlanFile } from '@/lib/client-file-groups'
import { cleanLeadFiles } from '@/lib/lead-files'
import { findSamePerson } from '@/lib/leads'
import { quoteDisplayTitle, jobDisplayTitle } from '@/lib/utils'

interface PickItem { key: string; name: string; mime: string; size: number; label: string; from: { bucket: string; path: string } | { url: string } }
interface PickGroup { id: string; icon: string; title: string; files: PickItem[] }
interface LeadRow { id: string; client_name: string; client_email: string; client_phone: string; created_at: string; client_files: unknown }

const fmtSize = (b: number) => (b <= 0 ? '' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
const mimeOfName = (n: string) => (/\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.(jpe?g)$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : '')

export default function QuoteFilePicker({ open, onClose, customer, leadId, excludeQuoteId, onPick }: {
  open: boolean
  onClose: () => void
  /** who the quote is for: starts the customer and lead choices */
  customer?: { name?: string; email?: string; phone?: string }
  /** the lead this quote came from, if any */
  leadId?: string | null
  /** this quote's own id (its files are already attached, so they are not listed again) */
  excludeQuoteId?: string
  /** the chosen files; the window closes when this finishes */
  onPick: (files: File[]) => Promise<void> | void
}) {
  const sb = useMemo(() => createClient(), [])
  const { clients, quotes, jobs } = useApp()
  const customers = useMemo(() => clients.filter(c => c.clientType === 'client').sort((a, b) => (a.name || '').localeCompare(b.name || '')), [clients])
  const [clientId, setClientId] = useState('')
  const [leadPick, setLeadPick] = useState('')
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [groups, setGroups] = useState<PickGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [chosen, setChosen] = useState<Record<string, PickItem>>({})
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)

  // leads that have files (read with the signed-in company's own login)
  useEffect(() => {
    if (!open) return
    let live = true
    sb.from('quote_requests').select('id, client_name, client_email, client_phone, created_at, client_files').order('created_at', { ascending: false }).limit(300).then(({ data }) => {
      if (!live) return
      setLeads(((data ?? []) as LeadRow[]).filter(l => cleanLeadFiles(l.client_files).some(f => isPlanFile({ name: f.name, mime: mimeOfName(f.name) || (f.isImage ? 'image/jpeg' : '') }))))
    })
    return () => { live = false }
  }, [open, sb])

  // the customer and the lead this quote is for, found once when the window opens
  useEffect(() => {
    if (!open) { setStarted(false); return }
    if (started) return
    const name = (customer?.name || '').trim().toLowerCase()
    const email = (customer?.email || '').trim().toLowerCase()
    const c = (name && customers.find(x => (x.name || '').trim().toLowerCase() === name)) || (email && customers.find(x => (x.email || '').trim().toLowerCase() === email)) || null
    setClientId(c ? c.id : '')
    setChosen({}); setNote('')
    setStarted(true)
  }, [open, started, customer?.name, customer?.email, customers])
  useEffect(() => {
    if (!open || !started) return
    setLeadPick(prev => {
      if (prev) return prev
      if (leadId && leads.some(l => l.id === leadId)) return leadId
      const same = findSamePerson({ email: customer?.email, phone: customer?.phone }, leads.map(l => ({ ...l, email: l.client_email, phone: l.client_phone })))
      return same ? same.id : ''
    })
  }, [open, started, leads, leadId, customer?.email, customer?.phone])

  const client = customers.find(c => c.id === clientId)
  const clientQuotes = useMemo(() => (client ? quotesForClient(client.name, quotes).filter(q => q.status !== 'deleted' && q.id !== excludeQuoteId).map(q => ({ id: q.id, ref: q.ref, title: quoteDisplayTitle(q) })) : []), [client, quotes, excludeQuoteId])
  const clientJobs = useMemo(() => (client ? jobsForClient(client.name, jobs).map(j => ({ id: j.id, title: jobDisplayTitle(j) + (j.address ? ' — ' + j.address : '') })) : []), [client, jobs])
  const quoteKey = clientQuotes.map(q => q.id).join(',')
  const jobKey = clientJobs.map(j => j.id).join(',')
  const lead = leads.find(l => l.id === leadPick)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const run = async () => {
      const out: PickGroup[] = []
      let readError = ''
      if (lead) {
        const files = cleanLeadFiles(lead.client_files).map((f, i): PickItem => ({
          key: `l-${lead.id}-${i}`, name: f.name, mime: mimeOfName(f.name) || (f.isImage ? 'image/jpeg' : ''), size: 0, label: '',
          from: f.path ? { bucket: 'job-documents', path: f.path } : { url: f.url },
        })).filter(isPlanFile)
        if (files.length) out.push({ id: 'lead', icon: '📥', title: `Lead: ${lead.client_name}`, files })
      }
      if (client) {
        const r = await fetchClientFileGroups(sb, client, clientQuotes, clientJobs)
        readError = r.readError
        for (const g of r.groups) {
          const files = g.files.map((f): PickItem => ({ key: f.key, name: f.name, mime: f.mime, size: f.size, label: f.label, from: { bucket: f.bucket, path: f.path } })).filter(isPlanFile)
          if (files.length) out.push({ id: g.id, icon: g.kind === 'quote' ? '📋' : g.kind === 'job' ? '🏗' : '📁', title: g.title, files })
        }
      }
      if (!cancelled) { setGroups(out); setNote(readError); setLoading(false) }
    }
    run()
    return () => { cancelled = true }
  }, [open, client?.id, quoteKey, jobKey, lead?.id, sb]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(f: PickItem) {
    setChosen(cur => { const n = { ...cur }; if (n[f.key]) delete n[f.key]; else n[f.key] = f; return n })
  }

  async function addChosen() {
    const items = Object.values(chosen)
    if (!items.length || busy) return
    setBusy(true); setNote('')
    const files: File[] = []
    const failed: string[] = []
    for (const f of items) {
      try {
        let blob: Blob | null = null
        if ('url' in f.from) { const res = await fetch(f.from.url); if (res.ok) blob = await res.blob() }
        else { const { data } = await sb.storage.from(f.from.bucket).download(f.from.path); blob = data }
        if (!blob) throw new Error('missing')
        files.push(new File([blob], f.name, { type: f.mime || mimeOfName(f.name) || blob.type }))
      } catch { failed.push(f.name) }
    }
    if (files.length) { try { await onPick(files) } catch { /* the caller shows its own problems */ } }
    setBusy(false)
    if (failed.length) { setNote(`Could not fetch: ${failed.join(', ')}. They may have been removed.`); if (!files.length) return }
    if (files.length) onClose()
  }

  if (!open || typeof document === 'undefined') return null
  const total = groups.reduce((n, g) => n + g.files.length, 0)
  const nChosen = Object.keys(chosen).length
  const sel: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginBottom: 10 }
  const lab: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div role="dialog" aria-label="Pick from the customer's or lead's files" style={{ background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 10, width: 'min(640px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Pick from the customer's or lead's files</div>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'inherit', lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lab} htmlFor="qfp-customer">Customer</label>
              <select id="qfp-customer" value={clientId} onChange={e => { setClientId(e.target.value); setChosen({}) }} style={sel}>
                <option value="">None</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lab} htmlFor="qfp-lead">Lead (with files)</label>
              <select id="qfp-lead" value={leadPick} onChange={e => { setLeadPick(e.target.value); setChosen({}) }} style={sel}>
                <option value="">None</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.client_name}</option>)}
              </select>
            </div>
          </div>
          {note && <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '5px 9px', marginBottom: 8 }}>{note}</div>}
          {!client && !lead ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Choose the customer, or the lead, whose files you want to pick from.</div>
            : loading ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading files…</div>
            : total === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>No pictures or PDFs are filed for {[client?.name, lead ? `the lead ${lead.client_name}` : ''].filter(Boolean).join(' or ')} yet.</div>
            : groups.map(g => (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12, background: 'var(--warm, #f6f6f3)' }}>{g.icon} {g.title}</div>
                {g.files.map(f => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', background: chosen[f.key] ? '#f1f8ee' : '#fff' }}>
                    <input type="checkbox" checked={!!chosen[f.key]} onChange={() => toggle(f)} disabled={busy} style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</span>
                      {f.label && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{f.label}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
                  </label>
                ))}
              </div>
            ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>The quote gets its own copy of each file you tick.</div>
          <button className="btn-sm btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={addChosen} disabled={busy || nChosen === 0}>{busy ? 'Adding…' : nChosen ? `Add ${nChosen} file${nChosen === 1 ? '' : 's'}` : 'Add'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
