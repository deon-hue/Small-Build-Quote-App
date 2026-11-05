'use client'

// Print the drawing: pick what part, the paper and the scale, and what goes on the page; then download the PDF, keep it with this take-off (so a quote can pick it up), or attach it to a quote. The picture and the PDF are made
// by Take-off (buildPdf); no prices are on it. The layout rules are in lib/takeoff-print.ts.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PAPER_NAMES, PRINT_SCALES, type PaperName } from '@/lib/takeoff-print'
import { listDrawingPdfs, saveDrawingPdf, downloadDrawingPdf, deleteDrawingPdf, type SavedDrawing } from '@/lib/takeoff-sheet-cloud'
import { uploadQuoteDocument } from '@/lib/quote-documents'

export type PrintPart = 'drawings' | 'sheet' | 'view'
export interface PrintOptions {
  part: PrintPart
  paper: PaperName
  /** 'fit' or the scale denominator (50 is 1:50) */
  scale: 'fit' | number
  titleBlock: boolean
  keyRow: boolean
  withPlan: boolean
  description: boolean
  /** which drawings the description covers: the showing level of the showing sheet, or the whole take-off */
  descriptionOf: 'showing' | 'all'
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { part: 'drawings', paper: 'A3', scale: 'fit', titleBlock: true, keyRow: true, withPlan: false, description: true, descriptionOf: 'showing' }

export interface PrintBuilt { bytes: Uint8Array; fileName: string; note: string; scaleText: string }

interface Props {
  options: PrintOptions
  onOptions: (o: PrintOptions) => void
  /** whether the showing sheet's scale is set (a true scale needs it) */
  hasScale: boolean
  hasLevels: boolean
  hasPlan: boolean
  userId: string | null
  projectId: string
  /** quotes the drawing can be attached to, the one this take-off is linked to first */
  quotes: { id: string; label: string }[]
  linkedQuoteId?: string
  buildPdf: (o: PrintOptions) => Promise<PrintBuilt>
  onClose: () => void
}

const box = { background: 'var(--to-panel, #fff)', color: 'var(--to-text, #1e293b)', border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 10, width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto' as const, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }
const lab = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: 'var(--to-muted, #64748b)', marginBottom: 4 }
const sel = { height: 30, borderRadius: 6, border: '1px solid var(--to-border, #cbd5e1)', background: 'var(--to-input, #fff)', color: 'inherit', padding: '0 8px', fontSize: 13 }
const btn = (primary = false, disabled = false) => ({ height: 34, padding: '0 14px', borderRadius: 7, border: primary ? 'none' : '1px solid var(--to-border, #cbd5e1)', background: primary ? '#2563eb' : 'var(--to-input, #f8fafc)', color: primary ? '#fff' : 'inherit', fontWeight: 600, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 })

function saveBlob(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function TakeoffPrintDialog(p: Props) {
  const o = p.options
  const set = (patch: Partial<PrintOptions>) => p.onOptions({ ...o, ...patch })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saved, setSaved] = useState<SavedDrawing[]>([])
  const [quoteId, setQuoteId] = useState(p.linkedQuoteId && p.quotes.some(q => q.id === p.linkedQuoteId) ? p.linkedQuoteId : '')

  const refresh = async () => { if (p.userId) setSaved(await listDrawingPdfs(createClient(), p.userId, p.projectId)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [p.userId, p.projectId])

  async function run(what: string, fn: (b: PrintBuilt) => Promise<string>) {
    if (busy) return
    setBusy(what); setMsg(null)
    try {
      const built = await p.buildPdf(o)
      const text = await fn(built)
      setMsg({ ok: true, text: text + (built.note ? ' ' + built.note : '') })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'The drawing could not be made.' })
    } finally { setBusy('') }
  }

  const download = () => run('download', async b => { saveBlob(b.bytes, b.fileName); return `Downloaded "${b.fileName}" (${b.scaleText}).` })
  const keep = () => run('save', async b => {
    if (!p.userId) throw new Error('You need to be signed in to save it with the take-off.')
    const r = await saveDrawingPdf(createClient(), p.userId, p.projectId, b.fileName, b.bytes)
    if ('error' in r) throw new Error(r.error)
    await refresh()
    return 'Saved with this take-off. On the quote, use Pick from the customer\'s or lead\'s files to add it.'
  })
  const attach = () => run('attach', async b => {
    if (!p.userId) throw new Error('You need to be signed in to attach it.')
    if (!quoteId) throw new Error('Pick a quote first.')
    const file = new File([b.bytes as BlobPart], b.fileName, { type: 'application/pdf' })
    const r = await uploadQuoteDocument(createClient(), p.userId, quoteId, file, 'plan', b.fileName.replace(/\.pdf$/i, ''))
    if ('error' in r) throw new Error(r.error)
    const q = p.quotes.find(x => x.id === quoteId)
    return `Attached to ${q ? q.label : 'the quote'} (in its Attachments).`
  })

  async function openSaved(d: SavedDrawing) {
    const blob = await downloadDrawingPdf(createClient(), d.path)
    if (!blob) { setMsg({ ok: false, text: 'That drawing could not be opened.' }); return }
    const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  async function removeSaved(d: SavedDrawing) {
    if (!window.confirm(`Delete the saved drawing "${d.name}"? It stays on any quote it was already attached to.`)) return
    if (await deleteDrawingPdf(createClient(), d.path)) await refresh(); else setMsg({ ok: false, text: 'It could not be deleted.' })
  }

  const row = { display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: 12 }
  const check = (label: string, on: boolean, change: (v: boolean) => void, disabled = false, hint = '') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: disabled ? 0.55 : 1, marginBottom: 6 }} title={hint}>
      <input type="checkbox" checked={on && !disabled} disabled={disabled} onChange={e => change(e.target.checked)} /> {label}
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget && !busy) p.onClose() }}>
      <div style={box} data-testid="print-dialog">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>🖨 Print the drawing</div>
          <button onClick={p.onClose} disabled={!!busy} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'inherit', lineHeight: 1 }} aria-label="Close">×</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--to-muted, #64748b)', marginBottom: 14 }}>A plan printout with a key and a description of the works. It has no prices on it.</div>

        <div style={row}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={lab}>What to print</div>
            <select style={{ ...sel, width: '100%' }} value={o.part} onChange={e => set({ part: e.target.value as PrintPart })}>
              <option value="drawings">Everything drawn (fitted to the page)</option>
              <option value="sheet" disabled={!p.hasPlan}>The whole sheet</option>
              <option value="view">What is on the screen now</option>
            </select>
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <div style={lab}>Paper</div>
            <select style={{ ...sel, width: '100%' }} value={o.paper} onChange={e => set({ paper: e.target.value as PaperName })}>
              {PAPER_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 130px' }}>
            <div style={lab}>Scale</div>
            <select style={{ ...sel, width: '100%' }} value={o.scale === 'fit' ? 'fit' : String(o.scale)} onChange={e => set({ scale: e.target.value === 'fit' ? 'fit' : Number(e.target.value) })} disabled={!p.hasScale} title={p.hasScale ? '' : 'Set the sheet\'s scale first to print at a true scale'}>
              <option value="fit">Fit the page</option>
              {PRINT_SCALES.map(s => <option key={s} value={s}>1:{s}</option>)}
            </select>
          </div>
        </div>
        {!p.hasScale && <div style={{ fontSize: 11, color: '#b45309', marginBottom: 10 }}>This sheet's scale is not set, so the print is fitted to the page and says "Scale not set". Set the scale (or Calibrate) to print at 1:50, 1:100 and so on.</div>}

        <div style={lab}>On the page</div>
        <div style={{ marginBottom: 12 }}>
          {check('Title block (job, client, site, drawing, scale, date)', o.titleBlock, v => set({ titleBlock: v }))}
          {check('Key of what the colours are', o.keyRow, v => set({ keyRow: v }))}
          {check('Show the plan picture underneath', o.withPlan, v => set({ withPlan: v }), !p.hasPlan, 'The architect\'s plan or scan the drawing was traced from. Off: just your drawing on white, which is cleaner.')}
          {check('A second page: description of the works', o.description, v => set({ description: v }), false, 'In plain words, from the take-off: what is being built and the sizes. No prices.')}
          {o.description && (
            <div style={{ marginLeft: 24 }}>
              <select style={sel} value={o.descriptionOf} onChange={e => set({ descriptionOf: e.target.value as 'showing' | 'all' })}>
                <option value="showing">{p.hasLevels ? 'Covering what is showing (this sheet and level)' : 'Covering what is showing (this sheet)'}</option>
                <option value="all">Covering the whole take-off</option>
              </select>
            </div>
          )}
        </div>

        {msg && <div role="status" style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 6, marginBottom: 12, background: msg.ok ? '#ecfdf5' : '#fef2f2', color: msg.ok ? '#065f46' : '#991b1b', border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}` }}>{msg.text}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button style={btn(true, !!busy)} disabled={!!busy} onClick={download}>{busy === 'download' ? 'Making the PDF…' : '⬇ Download PDF'}</button>
          <button style={btn(false, !!busy || !p.userId)} disabled={!!busy || !p.userId} onClick={keep} title="Keeps the PDF with this take-off so the quote can pick it up">{busy === 'save' ? 'Saving…' : '💾 Save with this take-off'}</button>
        </div>

        <div style={{ borderTop: '1px solid var(--to-border, #e2e8f0)', paddingTop: 12, marginBottom: 12 }}>
          <div style={lab}>Attach to a quote</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...sel, flex: 1, minWidth: 0 }} value={quoteId} onChange={e => setQuoteId(e.target.value)}>
              <option value="">Pick a quote…</option>
              {p.quotes.map(q => <option key={q.id} value={q.id}>{q.label}{q.id === p.linkedQuoteId ? '  (this take-off\'s quote)' : ''}</option>)}
            </select>
            <button style={btn(false, !!busy || !quoteId || !p.userId)} disabled={!!busy || !quoteId || !p.userId} onClick={attach}>{busy === 'attach' ? 'Attaching…' : '📎 Attach'}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--to-muted, #64748b)', marginTop: 4 }}>It goes in the quote's Attachments as a plan. Or use "Save with this take-off" and pick it from the quote.</div>
        </div>

        {saved.length > 0 && (
          <div style={{ borderTop: '1px solid var(--to-border, #e2e8f0)', paddingTop: 12 }}>
            <div style={lab}>Saved with this take-off</div>
            {saved.map(d => (
              <div key={d.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>📄 {d.name}</span>
                <span style={{ color: 'var(--to-muted, #64748b)', fontSize: 11 }}>{d.at ? new Date(d.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                <button style={{ ...btn(), height: 26, padding: '0 8px', fontSize: 12 }} onClick={() => openSaved(d)}>Open</button>
                <button style={{ ...btn(), height: 26, padding: '0 8px', fontSize: 12 }} onClick={() => removeSaved(d)} aria-label="Delete">🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
