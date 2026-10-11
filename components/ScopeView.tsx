import React from 'react'
import { parseScope, type ScopeSegment } from '@/lib/scope-format'

// A scope of works as it is read on screen: real bold, underline and bullets, no stars. See lib/scope-format.ts.
const runs = (segs: ScopeSegment[]) => segs.map((s, i) => {
  let n: React.ReactNode = s.text
  if (s.underline) n = <u>{n}</u>
  if (s.bold) n = <strong>{n}</strong>
  return <React.Fragment key={i}>{n}</React.Fragment>
})

export default function ScopeView({ text, style }: { text: string; style?: React.CSSProperties }) {
  const blocks = parseScope(text)
  const out: React.ReactNode[] = []
  let items: React.ReactNode[] = []
  const closeList = (k: number) => { if (items.length) { out.push(<ul key={`u${k}`} style={{ margin: '4px 0 6px 20px', padding: 0 }}>{items}</ul>); items = [] } }
  blocks.forEach((b, i) => {
    if (b.kind === 'bullet') { items.push(<li key={i} style={{ margin: '0 0 2px' }}>{runs(b.segs)}</li>); return }
    closeList(i)
    out.push(b.kind === 'blank' ? <div key={i} style={{ height: '0.6em' }} /> : <div key={i}>{runs(b.segs)}</div>)
  })
  closeList(blocks.length)
  return <div style={style}>{out}</div>
}
