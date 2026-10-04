'use client'

import { useOwnerData, StatCard, ErrorNote, PageTitle } from '@/components/OwnerUi'

interface Overview {
  companies: number; active_7d: number; paused: number; ai_today: number; messages_today: number; unused_invites: number; new_feedback: number
}

export default function OwnerOverviewPage() {
  const { data, error, loading } = useOwnerData<Overview>('owner_overview')
  return (
    <>
      <PageTitle sub="A quick look at how the beta is going. Numbers only — you can never see inside a company's quotes, clients or prices from here.">Overview</PageTitle>
      <ErrorNote message={error} />
      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          <StatCard label="Companies" value={data.companies} hint={`${data.active_7d} active in the last 7 days`} href="/owner/companies" />
          <StatCard label="Paused" value={data.paused} hint="accounts switched off" href="/owner/companies" />
          <StatCard label="AI uses today" value={data.ai_today} hint="across all companies" />
          <StatCard label="Messages sent today" value={data.messages_today} hint="emails / WhatsApp" />
          <StatCard label="Unused invite codes" value={data.unused_invites} hint="still valid" href="/owner/invites" />
          <StatCard label="New feedback" value={data.new_feedback} hint="waiting to be read" href="/owner/feedback" />
        </div>
      )}
    </>
  )
}
