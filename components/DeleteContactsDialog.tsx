'use client'

// Delete one or several contacts. Shows what each is used for before anything happens, offers to archive them in Xero too (Xero never lets an app
// delete a contact, only archive it), and remembers every deleted contact so the Xero contact sync does not bring it back (see deleteClient in the
// app context and lib/contact-tombstones.ts). Sequential, with a plain result at the end.

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { describeUsage, type UsageItem } from '@/lib/contact-usage'
import type { Client } from '@/lib/types'

export interface DeleteTarget { c: Client; usage: UsageItem[] }

const SUB_KINDS = ['fixed quote', 'weekly timesheet day', 'portal timesheet']

export default function DeleteContactsDialog({ targets, xeroConnected, onClose, onDone }: {
  targets: DeleteTarget[]
  xeroConnected: boolean
  onClose: () => void
  /** the ids that were deleted */
  onDone: (ids: string[]) => void
}) {
  const { deleteClient } = useApp()
  const linked = targets.filter(t => !!t.c.xeroContactId)
  const [archive, setArchive] = useState(xeroConnected && linked.length > 0)
  const [phase, setPhase] = useState<'confirm' | 'working' | 'done'>('confirm')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ deleted: string[]; archived: number; archiveFailed: { name: string; error: string }[]; failed: string[] }>({ deleted: [], archived: 0, archiveFailed: [], failed: [] })

  const used = targets.filter(t => t.usage.length > 0)
  const removesSubData = targets.some(t => t.usage.some(u => SUB_KINDS.includes(u.label)))

  async function run() {
    setPhase('working')
    const r = { deleted: [] as string[], archived: 0, archiveFailed: [] as { name: string; error: string }[], failed: [] as string[] }
    for (let i = 0; i < targets.length; i++) {
      const { c } = targets[i]
      setProgress(i + 1)
      if (archive && c.xeroContactId) {
        try {
          const res = await fetch('/api/xero/archive-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: c.id }) })
          const j = await res.json() as { ok?: boolean; error?: string }
          if (j.ok) r.archived++; else r.archiveFailed.push({ name: c.name, error: j.error || 'Xero refused' })
        } catch { r.archiveFailed.push({ name: c.name, error: 'could not reach Xero' }) }
      }
      try { await deleteClient(c.id); r.deleted.push(c.id) } catch { r.failed.push(c.name) }
    }
    setResult(r)
    setPhase('done')
  }

  const n = targets.length
  return (
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={() => { if (phase !== 'working') (phase === 'done' ? onDone(result.deleted) : onClose()) }}>
      <div className="modal-box" style={{ width: 'min(560px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-hd">
          <div style={{ fontWeight: 700, fontSize: 17 }}>{phase === 'done' ? 'Done' : n === 1 ? 'Delete ' + targets[0].c.name + '?' : 'Delete ' + n + ' contacts?'}</div>
        </div>
        <div style={{ padding: '16px 22px', overflowY: 'auto', fontSize: 13.5, lineHeight: 1.5 }}>
          {phase === 'confirm' && (
            <>
              {n > 1 && (
                <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', marginBottom: 12, fontSize: 12.5 }}>
                  {targets.map(t => <div key={t.c.id}>{t.c.name || '(no name)'} <span style={{ color: 'var(--muted)' }}>· {t.c.clientType === 'subcontractor' ? 'subcontractor' : t.c.clientType}</span></div>)}
                </div>
              )}
              {used.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', marginBottom: 12, color: '#92400e', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><AlertTriangle size={15} />{used.length === 1 ? 'This contact is used in the app' : used.length + ' of these contacts are used in the app'}</div>
                  {used.slice(0, 6).map(t => <div key={t.c.id}><strong>{t.c.name}</strong>: {describeUsage(t.usage)}</div>)}
                  {used.length > 6 && <div>and {used.length - 6} more</div>}
                  <div style={{ marginTop: 6 }}>
                    Quotes, jobs, bills and invoices stay where they are.
                    {removesSubData && <strong> A subcontractor's weekly timesheet days, portal timesheets and fixed quotes are deleted along with them.</strong>}
                  </div>
                </div>
              )}
              <div>
                <strong>They stay deleted.</strong> The app remembers it, so the Xero contact sync will not bring {n === 1 ? 'this contact' : 'them'} back. This cannot be undone here{n === 1 ? '' : ' (but you can restore a deleted contact from Tidy up contacts)'}.
              </div>
              {xeroConnected && linked.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, cursor: 'pointer', background: 'var(--cream, #f7f5f0)', borderRadius: 8, padding: '10px 12px' }}>
                  <input type="checkbox" checked={archive} onChange={e => setArchive(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
                  <span>
                    <strong>Also archive in Xero</strong> ({linked.length === n ? (n === 1 ? 'it is linked to Xero' : 'all are linked to Xero') : linked.length + ' of ' + n + ' are linked to Xero'})
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>Xero only lets the app archive a contact, not delete it. Archived contacts disappear from Xero's normal lists and you can restore them there. If Xero refuses (for example unpaid invoices), the contact is still deleted here and you'll be told.</span>
                  </span>
                </label>
              )}
              {!xeroConnected && <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 12 }}>Xero isn't connected, so nothing will change in Xero.</div>}
            </>
          )}
          {phase === 'working' && <div style={{ padding: '20px 0', textAlign: 'center' }}>Working… {progress} of {n}</div>}
          {phase === 'done' && (
            <>
              <div style={{ fontWeight: 700, color: '#166534' }}>✓ Deleted {result.deleted.length} contact{result.deleted.length === 1 ? '' : 's'}. They won't come back from Xero.</div>
              {archive && <div style={{ marginTop: 6 }}>Archived in Xero: {result.archived}.</div>}
              {result.archiveFailed.length > 0 && (
                <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', color: '#92400e', fontSize: 12.5 }}>
                  <strong>{result.archiveFailed.length} could not be archived in Xero</strong> (they are deleted here, and won't return). You can archive them in Xero yourself:
                  {result.archiveFailed.slice(0, 8).map((f, i) => <div key={i}>· {f.name}: {f.error}</div>)}
                </div>
              )}
              {result.failed.length > 0 && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 12.5 }}>Could not delete: {result.failed.join(', ')}.</div>}
            </>
          )}
        </div>
        <div style={{ padding: '12px 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          {phase === 'confirm' && (
            <>
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-danger" onClick={run}>Delete {n === 1 ? 'contact' : n + ' contacts'}</button>
            </>
          )}
          {phase === 'done' && <button className="btn btn-primary" onClick={() => onDone(result.deleted)}>Close</button>}
        </div>
      </div>
    </div>
  )
}
