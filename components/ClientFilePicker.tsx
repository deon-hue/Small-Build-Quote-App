'use client'

/**
 * "Load a plan from a customer's files": a window in Take-off that lists the pictures and PDFs filed against a customer (the files on their contact card, their quotes and their jobs) and hands the one you pick
 * back as a File, exactly as if it had been chosen from the computer. The customer starts as the one on the take-off (matched by id, then by name) and can be changed.
 * A LEAD (an enquiry that is not a contact yet) can be chosen too: the plans and photos that came with it or were added to it (quote_requests.client_files). The lead starts as the one the take-off's client was picked from
 * (its id is 'lead:<id>' on the take-off's client), else a lead with the same email, phone or name.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { quotesForClient, jobsForClient } from '@/lib/client-match'
import { fetchClientFileGroups, isPlanFile, type FileGroup, type FileItem } from '@/lib/client-file-groups'
import { cleanLeadFiles } from '@/lib/lead-files'
import { findSamePerson } from '@/lib/leads'
import { quoteDisplayTitle, jobDisplayTitle } from '@/lib/utils'

interface LeadRow { id: string; client_name: string; client_email: string; client_phone: string; client_files: unknown }
const mimeOfName = (n: string) => (/\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.(jpe?g)$/i.test(n) ? 'image/jpeg' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : '')
/** a lead's file as the list shows it: kept in our private folder (path) or arrived by the form or an email (public url) */
interface LeadPlanFile { key: string; name: string; mime: string; from: { bucket: 'job-documents'; path: string } | { url: string } }

interface Props {
  open: boolean
  onClose: () => void
  /** the customer on the take-off, if there is one: used to pick the starting contact */
  takeoffClient?: { id?: string; name?: string; email?: string; phone?: string }
  /** called with the chosen file; the picker closes first */
  onPick: (file: File) => void
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ClientFilePicker({ open, onClose, takeoffClient, onPick }: Props) {
  const sb = useMemo(() => createClient(), [])
  const { clients, quotes, jobs } = useApp()
  const customers = useMemo(() => clients.filter(c => c.clientType === 'client').sort((a, b) => (a.name || '').localeCompare(b.name || '')), [clients])
  const [clientId, setClientId] = useState('')
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [leadPick, setLeadPick] = useState('')
  const [leadStarted, setLeadStarted] = useState(false)

  // the leads that have a picture or PDF (read with the signed-in company's own login)
  useEffect(() => {
    if (!open) { setLeadStarted(false); return }
    let live = true
    sb.from('quote_requests').select('id, client_name, client_email, client_phone, client_files').order('created_at', { ascending: false }).limit(300).then(({ data }) => {
      if (!live) return
      setLeads(((data ?? []) as LeadRow[]).filter(l => cleanLeadFiles(l.client_files).some(f => isPlanFile({ name: f.name, mime: mimeOfName(f.name) || (f.isImage ? 'image/jpeg' : '') }))))
    })
    return () => { live = false }
  }, [open, sb])

  // the lead to start on: the one the take-off's client was picked from, else the same person by email, phone or name; chosen once when the window opens
  useEffect(() => {
    if (!open || leadStarted || leads.length === 0) return
    setLeadStarted(true)
    const fromId = (takeoffClient?.id || '').startsWith('lead:') ? (takeoffClient?.id || '').slice(5) : ''
    const same = fromId && leads.some(l => l.id === fromId) ? leads.find(l => l.id === fromId)
      : findSamePerson({ email: takeoffClient?.email, phone: takeoffClient?.phone }, leads.map(l => ({ ...l, email: l.client_email, phone: l.client_phone })))
        ?? leads.find(l => takeoffClient?.name && (l.client_name || '').trim().toLowerCase() === takeoffClient.name.trim().toLowerCase())
    if (same) setLeadPick(prev => prev || same.id)
  }, [open, leadStarted, leads, takeoffClient?.id, takeoffClient?.email, takeoffClient?.phone, takeoffClient?.name])
  const lead = leads.find(l => l.id === leadPick)
  const leadFiles = useMemo((): LeadPlanFile[] => lead
    ? cleanLeadFiles(lead.client_files).map((f, i): LeadPlanFile => ({ key: `l-${lead.id}-${i}`, name: f.name, mime: mimeOfName(f.name) || (f.isImage ? 'image/jpeg' : ''), from: f.path ? { bucket: 'job-documents', path: f.path } : { url: f.url } })).filter(isPlanFile)
    : [], [lead])

  // starting customer: the take-off's customer if it is a contact (by id, else by name)
  useEffect(() => {
    if (!open) return
    const byId = takeoffClient?.id ? customers.find(c => c.id === takeoffClient.id) : undefined
    const byName = !byId && takeoffClient?.name ? customers.find(c => (c.name || '').trim().toLowerCase() === takeoffClient.name!.trim().toLowerCase()) : undefined
    setClientId(prev => prev || byId?.id || byName?.id || '')
    setNote('')
  }, [open, takeoffClient?.id, takeoffClient?.name, customers])

  const client = customers.find(c => c.id === clientId)
  const clientQuotes = useMemo(() => (client ? quotesForClient(client.name, quotes).filter(q => q.status !== 'deleted').map(q => ({ id: q.id, ref: q.ref, title: quoteDisplayTitle(q) })) : []), [client, quotes])
  const clientJobs = useMemo(() => (client ? jobsForClient(client.name, jobs).map(j => ({ id: j.id, title: jobDisplayTitle(j) + (j.address ? ' — ' + j.address : '') })) : []), [client, jobs])
  const quoteKey = clientQuotes.map(q => q.id).join(',')
  const jobKey = clientJobs.map(j => j.id).join(',')

  useEffect(() => {
    if (!open || !client) { setGroups([]); return }
    let cancelled = false
    setLoading(true)
    fetchClientFileGroups(sb, client, clientQuotes, clientJobs).then(r => {
      if (cancelled) return
      setGroups(r.groups.map(g => ({ ...g, files: g.files.filter(isPlanFile) })).filter(g => g.files.length > 0))
      setNote(r.readError)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, client?.id, quoteKey, jobKey, sb]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pickLead(f: LeadPlanFile) {
    setBusyKey(f.key); setNote('')
    try {
      let blob: Blob | null = null
      if ('url' in f.from) { const res = await fetch(f.from.url); if (res.ok) blob = await res.blob() }
      else { const { data } = await sb.storage.from(f.from.bucket).download(f.from.path); blob = data }
      if (!blob) throw new Error('missing')
      setBusyKey('')
      onPick(new File([blob], f.name, { type: f.mime || blob.type }))
    } catch { setBusyKey(''); setNote('Could not fetch that file. It may have been removed.') }
  }

  async function pick(f: FileItem) {
    setBusyKey(f.key); setNote('')
    const { data, error } = await sb.storage.from(f.bucket).download(f.path)
    setBusyKey('')
    if (error || !data) { setNote('Could not fetch that file. It may have been removed.'); return }
    const type = f.mime || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : data.type)
    onPick(new File([data], f.name, { type }))
  }

  if (!open) return null
  const total = groups.reduce((n, g) => n + g.files.length, 0) + leadFiles.length
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--to-panel, #fff)', color: 'var(--to-text, #1e293b)', border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 10, width: 'min(640px, 94vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--to-border, #e2e8f0)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Load a plan from a customer's or lead's files</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'inherit', lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
          <label style={{ fontSize: 11, color: 'var(--to-muted, #64748b)', display: 'block', marginBottom: 4 }}>Customer</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 13, marginBottom: 12 }}>
            <option value="">Choose a customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ fontSize: 11, color: 'var(--to-muted, #64748b)', display: 'block', marginBottom: 4 }}>Lead (an enquiry that is not a contact yet; only leads with pictures or PDFs are listed)</label>
          <select value={leadPick} onChange={e => setLeadPick(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 13, marginBottom: 12 }}>
            <option value="">None</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.client_name}</option>)}
          </select>
          {note && <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '5px 9px', marginBottom: 8 }}>{note}</div>}
          {lead && leadFiles.length > 0 && (
            <div style={{ border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12, background: 'rgba(128,128,128,0.1)' }}>📥 Lead: {lead.client_name}</div>
              {leadFiles.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderTop: '1px solid var(--to-border, #e2e8f0)', fontSize: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</div>
                  <button disabled={!!busyKey} onClick={() => pickLead(f)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #2d6a2d', background: '#2d6a2d', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: busyKey ? 0.6 : 1 }}>
                    {busyKey === f.key ? '⏳ Fetching…' : 'Use as plan'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!client && !lead ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>Choose the customer or lead whose files you want to pick from.</div>
            : !client ? null
            : loading ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>Loading files…</div>
            : groups.length === 0 ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>No pictures or PDFs are filed for {client.name} yet. Add them on the customer's contact card, or load a plan from this computer.</div>
            : groups.map(g => (
              <div key={g.id} style={{ border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12, background: 'rgba(128,128,128,0.1)' }}>{g.kind === 'quote' ? '📋 ' : g.kind === 'job' ? '🏗 ' : '📁 '}{g.title}</div>
                {g.files.map(f => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderTop: '1px solid var(--to-border, #e2e8f0)', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</div>
                      {f.label && <div style={{ fontSize: 10.5, color: 'var(--to-muted, #64748b)' }}>{f.label}</div>}
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--to-muted, #64748b)', whiteSpace: 'nowrap' }}>{fmtSize(f.size)}</span>
                    <button disabled={!!busyKey} onClick={() => pick(f)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #2d6a2d', background: '#2d6a2d', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: busyKey ? 0.6 : 1 }}>
                      {busyKey === f.key ? '⏳ Fetching…' : 'Use as plan'}
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
