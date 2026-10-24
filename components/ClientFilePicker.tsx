'use client'

/**
 * "Load a plan from a customer's files": a window in Take-off that lists the pictures and PDFs filed against a customer (the files on their contact card, their quotes and their jobs) and hands the one you pick
 * back as a File, exactly as if it had been chosen from the computer. The customer starts as the one on the take-off (matched by id, then by name) and can be changed.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { quotesForClient, jobsForClient } from '@/lib/client-match'
import { fetchClientFileGroups, isPlanFile, type FileGroup, type FileItem } from '@/lib/client-file-groups'
import { quoteDisplayTitle, jobDisplayTitle } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  /** the customer on the take-off, if there is one: used to pick the starting contact */
  takeoffClient?: { id?: string; name?: string }
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

  async function pick(f: FileItem) {
    setBusyKey(f.key); setNote('')
    const { data, error } = await sb.storage.from(f.bucket).download(f.path)
    setBusyKey('')
    if (error || !data) { setNote('Could not fetch that file. It may have been removed.'); return }
    const type = f.mime || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : data.type)
    onPick(new File([data], f.name, { type }))
  }

  if (!open) return null
  const total = groups.reduce((n, g) => n + g.files.length, 0)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--to-panel, #fff)', color: 'var(--to-text, #1e293b)', border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 10, width: 'min(640px, 94vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--to-border, #e2e8f0)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Load a plan from a customer's files</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'inherit', lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
          <label style={{ fontSize: 11, color: 'var(--to-muted, #64748b)', display: 'block', marginBottom: 4 }}>Customer</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 13, marginBottom: 12 }}>
            <option value="">Choose a customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {note && <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '5px 9px', marginBottom: 8 }}>{note}</div>}
          {!client ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>Choose the customer whose files you want to pick from.</div>
            : loading ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>Loading files…</div>
            : total === 0 ? <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)' }}>No pictures or PDFs are filed for {client.name} yet. Add them on the customer's contact card, or load a plan from this computer.</div>
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
