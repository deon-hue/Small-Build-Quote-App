'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  FloorLayer, FloorMakeup, TakeoffItem,
  LayerCostRecord, LayerLabourItem, LayerMaterialItem,
  LayerPlantItem, LayerSubItem, LayerOtherItem,
} from '@/lib/takeoff-types'
import type { BOLabourTrade } from '@/lib/back-office-types'

// ── helpers ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const f2  = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function empty(): LayerCostRecord {
  return { labourItems: [], materialItems: [], plantItems: [], subItems: [], otherItems: [] }
}

type Tab = 'labour' | 'materials' | 'plant' | 'sub' | 'other'

type EditState =
  | null
  | { tab: 'labour';    id: string | 'new'; form: Partial<LayerLabourItem>   }
  | { tab: 'materials'; id: string | 'new'; form: Partial<LayerMaterialItem> }
  | { tab: 'plant';     id: string | 'new'; form: Partial<LayerPlantItem>    }
  | { tab: 'sub';       id: string | 'new'; form: Partial<LayerSubItem>      }
  | { tab: 'other';     id: string | 'new'; form: Partial<LayerOtherItem>    }

export interface ConstructionLayerModalProps {
  layer:         FloorLayer
  makeup:        FloorMakeup
  item:          TakeoffItem
  calcQty:       number
  calcUnit:      string
  darkMode:      boolean
  accentColor:   string
  labourTrades:  BOLabourTrade[]
  onSaveToTakeoff: (costs: LayerCostRecord, toggleEnabled?: boolean, thicknessMm?: number) => void
  onSaveToBO:    (costs: LayerCostRecord) => Promise<void>
  onClose:       () => void
}

const CAT_COLOR: Record<string, string> = {
  labour: '#e74c3c', materials: '#3498db',
  plant: '#f39c12', sub: '#9b59b6', other: '#95a5a6',
}

export default function ConstructionLayerModal({
  layer, makeup, item, calcQty, calcUnit,
  darkMode, accentColor, labourTrades,
  onSaveToTakeoff, onSaveToBO, onClose,
}: ConstructionLayerModalProps) {
  // ── local state ────────────────────────────────────────────────────────────
  const initEnabled   = (item.floorLayerToggles ?? {})[layer.id] ?? layer.defaultEnabled
  const initThickness = (item.floorLayerThicknesses ?? {})[layer.id] ?? layer.thickness

  const [enabled,   setEnabled]   = useState(initEnabled)
  const [thickness, setThickness] = useState(initThickness)
  const [costs,     setCosts]     = useState<LayerCostRecord>(() => item.layerCosts?.[layer.id] ?? empty())
  const [tab,       setTab]       = useState<Tab>('labour')
  const [es,        setEs]        = useState<EditState>(null)
  const [saving,    setSaving]    = useState(false)
  const [savedMsg,  setSavedMsg]  = useState('')

  // ── totals ─────────────────────────────────────────────────────────────────
  const T = {
    labour:    costs.labourItems.reduce((s, x) => s + x.total, 0),
    materials: costs.materialItems.reduce((s, x) => s + x.total, 0),
    plant:     costs.plantItems.reduce((s, x) => s + x.total, 0),
    sub:       costs.subItems.reduce((s, x) => s + x.total, 0),
    other:     costs.otherItems.reduce((s, x) => s + x.total, 0),
  }
  const grand = T.labour + T.materials + T.plant + T.sub + T.other

  // ── theme ──────────────────────────────────────────────────────────────────
  const bg   = darkMode ? '#111e11' : '#ffffff'
  const bg2  = darkMode ? '#182818' : '#f5f9f5'
  const bd   = darkMode ? '#2a3a2a' : '#d8e8d8'
  const txt  = darkMode ? '#c8d8a8' : '#1a2a1a'
  const muted= darkMode ? '#5a7a5a' : '#6a8a6a'

  const inp: React.CSSProperties = {
    background: bg2, border: `1px solid ${bd}`, borderRadius: 5,
    color: txt, padding: '5px 8px', fontSize: 12, width: '100%',
    boxSizing: 'border-box', outline: 'none',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 10, color: muted, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 3,
  }
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    borderRadius: 5, border: `1px solid ${bd}`, cursor: 'pointer',
    fontSize: 12, fontFamily: 'inherit', background: bg2, color: txt,
  }

  const TABS: { key: Tab; emoji: string; label: string }[] = [
    { key: 'labour',    emoji: '🔨', label: 'Labour'        },
    { key: 'materials', emoji: '📦', label: 'Materials'     },
    { key: 'plant',     emoji: '🚜', label: 'Plant'         },
    { key: 'sub',       emoji: '👷', label: 'Subcontractors'},
    { key: 'other',     emoji: '📋', label: 'Other'         },
  ]

  const countFor = (t: Tab) => ({
    labour:    costs.labourItems.length,
    materials: costs.materialItems.length,
    plant:     costs.plantItems.length,
    sub:       costs.subItems.length,
    other:     costs.otherItems.length,
  }[t])

  // ── save handlers ──────────────────────────────────────────────────────────
  function handleSaveTakeoff() {
    onSaveToTakeoff(costs,
      enabled !== initEnabled ? enabled : undefined,
      thickness !== initThickness ? thickness : undefined,
    )
    setSavedMsg('Saved to takeoff ✓')
    setTimeout(() => setSavedMsg(''), 2500)
  }

  async function handleSaveBO() {
    setSaving(true)
    try {
      await onSaveToBO(costs)
      setSavedMsg('Saved to Back Office ✓')
    } catch {
      setSavedMsg('Save to Back Office failed')
    } finally {
      setSaving(false)
      setTimeout(() => setSavedMsg(''), 3000)
    }
  }

  // ── generic item row ────────────────────────────────────────────────────────
  function ItemRow({ id, primary, secondary, total, catColor, onEdit, onDel }: {
    id: string; primary: string; secondary: string; total: number
    catColor: string; onEdit: () => void; onDel: () => void
  }) {
    const active = es && es.id === id
    return (
      <div onClick={onEdit} style={{
        padding: '7px 10px', borderRadius: 6, marginBottom: 3, cursor: 'pointer',
        background: active ? (darkMode ? '#1e361e' : '#e8f5e8') : bg2,
        border: `1px solid ${active ? accentColor + '88' : bd}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</div>
            <div style={{ fontSize: 10, color: muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</div>
          </div>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: accentColor, fontWeight: 700, flexShrink: 0 }}>£{f2(total)}</span>
          <button style={{ padding: '1px 6px', borderRadius: 4, border: `1px solid #e74c3c44`, background: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
            onClick={e => { e.stopPropagation(); onDel() }}>×</button>
        </div>
      </div>
    )
  }

  // ── editor form renderers ──────────────────────────────────────────────────
  function renderEditorForm() {
    if (!es) return null
    const edBg: React.CSSProperties = { background: darkMode ? '#1a3a1a' : '#edf7ed', border: `1px solid ${accentColor}55`, borderRadius: 8, padding: 14, marginTop: 8 }

    // ── Labour ──────────────────────────────────────────────────────────────
    if (es.tab === 'labour') {
      const f = es.form
      const computedTotal = (f.qty ?? 1) * (f.rate ?? 0)
      const submit = () => {
        const ni: LayerLabourItem = {
          id: es.id === 'new' ? uid() : es.id,
          trade: f.trade ?? '', description: f.description ?? '',
          qty: f.qty ?? 1, unit: f.unit ?? 'hr', rate: f.rate ?? 0,
          outputRate: f.outputRate, total: computedTotal,
        }
        setCosts(c => ({
          ...c, labourItems: es.id === 'new'
            ? [...c.labourItems, ni]
            : c.labourItems.map(x => x.id === es.id ? ni : x),
        }))
        setEs(null)
      }
      const up = (patch: Partial<LayerLabourItem>) => setEs({ ...es, form: { ...f, ...patch } })
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Labour Item' : '✎ Edit Labour Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Trade</label>
              <select style={inp} value={f.trade ?? ''} onChange={e => up({ trade: e.target.value })}>
                <option value="">— select —</option>
                {labourTrades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Description</label>
              <input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} placeholder="e.g. Bricklaying and pointing" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Qty</label>
              <input type="number" step="0.5" min={0} style={inp} value={f.qty ?? 1}
                onChange={e => up({ qty: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'hr'} onChange={e => up({ unit: e.target.value as 'hr' | 'day' })}>
                <option value="hr">hr</option>
                <option value="day">day</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Rate (£/unit)</label>
              <input type="number" step="0.5" min={0} style={inp} value={f.rate ?? 0}
                onChange={e => up({ rate: +e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Output rate (optional, e.g. m²/hr)</label>
              <input type="number" step="any" min={0} style={inp} value={f.outputRate ?? ''} placeholder="0.5"
                onChange={e => up({ outputRate: e.target.value ? +e.target.value : undefined })} />
            </div>
            <div>
              <label style={lbl}>Total</label>
              <div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(computedTotal)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    // ── Materials ────────────────────────────────────────────────────────────
    if (es.tab === 'materials') {
      const f = es.form
      const gross = (f.qty ?? 0) * (1 + (f.wastePct ?? 0) / 100)
      const computedTotal = gross * (f.unitCost ?? 0)
      const submit = () => {
        const ni: LayerMaterialItem = {
          id: es.id === 'new' ? uid() : es.id,
          name: f.name ?? '', unit: f.unit ?? 'm²',
          qty: f.qty ?? 0, unitCost: f.unitCost ?? 0, wastePct: f.wastePct ?? 0,
          supplier: f.supplier, description: f.description, total: computedTotal,
        }
        setCosts(c => ({
          ...c, materialItems: es.id === 'new'
            ? [...c.materialItems, ni]
            : c.materialItems.map(x => x.id === es.id ? ni : x),
        }))
        setEs(null)
      }
      const up = (patch: Partial<LayerMaterialItem>) => setEs({ ...es, form: { ...f, ...patch } })
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Material Item' : '✎ Edit Material Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Product / Name</label>
              <input style={inp} value={f.name ?? ''} onChange={e => up({ name: e.target.value })} placeholder="e.g. Dense concrete block 100mm" />
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'm²'} onChange={e => up({ unit: e.target.value })}>
                {['m²','m³','lm','nr','bag','tonne','kg','item'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Qty (net)</label>
              <input type="number" step="any" min={0} style={inp} value={f.qty ?? 0} onChange={e => up({ qty: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Unit cost (£)</label>
              <input type="number" step="0.01" min={0} style={inp} value={f.unitCost ?? 0} onChange={e => up({ unitCost: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Waste %</label>
              <input type="number" step="1" min={0} max={100} style={inp} value={f.wastePct ?? 0} onChange={e => up({ wastePct: +e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Supplier (optional)</label>
              <input style={inp} value={f.supplier ?? ''} onChange={e => up({ supplier: e.target.value })} placeholder="e.g. Travis Perkins" />
            </div>
            <div>
              <label style={lbl}>Total (inc. waste)</label>
              <div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(computedTotal)}</div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Description / spec (optional)</label>
            <input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    // ── Plant ────────────────────────────────────────────────────────────────
    if (es.tab === 'plant') {
      const f = es.form
      const computedTotal = (f.qty ?? 1) * (f.hireRate ?? 0)
      const submit = () => {
        const ni: LayerPlantItem = {
          id: es.id === 'new' ? uid() : es.id,
          name: f.name ?? '', unit: f.unit ?? 'day',
          qty: f.qty ?? 1, hireRate: f.hireRate ?? 0, total: computedTotal,
        }
        setCosts(c => ({
          ...c, plantItems: es.id === 'new'
            ? [...c.plantItems, ni]
            : c.plantItems.map(x => x.id === es.id ? ni : x),
        }))
        setEs(null)
      }
      const up = (patch: Partial<LayerPlantItem>) => setEs({ ...es, form: { ...f, ...patch } })
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Plant Item' : '✎ Edit Plant Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Plant / Equipment</label>
              <input style={inp} value={f.name ?? ''} onChange={e => up({ name: e.target.value })} placeholder="e.g. Concrete mixer, Skip hire" />
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'day'} onChange={e => up({ unit: e.target.value })}>
                {['day','week','hr','item'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Qty</label>
              <input type="number" step="0.5" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Hire rate (£/unit)</label>
              <input type="number" step="0.5" min={0} style={inp} value={f.hireRate ?? 0} onChange={e => up({ hireRate: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Total</label>
              <div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(computedTotal)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    // ── Subcontractors ───────────────────────────────────────────────────────
    if (es.tab === 'sub') {
      const f = es.form
      const computedTotal = (f.basis ?? 'fixed') === 'fixed' ? (f.rate ?? 0) : (f.qty ?? 1) * (f.rate ?? 0)
      const submit = () => {
        const ni: LayerSubItem = {
          id: es.id === 'new' ? uid() : es.id,
          trade: f.trade ?? '', description: f.description ?? '',
          basis: f.basis ?? 'fixed', qty: f.qty ?? 1,
          unit: f.unit ?? 'item', rate: f.rate ?? 0, total: computedTotal,
        }
        setCosts(c => ({
          ...c, subItems: es.id === 'new'
            ? [...c.subItems, ni]
            : c.subItems.map(x => x.id === es.id ? ni : x),
        }))
        setEs(null)
      }
      const up = (patch: Partial<LayerSubItem>) => setEs({ ...es, form: { ...f, ...patch } })
      const isFixed = (f.basis ?? 'fixed') === 'fixed'
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Subcontractor Item' : '✎ Edit Subcontractor Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Trade</label>
              <input style={inp} value={f.trade ?? ''} onChange={e => up({ trade: e.target.value })} placeholder="e.g. Scaffolding, Groundworks" />
            </div>
            <div>
              <label style={lbl}>Basis</label>
              <select style={inp} value={f.basis ?? 'fixed'} onChange={e => up({ basis: e.target.value as 'fixed' | 'per_unit' })}>
                <option value="fixed">Fixed price</option>
                <option value="per_unit">Per unit</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>Description</label>
            <input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} placeholder="Scope of subcontractor work" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isFixed ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            {!isFixed && (
              <>
                <div>
                  <label style={lbl}>Qty</label>
                  <input type="number" step="any" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <input style={inp} value={f.unit ?? 'item'} onChange={e => up({ unit: e.target.value })} />
                </div>
              </>
            )}
            <div>
              <label style={lbl}>{isFixed ? 'Fixed price (£)' : 'Rate (£/unit)'}</label>
              <input type="number" step="1" min={0} style={inp} value={f.rate ?? 0} onChange={e => up({ rate: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Total</label>
              <div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(computedTotal)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    // ── Other ────────────────────────────────────────────────────────────────
    if (es.tab === 'other') {
      const f = es.form
      const computedTotal = (f.qty ?? 1) * (f.unitCost ?? 0)
      const submit = () => {
        const ni: LayerOtherItem = {
          id: es.id === 'new' ? uid() : es.id,
          description: f.description ?? '', unit: f.unit ?? 'item',
          qty: f.qty ?? 1, unitCost: f.unitCost ?? 0, total: computedTotal,
        }
        setCosts(c => ({
          ...c, otherItems: es.id === 'new'
            ? [...c.otherItems, ni]
            : c.otherItems.map(x => x.id === es.id ? ni : x),
        }))
        setEs(null)
      }
      const up = (patch: Partial<LayerOtherItem>) => setEs({ ...es, form: { ...f, ...patch } })
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Other Cost Item' : '✎ Edit Other Cost Item'}
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>Description</label>
            <input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} placeholder="e.g. Provisional sum, allowance, fee" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Qty</label>
              <input type="number" step="any" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <input style={inp} value={f.unit ?? 'item'} onChange={e => up({ unit: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Unit cost (£)</label>
              <input type="number" step="0.01" min={0} style={inp} value={f.unitCost ?? 0} onChange={e => up({ unitCost: +e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Total</label>
              <div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(computedTotal)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }
    return null
  }

  // ── add-button helper ──────────────────────────────────────────────────────
  function addBtn(t: Tab, defaultForm: Record<string, unknown>) {
    const isAdding = es?.tab === t && es.id === 'new'
    return (
      <button style={{ ...btn, marginTop: 4, fontSize: 11 }}
        onClick={() => isAdding ? setEs(null) : setEs({ tab: t, id: 'new', form: defaultForm } as EditState)}>
        {isAdding ? '✕ Cancel' : '+ Add'}
      </button>
    )
  }

  // ── tab content ────────────────────────────────────────────────────────────
  function renderTabContent() {
    switch (tab) {
      case 'labour':
        return (
          <>
            {costs.labourItems.length === 0 && !(es?.tab === 'labour' && es.id === 'new') && (
              <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No labour items yet</div>
            )}
            {costs.labourItems.map(x => (
              <ItemRow key={x.id} id={x.id}
                primary={x.trade || 'Labour'} secondary={`${x.qty} ${x.unit} × £${x.rate}/${x.unit}${x.description ? ' — ' + x.description : ''}`}
                total={x.total} catColor={CAT_COLOR.labour}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'labour', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, labourItems: c.labourItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('labour', { trade: '', description: '', qty: 1, unit: 'hr', rate: 0 })}
            {es?.tab === 'labour' && renderEditorForm()}
          </>
        )
      case 'materials':
        return (
          <>
            {costs.materialItems.length === 0 && !(es?.tab === 'materials' && es.id === 'new') && (
              <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No material items yet</div>
            )}
            {costs.materialItems.map(x => (
              <ItemRow key={x.id} id={x.id}
                primary={x.name || 'Material'} secondary={`${x.qty} ${x.unit} × £${x.unitCost}${x.wastePct > 0 ? ` + ${x.wastePct}% waste` : ''}`}
                total={x.total} catColor={CAT_COLOR.materials}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'materials', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, materialItems: c.materialItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('materials', { name: '', unit: 'm²', qty: 0, unitCost: 0, wastePct: 0 })}
            {es?.tab === 'materials' && renderEditorForm()}
          </>
        )
      case 'plant':
        return (
          <>
            {costs.plantItems.length === 0 && !(es?.tab === 'plant' && es.id === 'new') && (
              <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No plant items yet</div>
            )}
            {costs.plantItems.map(x => (
              <ItemRow key={x.id} id={x.id}
                primary={x.name || 'Plant'} secondary={`${x.qty} ${x.unit} × £${x.hireRate}/${x.unit}`}
                total={x.total} catColor={CAT_COLOR.plant}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'plant', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, plantItems: c.plantItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('plant', { name: '', unit: 'day', qty: 1, hireRate: 0 })}
            {es?.tab === 'plant' && renderEditorForm()}
          </>
        )
      case 'sub':
        return (
          <>
            {costs.subItems.length === 0 && !(es?.tab === 'sub' && es.id === 'new') && (
              <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No subcontractor items yet</div>
            )}
            {costs.subItems.map(x => (
              <ItemRow key={x.id} id={x.id}
                primary={x.trade || 'Subcontractor'} secondary={x.basis === 'fixed' ? `Fixed price — ${x.description}` : `${x.qty} ${x.unit} × £${x.rate}`}
                total={x.total} catColor={CAT_COLOR.sub}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'sub', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, subItems: c.subItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('sub', { trade: '', description: '', basis: 'fixed', qty: 1, unit: 'item', rate: 0 })}
            {es?.tab === 'sub' && renderEditorForm()}
          </>
        )
      case 'other':
        return (
          <>
            {costs.otherItems.length === 0 && !(es?.tab === 'other' && es.id === 'new') && (
              <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>No other cost items yet</div>
            )}
            {costs.otherItems.map(x => (
              <ItemRow key={x.id} id={x.id}
                primary={x.description || 'Other'} secondary={`${x.qty} ${x.unit} × £${x.unitCost}`}
                total={x.total} catColor={CAT_COLOR.other}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'other', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, otherItems: c.otherItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('other', { description: '', unit: 'item', qty: 1, unitCost: 0 })}
            {es?.tab === 'other' && renderEditorForm()}
          </>
        )
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{ background: bg, borderRadius: 12, width: '100%', maxWidth: 660, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: `1px solid ${bd}` }}>

        {/* ── Header ── */}
        <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLOR[layer.category] ?? '#95a5a6', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layer.name}{layer.thickness > 0 ? ` (${layer.thickness}mm)` : ''}
              </span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${CAT_COLOR[layer.category]}22`, color: CAT_COLOR[layer.category], fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>
                {layer.category}
              </span>
            </div>
            <div style={{ fontSize: 11, color: muted }}>
              {makeup.name} · {item.phase}
              {layer.description ? ` · ${layer.description}` : ''}
            </div>
          </div>
          <button style={{ ...btn, padding: '4px 10px', fontSize: 16, lineHeight: 1, flexShrink: 0 }} onClick={onClose}>×</button>
        </div>

        {/* ── Layer Info Bar ── */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${bd}`, background: bg2, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: muted }}>Calculated:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, fontFamily: 'monospace' }}>{calcQty.toFixed(2)} {calcUnit}</span>
          </div>
          {layer.thickness > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: muted }}>Thickness:</span>
              <input type="number" step={5} min={0}
                style={{ ...inp, width: 70, padding: '3px 6px' }}
                value={thickness}
                onChange={e => setThickness(+e.target.value)} />
              <span style={{ fontSize: 11, color: muted }}>mm</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" id="layer-enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="layer-enabled" style={{ fontSize: 11, color: txt, cursor: 'pointer' }}>Enabled in build-up</label>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${bd}`, background: bg2, overflowX: 'auto' }}>
          {TABS.map(t => {
            const count = countFor(t.key)
            const active = tab === t.key
            const tabTotal = { labour: T.labour, materials: T.materials, plant: T.plant, sub: T.sub, other: T.other }[t.key]
            return (
              <button key={t.key}
                onClick={() => { setTab(t.key); setEs(null) }}
                style={{ flex: 1, minWidth: 80, padding: '8px 4px', border: 'none', borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent', background: 'transparent', color: active ? accentColor : muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 700 : 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span>{t.emoji} {t.label}</span>
                {(count > 0 || tabTotal > 0) && (
                  <span style={{ fontSize: 9, color: active ? accentColor : muted }}>
                    {count > 0 ? `${count} item${count !== 1 ? 's' : ''}` : ''}{count > 0 && tabTotal > 0 ? ' · ' : ''}{tabTotal > 0 ? `£${Math.round(tabTotal)}` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {renderTabContent()}
        </div>

        {/* ── Cost Summary ── */}
        {grand > 0 && (
          <div style={{ padding: '8px 16px', borderTop: `1px solid ${bd}`, background: bg2, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['labour','materials','plant','sub','other'] as Tab[]).map(k => {
              const v = { labour: T.labour, materials: T.materials, plant: T.plant, sub: T.sub, other: T.other }[k]
              if (v <= 0) return null
              const labels = { labour: 'Labour', materials: 'Materials', plant: 'Plant', sub: 'Sub', other: 'Other' }
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[k] }} />
                  <span style={{ color: muted }}>{labels[k]}</span>
                  <span style={{ color: txt, fontFamily: 'monospace', fontWeight: 600 }}>£{Math.round(v)}</span>
                </div>
              )
            })}
            <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: accentColor, fontFamily: 'monospace' }}>
              Total £{f2(grand)}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${bd}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedMsg && (
            <span style={{ fontSize: 11, color: savedMsg.includes('failed') ? '#e74c3c' : '#27ae60', fontWeight: 600, flex: 1 }}>{savedMsg}</span>
          )}
          <div style={{ marginLeft: savedMsg ? 0 : 'auto', display: 'flex', gap: 8 }}>
            <button style={btn} onClick={onClose}>Close</button>
            <button style={{ ...btn, background: bg2, borderColor: accentColor, color: accentColor, fontWeight: 600 }}
              onClick={handleSaveTakeoff}>
              💾 Save to Takeoff
            </button>
            <button style={{ ...btn, background: accentColor, border: 'none', color: '#fff', fontWeight: 700 }}
              disabled={saving}
              onClick={handleSaveBO}>
              {saving ? 'Saving…' : '↗ Save to Back Office'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Utility: save a layer cost record to Back Office ─────────────────────────
// Call this from page.tsx passing the Supabase userId, item, layer, makeup and costs.
export async function saveLayerCostToBackOffice(
  userId: string,
  item: TakeoffItem,
  layer: FloorLayer,
  makeup: FloorMakeup,
  costs: LayerCostRecord,
) {
  const sb = createClient()

  const labourCost    = costs.labourItems.reduce((s, x) => s + x.total, 0)
  const materialsCost = costs.materialItems.reduce((s, x) => s + x.total, 0)
  const plantCost     = costs.plantItems.reduce((s, x) => s + x.total, 0)
  const subCost       = costs.subItems.reduce((s, x) => s + x.total, 0)
  const otherCost     = costs.otherItems.reduce((s, x) => s + x.total, 0)

  // 1. Find or create bo_phase for item.phase
  let phaseId: string
  const { data: existPhase } = await sb.from('bo_phases')
    .select('id').eq('user_id', userId).eq('name', item.phase).maybeSingle()
  if (existPhase) {
    phaseId = existPhase.id
  } else {
    const { data: np, error: pe } = await sb.from('bo_phases')
      .insert({ user_id: userId, name: item.phase, active: true, job_types: [], display_order: 99 })
      .select('id').single()
    if (pe || !np) throw new Error('Could not create bo_phase: ' + pe?.message)
    phaseId = np.id
  }

  // 2. Find or create bo_sub_phase for makeup.name under that phase
  let subPhaseId: string | null = null
  const { data: existSub } = await sb.from('bo_sub_phases')
    .select('id').eq('user_id', userId).eq('phase_id', phaseId).eq('name', makeup.name).maybeSingle()
  if (existSub) {
    subPhaseId = existSub.id
  } else {
    const { data: ns } = await sb.from('bo_sub_phases')
      .insert({ user_id: userId, phase_id: phaseId, name: makeup.name, active: true, display_order: 99, markup_pct: 20 })
      .select('id').single()
    subPhaseId = ns?.id ?? null
  }

  // 3. Find or create bo_task for layer.name under that phase/sub-phase
  const taskPayload = {
    user_id:          userId,
    phase_id:         phaseId,
    sub_phase_id:     subPhaseId,
    name:             layer.name,
    description:      layer.description,
    client_description: layer.description,
    unit:             layer.unit,
    default_qty:      1,
    labour_cost:      labourCost,
    materials_cost:   materialsCost,
    plant_cost:       plantCost,
    subcontract_cost: subCost,
    waste_cost:       0,
    other_cost:       otherCost,
    markup_pct:       20,
    from_takeoff:     true,
    from_ai:          false,
    active:           true,
    display_order:    99,
    trade_name:       null as string | null,
    productivity_rate: null as number | null,
  }

  const { data: existTask } = await sb.from('bo_tasks')
    .select('id').eq('user_id', userId).eq('phase_id', phaseId).eq('name', layer.name).maybeSingle()

  if (existTask) {
    const { error } = await sb.from('bo_tasks').update(taskPayload).eq('id', existTask.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb.from('bo_tasks').insert(taskPayload)
    if (error) throw new Error(error.message)
  }
}
