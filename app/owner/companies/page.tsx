'use client'

import Link from 'next/link'
import { useOwnerData, ErrorNote, PageTitle, TH, TD, Badge } from '@/components/OwnerUi'
import { fmtDate, type OwnerCompany } from '@/lib/owner-api'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

export default function OwnerCompaniesPage() {
  const { data, error, loading } = useOwnerData<OwnerCompany[]>('owner_companies')
  return (
    <>
      <PageTitle sub="Every company on the platform. Numbers only — never the contents of their quotes, clients or prices.">Companies</PageTitle>
      <ErrorNote message={error} />
      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={TH}>Company</th><th style={TH}>Owner email</th><th style={TH}>Joined</th><th style={TH}>Last sign-in</th>
                <th style={TH}>Quotes</th><th style={TH}>Jobs</th><th style={TH}>Clients</th>
                <th style={TH}>AI today</th><th style={TH}>Messages today</th><th style={TH}>Terms</th><th style={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={11} style={{ ...TD, color: 'var(--muted)' }}>No companies yet.</td></tr>}
              {data.map(c => (
                <tr key={c.owner_id}>
                  <td style={TD}><Link href={`/owner/companies/${c.owner_id}`} style={{ fontWeight: 700 }}>{c.company_name || '(no name)'}</Link>{c.invite_label ? <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.invite_label}</div> : null}</td>
                  <td style={TD}>{c.owner_email || '—'}</td>
                  <td style={TD}>{fmtDate(c.joined)}</td>
                  <td style={TD}>{fmtDate(c.last_sign_in_at)}</td>
                  <td style={TD}>{c.quotes}</td><td style={TD}>{c.jobs}</td><td style={TD}>{c.clients}</td>
                  <td style={TD}>{c.ai_today} / {c.ai_limit}</td>
                  <td style={TD}>{c.send_today} / {c.send_limit}</td>
                  <td style={TD}>{c.terms_version ? <Badge tone={c.terms_version === CURRENT_TERMS_VERSION ? 'green' : 'amber'}>{c.terms_version}</Badge> : <Badge>none</Badge>}</td>
                  <td style={TD}>{c.paused ? <Badge tone="red">Paused</Badge> : <Badge tone="green">Active</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
