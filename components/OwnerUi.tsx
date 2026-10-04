'use client'

// Small shared pieces for the owner pages.

import { useCallback, useEffect, useState } from 'react'
import { ownerRpc } from '@/lib/owner-api'

/** Loads an owner_* function's result and lets the page reload it. */
export function useOwnerData<T>(fn: string, args?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(args ?? {})

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await ownerRpc<T>(fn, args))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key])

  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload }
}

export function StatCard({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const inner = (
    <div className="card" style={{ marginBottom: 0 }}>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)' }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  )
  return href ? <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</a> : inner
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null
  return <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13, margin: '0 0 14px' }}>{message}</div>
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>{children}</h1>
      {sub && <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', padding: '8px 10px', borderBottom: '1.5px solid var(--border)', whiteSpace: 'nowrap' }
export const TD: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13.5, verticalAlign: 'top' }

export function Badge({ children, tone = 'grey' }: { children: React.ReactNode; tone?: 'grey' | 'green' | 'red' | 'amber' }) {
  const colours = {
    grey: ['#eef0f2', '#4a5058'], green: ['#e4f2cf', '#3e6b12'], red: ['#fbe3df', '#a3281b'], amber: ['#fdf0d3', '#8a5a00'],
  }[tone]
  return <span style={{ background: colours[0], color: colours[1], borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}
