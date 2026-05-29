'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchFormulaRules, upsertFormulaRule, deleteFormulaRule } from '@/lib/back-office-queries'
import type { BOFormulaRule, FormulaVariable } from '@/lib/back-office-types'
import { Plus, Trash2 } from 'lucide-react'

interface Props { userId: string }

function evalFormula(expression: string, vars: Record<string, number>): string {
  try {
    const fn = new Function(...Object.keys(vars), `return ${expression}`)
    const result = fn(...Object.values(vars))
    return typeof result === 'number' ? result.toFixed(3) : String(result)
  } catch {
    return 'Error'
  }
}

export default function SectionFormulaRules({ userId }: Props) {
  const sb = createClient()
  const [rules, setRules] = useState<BOFormulaRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BOFormulaRule | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [previewVars, setPreviewVars] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setRules(await fetchFormulaRules(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openNew() {
    const r: BOFormulaRule = { id: '', user_id: userId, name: 'New Formula', expression: 'length * width', variables: [{ name: 'length', label: 'Length (m)', defaultValue: 0 }, { name: 'width', label: 'Width (m)', defaultValue: 0 }], description: '', active: true }
    setEditing(r); setIsNew(true)
    setPreviewVars(Object.fromEntries(r.variables.map(v => [v.name, v.defaultValue])))
  }

  async function save() {
    if (!editing) return
    const saved = await upsertFormulaRule(sb, { ...editing, user_id: userId })
    if (saved) {
      if (isNew) setRules(prev => [...prev, saved])
      else setRules(prev => prev.map(r => r.id === saved.id ? saved : r))
    }
    setEditing(null)
  }

  async function remove(id: string) {
    if (!confirm('Delete this formula?')) return
    await deleteFormulaRule(sb, id)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  function addVariable() {
    if (!editing) return
    const v: FormulaVariable = { name: `var${editing.variables.length + 1}`, label: 'New Variable', defaultValue: 0 }
    setEditing({ ...editing, variables: [...editing.variables, v] })
    setPreviewVars(prev => ({ ...prev, [v.name]: v.defaultValue }))
  }

  function updateVariable(i: number, patch: Partial<FormulaVariable>) {
    if (!editing) return
    const vars = editing.variables.map((v, j) => j === i ? { ...v, ...patch } : v)
    setEditing({ ...editing, variables: vars })
    if (patch.name) {
      const old = editing.variables[i].name
      setPreviewVars(prev => { const n = { ...prev }; n[patch.name!] = n[old] ?? 0; delete n[old]; return n })
    }
    if (patch.defaultValue !== undefined) {
      setPreviewVars(prev => ({ ...prev, [vars[i].name]: patch.defaultValue! }))
    }
  }

  function removeVariable(i: number) {
    if (!editing) return
    const old = editing.variables[i].name
    const vars = editing.variables.filter((_, j) => j !== i)
    setEditing({ ...editing, variables: vars })
    setPreviewVars(prev => { const n = { ...prev }; delete n[old]; return n })
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Formula Rules</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Reusable quantity formulas used by the Takeoff Tool and AI Scope Writer. Variables are substituted at runtime.</p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Formula
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {rules.map(rule => {
          const testVars = Object.fromEntries(rule.variables.map(v => [v.name, v.defaultValue || 1]))
          const preview = evalFormula(rule.expression, testVars)
          return (
            <div key={rule.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{rule.name}</div>
                  {rule.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{rule.description}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', color: '#1e40af', fontFamily: 'monospace' }}>{rule.expression}</code>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Variables: {rule.variables.map(v => v.name).join(', ') || 'none'}</span>
                    <span style={{ fontSize: 11, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: '2px 8px', color: '#166534' }}>
                      Preview ({rule.variables.map(v => `${v.name}=${v.defaultValue || 1}`).join(', ')}): {preview}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditing({ ...rule }); setIsNew(false); setPreviewVars(Object.fromEntries(rule.variables.map(v => [v.name, v.defaultValue]))) }}
                    style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', fontSize: 12, cursor: 'pointer' }}>✏️ Edit</button>
                  <button onClick={() => remove(rule.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
          No formula rules yet. Click <strong>Add Formula</strong> to create one.
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Formula' : '✏️ Edit Formula'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Formula Name</label>
                  <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Expression</label>
                  <input value={editing.expression} onChange={e => setEditing({ ...editing, expression: e.target.value })} placeholder="e.g. length * width" style={{ ...inp, fontFamily: 'monospace', background: '#f8fafc' }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="What does this formula calculate?" style={inp} />
              </div>

              {/* Variables */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ ...lbl, margin: 0 }}>Variables</label>
                  <button onClick={addVariable} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, color: '#166534', fontSize: 12, cursor: 'pointer' }}>
                    <Plus size={12} /> Add
                  </button>
                </div>
                {editing.variables.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 28px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input value={v.name} onChange={e => updateVariable(i, { name: e.target.value })} placeholder="var name" style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }} />
                    <input value={v.label} onChange={e => updateVariable(i, { label: e.target.value })} placeholder="Display label" style={{ ...inp, fontSize: 12 }} />
                    <input type="number" value={v.defaultValue} onChange={e => updateVariable(i, { defaultValue: +e.target.value })} placeholder="Default" style={{ ...inp, fontSize: 12 }} />
                    <button onClick={() => removeVariable(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2 }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>

              {/* Live preview */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>Live Preview</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  {editing.variables.map(v => (
                    <label key={v.name} style={{ fontSize: 12, color: '#374151' }}>
                      {v.label}:&nbsp;
                      <input type="number" value={previewVars[v.name] ?? 0} onChange={e => setPreviewVars(prev => ({ ...prev, [v.name]: +e.target.value }))}
                        style={{ width: 60, padding: '2px 6px', border: '1px solid #86efac', borderRadius: 4, fontSize: 12 }} />
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                  Result: {evalFormula(editing.expression, previewVars)}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 22px', background: '#4a90a4', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Formula</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
