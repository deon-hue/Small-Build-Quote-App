'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchWallTypesWithLayers,
  upsertWallType, deleteWallType,
  upsertWallLayer, deleteWallLayer,
} from '@/lib/back-office-queries'
import type { BOWallType, BOWallLayer } from '@/lib/back-office-types'
import {
  WALL_LAYER_CATEGORIES, WALL_LAYER_QTY_TYPES, WALL_LAYER_UNITS,
} from '@/lib/back-office-types'
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X } from 'lucide-react'

interface Props { userId: string }

// ── Inline style helpers ──────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '6px 9px', border: '1px solid #e2e8f0',
  borderRadius: 5, fontSize: 13, boxSizing: 'border-box',
}

// Category chip colours
const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  labour:    { bg: '#fef3c7', color: '#92400e' },
  materials: { bg: '#dbeafe', color: '#1d4ed8' },
  plant:     { bg: '#f3e8ff', color: '#7c3aed' },
  other:     { bg: '#f1f5f9', color: '#475569' },
}

// ── Sub-component: Layer row editor ──────────────────────────────────────────
interface LayerRowProps {
  layer: BOWallLayer
  userId: string
  wallTypeId: string
  onSaved: (l: BOWallLayer) => void
  onDeleted: (id: string) => void
}

function LayerRow({ layer, userId, wallTypeId, onSaved, onDeleted }: LayerRowProps) {
  const sb = createClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BOWallLayer>(layer)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const result = await upsertWallLayer(sb, { ...draft, user_id: userId, wall_type_id: wallTypeId })
    setSaving(false)
    if (result) { onSaved(result); setEditing(false) }
  }

  async function remove() {
    if (!confirm('Remove this layer?')) return
    await deleteWallLayer(sb, layer.id)
    onDeleted(layer.id)
  }

  const catColor = CAT_COLORS[layer.category] ?? CAT_COLORS.other

  if (!editing) {
    return (
      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
        <td style={{ padding: '6px 8px', fontWeight: 500, color: '#1e293b', fontSize: 13 }}>{layer.name}</td>
        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: 12 }}>
          {layer.thickness_mm > 0 ? `${layer.thickness_mm}mm` : '—'}
        </td>
        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: 12 }}>
          {WALL_LAYER_QTY_TYPES.find(q => q.value === layer.qty_type)?.label ?? layer.qty_type}
        </td>
        <td style={{ padding: '6px 8px', fontSize: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, ...catColor }}>
            {layer.category}
          </span>
        </td>
        <td style={{ padding: '6px 8px', color: '#64748b', fontSize: 11 }}>{layer.description}</td>
        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: layer.default_enabled ? '#16a34a' : '#94a3b8' }}>
          {layer.default_enabled ? '✓' : '—'}
        </td>
        <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button onClick={() => { setDraft({ ...layer }); setEditing(true) }}
            style={{ padding: '3px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, color: '#1d4ed8', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
            <Pencil size={11} />
          </button>
          <button onClick={remove}
            style={{ padding: '3px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>
            <Trash2 size={11} />
          </button>
        </td>
      </tr>
    )
  }

  // Edit mode
  return (
    <tr style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
      <td style={{ padding: '6px 8px' }}>
        <input style={inp} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Layer name" />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input type="number" min={0} step={0.5} style={{ ...inp, width: 80 }} value={draft.thickness_mm}
          onChange={e => setDraft(d => ({ ...d, thickness_mm: +e.target.value }))} />
      </td>
      <td style={{ padding: '6px 8px' }}>
        <select style={{ ...inp }} value={draft.qty_type} onChange={e => setDraft(d => ({ ...d, qty_type: e.target.value }))}>
          {WALL_LAYER_QTY_TYPES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <select style={{ ...inp }} value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
          {WALL_LAYER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px' }}>
        <input style={inp} value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" />
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <input type="checkbox" checked={draft.default_enabled}
          onChange={e => setDraft(d => ({ ...d, default_enabled: e.target.checked }))} />
      </td>
      <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '3px 8px', background: '#16a34a', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
          <Check size={11} />
        </button>
        <button onClick={() => setEditing(false)}
          style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #d1d5db', borderRadius: 4, color: '#374151', fontSize: 11, cursor: 'pointer' }}>
          <X size={11} />
        </button>
      </td>
    </tr>
  )
}

// ── Sub-component: Wall Type card ─────────────────────────────────────────────
interface WallTypeCardProps {
  wallType: BOWallType
  userId: string
  onUpdated: (wt: BOWallType) => void
  onDeleted: (id: string) => void
}

function WallTypeCard({ wallType, userId, onUpdated, onDeleted }: WallTypeCardProps) {
  const sb = createClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BOWallType>(wallType)
  const [saving, setSaving] = useState(false)
  const [layers, setLayers] = useState<BOWallLayer[]>(wallType.layers ?? [])

  async function saveType() {
    setSaving(true)
    const result = await upsertWallType(sb, { ...draft, user_id: userId })
    setSaving(false)
    if (result) {
      const updated = { ...result, layers }
      onUpdated(updated)
      setEditing(false)
      setDraft(updated)
    }
  }

  async function remove() {
    if (!confirm(`Delete wall type "${wallType.name}"? This will remove all its layers.`)) return
    await deleteWallType(sb, wallType.id)
    onDeleted(wallType.id)
  }

  async function addLayer() {
    const result = await upsertWallLayer(sb, {
      user_id: userId,
      wall_type_id: wallType.id,
      name: 'New Layer',
      thickness_mm: 0,
      unit: 'm²',
      qty_type: 'area',
      spacing_mm: null,
      description: '',
      category: 'materials',
      default_enabled: true,
      display_order: layers.length,
    })
    if (result) setLayers(prev => [...prev, result])
  }

  function handleLayerSaved(updated: BOWallLayer) {
    setLayers(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  function handleLayerDeleted(id: string) {
    setLayers(prev => prev.filter(l => l.id !== id))
  }

  const isBuiltIn = !!wallType.canonical_id

  return (
    <div style={{ border: `1px solid ${isBuiltIn ? '#e2e8f0' : '#bfdbfe'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: isBuiltIn ? '#f8fafc' : '#eff6ff', cursor: 'pointer', userSelect: 'none',
      }}>
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex', alignItems: 'center' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {editing ? (
          <input
            style={{ flex: 1, padding: '4px 8px', border: '1px solid #4a90a4', borderRadius: 5, fontSize: 14, fontWeight: 700 }}
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            onClick={() => setExpanded(e => !e)}
            style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isBuiltIn ? '#1e293b' : '#1e3a8a' }}
          >
            {isBuiltIn ? '🧱' : '★'} {wallType.name}
          </span>
        )}

        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          {layers.length} layer{layers.length !== 1 ? 's' : ''}
          {wallType.labour_hrs_per_m2 > 0 && ` · ~${wallType.labour_hrs_per_m2}hrs/m²`}
        </span>

        {isBuiltIn && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
            Built-in
          </span>
        )}

        {editing ? (
          <>
            <button onClick={e => { e.stopPropagation(); saveType() }} disabled={saving}
              style={{ padding: '4px 10px', background: '#16a34a', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={e => { e.stopPropagation(); setEditing(false); setDraft(wallType) }}
              style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #d1d5db', borderRadius: 5, color: '#374151', fontSize: 12, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={e => { e.stopPropagation(); setDraft({ ...wallType, layers }); setEditing(true); setExpanded(true) }}
              style={{ padding: '4px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, color: '#374151', fontSize: 12, cursor: 'pointer' }}>
              <Pencil size={12} />
            </button>
            <button onClick={e => { e.stopPropagation(); remove() }}
              style={{ padding: '4px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>

          {/* Edit meta fields */}
          {editing && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 14, padding: '10px 12px', background: '#f0f9ff', borderRadius: 7, border: '1px solid #bae6fd' }}>
              <div>
                <label style={lbl}>Client Description</label>
                <textarea style={{ ...inp, resize: 'vertical', minHeight: 56 }}
                  value={draft.client_description}
                  onChange={e => setDraft(d => ({ ...d, client_description: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Labour hrs/m²</label>
                <input type="number" min={0} step={0.1} style={inp}
                  value={draft.labour_hrs_per_m2}
                  onChange={e => setDraft(d => ({ ...d, labour_hrs_per_m2: +e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Waste %</label>
                <input type="number" min={0} max={50} step={1} style={inp}
                  value={draft.waste_percent}
                  onChange={e => setDraft(d => ({ ...d, waste_percent: +e.target.value }))} />
              </div>
            </div>
          )}

          {/* Read-only description when not editing */}
          {!editing && wallType.client_description && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
              {wallType.client_description}
            </p>
          )}

          {/* Layers table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Layer Name', 'Thickness', 'Qty Type', 'Category', 'Description', 'Default', ''].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '14px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                    No layers yet — add one below
                  </td>
                </tr>
              ) : layers.map(layer => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  userId={userId}
                  wallTypeId={wallType.id}
                  onSaved={handleLayerSaved}
                  onDeleted={handleLayerDeleted}
                />
              ))}
            </tbody>
          </table>

          <button onClick={addLayer}
            style={{ marginTop: 8, padding: '5px 14px', border: '1px dashed #94a3b8', borderRadius: 6, background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
            <Plus size={11} style={{ display: 'inline', marginRight: 4 }} />Add Layer
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main section component ────────────────────────────────────────────────────
export default function SectionWallTypes({ userId }: Props) {
  const sb = createClient()
  const [wallTypes, setWallTypes] = useState<BOWallType[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setWallTypes(await fetchWallTypesWithLayers(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function addWallType() {
    const result = await upsertWallType(sb, {
      user_id: userId,
      canonical_id: null,
      name: 'New Wall Type',
      client_description: '',
      labour_hrs_per_m2: 3.0,
      waste_percent: 10,
      display_order: wallTypes.length,
      active: true,
    })
    if (result) setWallTypes(prev => [...prev, { ...result, layers: [] }])
  }

  function handleUpdated(updated: BOWallType) {
    setWallTypes(prev => prev.map(wt => wt.id === updated.id ? updated : wt))
  }

  function handleDeleted(id: string) {
    setWallTypes(prev => prev.filter(wt => wt.id !== id))
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading wall types…</div>

  const builtIn = wallTypes.filter(wt => !!wt.canonical_id)
  const custom = wallTypes.filter(wt => !wt.canonical_id)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🧱 External Wall Types</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Master source of truth for wall build-up recipes. The Takeoff tool pulls these directly.
            Editing here updates what the takeoff uses next time.
          </p>
          <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '5px 10px', marginTop: 8, maxWidth: 600 }}>
            ⚠️ For estimating only — always confirm construction against drawings and Building Control requirements.
          </div>
        </div>
        <button onClick={addWallType}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          <Plus size={14} /> Add Wall Type
        </button>
      </div>

      {/* Built-in types */}
      {builtIn.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Built-in Types ({builtIn.length})
          </div>
          {builtIn.map(wt => (
            <WallTypeCard
              key={wt.id}
              wallType={wt}
              userId={userId}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Custom types */}
      {custom.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Custom Types ({custom.length})
          </div>
          {custom.map(wt => (
            <WallTypeCard
              key={wt.id}
              wallType={wt}
              userId={userId}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {wallTypes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
          No wall types yet. They will appear here after Back Office syncs, or add your own above.
        </div>
      )}
    </div>
  )
}
