'use client'

import { useState } from 'react'
import { calcItemSell, calcPhaseSell, fmt } from '@/lib/utils'
import type { Quote } from '@/lib/types'
import QuoteCommentsSection from './QuoteCommentsSection'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props {
  quote: Quote
  settings: { logo?: string; name?: string; tagline?: string; phone?: string; email?: string; address?: string }
  onClose: () => void
  onApproveClick?: () => void
  canApprove?: boolean
  isPreview?: boolean
  quoteView?: 'full' | 'phases' | 'total_only'
  clientSettings?: { quoteView?: 'full' | 'phases' | 'total_only'; showScope?: boolean }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', sent: 'Sent — awaiting your approval',
  accepted: 'Approved', declined: 'Declined',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#e67e22', accepted: '#7ab533', declined: '#c0392b',
}

export default function PortalQuoteDetailsModal({
  quote,
  settings,
  onClose,
  onApproveClick,
  canApprove,
  isPreview = false,
  quoteView = 'full',
  clientSettings,
}: Props) {
  // Determine what the client is allowed to see based on their quoteView setting
  const clientQuoteView = clientSettings?.quoteView || 'full'
  const clientCanSeeScope = clientSettings?.showScope !== false
  const clientCanSeeCosts = clientQuoteView === 'full'
  const clientCanSeePhases = clientQuoteView === 'full' || clientQuoteView === 'phases'

  const mainModal = useDraggableModal()
  const printOptionsModal = useDraggableModal()
  const [showPrintOptions, setShowPrintOptions] = useState(false)
  const [printOptions, setPrintOptions] = useState({
    includeScope: clientCanSeeScope,
    includePhases: clientCanSeePhases,
    includeCosts: clientCanSeeCosts,
  })

  const subtotal = quote.phases.reduce((s, p) => s + calcPhaseSell(p, quote.markup), 0)
  const vatAmount = quote.vatIncluded ? subtotal * 0.20 : 0
  const total = subtotal + vatAmount
  const isApproved = quote.status === 'accepted'

  function handlePrint() {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const phaseContent = quote.phases.length > 0 ? `
      <h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 16px; font-weight: 700;">Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${quote.phases.map((phase, pi) => `
          <tr style="background: #f0f2ee;">
            <td style="padding: 10px; font-weight: 700; border: 1px solid #ddd;">${pi + 1}. ${phase.phase}</td>
            ${printOptions.includeCosts ? `<td style="padding: 10px; text-align: right; font-weight: 700; border: 1px solid #ddd;">${fmt(calcPhaseSell(phase, quote.markup))}</td>` : ''}
          </tr>
          ${printOptions.includePhases ? phase.items.filter(item => calcItemSell(item, quote.markup) > 0).map(item => `
            <tr style="background: #fff;">
              <td style="padding: 8px; border: 1px solid #ddd;">${item.desc} (${item.qty} ${item.unit})</td>
              ${printOptions.includeCosts ? `<td style="padding: 8px; text-align: right; border: 1px solid #ddd;">${fmt(calcItemSell(item, quote.markup))}</td>` : ''}
            </tr>
          `).join('') : ''}
        `).join('')}
      </table>
    ` : ''

    const scopeContent = printOptions.includeScope && quote.scope ? `
      <h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 16px; font-weight: 700;">Scope of Works</h3>
      <div style="white-space: pre-wrap; line-height: 1.7; padding: 12px; background: #fafaf8; border: 1px solid #ddd; border-radius: 4px;">
        ${quote.scope}
      </div>
    ` : ''

    const costContent = printOptions.includeCosts ? `
      <div style="margin-top: 24px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
        ${quote.phases.length > 0 ? `
          <div style="padding: 10px; background: #fafaf8; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between;">
            <span>Subtotal (ex. VAT)</span>
            <strong>${fmt(subtotal)}</strong>
          </div>
        ` : ''}
        ${quote.vatIncluded ? `
          <div style="padding: 10px; background: #fafaf8; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between;">
            <span>VAT (20%)</span>
            <strong>${fmt(vatAmount)}</strong>
          </div>
        ` : ''}
        <div style="padding: 14px; background: #2d5f3e; color: #fff; display: flex; justify-content: space-between; font-weight: 700;">
          <span>Total${quote.vatIncluded ? ' (inc. VAT)' : ''}</span>
          <strong style="font-size: 18px;">${fmt(total)}</strong>
        </div>
      </div>
    ` : ''

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${settings.name || 'Your Builder'} - Quote ${quote.ref}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif; margin: 0; padding: 20px; }
          .header { background: #2d5f3e; color: #fff; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
          .header h1 { margin: 0 0 8px 0; font-size: 24px; }
          .header p { margin: 0 0 4px 0; font-size: 13px; }
          h2 { font-size: 18px; margin-top: 24px; margin-bottom: 16px; }
          h3 { font-size: 16px; margin-top: 24px; margin-bottom: 16px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${quote.jobType}</h1>
          <p><strong>Quote Ref:</strong> ${quote.ref}${quote.versionNumber ? ` v${quote.versionNumber}` : ''}</p>
          <p><strong>Customer:</strong> ${quote.customer.name}</p>
          <p><strong>Prepared by:</strong> ${settings.name || 'Your Builder'}</p>
        </div>

        ${scopeContent}
        ${phaseContent}
        ${costContent}

        <div style="margin-top: 40px; font-size: 12px; color: #888;">
          <p>This quote is valid for 30 days from the date of issue.</p>
          ${settings.email ? `<p>Questions? Contact us at ${settings.email}</p>` : ''}
        </div>
      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 250)
  }

  return (
    <div className="modal-overlay" onClick={e => mainModal.onOverlayClick(e, onClose)}>
      <div ref={mainModal.boxRef} className="portal-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', ...mainModal.draggableStyle }}>
        <div className="portal-modal-hd" onMouseDown={mainModal.onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Quote Details</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {quote.ref} — {quote.jobType}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowPrintOptions(true)}
              style={{
                background: '#f0f2ee', border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}
              title="Print quote"
            >
              🖨️ Print
            </button>
            <ModalMaximizeButton isMaximized={mainModal.isMaximized} onClick={mainModal.toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── Company header ─────────────────────────── */}
          <div style={{
            background: 'var(--moss)', color: '#fff',
            padding: '20px 24px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
            marginBottom: 20, borderRadius: 8, marginLeft: -24, marginRight: -24, marginTop: -24,
          }}>
            <div>
              {settings.logo
                ? <img src={settings.logo} alt="logo" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 6 }} />
                : <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{settings.name || 'Your Builder'}</div>
              }
              {settings.tagline && <div style={{ fontSize: 12, opacity: 0.85 }}>{settings.tagline}</div>}
              {settings.phone && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{settings.phone}</div>}
              {settings.email && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.email}</div>}
              {settings.address && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Quotation</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                {quote.ref}
                {quote.versionNumber && <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>v{quote.versionNumber}</span>}
              </div>
              {quote.savedDate && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Issued {quote.savedDate}</div>}
            </div>
          </div>

          {/* ── Quote meta row ──────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: 16, padding: '16px 24px',
            borderBottom: '1px solid var(--border)', background: '#fafaf8',
            marginBottom: 20, marginLeft: -24, marginRight: -24,
            borderRadius: '8px 8px 0 0',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Prepared for</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{quote.customer.name}</div>
              {quote.customer.address && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.address}</div>}
              {quote.customer.phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.phone}</div>}
              {quote.customer.email && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.email}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Status</div>
              <span className="portal-badge" style={{ background: STATUS_COLOR[quote.status] || '#888', fontSize: 12 }}>
                {STATUS_LABEL[quote.status] || quote.status}
              </span>
            </div>
          </div>

          {/* ── Job type heading ────────────────────── */}
          <div style={{ marginTop: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{quote.jobType}</div>
          </div>

          {/* ── Approved banner ─────────────────────── */}
          {isApproved && quote.clientApprovedBy && (
            <div style={{ background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 8, padding: '12px 16px', margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#4a7c1f' }}>Approved by {quote.clientApprovedBy}</div>
                {quote.clientApprovedAt && <div style={{ fontSize: 12, color: '#6a9a3a' }}>{fmtDateTime(quote.clientApprovedAt)}</div>}
              </div>
            </div>
          )}

          {/* ── Scope of works ──────────────────────── */}
          {quote.scope && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Scope of Works
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.8, padding: '14px 16px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 8 }}>
                {quote.scope.split(/\n\n+|\. (?=[A-Z])/g).map((para, idx) => (
                  <p key={idx} style={{ margin: '0 0 12px 0', wordSpacing: '0.05em', textAlign: 'justify' }}>
                    {para.trim()}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── Phases & line items ─────────────────── */}
          {quote.phases.length > 0 && quoteView !== 'total_only' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              {quote.phases.map((phase, pi) => (
                <div key={phase.id}>
                  {/* Phase heading */}
                  <div style={{
                    background: pi % 2 === 0 ? '#f0f2ee' : '#e8ebe4',
                    padding: '10px 16px', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    borderTop: pi > 0 ? '2px solid var(--border)' : undefined,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                      {pi + 1}. {phase.phase}
                    </div>
                    {/* Phase total — shown for 'full' and 'phases' views */}
                    {(quoteView === 'full' || quoteView === 'phases') && (
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--moss)' }}>
                        {fmt(calcPhaseSell(phase, quote.markup))}
                      </div>
                    )}
                  </div>

                  {/* Line items — shown for 'full' and 'phases' quoteView; 'phases' hides the price */}
                  {(quoteView === 'full' || quoteView === 'phases') && phase.items.filter(item => calcItemSell(item, quote.markup) > 0).map((item, ii) => {
                    // Backfill description if missing
                    const itemTypeLabels: Record<string, string> = {
                      labour: 'Labour', materials: 'Materials', plant: 'Plant Work',
                      subcontractors: 'Subcontractor Work', other: 'Other Cost'
                    }
                    const desc = item.desc || (item.itemType ? itemTypeLabels[item.itemType] : undefined) || 'Item'
                    return (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '10px 16px', gap: 12,
                      borderTop: '1px solid var(--border)',
                      background: ii % 2 === 0 ? '#fff' : '#fafaf8',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{desc}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {item.qty} {item.unit}
                        </div>
                        {item.notes && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
                            {item.notes}
                          </div>
                        )}
                      </div>
                      {quoteView === 'full' && (
                        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                          {fmt(calcItemSell(item, quote.markup))}
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── Financial summary ───────────────────── */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', marginBottom: 20,
          }}>
            {quoteView !== 'total_only' && (
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(subtotal)}</span>
              </div>
            )}
            {quoteView !== 'total_only' && quote.vatIncluded && (
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(vatAmount)}</span>
              </div>
            )}
            <div style={{
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', background: 'var(--moss)',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                Total{quote.vatIncluded ? ' (inc. VAT)' : ''}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>
                {fmt(total)}
              </span>
            </div>
          </div>

          {/* ── Comments section ───────────────────── */}
          {!isPreview && (
            <QuoteCommentsSection
              quoteId={quote.id}
              isPortalView={true}
              phases={quote.phases.map(p => p.phase)}
              customerName={quote.customer.name}
            />
          )}

        </div>

        {/* ── Footer with approve button ─────────────────────── */}
        {canApprove && !isPreview && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onApproveClick} style={{ minWidth: 160 }}>
              ✍️ Approve Quote
            </button>
          </div>
        )}
        {!mainModal.isMaximized && <ModalResizeHandle onMouseDown={mainModal.onResizeMouseDown} />}
      </div>

      {/* ── Print options dialog ─────────────────────────────── */}
      {showPrintOptions && (
        <div className="modal-overlay" onClick={e => printOptionsModal.onOverlayClick(e, () => setShowPrintOptions(false))}>
          <div ref={printOptionsModal.boxRef} className="portal-modal" style={{ maxWidth: 400, ...printOptionsModal.draggableStyle }}>
            <div className="portal-modal-hd" onMouseDown={printOptionsModal.onHeaderMouseDown}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Print Options</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Choose what to include in your print
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ModalMaximizeButton isMaximized={printOptionsModal.isMaximized} onClick={printOptionsModal.toggleMaximize} />
                <button className="modal-close" onClick={() => setShowPrintOptions(false)}>×</button>
              </div>
            </div>

            <div className="portal-modal-bd" style={{ paddingBottom: 0 }}>
              {clientCanSeeScope && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={printOptions.includeScope}
                    onChange={e => setPrintOptions(p => ({ ...p, includeScope: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                    Include Scope of Works
                  </span>
                </label>
              )}

              {clientCanSeePhases && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={printOptions.includePhases}
                    onChange={e => setPrintOptions(p => ({ ...p, includePhases: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                    Include Phases Breakdown
                  </span>
                </label>
              )}

              {clientCanSeeCosts && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={printOptions.includeCosts}
                    onChange={e => setPrintOptions(p => ({ ...p, includeCosts: e.target.checked }))}
                    style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                    Include Cost Details
                  </span>
                </label>
              )}

              {!clientCanSeeScope && !clientCanSeePhases && !clientCanSeeCosts && (
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
                  No print options available for this client.
                </div>
              )}
            </div>

            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={() => setShowPrintOptions(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handlePrint()
                  setShowPrintOptions(false)
                }}
              >
                🖨️ Print
              </button>
            </div>
            {!printOptionsModal.isMaximized && <ModalResizeHandle onMouseDown={printOptionsModal.onResizeMouseDown} />}
          </div>
        </div>
      )}
    </div>
  )
}
