'use client'

import { useState, useEffect } from 'react'

interface Status { configured: boolean; connected: boolean; tenantName: string | null; connectedAt: string | null }

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected:      { text: 'Connected to Xero ✓', ok: true },
  denied:         { text: 'Connection cancelled.', ok: false },
  state:          { text: 'Security check failed — please try connecting again.', ok: false },
  notenant:       { text: 'No Xero organisation found for that login.', ok: false },
  notconfigured:  { text: 'Xero isn’t configured on the server yet (missing Client ID/Secret).', ok: false },
  error:          { text: 'Something went wrong connecting to Xero.', ok: false },
}

export default function XeroConnectionCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function syncContacts() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/xero/sync-contacts', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setSyncMsg(`Sync failed: ${data.error || 'error'}`); return }
      const s = data.summary
      setSyncMsg(`Synced ✓ — clients: +${s.clientsCreatedLocal} new, ${s.clientsUpdatedLocal} updated, ${s.clientsPushed} sent to Xero · suppliers: +${s.suppliersCreatedLocal} new, ${s.suppliersUpdatedLocal} updated, ${s.suppliersPushed} sent.${s.errors?.length ? ` (${s.errors.length} issue(s))` : ''}`)
    } catch {
      setSyncMsg('Sync failed — please try again.')
    } finally { setSyncing(false) }
  }

  async function load() {
    try { setStatus(await (await fetch('/api/xero/status')).json()) } catch { /* ignore */ }
  }
  useEffect(() => {
    load()
    try { setFlash(new URLSearchParams(window.location.search).get('xero')) } catch { /* ignore */ }
  }, [])

  async function disconnect() {
    if (!confirm('Disconnect Xero? You can reconnect anytime.')) return
    setBusy(true)
    try { await fetch('/api/xero/disconnect', { method: 'POST' }); await load() } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="card-hd">Accounting — Xero</div>
      <div style={{ padding: '18px 20px' }}>
        {flash && MESSAGES[flash] && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, fontSize: 12,
            background: MESSAGES[flash].ok ? '#dcfce7' : '#fef2f2',
            color: MESSAGES[flash].ok ? '#166534' : '#991b1b',
            border: `1px solid ${MESSAGES[flash].ok ? '#bbf7d0' : '#fecaca'}` }}>
            {MESSAGES[flash].text}
          </div>
        )}

        {!status ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Checking…</div>
        ) : status.connected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>● Connected</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{status.tenantName}</span>
              <div style={{ flex: 1 }} />
              <button className="btn-sm btn-outline" onClick={syncContacts} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync contacts'}</button>
              <button className="btn-sm btn-danger" onClick={disconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Disconnect'}</button>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Sync pushes your clients &amp; suppliers to Xero and pulls Xero contacts back in. If a contact was edited both sides, the most recently changed version wins.
            </p>
            {syncMsg && <div style={{ marginTop: 8, fontSize: 12, color: '#0f172a', background: '#f1f5f9', borderRadius: 6, padding: '8px 10px' }}>{syncMsg}</div>}
          </>
        ) : (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
              Connect your Xero organisation to sync clients &amp; suppliers and push supplier bills. Captured costs stay tracked in this app; Xero handles the accounting.
            </p>
            {status.configured ? (
              <a href="/api/xero/connect" className="btn btn-primary" style={{ textDecoration: 'none' }}>Connect to Xero</a>
            ) : (
              <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px' }}>
                Xero isn’t configured on the server yet. Set <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code> in the environment, then reload.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
