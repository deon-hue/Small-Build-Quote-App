'use client'

// "Ask for prices" on a calculator's materials list: pick the suppliers or merchants, say where it is going and when it is needed, and each gets their own link to give a price,
// no login. It is a request for a price like any other (it has a PO number), made before there is a job while you are pricing a quote, or for a job if you pick one. The list the
// suppliers see is what to buy and how much, never our own prices. Replies are compared in the job's Orders, or under Jobs, Price requests when it is not for a job yet.

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { Recipients } from './OrderRecipients'
import PriceRequestItems from './PriceRequestItems'
import JobOrdersModal from './JobOrdersModal'
import { insertJobOrder, insertOrderQuotes, type OrderItem, type QuoteInvitee } from '@/lib/job-orders'

interface Props {
  lines: { name: string; purchaseQty: number; unit: string }[]
  /** the calculator's name, e.g. "Cavity wall" */
  title: string
  /** where the calculator is being used, if it says (a quote or job) */
  location?: string
  onClose: () => void
}

export default function MaterialsPriceRequest({ lines, title, location, onClose }: Props) {
  const sb = useMemo(() => createClient(), [])
  const { suppliers, jobs } = useApp()
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [name, setName] = useState(`${title} materials`.replace(/ materials materials$/i, ' materials'))
  const [jobId, setJobId] = useState('')
  const [where, setWhere] = useState('')
  const [needed, setNeeded] = useState('')
  const [note, setNote] = useState('')
  const [recips, setRecips] = useState<QuoteInvitee[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // once made, show it so the links can be sent straight away
  const [made, setMade] = useState<{ jobId: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: owner } = await sb.rpc('get_effective_owner_id')
      if (alive) setOwnerId((owner as string) || user.id)
    })()
    return () => { alive = false }
  }, [sb])

  // the calculator's list as items a supplier prices one by one (what and how much, never our own prices); it can be edited, and products added
  const [items, setItems] = useState<OrderItem[]>(() => lines.filter(l => l.purchaseQty > 0 && l.name.trim()).map((l, i) => ({ id: `it-${i + 1}`, name: l.name.trim(), qty: +l.purchaseQty.toFixed(2), unit: l.unit.trim() })))
  const cleanItems = items.filter(i => i.name.trim() && i.qty > 0).map(i => ({ ...i, name: i.name.trim(), unit: i.unit.trim() }))
  const itemCount = cleanItems.length
  const pickedJob = jobs.find(j => j.id === jobId)

  function chooseJob(id: string) {
    setJobId(id)
    const j = jobs.find(x => x.id === id)
    if (j && !where.trim()) setWhere(j.address || '')
  }

  async function create() {
    if (!ownerId) return
    if (itemCount === 0) { setError('There is nothing on the list to price. Add an item.'); return }
    if (!name.trim()) { setError('Give the request a name.'); return }
    if (recips.length === 0) { setError('Add at least one supplier to ask.'); return }
    setBusy(true); setError('')
    const { order, error: err, degraded } = await insertJobOrder(sb, ownerId, {
      jobId, kind: 'quote_request', status: 'draft', orderType: 'materials', costCategory: 'materials', payTerms: 'on_order', rateBasis: 'fixed', rate: 0, plannedUnits: 1,
      title: name.trim(), details: note.trim(), items: cleanItems, deliveryDate: needed, siteAddress: where.trim(),
      supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '', sourceLabel: [title, location].filter(Boolean).join(' · '),
    })
    if (!order) {
      setBusy(false)
      setError(/\bitems\b|PGRST204/i.test(err ?? '') ? 'Pricing item by item needs a small database update first: run supabase/job-orders-lines.sql in the Supabase SQL editor.' : /job_id|null value|violates not-null/i.test(err ?? '') ? 'Asking for prices before there is a job needs a small database update first: run supabase/job-orders-materials.sql in the Supabase SQL editor. Or pick a job.' : `Could not save the request. ${err ?? ''}`)
      return
    }
    const r = await insertOrderQuotes(sb, ownerId, order.id, recips)
    setBusy(false)
    if (!r.ok) { setError(/does not exist|schema cache|PGRST205|42P01/i.test(r.error ?? '') ? 'Price requests need a small database update first: run supabase/job-orders-quotes.sql in the Supabase SQL editor.' : `The request was saved but the suppliers were not added: ${r.error ?? ''}`); return }
    if (degraded) window.alert('Made, but as one price for the whole list: pricing item by item needs a small database update first. Run supabase/job-orders-lines.sql in the Supabase SQL editor, then make the request again. (This one still works, with one price.)')
    setMade({ jobId: jobId || null })
  }

  if (made) return <JobOrdersModal jobId={made.jobId} jobLabel={made.jobId ? `${pickedJob?.client ?? 'Job'} — price request made` : 'Price request made. Send each supplier their link.'} onClose={onClose} zIndex={1300} />

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const lab: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }
  const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const primary: React.CSSProperties = { ...btn, background: '#0369a1', borderColor: '#0369a1', color: '#fff' }

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} onMouseDown={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 14px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>✉ Ask suppliers for prices</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{title}{location ? ` · ${location}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            Each supplier gets their own link and prices every item on the list (a unit price each, or "can't supply"), adds any delivery charge, and gives their delivery date and how long the prices stand. You compare them side by side. They see what to buy and how much, never your own prices, and only the area of the job.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <div><label style={lab}>Name of the request</label><input style={inp} value={name} onChange={e => setName(e.target.value)} /></div>
            <div>
              <label style={lab}>For which job</label>
              <select style={inp} value={jobId} onChange={e => chooseJob(e.target.value)}>
                <option value="">Not for a job yet (pricing a quote)</option>
                {jobs.filter(j => !j.archived && j.stage !== 'complete').map(j => <option key={j.id} value={j.id}>{j.client} · {j.title || j.type}</option>)}
              </select>
            </div>
            <div><label style={lab}>Where is it going (the area is enough)</label><input style={inp} value={where} onChange={e => setWhere(e.target.value)} placeholder="Tooting, SW17" /></div>
            <div><label style={lab}>Needed by</label><input style={inp} type="date" value={needed} onChange={e => setNeeded(e.target.value)} /></div>
          </div>
          <div><label style={lab}>A note for the suppliers (optional)</label><input style={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="Crane lorry needed, trade account, pick-up is fine…" /></div>
          <PriceRequestItems ownerId={ownerId} items={items} onChange={setItems} />
          <Recipients suppliers={suppliers} value={recips} onChange={setRecips} inp={inp} lab={lab} btn={btn} />
          {error && <div style={{ padding: '8px 12px', borderRadius: 7, fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={create} disabled={busy || !ownerId} style={primary}>{busy ? 'Making the request…' : 'Make the request, then send the links'}</button>
            <button onClick={onClose} style={btn}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
