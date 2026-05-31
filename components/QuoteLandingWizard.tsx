'use client'

/**
 * QuoteLandingWizard
 * Three-card selection screen shown when creating a new quote.
 * The user picks one route and is taken into the QuoteWorkspace.
 */

import { useState } from 'react'
import { JOB_TYPES } from '@/lib/utils'

export type QuoteCreationMode = 'takeoff' | 'ai' | 'manual'

interface Props {
  onSelect: (mode: QuoteCreationMode, jobType?: string) => void
}

const card: React.CSSProperties = {
  flex: '1 1 280px', maxWidth: 360,
  background: '#fff',
  border: '2px solid #e2e8f0',
  borderRadius: 14,
  padding: '28px 26px',
  display: 'flex', flexDirection: 'column', gap: 0,
  transition: 'border-color 0.15s, box-shadow 0.15s',
  cursor: 'default',
}

const iconBox = (bg: string): React.CSSProperties => ({
  width: 56, height: 56, borderRadius: 12,
  background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 26, marginBottom: 16,
})

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#94a3b8', marginTop: 14, marginBottom: 4,
}

const bullet = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'flex-start', gap: 7,
  fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: 3,
})

const dot = (color: string): React.CSSProperties => ({
  width: 5, height: 5, borderRadius: '50%', background: color,
  flexShrink: 0, marginTop: 6,
})

const ctaBtn = (bg: string, text: string): React.CSSProperties => ({
  marginTop: 'auto', paddingTop: 20,
})

export default function QuoteLandingWizard({ onSelect }: Props) {
  const [jobType, setJobType] = useState('Rear Extension')
  const [hovered, setHovered] = useState<QuoteCreationMode | null>(null)

  const CARDS: Array<{
    mode:   QuoteCreationMode
    icon:   string
    iconBg: string
    title:  string
    tagline:string
    when:   string[]
    does:   string[]
    best:   string
    ctaLabel: string
    ctaColor: string
    ctaTextColor: string
    borderHover: string
  }> = [
    {
      mode:   'takeoff',
      icon:   '📐',
      iconBg: '#eff6ff',
      title:  'Import from Takeoff',
      tagline:'Create a quote directly from measured plans completed in the Takeoff module.',
      when: [
        'Plans have already been measured',
        'Walls, floors, roofs and elements have been quantified',
        'Material quantities and labour calculations are ready',
      ],
      does: [
        'Import phases, sub-phases and room names',
        'Import drawing labels and construction types',
        'Import build-up types, layers and tasks',
        'Transfer all quantities and measurements',
      ],
      best:       'Accurate pricing from completed takeoff drawings.',
      ctaLabel:   'Create Quote From Takeoff',
      ctaColor:   '#1d4ed8',
      ctaTextColor: '#fff',
      borderHover: '#93c5fd',
    },
    {
      mode:   'ai',
      icon:   '✦',
      iconBg: '#fdf4ff',
      title:  'Generate from AI Scope',
      tagline:'Create a quote from an AI-generated scope of works.',
      when: [
        'The client has supplied information or requirements',
        'An AI scope has already been generated',
        'No takeoff has been completed yet',
      ],
      does: [
        'Analyse the scope of works',
        'Build phases and sub-phases automatically',
        'Assign tasks using Back Office master data',
        'Generate a structured quote ready for pricing',
      ],
      best:       'Early-stage estimates and client enquiries.',
      ctaLabel:   'Generate Quote From Scope',
      ctaColor:   '#7c3aed',
      ctaTextColor: '#fff',
      borderHover: '#d8b4fe',
    },
    {
      mode:   'manual',
      icon:   '✏️',
      iconBg: '#f0fdf4',
      title:  'Manual Quote',
      tagline:'Build a quote manually using predefined job templates.',
      when: [
        'You want full control over the quote',
        'The project is simple or non-standard',
        'No takeoff or scope exists',
      ],
      does: [
        'Ask for the job type',
        'Load default phases and sub-phases',
        'Load default tasks from Back Office',
        'Allow manual editing of all items',
      ],
      best:       'Quick quotes and bespoke projects.',
      ctaLabel:   'Create Manual Quote',
      ctaColor:   '#16a34a',
      ctaTextColor: '#fff',
      borderHover: '#86efac',
    },
  ]

  return (
    <div style={{ padding: '40px 32px', maxWidth: 1140, margin: '0 auto' }}>
      {/* Page title */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
          Create a New Quote
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#64748b' }}>
          Choose how you want to build this quote.
        </p>
      </div>

      {/* Three cards */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        {CARDS.map(c => (
          <div
            key={c.mode}
            style={{
              ...card,
              borderColor: hovered === c.mode ? c.borderHover : '#e2e8f0',
              boxShadow: hovered === c.mode ? '0 8px 24px rgba(0,0,0,0.08)' : 'none',
            }}
            onMouseEnter={() => setHovered(c.mode)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Icon */}
            <div style={iconBox(c.iconBg)}>
              {c.icon}
            </div>

            {/* Title + tagline */}
            <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 6 }}>
              {c.title}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 4 }}>
              {c.tagline}
            </div>

            {/* Use this when… */}
            <div style={sectionLabel}>Use this option when:</div>
            {c.when.map((w, i) => (
              <div key={i} style={bullet(c.ctaColor)}>
                <span style={dot(c.ctaColor)} />
                <span>{w}</span>
              </div>
            ))}

            {/* This method will… */}
            <div style={sectionLabel}>This method will:</div>
            {c.does.map((d, i) => (
              <div key={i} style={bullet(c.ctaColor)}>
                <span style={{ ...dot(c.ctaColor), background: '#cbd5e1' }} />
                <span>{d}</span>
              </div>
            ))}

            {/* Best for */}
            <div style={{ marginTop: 14, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#475569', border: '1px solid #e2e8f0' }}>
              <strong style={{ color: '#1e293b' }}>Best for:</strong> {c.best}
            </div>

            {/* Job type picker for manual */}
            {c.mode === 'manual' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 5 }}>
                  Job Type
                </label>
                <select
                  value={jobType}
                  onChange={e => setJobType(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none' }}
                >
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  Phases and tasks will be loaded for this job type.
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={ctaBtn(c.ctaColor, c.ctaTextColor)}>
              <button
                onClick={() => onSelect(c.mode, c.mode === 'manual' ? jobType : undefined)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                  background: c.ctaColor, color: c.ctaTextColor,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  marginTop: 16,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {c.ctaLabel}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
