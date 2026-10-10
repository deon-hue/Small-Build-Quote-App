'use client'

// Back Office > Phases & Tasks: the standard (built-in) phases, sub-phases and tasks this company has deleted, with a Restore button for each.
// A deleted standard item is remembered so Back Office does not put it back (see lib/bo-deleted.ts); Restore forgets it and re-runs the setup.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchDeletedStandardItems, restoreDeletedStandardItem, syncBackOfficeFromProduct } from '@/lib/back-office-queries'

type Item = Awaited<ReturnType<typeof fetchDeletedStandardItems>>[number]
const KIND: Record<string, string> = { phase: 'Main phase', sub_phase: 'Sub-phase', task: 'Task' }

export default function DeletedStandardItems({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => { setItems(await fetchDeletedStandardItems(createClient(), userId)) }, [userId])
  useEffect(() => { load() }, [load])

  async function restore(it: Item) {
    setBusy(it.id); setNote('')
    const sb = createClient()
    await restoreDeletedStandardItem(sb, it.id)
    await syncBackOfficeFromProduct(sb, userId)
    await load()
    setBusy(null)
    setNote('Restored “' + (it.name || it.canonical_id) + '”.' + (it.kind === 'task' ? ' If its sub-phase is also deleted, restore the sub-phase too.' : ''))
    onChanged()
  }

  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#475569' }}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{open ? '▾' : '▸'}</span>
        Deleted standard items ({items.length})
        <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— kept so they don&apos;t come back; restore any you want again</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '6px 14px 10px' }}>
          {note && <div style={{ margin: '6px 0', fontSize: 12.5, color: '#166534' }}>{note}</div>}
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: '#f1f5f9', color: '#475569', flexShrink: 0 }}>{KIND[it.kind] ?? it.kind}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{it.name || it.canonical_id}</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8', flexShrink: 0 }}>deleted {new Date(it.deleted_at).toLocaleDateString('en-GB')}</span>
              <button disabled={busy === it.id} onClick={() => restore(it)} style={{ padding: '3px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer' }}>{busy === it.id ? 'Restoring…' : 'Restore'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
