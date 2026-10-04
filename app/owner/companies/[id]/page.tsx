'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useOwnerData, ErrorNote, PageTitle, TH, TD, Badge } from '@/components/OwnerUi'
import { ownerRpc, fmtDate, fmtDateTime, type OwnerCompany } from '@/lib/owner-api'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

interface UsageDay { day: string; ai: number; send: number }

export default function OwnerCompanyPage() {
  const { id } = useParams<{ id: string }>()
  const list = useOwnerData<OwnerCompany[]>('owner_companies')
  const usage = useOwnerData<UsageDay[]>('owner_company_usage', { p_owner: id })
  const company = list.data?.find(c => c.owner_id === id)

  const [aiLimit, setAiLimit] = useState('')
  const [sendLimit, setSendLimit] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (company) {
      setAiLimit(company.ai_limit_override == null ? '' : String(company.ai_limit_override))
      setSendLimit(company.send_limit_override == null ? '' : String(company.send_limit_override))
    }
  }, [company])

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault()
    setMsg(''); setErr(''); setBusy(true)
    try {
      const toNum = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))))
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_set_limits', { p_owner: id, p_ai: toNum(aiLimit), p_send: toNum(sendLimit) })
      if (r.error) throw new Error(r.error === 'out_of_range' ? 'Limits must be between 0 and 100,000.' : r.error)
      setMsg('Limits saved.')
      list.reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not save') } finally { setBusy(false) }
  }

  async function setPaused(paused: boolean) {
    if (paused && !window.confirm(`Pause ${company?.company_name}? Their people will see an "account paused" page and AI and messaging stop.`)) return
    setMsg(''); setErr(''); setBusy(true)
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_set_paused', { p_owner: id, p_paused: paused })
      if (r.error) throw new Error(r.error)
      setMsg(paused ? 'Account paused.' : 'Account re-opened.')
      list.reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not change') } finally { setBusy(false) }
  }

  if (list.loading && !list.data) return <div style={{ color: 'var(--muted)' }}>Loading…</div>
  if (!company) return <><ErrorNote message={list.error || 'Company not found.'} /><Link href="/owner/companies">← All companies</Link></>

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <div style={{ width: 170, color: 'var(--muted)', flexShrink: 0 }}>{label}</div><div>{value}</div>
    </div>
  )

  return (
    <>
      <div style={{ marginBottom: 8 }}><Link href="/owner/companies" style={{ fontSize: 13 }}>← All companies</Link></div>
      <PageTitle sub={company.owner_email || undefined}>{company.company_name || '(no name)'} {company.paused ? <Badge tone="red">Paused</Badge> : <Badge tone="green">Active</Badge>}</PageTitle>
      <ErrorNote message={err || list.error} />
      {msg && <div style={{ padding: '10px 14px', background: 'rgba(122,181,51,0.14)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-hd">Account</div>
          <div style={{ padding: '6px 18px 14px' }}>
            {row('Joined', fmtDate(company.joined))}
            {row('Last sign-in', fmtDateTime(company.last_sign_in_at))}
            {row('Invite code used for', company.invite_label || '—')}
            {row('Terms accepted', company.terms_accepted_at ? `${fmtDate(company.terms_accepted_at)} ` : '—')}
            {row('Terms version', company.terms_version ? <Badge tone={company.terms_version === CURRENT_TERMS_VERSION ? 'green' : 'amber'}>{company.terms_version}</Badge> : <Badge>none</Badge>)}
            {row('Quotes', company.quotes)}
            {row('Jobs', company.jobs)}
            {row('Clients', company.clients)}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Counts only. The owner area cannot show their quotes, clients or prices.</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-hd">Daily limits</div>
          <form onSubmit={saveLimits} style={{ padding: '14px 18px' }}>
            <div className="fg">
              <label>AI uses per day <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(blank = default 100)</span></label>
              <input type="number" min={0} max={100000} value={aiLimit} onChange={e => setAiLimit(e.target.value)} placeholder="100" />
            </div>
            <div className="fg">
              <label>Messages per day <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(blank = default 60)</span></label>
              <input type="number" min={0} max={100000} value={sendLimit} onChange={e => setSendLimit(e.target.value)} placeholder="60" />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
              Today: {company.ai_today}/{company.ai_limit} AI · {company.send_today}/{company.send_limit} messages
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>Save limits</button>
          </form>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-hd">Pause this account</div>
          <div style={{ padding: '14px 18px', fontSize: 13.5, lineHeight: 1.55 }}>
            A paused company sees an “account paused” page. AI and messaging stop. Nothing is deleted, and you can re-open it at any time.
            <div style={{ marginTop: 12 }}>
              {company.paused
                ? <button className="btn btn-primary" disabled={busy} onClick={() => setPaused(false)}>Re-open account</button>
                : <button className="btn btn-outline" disabled={busy} onClick={() => setPaused(true)}>Pause account</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <div className="card-hd">Usage — last 14 days</div>
        <ErrorNote message={usage.error} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Day</th><th style={TH}>AI uses</th><th style={TH}>Messages</th></tr></thead>
          <tbody>
            {(usage.data ?? []).map(d => (
              <tr key={d.day}><td style={TD}>{fmtDate(d.day)}</td><td style={TD}>{d.ai || '—'}</td><td style={TD}>{d.send || '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--muted)' }}>7 days: {company.ai_7d} AI, {company.send_7d} messages · 30 days: {company.ai_30d} AI, {company.send_30d} messages</div>
      </div>
    </>
  )
}
