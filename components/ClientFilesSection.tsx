'use client'

/**
 * The Files section on a customer's contact card: everything filed against that customer in one place, with downloads.
 *   Customer files   files added to the contact itself (a first set of plans, ID, photos...), added and removed here (table client_files, supabase/client-files.sql)
 *   Quotes           the files attached to each of the customer's quotes (read from quote_documents: not copied, no extra space), managed in the quote
 *   Jobs             the files on each of the customer's jobs (read from job_attachments), managed in the job
 * Each file can be viewed or downloaded, each folder downloaded, and everything downloaded as one zip (built in the browser from the files themselves; lib/zip-store.ts).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showUrlDocument } from '@/lib/open-document'
import { buildZip, uniquePaths } from '@/lib/zip-store'
import { uploadClientFile, deleteClientFile, CLIENT_FILE_MAX_BYTES, type ClientFileCategory } from '@/lib/client-files'
import { fetchClientFileGroups, type FileItem, type FileGroup as Group } from '@/lib/client-file-groups'

interface Props {
  client: { id: string; name: string }
  quotes: { id: string; ref: string; title: string }[]
  jobs: { id: string; title: string }[]
}

const CATEGORY_LABEL: Record<string, string> = { photo: '📷 Photo', plan: '📐 Plan', document: '📄 Document', contract: '📝 Contract' }
const ZIP_WARN_BYTES = 1024 * 1024 * 1024        // ask first above 1 GB
const ZIP_MAX_BYTES = Math.floor(3.5 * 1024 * 1024 * 1024)   // a zip cannot pass 4 GB

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function fmtDate(iso?: string) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
}
const folderName = (s: string) => (s || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'Untitled'

export default function ClientFilesSection({ client, quotes, jobs }: Props) {
  const sb = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [notSetUp, setNotSetUp] = useState(false)
  const [readErr, setReadErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [category, setCategory] = useState<ClientFileCategory>('document')
  const [label, setLabel] = useState('')
  const [dragging, setDragging] = useState(false)
  const [zipBusy, setZipBusy] = useState('')
  const [zipMsg, setZipMsg] = useState('')

  const quoteKey = quotes.map(q => q.id).join(',')
  const jobKey = jobs.map(j => j.id).join(',')

  const load = useCallback(async () => {
    const r = await fetchClientFileGroups(sb, client, quotes, jobs)
    setNotSetUp(r.notSetUp)
    setReadErr(r.readError)
    setGroups(r.groups)
    setLoading(false)
  }, [sb, client.id, quoteKey, jobKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setLoading(true); load() }, [load])

  const allFiles = groups.flatMap(g => g.files)
  const totalBytes = allFiles.reduce((s, f) => s + f.size, 0)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true); setUploadErr('')
    for (const file of Array.from(files)) {
      const r = await uploadClientFile(sb, client.id, file, category, label)
      if ('error' in r) { setUploadErr(r.error); break }
    }
    setLabel('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
    await load()
  }

  async function remove(f: FileItem) {
    if (!f.own || !confirm(`Delete ${f.name}? This removes the file from this customer.`)) return
    await deleteClientFile(sb, f.own)
    await load()
  }

  async function open(f: FileItem, download: boolean) {
    const { data } = await sb.storage.from(f.bucket).createSignedUrl(f.path, download ? 120 : 3600, download ? { download: f.name } : undefined)
    if (!data?.signedUrl) { setZipMsg('Could not open that file. It may have been removed.'); return }
    if (download) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); return }
    if (!showUrlDocument(data.signedUrl, { title: f.name, mime: f.mime })) window.open(data.signedUrl, '_blank')
  }

  /** A zip of the given folders: Customer name / Customer files, Quotes / <quote>, Jobs / <job>, each file inside its folder. */
  async function downloadZip(which: Group[], zipLabel: string, busyKey: string) {
    const files = which.flatMap(g => g.files.map(f => ({ g, f })))
    if (files.length === 0) return
    const bytes = files.reduce((s, x) => s + x.f.size, 0)
    if (bytes > ZIP_MAX_BYTES) { setZipMsg(`That is ${fmtSize(bytes)}, too big for one zip (3.5 GB at most). Download a folder at a time instead.`); return }
    if (bytes > ZIP_WARN_BYTES && !confirm(`That is ${fmtSize(bytes)}. It is put together in this browser, so it may take a while and needs that much free memory. Carry on?`)) return
    setZipBusy(busyKey); setZipMsg('')
    const root = folderName(client.name)
    const paths = uniquePaths(files.map(({ g, f }) => {
      const dir = g.kind === 'customer' ? 'Customer files' : g.kind === 'quote' ? `Quotes/${folderName(g.title.replace(/^Quote\s*/, ''))}` : `Jobs/${folderName(g.title.replace(/^Job\s*—\s*/, ''))}`
      return `${root}/${dir}/${f.name}`
    }))
    const entries: { path: string; data: Blob }[] = []
    const skipped: string[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        setZipMsg(`Getting file ${i + 1} of ${files.length}: ${files[i].f.name}`)
        const { data, error } = await sb.storage.from(files[i].f.bucket).download(files[i].f.path)
        if (error || !data) { skipped.push(files[i].f.name); continue }
        entries.push({ path: paths[i], data })
      }
      if (entries.length === 0) { setZipMsg('None of the files could be fetched, so no zip was made.'); return }
      setZipMsg('Putting the zip together…')
      const blob = await buildZip(entries)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${folderName(zipLabel)}.zip`; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setZipMsg(`Zip ready: ${entries.length} file${entries.length === 1 ? '' : 's'}, ${fmtSize(blob.size)}.${skipped.length ? ` Not included (could not be fetched): ${skipped.join(', ')}.` : ''}`)
    } catch (e) {
      setZipMsg(`The zip could not be made: ${(e as { message?: string })?.message || 'unknown problem'}.`)
    } finally {
      setZipBusy('')
    }
  }

  const smallBtn: React.CSSProperties = { fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--ink)', whiteSpace: 'nowrap' }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>Files</div>
        {!loading && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{allFiles.length} file{allFiles.length === 1 ? '' : 's'}{allFiles.length > 0 ? `, ${fmtSize(totalBytes)}` : ''}</div>}
        <div style={{ flex: 1 }} />
        {allFiles.length > 0 && (
          <button type="button" disabled={!!zipBusy} onClick={() => downloadZip(groups, `${client.name} - all files`, 'all')} style={{ ...smallBtn, background: 'var(--moss, #7ab533)', color: '#fff', border: 'none', fontWeight: 600, opacity: zipBusy ? 0.6 : 1 }}>
            {zipBusy === 'all' ? '⏳ Working…' : '⬇ Download everything (zip)'}
          </button>
        )}
      </div>

      {zipMsg && <div style={{ fontSize: 11, color: zipMsg.startsWith('Zip ready') ? '#166534' : '#92400e', background: zipMsg.startsWith('Zip ready') ? '#f0fdf4' : '#fffbeb', border: `1px solid ${zipMsg.startsWith('Zip ready') ? '#bbf7d0' : '#fde68a'}`, borderRadius: 5, padding: '5px 9px', marginBottom: 8 }}>{zipMsg}</div>}
      {readErr && <div style={{ fontSize: 11, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '5px 9px', marginBottom: 8 }}>⚠ {readErr}</div>}

      {/* Add files to the customer */}
      {notSetUp ? (
        <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
          Adding files straight to a customer is not switched on yet: the database step (<code>supabase/client-files.sql</code>) still has to be run. The files on this customer's quotes and jobs are shown below as normal.
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          style={{ border: `1.5px dashed ${dragging ? 'var(--moss)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, background: dragging ? '#f0f7ee' : 'var(--warm, #fafaf8)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} style={{ ...smallBtn, fontWeight: 600 }}>{uploading ? '⏳ Uploading…' : '＋ Add files to this customer'}</button>
            <select value={category} onChange={e => setCategory(e.target.value as ClientFileCategory)} style={{ fontSize: 11, padding: '3px 6px' }}>
              <option value="document">📄 Document</option>
              <option value="plan">📐 Plan / drawing</option>
              <option value="photo">📷 Photo</option>
            </select>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" style={{ fontSize: 11, padding: '3px 8px', flex: 1, minWidth: 120 }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5 }}>Click, or drag files here. Plans, photos and documents, up to {CLIENT_FILE_MAX_BYTES / 1024 / 1024} MB each. Files on this customer's quotes and jobs are listed below and are added from the quote or job itself.</div>
          <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip" style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          {uploadErr && <div style={{ fontSize: 11, color: '#c0392b', marginTop: 5 }}>{uploadErr}</div>}
        </div>
      )}

      {loading ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>Loading files…</div> : allFiles.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No files yet for this customer.</div>
      ) : groups.filter(g => g.files.length > 0).map(g => (
        <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: '#f6f7f4', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.kind === 'quote' ? '📋 ' : g.kind === 'job' ? '🏗 ' : '📁 '}{g.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.files.length} · {fmtSize(g.files.reduce((s, f) => s + f.size, 0))}</div>
            <button type="button" disabled={!!zipBusy} onClick={() => downloadZip([g], `${client.name} - ${g.title}`, g.id)} style={{ ...smallBtn, opacity: zipBusy ? 0.6 : 1 }}>{zipBusy === g.id ? '⏳' : '⬇ Folder'}</button>
          </div>
          {g.files.map(f => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontSize: 10.5, color: 'var(--muted)', minWidth: 72 }}>{CATEGORY_LABEL[f.category] ?? '📄 File'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</div>
                {f.label && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{f.label}</div>}
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtSize(f.size)}{f.at ? ` · ${fmtDate(f.at)}` : ''}</span>
              <button type="button" onClick={() => open(f, false)} style={smallBtn}>View</button>
              <button type="button" onClick={() => open(f, true)} style={smallBtn}>⬇</button>
              {f.own && <button type="button" onClick={() => remove(f)} title="Delete this file" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
