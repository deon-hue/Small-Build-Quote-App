// Xero OAuth2 + API helpers (server-only). Raw fetch, no SDK.
// Tokens live in xero_connections (RLS owner-only). Access tokens are renewed
// with the rotating refresh token as needed.

import type { SupabaseClient } from '@supabase/supabase-js'

const AUTHORIZE_URL   = 'https://login.xero.com/identity/connect/authorize'
const TOKEN_URL       = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const API_BASE        = 'https://api.xero.com/api.xro/2.0'

// NOTE: accounting.transactions must be enabled in the Xero Developer Portal
// (developer.xero.com → your app → Configuration) before adding it here.
export const XERO_SCOPES = [
  'openid', 'profile', 'email', 'offline_access',
  'accounting.contacts',
].join(' ')

export function xeroConfigured(): boolean {
  return !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET)
}

export function redirectUri(origin: string): string {
  return process.env.XERO_REDIRECT_URI || `${origin}/api/xero/callback`
}

export function authorizeUrl(origin: string, state: string): string {
  // Build manually with encodeURIComponent so spaces in `scope` become %20,
  // not '+'. Xero rejects '+'-separated scopes with invalid_scope.
  const params: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', process.env.XERO_CLIENT_ID || ''],
    ['redirect_uri', redirectUri(origin)],
    ['scope', XERO_SCOPES],
    ['state', state],
  ]
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${AUTHORIZE_URL}?${query}`
}

function basicAuth(): string {
  const raw = `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  return 'Basic ' + Buffer.from(raw).toString('base64')
}

interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; scope?: string }

export async function exchangeCode(origin: string, code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin) }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Fetch the Xero org(s) this token can access; returns the first tenant. */
export async function fetchFirstTenant(accessToken: string): Promise<{ tenantId: string; tenantName: string } | null> {
  const res = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } })
  if (!res.ok) return null
  const arr = await res.json() as Array<{ tenantId: string; tenantName: string }>
  return arr?.length ? { tenantId: arr[0].tenantId, tenantName: arr[0].tenantName } : null
}

export interface XeroConn { access_token: string; refresh_token: string; tenant_id: string; tenant_name: string; expires_at: string | null; scopes: string }

/** Load the user's connection, refreshing the access token if it's near expiry. Returns null if not connected. */
export async function getValidConnection(sb: SupabaseClient, userId: string): Promise<XeroConn | null> {
  const { data } = await sb.from('xero_connections').select('*').eq('user_id', userId).maybeSingle()
  if (!data) return null
  let conn = data as XeroConn

  const expMs = conn.expires_at ? new Date(conn.expires_at).getTime() : 0
  if (Date.now() > expMs - 60_000) {
    // refresh
    const t = await refreshTokens(conn.refresh_token)
    const expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString()
    await sb.from('xero_connections').update({
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at, scopes: t.scope ?? conn.scopes, updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
    conn = { ...conn, access_token: t.access_token, refresh_token: t.refresh_token, expires_at }
  }
  return conn
}

/** Call a Xero Accounting API endpoint with a valid connection. */
export async function xeroFetch(conn: XeroConn, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      'Xero-Tenant-Id': conn.tenant_id,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}
