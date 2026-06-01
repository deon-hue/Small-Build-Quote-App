'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  FloorLayer, FloorMakeup, TakeoffItem,
  LayerCostRecord, LayerLabourItem, LayerMaterialItem,
  LayerPlantItem, LayerSubItem, LayerOtherItem,
} from '@/lib/takeoff-types'
import type { BOLabourTrade, BOProduct, BOPlantItem } from '@/lib/back-office-types'

// ── helpers ────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const f2  = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function empty(): LayerCostRecord {
  return { labourItems: [], materialItems: [], plantItems: [], subItems: [], otherItems: [] }
}

// ── fetch BO defaults for this layer/task ──────────────────────────────────────
/** Result of a BO lookup — includes the source so the modal can show sync status */
interface BOLookupResult {
  recipe:  LayerCostRecord
  source:  'recipe'        // full recipe saved from Layer Editor
         | 'aggregate'     // aggregate costs only (no item breakdown yet)
         | 'wall_layer'    // structure synced but no costs yet
}

async function fetchBOLayerDefaults(
  userId:    string,
  phaseName: string,
  makeupName: string,
  layerName: string,
): Promise<BOLookupResult | null> {
  const sb = createClient()

  // ── 1. Find matching bo_phase ──────────────────────────────────────────────
  const { data: boPhase } = await sb.from('bo_phases')
    .select('id').eq('user_id', userId).eq('name', phaseName).maybeSingle()
  if (!boPhase) return null

  // ── 2. Find bo_sub_phase by makeup name for precise task lookup ───────────
  const { data: boSubPhase } = await sb.from('bo_sub_phases')
    .select('id').eq('user_id', userId).eq('phase_id', boPhase.id).eq('name', makeupName)
    .maybeSingle()

  // ── 3. Check bo_tasks — prefer sub_phase_id match (most precise) ─────────
  const { data: boTask } = await sb.from('bo_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq(boSubPhase ? 'sub_phase_id' : 'phase_id', boSubPhase ? boSubPhase.id : boPhase.id)
    .eq('name', layerName)
    .maybeSingle()

  if (boTask) {
    const stored = (boTask.recipe_items ?? null) as LayerCostRecord | null
    if (stored?.labourItems) return { recipe: stored, source: 'recipe' }

    // Build from aggregate costs
    const u = uid
    const rec: LayerCostRecord = { labourItems: [], materialItems: [], plantItems: [], subItems: [], otherItems: [] }
    const dq = Math.max(1, boTask.default_qty ?? 1)

    if ((boTask.labour_cost ?? 0) > 0)
      rec.labourItems.push({
        id: u(), trade: boTask.trade_name ?? 'Labour',
        description: boTask.description ?? '', qty: dq, unit: 'hr',
        rate: +((boTask.labour_cost) / dq).toFixed(2), total: boTask.labour_cost,
      })
    if ((boTask.materials_cost ?? 0) > 0)
      rec.materialItems.push({
        id: u(), name: 'Materials', unit: boTask.unit ?? 'm²',
        qty: dq, unitCost: +((boTask.materials_cost) / dq).toFixed(2),
        wastePct: 0, total: boTask.materials_cost,
      })
    if ((boTask.plant_cost ?? 0) > 0)
      rec.plantItems.push({
        id: u(), name: 'Plant / Equipment', unit: 'day',
        qty: 1, hireRate: boTask.plant_cost, total: boTask.plant_cost,
      })
    if ((boTask.subcontract_cost ?? 0) > 0)
      rec.subItems.push({
        id: u(), trade: 'Subcontractor', description: boTask.client_description ?? '',
        basis: 'fixed', qty: 1, unit: 'item', rate: boTask.subcontract_cost, total: boTask.subcontract_cost,
      })
    const ot = (boTask.other_cost ?? 0) + (boTask.waste_cost ?? 0)
    if (ot > 0)
      rec.otherItems.push({
        id: u(), description: 'Other / waste', unit: 'item', qty: 1, unitCost: ot, total: ot,
      })

    return { recipe: rec, source: 'aggregate' }
  }

  // ── 4. No bo_task — check bo_wall_layers as last resort ────────────────────
  // After the new sync (step 5 in syncBackOfficeFromProduct), layers should always
  // be in bo_tasks. This fallback handles the brief window before first BO page load.
  const { data: boWallType } = await sb.from('bo_wall_types')
    .select('id').eq('user_id', userId).eq('name', makeupName).maybeSingle()

  if (boWallType) {
    const { data: boWallLayer } = await sb.from('bo_wall_layers')
      .select('id, name, description, category')
      .eq('user_id', userId).eq('wall_type_id', boWallType.id).eq('name', layerName)
      .maybeSingle()

    if (boWallLayer) {
      // Layer is structurally synced — return an empty recipe so the user can fill costs
      return { recipe: empty(), source: 'wall_layer' }
    }
  }

  return null
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

  const initEnabled   = (item.floorLayerToggles ?? {})[layer.id] ?? layer.defaultEnabled
  const initThickness = (item.floorLayerThicknesses ?? {})[layer.id] ?? layer.thickness

  const [enabled,        setEnabled]        = useState(initEnabled)
  const [thickness,      setThickness]      = useState(initThickness)
  const [costs,          setCosts]          = useState<LayerCostRecord>(() => item.layerCosts?.[layer.id] ?? empty())
  const [tab,            setTab]            = useState<Tab>('labour')
  const [es,             setEs]             = useState<EditState>(null)
  const [saving,         setSaving]         = useState(false)
  const [savedMsg,       setSavedMsg]       = useState('')
  const [loadingBO,      setLoadingBO]      = useState(false)
  const [boSyncStatus,   setBoSyncStatus]   = useState<'recipe' | 'aggregate' | 'wall_layer' | 'none' | 'loading'>('loading')
  const [boProducts,     setBoProducts]     = useState<BOProduct[]>([])
  const [boPlantItems,   setBoPlantItems]   = useState<BOPlantItem[]>([])
  const [pickerTab,      setPickerTab]      = useState<Tab | null>(null)
  const [pickerSearch,   setPickerSearch]   = useState('')

  // ── Load BO data on mount ──────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const sb  = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      // Always load BO product + plant lists for pickers
      const [{ data: prods }, { data: plant }] = await Promise.all([
        sb.from('bo_products').select('*').eq('user_id', user.id).eq('active', true).order('name'),
        sb.from('bo_plant_items').select('*').eq('user_id', user.id).eq('active', true).order('display_order'),
      ])
      setBoProducts(prods ?? [])
      setBoPlantItems(plant ?? [])

      // Pull BO defaults if no local recipe saved
      if (!item.layerCosts?.[layer.id]) {
        setLoadingBO(true)
        const result = await fetchBOLayerDefaults(user.id, item.phase, makeup.name, layer.name).catch(() => null)
        if (result) { setCosts(result.recipe); setBoSyncStatus(result.source) }
        else setBoSyncStatus('none')
        setLoadingBO(false)
      } else {
        // Check BO status even if we have local data
        fetchBOLayerDefaults(user.id, item.phase, makeup.name, layer.name)
          .then(r => setBoSyncStatus(r?.source ?? 'none'))
          .catch(() => setBoSyncStatus('none'))
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function reloadFromBO() {
    setLoadingBO(true)
    try {
      const sb  = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const result = await fetchBOLayerDefaults(user.id, item.phase, makeup.name, layer.name)
      if (result) { setCosts(result.recipe); setBoSyncStatus(result.source); setSavedMsg('Reloaded from Back Office ✓') }
      else { setBoSyncStatus('none'); setSavedMsg('No Back Office defaults found for this layer') }
    } finally {
      setLoadingBO(false)
      setTimeout(() => setSavedMsg(''), 3000)
    }
  }

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
  const bg    = darkMode ? '#111e11' : '#ffffff'
  const bg2   = darkMode ? '#182818' : '#f5f9f5'
  const bg3   = darkMode ? '#0d160d' : '#eef5ee'
  const bd    = darkMode ? '#2a3a2a' : '#d8e8d8'
  const txt   = darkMode ? '#c8d8a8' : '#1a2a1a'
  const muted = darkMode ? '#5a7a5a' : '#6a8a6a'

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

  const tabCount: Record<Tab, number> = {
    labour:    costs.labourItems.length,
    materials: costs.materialItems.length,
    plant:     costs.plantItems.length,
    sub:       costs.subItems.length,
    other:     costs.otherItems.length,
  }
  const tabTotal: Record<Tab, number> = {
    labour: T.labour, materials: T.materials, plant: T.plant, sub: T.sub, other: T.other,
  }

  function handleSaveTakeoff() {
    onSaveToTakeoff(costs,
      enabled  !== initEnabled   ? enabled   : undefined,
      thickness !== initThickness ? thickness : undefined,
    )
    setSavedMsg('Saved to takeoff ✓')
    setTimeout(() => setSavedMsg(''), 2500)
  }

  async function handleSaveBO() {
    setSaving(true)
    try {
      await onSaveToBO(costs)
      setBoSyncStatus('recipe')
      setSavedMsg('Saved to Back Office ✓')
    } catch (e: unknown) {
      setSavedMsg('Save failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
      setTimeout(() => setSavedMsg(''), 3500)
    }
  }

  // ── generic item row ────────────────────────────────────────────────────────
  function ItemRow({ id, primary, secondary, total, catColor, onEdit, onDel }: {
    id: string; primary: string; secondary: string; total: number
    catColor: string; onEdit: () => void; onDel: () => void
  }) {
    const active = es?.id === id
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

  // ── BO product picker ──────────────────────────────────────────────────────
  function BOPicker({ forTab }: { forTab: Tab }) {
    const open = pickerTab === forTab
    const items: { id: string; name: string; unit: string; cost: number; supplier?: string; wastePct?: number }[] =
      forTab === 'materials'
        ? boProducts.map(p => ({ id: p.id, name: p.name, unit: p.unit, cost: p.default_cost, supplier: p.supplier, wastePct: p.waste_pct }))
        : forTab === 'plant'
          ? boPlantItems.map(p => ({ id: p.id, name: p.name, unit: p.unit, cost: p.default_cost }))
          : []

    if (items.length === 0 && !open) return null

    const filtered = items.filter(x => x.name.toLowerCase().includes(pickerSearch.toLowerCase()))

    function addFromBO(x: typeof items[0]) {
      if (forTab === 'materials') {
        const ni: LayerMaterialItem = {
          id: uid(), name: x.name, unit: x.unit,
          qty: calcQty, unitCost: x.cost, wastePct: x.wastePct ?? 0,
          supplier: x.supplier,
          total: calcQty * x.cost * (1 + (x.wastePct ?? 0) / 100),
        }
        setCosts(c => ({ ...c, materialItems: [...c.materialItems, ni] }))
      } else if (forTab === 'plant') {
        const ni: LayerPlantItem = { id: uid(), name: x.name, unit: x.unit, qty: 1, hireRate: x.cost, total: x.cost }
        setCosts(c => ({ ...c, plantItems: [...c.plantItems, ni] }))
      }
      setPickerSearch('')
    }

    return (
      <div style={{ marginTop: 10, borderTop: `1px solid ${bd}`, paddingTop: 8 }}>
        <button style={{ ...btn, width: '100%', justifyContent: 'space-between', fontSize: 11 }}
          onClick={() => { setPickerTab(open ? null : forTab); setPickerSearch('') }}>
          <span>📋 Back Office {forTab === 'materials' ? 'Products' : 'Plant'}</span>
          <span>{open ? '▲' : '▼'} {items.length} available</span>
        </button>
        {open && (
          <div style={{ marginTop: 8 }}>
            <input style={{ ...inp, marginBottom: 6 }} placeholder="Search..." value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)} />
            <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${bd}`, borderRadius: 6 }}>
              {filtered.length === 0 && (
                <div style={{ padding: '10px', fontSize: 11, color: muted, textAlign: 'center' }}>No matches</div>
              )}
              {filtered.map(x => (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${bd}`, background: bg }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
                    <div style={{ fontSize: 10, color: muted }}>{x.unit} · £{x.cost}{x.wastePct ? ` · ${x.wastePct}% waste` : ''}{x.supplier ? ` · ${x.supplier}` : ''}</div>
                  </div>
                  <button style={{ ...btn, padding: '3px 10px', fontSize: 11, background: accentColor, color: '#fff', border: 'none', flexShrink: 0 }}
                    onClick={() => addFromBO(x)}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── editor form ────────────────────────────────────────────────────────────
  function renderEditorForm() {
    if (!es) return null
    const edBg: React.CSSProperties = {
      background: bg3, border: `1px solid ${accentColor}55`, borderRadius: 8, padding: 14, marginTop: 10,
    }

    if (es.tab === 'labour') {
      const f = es.form
      const total = (f.qty ?? 1) * (f.rate ?? 0)
      const up = (p: Partial<LayerLabourItem>) => setEs({ ...es, form: { ...f, ...p } })
      const submit = () => {
        const ni: LayerLabourItem = {
          id: es.id === 'new' ? uid() : es.id, trade: f.trade ?? '',
          description: f.description ?? '', qty: f.qty ?? 1,
          unit: f.unit ?? 'hr', rate: f.rate ?? 0, outputRate: f.outputRate, total,
        }
        setCosts(c => ({ ...c, labourItems: es.id === 'new' ? [...c.labourItems, ni] : c.labourItems.map(x => x.id === es.id ? ni : x) }))
        setEs(null)
      }
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>Qty</label><input type="number" step="0.5" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} /></div>
            <div><label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'hr'} onChange={e => up({ unit: e.target.value as 'hr' | 'day' })}>
                <option value="hr">hr</option><option value="day">day</option>
              </select>
            </div>
            <div><label style={lbl}>Rate (£/unit)</label><input type="number" step="0.5" min={0} style={inp} value={f.rate ?? 0} onChange={e => up({ rate: +e.target.value })} /></div>
            <div><label style={lbl}>Total</label><div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(total)}</div></div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Output rate (optional, e.g. m²/hr)</label>
            <input type="number" step="any" min={0} style={inp} value={f.outputRate ?? ''} placeholder="0.5"
              onChange={e => up({ outputRate: e.target.value ? +e.target.value : undefined })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    if (es.tab === 'materials') {
      const f = es.form
      const gross = (f.qty ?? 0) * (1 + (f.wastePct ?? 0) / 100)
      const total = gross * (f.unitCost ?? 0)
      const up = (p: Partial<LayerMaterialItem>) => setEs({ ...es, form: { ...f, ...p } })
      const submit = () => {
        const ni: LayerMaterialItem = {
          id: es.id === 'new' ? uid() : es.id, name: f.name ?? '', unit: f.unit ?? 'm²',
          qty: f.qty ?? 0, unitCost: f.unitCost ?? 0, wastePct: f.wastePct ?? 0,
          supplier: f.supplier, description: f.description, total,
        }
        setCosts(c => ({ ...c, materialItems: es.id === 'new' ? [...c.materialItems, ni] : c.materialItems.map(x => x.id === es.id ? ni : x) }))
        setEs(null)
      }
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Material Item' : '✎ Edit Material Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>Product / Name</label><input style={inp} value={f.name ?? ''} onChange={e => up({ name: e.target.value })} placeholder="e.g. Dense concrete block 100mm" /></div>
            <div><label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'm²'} onChange={e => up({ unit: e.target.value })}>
                {['m²','m³','lm','nr','bag','tonne','kg','item'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>Qty (net)</label><input type="number" step="any" min={0} style={inp} value={f.qty ?? 0} onChange={e => up({ qty: +e.target.value })} /></div>
            <div><label style={lbl}>Unit cost (£)</label><input type="number" step="0.01" min={0} style={inp} value={f.unitCost ?? 0} onChange={e => up({ unitCost: +e.target.value })} /></div>
            <div><label style={lbl}>Waste %</label><input type="number" step="1" min={0} max={100} style={inp} value={f.wastePct ?? 0} onChange={e => up({ wastePct: +e.target.value })} /></div>
            <div><label style={lbl}>Total (inc. waste)</label><div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(total)}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>Supplier</label><input style={inp} value={f.supplier ?? ''} onChange={e => up({ supplier: e.target.value })} placeholder="e.g. Travis Perkins" /></div>
            <div><label style={lbl}>Description / spec</label><input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    if (es.tab === 'plant') {
      const f = es.form
      const total = (f.qty ?? 1) * (f.hireRate ?? 0)
      const up = (p: Partial<LayerPlantItem>) => setEs({ ...es, form: { ...f, ...p } })
      const submit = () => {
        const ni: LayerPlantItem = { id: es.id === 'new' ? uid() : es.id, name: f.name ?? '', unit: f.unit ?? 'day', qty: f.qty ?? 1, hireRate: f.hireRate ?? 0, total }
        setCosts(c => ({ ...c, plantItems: es.id === 'new' ? [...c.plantItems, ni] : c.plantItems.map(x => x.id === es.id ? ni : x) }))
        setEs(null)
      }
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Plant Item' : '✎ Edit Plant Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>Plant / Equipment</label><input style={inp} value={f.name ?? ''} onChange={e => up({ name: e.target.value })} placeholder="e.g. Concrete mixer, Skip hire" /></div>
            <div><label style={lbl}>Unit</label>
              <select style={inp} value={f.unit ?? 'day'} onChange={e => up({ unit: e.target.value })}>
                {['day','week','hr','item'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>Qty</label><input type="number" step="0.5" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} /></div>
            <div><label style={lbl}>Hire rate (£/unit)</label><input type="number" step="0.5" min={0} style={inp} value={f.hireRate ?? 0} onChange={e => up({ hireRate: +e.target.value })} /></div>
            <div><label style={lbl}>Total</label><div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(total)}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    if (es.tab === 'sub') {
      const f = es.form
      const isFixed = (f.basis ?? 'fixed') === 'fixed'
      const total = isFixed ? (f.rate ?? 0) : (f.qty ?? 1) * (f.rate ?? 0)
      const up = (p: Partial<LayerSubItem>) => setEs({ ...es, form: { ...f, ...p } })
      const submit = () => {
        const ni: LayerSubItem = { id: es.id === 'new' ? uid() : es.id, trade: f.trade ?? '', description: f.description ?? '', basis: f.basis ?? 'fixed', qty: f.qty ?? 1, unit: f.unit ?? 'item', rate: f.rate ?? 0, total }
        setCosts(c => ({ ...c, subItems: es.id === 'new' ? [...c.subItems, ni] : c.subItems.map(x => x.id === es.id ? ni : x) }))
        setEs(null)
      }
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Subcontractor Item' : '✎ Edit Subcontractor Item'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>Trade</label><input style={inp} value={f.trade ?? ''} onChange={e => up({ trade: e.target.value })} placeholder="e.g. Scaffolding, Groundworks" /></div>
            <div><label style={lbl}>Basis</label>
              <select style={inp} value={f.basis ?? 'fixed'} onChange={e => up({ basis: e.target.value as 'fixed' | 'per_unit' })}>
                <option value="fixed">Fixed price</option><option value="per_unit">Per unit</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>Description / scope</label><input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: isFixed ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            {!isFixed && <>
              <div><label style={lbl}>Qty</label><input type="number" step="any" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} /></div>
              <div><label style={lbl}>Unit</label><input style={inp} value={f.unit ?? 'item'} onChange={e => up({ unit: e.target.value })} /></div>
            </>}
            <div><label style={lbl}>{isFixed ? 'Fixed price (£)' : 'Rate (£/unit)'}</label><input type="number" step="1" min={0} style={inp} value={f.rate ?? 0} onChange={e => up({ rate: +e.target.value })} /></div>
            <div><label style={lbl}>Total</label><div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(total)}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn, background: accentColor, color: '#fff', border: 'none', fontWeight: 700 }} onClick={submit}>Save Item</button>
            <button style={btn} onClick={() => setEs(null)}>Cancel</button>
          </div>
        </div>
      )
    }

    if (es.tab === 'other') {
      const f = es.form
      const total = (f.qty ?? 1) * (f.unitCost ?? 0)
      const up = (p: Partial<LayerOtherItem>) => setEs({ ...es, form: { ...f, ...p } })
      const submit = () => {
        const ni: LayerOtherItem = { id: es.id === 'new' ? uid() : es.id, description: f.description ?? '', unit: f.unit ?? 'item', qty: f.qty ?? 1, unitCost: f.unitCost ?? 0, total }
        setCosts(c => ({ ...c, otherItems: es.id === 'new' ? [...c.otherItems, ni] : c.otherItems.map(x => x.id === es.id ? ni : x) }))
        setEs(null)
      }
      return (
        <div style={edBg}>
          <div style={{ fontWeight: 700, fontSize: 12, color: accentColor, marginBottom: 10 }}>
            {es.id === 'new' ? '+ New Other Cost Item' : '✎ Edit Other Cost Item'}
          </div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>Description</label><input style={inp} value={f.description ?? ''} onChange={e => up({ description: e.target.value })} placeholder="e.g. Provisional sum, allowance, fee" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>Qty</label><input type="number" step="any" min={0} style={inp} value={f.qty ?? 1} onChange={e => up({ qty: +e.target.value })} /></div>
            <div><label style={lbl}>Unit</label><input style={inp} value={f.unit ?? 'item'} onChange={e => up({ unit: e.target.value })} /></div>
            <div><label style={lbl}>Unit cost (£)</label><input type="number" step="0.01" min={0} style={inp} value={f.unitCost ?? 0} onChange={e => up({ unitCost: +e.target.value })} /></div>
            <div><label style={lbl}>Total</label><div style={{ ...inp, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>£{f2(total)}</div></div>
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

  function addBtn(t: Tab, defaultForm: Record<string, unknown>) {
    const isAdding = es?.tab === t && es.id === 'new'
    return (
      <button style={{ ...btn, marginTop: 6, fontSize: 11 }}
        onClick={() => isAdding ? setEs(null) : setEs({ tab: t, id: 'new', form: defaultForm } as EditState)}>
        {isAdding ? '✕ Cancel' : '+ Add'}
      </button>
    )
  }

  function emptyNote(label: string) {
    return <div style={{ fontSize: 11, color: muted, textAlign: 'center', padding: '10px 0', fontStyle: 'italic' }}>No {label} items yet</div>
  }

  // ── tab content ────────────────────────────────────────────────────────────
  function renderTabContent() {
    switch (tab) {
      case 'labour':
        return (
          <>
            {costs.labourItems.length === 0 && !(es?.tab === 'labour' && es.id === 'new') && emptyNote('labour')}
            {costs.labourItems.map(x => (
              <ItemRow key={x.id} id={x.id} primary={x.trade || 'Labour'}
                secondary={`${x.qty} ${x.unit} × £${x.rate}/${x.unit}${x.description ? ' — ' + x.description : ''}`}
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
            {costs.materialItems.length === 0 && !(es?.tab === 'materials' && es.id === 'new') && emptyNote('material')}
            {costs.materialItems.map(x => (
              <ItemRow key={x.id} id={x.id} primary={x.name || 'Material'}
                secondary={`${x.qty} ${x.unit} × £${x.unitCost}${x.wastePct > 0 ? ` + ${x.wastePct}% waste` : ''}`}
                total={x.total} catColor={CAT_COLOR.materials}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'materials', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, materialItems: c.materialItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('materials', { name: '', unit: 'm²', qty: 0, unitCost: 0, wastePct: 0 })}
            {es?.tab === 'materials' && renderEditorForm()}
            <BOPicker forTab="materials" />
          </>
        )
      case 'plant':
        return (
          <>
            {costs.plantItems.length === 0 && !(es?.tab === 'plant' && es.id === 'new') && emptyNote('plant')}
            {costs.plantItems.map(x => (
              <ItemRow key={x.id} id={x.id} primary={x.name || 'Plant'}
                secondary={`${x.qty} ${x.unit} × £${x.hireRate}/${x.unit}`}
                total={x.total} catColor={CAT_COLOR.plant}
                onEdit={() => setEs(es?.id === x.id ? null : { tab: 'plant', id: x.id, form: { ...x } })}
                onDel={() => setCosts(c => ({ ...c, plantItems: c.plantItems.filter(y => y.id !== x.id) }))} />
            ))}
            {addBtn('plant', { name: '', unit: 'day', qty: 1, hireRate: 0 })}
            {es?.tab === 'plant' && renderEditorForm()}
            <BOPicker forTab="plant" />
          </>
        )
      case 'sub':
        return (
          <>
            {costs.subItems.length === 0 && !(es?.tab === 'sub' && es.id === 'new') && emptyNote('subcontractor')}
            {costs.subItems.map(x => (
              <ItemRow key={x.id} id={x.id} primary={x.trade || 'Subcontractor'}
                secondary={x.basis === 'fixed' ? `Fixed — ${x.description}` : `${x.qty} ${x.unit} × £${x.rate}`}
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
            {costs.otherItems.length === 0 && !(es?.tab === 'other' && es.id === 'new') && emptyNote('other cost')}
            {costs.otherItems.map(x => (
              <ItemRow key={x.id} id={x.id} primary={x.description || 'Other'}
                secondary={`${x.qty} ${x.unit} × £${x.unitCost}`}
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

      <div style={{ background: bg, borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: `1px solid ${bd}` }}>

        {/* ── Header ── */}
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${bd}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLOR[layer.category] ?? '#95a5a6', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: txt }}>{layer.name}{layer.thickness > 0 ? ` (${layer.thickness}mm)` : ''}</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${CAT_COLOR[layer.category]}22`, color: CAT_COLOR[layer.category], fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {layer.category}
              </span>
              {loadingBO
                ? <span style={{ fontSize: 10, color: muted }}>⟳ Checking Back Office…</span>
                : boSyncStatus === 'recipe'
                  ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#27ae6022', color: '#27ae60', fontWeight: 600 }}>✓ BO recipe synced</span>
                  : boSyncStatus === 'aggregate'
                    ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#f39c1222', color: '#f39c12', fontWeight: 600 }}>⚠ BO aggregate only — add item detail</span>
                    : boSyncStatus === 'wall_layer'
                      ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#3498db22', color: '#3498db', fontWeight: 600 }}>◌ Layer synced — no costs yet</span>
                      : boSyncStatus === 'none'
                        ? <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#e74c3c22', color: '#e74c3c', fontWeight: 600 }}>✕ Not in Back Office</span>
                        : null
              }
            </div>
            <div style={{ fontSize: 11, color: muted }}>{makeup.name} · {item.phase}{layer.description ? ` · ${layer.description}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button style={{ ...btn, padding: '4px 8px', fontSize: 11 }} onClick={reloadFromBO} title="Reload defaults from Back Office" disabled={loadingBO}>
              ↺ BO defaults
            </button>
            <button style={{ ...btn, padding: '4px 10px', fontSize: 16, lineHeight: 1 }} onClick={onClose}>×</button>
          </div>
        </div>

        {/* ── Layer Info Bar ── */}
        <div style={{ padding: '8px 16px', borderBottom: `1px solid ${bd}`, background: bg2, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: muted }}>Calculated:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, fontFamily: 'monospace' }}>{calcQty.toFixed(2)} {calcUnit}</span>
          </div>
          {layer.thickness > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: muted }}>Thickness:</span>
              <input type="number" step={5} min={0} style={{ ...inp, width: 70, padding: '3px 6px' }}
                value={thickness} onChange={e => setThickness(+e.target.value)} />
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
            const active = tab === t.key
            const count  = tabCount[t.key]
            const total  = tabTotal[t.key]
            return (
              <button key={t.key}
                onClick={() => { setTab(t.key); setEs(null); setPickerTab(null) }}
                style={{ flex: 1, minWidth: 80, padding: '8px 4px', border: 'none', borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent', background: 'transparent', color: active ? accentColor : muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 700 : 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span>{t.emoji} {t.label}</span>
                {(count > 0 || total > 0) && (
                  <span style={{ fontSize: 9, color: active ? accentColor : muted }}>
                    {count > 0 ? `${count} item${count !== 1 ? 's' : ''}` : ''}{count > 0 && total > 0 ? ' · ' : ''}{total > 0 ? `£${Math.round(total)}` : ''}
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
              const v = tabTotal[k]
              if (v <= 0) return null
              const labels: Record<Tab, string> = { labour: 'Labour', materials: 'Materials', plant: 'Plant', sub: 'Sub', other: 'Other' }
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[k] }} />
                  <span style={{ color: muted }}>{labels[k]}</span>
                  <span style={{ color: txt, fontFamily: 'monospace', fontWeight: 600 }}>£{Math.round(v)}</span>
                </div>
              )
            })}
            <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: accentColor, fontFamily: 'monospace' }}>Total £{f2(grand)}</div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${bd}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedMsg && <span style={{ fontSize: 11, color: savedMsg.includes('failed') || savedMsg.includes('No') ? '#e74c3c' : '#27ae60', fontWeight: 600, flex: 1 }}>{savedMsg}</span>}
          <div style={{ marginLeft: savedMsg ? 0 : 'auto', display: 'flex', gap: 8 }}>
            <button style={btn} onClick={onClose}>Close</button>
            <button style={{ ...btn, borderColor: accentColor, color: accentColor, fontWeight: 600 }} onClick={handleSaveTakeoff}>
              💾 Save to Takeoff
            </button>
            <button style={{ ...btn, background: accentColor, border: 'none', color: '#fff', fontWeight: 700 }}
              disabled={saving} onClick={handleSaveBO}>
              {saving ? 'Saving…' : '↗ Save to Back Office'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Utility: save a layer cost record to Back Office ─────────────────────────
export async function saveLayerCostToBackOffice(
  userId:  string,
  item:    TakeoffItem,
  layer:   FloorLayer,
  makeup:  FloorMakeup,
  costs:   LayerCostRecord,
) {
  const sb = createClient()

  const labourCost    = costs.labourItems.reduce((s, x) => s + x.total, 0)
  const materialsCost = costs.materialItems.reduce((s, x) => s + x.total, 0)
  const plantCost     = costs.plantItems.reduce((s, x) => s + x.total, 0)
  const subCost       = costs.subItems.reduce((s, x) => s + x.total, 0)
  const otherCost     = costs.otherItems.reduce((s, x) => s + x.total, 0)

  // 1. Find or create bo_phase
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

  // 2. Find or create bo_sub_phase for makeup
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

  // 3. Find or create bo_task — also saves recipe_items
  const taskPayload = {
    user_id: userId, phase_id: phaseId, sub_phase_id: subPhaseId,
    name: layer.name, description: layer.description, client_description: layer.description,
    unit: layer.unit, default_qty: 1,
    labour_cost: labourCost, materials_cost: materialsCost, plant_cost: plantCost,
    subcontract_cost: subCost, waste_cost: 0, other_cost: otherCost,
    markup_pct: 20, from_takeoff: true, from_ai: false, active: true, display_order: 99,
    trade_name: null as string | null, productivity_rate: null as number | null,
    recipe_items: costs as unknown as Record<string, unknown>,
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
