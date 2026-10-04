'use client'

import { useState } from 'react'
import { useOwnerData, ErrorNote, PageTitle, TH, TD, Badge } from '@/components/OwnerUi'
import { ownerRpc, fmtDate } from '@/lib/owner-api'

interface Invite {
  id: string; code: string; label: string; created_at: string; expires_at: string | null; redeemed_at: string | null
  redeemed_by_company: string | null; status: 'unused' | 'used' | 'expired'
}

export default function OwnerInvitesPage() {
  const { data, error, loading, reload } = useOwnerData<Invite[]>('owner_list_invites')
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('30')
  const [created, setCreated] = useState<{ code: string; label: string } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setCreated(null); setBusy(true)
    try {
      const r = await ownerRpc<{ ok?: boolean; code?: string; label?: string; error?: string }>('owner_create_invite', { p_label: label.trim(), p_days: Number(days) || 0 })
      if (!r.ok || !r.code) throw new Error(r.error || 'Could not create the code')
      setCreated({ code: r.code, label: r.label || '' })
      setLabel('')
      reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not create') } finally { setBusy(false) }
  }

  async function del(i: Invite) {
    if (!window.confirm(`Delete the unused code for “${i.label || i.code}”?`)) return
    setErr('')
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_delete_invite', { p_id: i.id })
      if (!r.ok) throw new Error('That code has already been used, so it can’t be deleted.')
      reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not delete') }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1800) } catch { /* the code is visible to copy by hand */ }
  }

  return (
    <>
      <PageTitle sub="Make a code for each friend. Each code works once; they use it at the registration page.">Invite codes</PageTitle>
      <ErrorNote message={err || error} />

      <div className="card">
        <div className="card-hd">New invite code</div>
        <form onSubmit={create} style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0, flex: '1 1 260px' }}>
            <label>Who is it for?</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Dave Smith (Smith Building)" required />
          </div>
          <div className="fg" style={{ margin: 0, width: 150 }}>
            <label>Valid for (days)</label>
            <input type="number" min={0} max={365} value={days} onChange={e => setDays(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Making…' : 'Make code'}</button>
        </form>
        {created && (
          <div style={{ margin: '0 18px 16px', padding: '12px 14px', background: 'rgba(122,181,51,0.14)', borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>Code for {created.label}:</div>
            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>{created.code}</div>
            <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => copy(created.code)}>{copied === created.code ? 'Copied ✓' : 'Copy code'}</button>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Send it with: app.buildospro.ai/register</div>
          </div>
        )}
      </div>

      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead><tr><th style={TH}>For</th><th style={TH}>Code</th><th style={TH}>Status</th><th style={TH}>Created</th><th style={TH}>Expires</th><th style={TH}>Used by</th><th style={TH} /></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={7} style={{ ...TD, color: 'var(--muted)' }}>No codes yet.</td></tr>}
              {data.map(i => (
                <tr key={i.id}>
                  <td style={TD}>{i.label || '—'}</td>
                  <td style={{ ...TD, fontFamily: 'monospace' }}>{i.code}</td>
                  <td style={TD}>{i.status === 'used' ? <Badge tone="green">Used</Badge> : i.status === 'expired' ? <Badge tone="red">Expired</Badge> : <Badge tone="amber">Unused</Badge>}</td>
                  <td style={TD}>{fmtDate(i.created_at)}</td>
                  <td style={TD}>{fmtDate(i.expires_at)}</td>
                  <td style={TD}>{i.redeemed_by_company ? `${i.redeemed_by_company} (${fmtDate(i.redeemed_at)})` : '—'}</td>
                  <td style={TD}>
                    {i.status !== 'used' && <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => copy(i.code)}>{copied === i.code ? 'Copied ✓' : 'Copy'}</button>}{' '}
                    {i.status !== 'used' && <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => del(i)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
