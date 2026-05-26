'use client'
import { useState } from 'react'
import type { EstimatorItem } from '@/lib/estimator'
import { calcMeasurement, MEASUREMENT_LABELS } from '@/lib/estimator'

interface Props {
  item: EstimatorItem
  onConfirm: (updated: EstimatorItem) => void
  onClose: () => void
}

export default function MeasureModal({ item, onConfirm, onClose }: Props) {
  const [length, setLength]    = useState(item.length)
  const [width,  setWidth]     = useState(item.width)
  const [depth,  setDepth]     = useState(item.depth)
  const [qty,    setQty]       = useState(item.qty || 1)
  const [manual, setManual]    = useState(item.manualMeasurement)
  const [manVal, setManVal]    = useState(item.measurement)

  const cfg      = MEASUREMENT_LABELS[item.measurementType]
  const computed = calcMeasurement(item.measurementType, length, width, depth, qty)
  const final    = manual ? manVal : computed

  const qtyLabel = item.measurementType === 'quantity' ? 'Quantity'
    : item.measurementType === 'linear' ? 'No. of runs'
    : 'No. of areas'

  const formula = item.measurementType === 'area'   ? `${length} × ${width} × ${qty}`
    : item.measurementType === 'volume' ? `${length} × ${width} × ${depth} × ${qty}`
    : item.measurementType === 'linear' ? `${length} × ${qty}`
    : `qty ${qty}`

  function handleConfirm() {
    onConfirm({ ...item, length, width, depth, qty, manualMeasurement: manual, measurement: final })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="form-modal" style={{ width: 'min(400px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div className="form-modal-hd">
          <span style={{ fontWeight: 700, fontSize: 15 }}>📐 {item.name}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="form-modal-bd">
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {cfg.label} measurement &mdash; unit: <strong>{item.unit}</strong>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} style={{ width: 'auto' }} />
            Enter measurement manually
          </label>

          {manual ? (
            <div className="fg">
              <label>Measurement ({item.unit})</label>
              <input type="number" value={manVal} min={0} step={0.01}
                onChange={e => setManVal(Number(e.target.value))} autoFocus />
            </div>
          ) : (
            <>
              {item.measurementType !== 'quantity' && (
                <div className={item.measurementType === 'area' || item.measurementType === 'volume' ? 'row2' : ''}>
                  <div className="fg">
                    <label>Length (m)</label>
                    <input type="number" value={length} min={0} step={0.1}
                      onChange={e => setLength(Number(e.target.value))} autoFocus />
                  </div>
                  {(item.measurementType === 'area' || item.measurementType === 'volume') && (
                    <div className="fg">
                      <label>Width (m)</label>
                      <input type="number" value={width} min={0} step={0.1}
                        onChange={e => setWidth(Number(e.target.value))} />
                    </div>
                  )}
                </div>
              )}
              {item.measurementType === 'volume' && (
                <div className="fg">
                  <label>Depth (m)</label>
                  <input type="number" value={depth} min={0} step={0.01}
                    onChange={e => setDepth(Number(e.target.value))} />
                </div>
              )}
              <div className="fg">
                <label>{qtyLabel}</label>
                <input type="number" value={qty} min={1} step={1}
                  onChange={e => setQty(Number(e.target.value))} />
              </div>
            </>
          )}

          {/* Result preview */}
          <div style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 6,
            background: 'var(--warm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {manual ? 'Manual override' : formula}
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 17, color: 'var(--slate)' }}>
              {final.toFixed(3)} <span style={{ fontSize: 12, fontWeight: 400 }}>{item.unit}</span>
            </span>
          </div>
        </div>

        <div className="form-modal-ft">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}
