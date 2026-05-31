'use client'

/**
 * AIScopeWorkspace
 * The intermediate screen between the Quote Landing Wizard and the Quoting Workspace.
 * Used only for the AI Scope path.
 *
 * User writes / pastes / dictates a scope of works here.
 * Clicking "Build Estimate" generates the phases and transitions to the workspace.
 */

import { useState, useRef } from 'react'

interface Props {
  scope:           string
  onScopeChange:   (v: string) => void
  jobType:         string
  onJobTypeChange: (jt: string) => void
  jobTypes:        string[]
  onBuildEstimate: () => void   // triggers AI generation, then page transitions
  onOpenChat:      () => void   // opens the ScopeChat modal
  generating:      boolean
  onBack:          () => void   // return to landing
}

export default function AIScopeWorkspace({
  scope, onScopeChange,
  jobType, onJobTypeChange, jobTypes,
  onBuildEstimate, onOpenChat,
  generating, onBack,
}: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)

  const wordCount = scope.trim() ? scope.trim().split(/\s+/).length : 0
  const readyToBuild = scope.trim().length > 20

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px' }}>

      {/* Back link */}
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748b', cursor: 'pointer', padding: 0, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 5 }}
      >
        ← Back to quote options
      </button>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fdf4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✦</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>AI Scope of Works</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
              Describe the project and the AI will build a structured quote from your Back Office rates.
            </p>
          </div>
        </div>
      </div>

      {/* Job type */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Job Type
        </label>
        <select
          value={jobType}
          onChange={e => onJobTypeChange(e.target.value)}
          style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 600, background: '#fff', width: '100%', maxWidth: 280, outline: 'none' }}
        >
          {jobTypes.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Scope textarea */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Scope of Works
          </label>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
        </div>
        <textarea
          ref={textRef}
          value={scope}
          onChange={e => onScopeChange(e.target.value)}
          rows={14}
          placeholder={`Describe the works to be carried out…\n\nExamples:\n• Single storey rear extension, approx 4m × 5m, flat roof, bifold doors\n• Full bathroom refurbishment including new suite, tiling and plumbing\n• Loft conversion with dormer window, en-suite and two velux windows\n\nThe more detail you provide, the better the estimate.`}
          style={{
            width: '100%', padding: '14px 16px', fontSize: 14, lineHeight: 1.7,
            border: '1.5px solid #e2e8f0', borderRadius: 10,
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box', color: '#1e293b', background: '#fff',
            minHeight: 260,
          }}
          onFocus={e => (e.target.style.borderColor = '#7c3aed')}
          onBlur={e  => (e.target.style.borderColor = '#e2e8f0')}
          autoFocus
        />
      </div>

      {/* Tip banner */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, marginBottom: 24, fontSize: 12, color: '#7c3aed' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>✦</span>
        <span>
          Use <strong>AI Chat</strong> to have the AI interview you about the project and build the scope automatically —
          or paste an existing scope directly into the box above.
        </span>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={onOpenChat}
          style={{
            padding: '11px 22px', border: '1.5px solid #7c3aed', borderRadius: 8,
            background: '#fff', color: '#7c3aed', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          ✦ AI Chat
          <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>interview mode</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={onBuildEstimate}
          disabled={!readyToBuild || generating}
          style={{
            padding: '12px 28px', border: 'none', borderRadius: 8,
            background: readyToBuild && !generating ? '#7c3aed' : '#e9d5ff',
            color: readyToBuild && !generating ? '#fff' : '#a78bfa',
            fontSize: 14, fontWeight: 700,
            cursor: readyToBuild && !generating ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8,
            minWidth: 200, justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          {generating ? (
            <>
              <span style={{ fontSize: 16 }}>⏳</span>
              Building estimate…
            </>
          ) : (
            <>
              <span style={{ fontSize: 16 }}>✦</span>
              Build Estimate
            </>
          )}
        </button>
      </div>

      {!readyToBuild && !generating && (
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, textAlign: 'right' }}>
          Add a few more words to your scope before building the estimate.
        </p>
      )}
    </div>
  )
}
