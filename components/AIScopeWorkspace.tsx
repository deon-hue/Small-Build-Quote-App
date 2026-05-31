'use client'

/**
 * AIScopeWorkspace — full redesign
 *
 * Phase 1: Job type selection cards
 * Phase 2: 3-column scope editor
 *   Left   — job type info + project setup + actions
 *   Centre — scope draft (title + textarea, editable)
 *   Right  — embedded AI interview panel
 */

import { useState, useEffect } from 'react'
import ScopeChat from '@/components/ScopeChat'

// ── Job type configuration ────────────────────────────────────────────────────

interface JobTypeConfig {
  id:                  string
  label:               string
  icon:                string
  tagline:             string
  scopeTitle:          string
  defaultDescription:  string
  defaultPhases:       string[]
  interviewQuestions:  string[]
}

const JOB_TYPE_CONFIGS: JobTypeConfig[] = [
  {
    id: 'Rear Extension',
    label: 'Rear Extension',
    icon: '🏠',
    tagline: 'Single or double-storey addition to the rear of a property',
    scopeTitle: 'Rear Extension — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to design and construct a new rear extension including demolition of existing rear elevation, new foundations, structural frame, external walls, roof structure, weatherproofing, windows and doors, internal finishes, and connection to all services.',
    defaultPhases: ['Site Setup & Demolition','Foundations','Structural Frame','External Walls','Roof','Windows & Doors','Internal Walls','Floors & Screeds','First Fix','Plastering','Second Fix','Decoration'],
    interviewQuestions: [
      'What are the approximate dimensions? (e.g. 4m wide × 5m deep)',
      'Single or double storey?',
      'What roof type is planned? (flat / pitched / lantern / vaulted)',
      'What type of rear glazing? (bifold / sliding / French doors / fixed glass)',
      'Is there any structural wall removal or knock-through required?',
      'What internal finishes are required? (plastering, tiling, flooring type)',
      'Is underfloor heating planned?',
      'Are there any utility diversions or drainage works needed?',
    ],
  },
  {
    id: 'Garden Room',
    label: 'Garden Room',
    icon: '🌿',
    tagline: 'Insulated garden studio, office, gym or entertaining space',
    scopeTitle: 'Garden Room — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to design and construct a new garden room including base/foundation, structural frame, insulation, roofing, external cladding, windows and doors, internal finishes, and electrical installation.',
    defaultPhases: ['Site Preparation','Foundations & Base','Structural Frame','Roofing','External Cladding','Windows & Doors','Insulation & Internal Boarding','Flooring','Electrics','Internal Finishes'],
    interviewQuestions: [
      'What are the approximate dimensions? (e.g. 5m × 4m)',
      'What is the intended use? (office / gym / entertainment / studio / living)',
      'What base type is planned? (concrete slab / suspended timber / screw pile)',
      'What external finish? (timber cladding / render / composite / brick)',
      'Is a toilet or shower room required?',
      'What electrical supply is needed? (lighting / power / heating / broadband)',
      'Is there an existing outbuilding to demolish first?',
    ],
  },
  {
    id: 'Landscaping',
    label: 'Landscaping',
    icon: '🌳',
    tagline: 'Garden design, hard and soft landscaping, drainage and external works',
    scopeTitle: 'Landscaping — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to carry out comprehensive landscaping works including ground preparation, drainage, hard landscaping surfaces, soft landscaping, boundary structures, external lighting, and irrigation as required.',
    defaultPhases: ['Site Clearance & Ground Prep','Drainage & Services','Hard Landscaping','Retaining Walls & Boundaries','Soft Landscaping & Planting','External Lighting','Finishing'],
    interviewQuestions: [
      'What is the approximate total area of the garden? (m²)',
      'What hard surfaces are required? (patio / driveway / paths / steps)',
      'What paving material? (Indian stone / porcelain / block paving / concrete)',
      'Is a new lawn required? (turf / seed / artificial grass)',
      'Are boundary walls, fencing or retaining walls needed?',
      'Is drainage or irrigation required?',
      'Is there any existing hard landscaping to remove or break out?',
      'Are there trees to remove or plant?',
    ],
  },
  {
    id: 'Loft Conversion',
    label: 'Loft Conversion',
    icon: '🏗️',
    tagline: 'Convert existing loft space into habitable rooms',
    scopeTitle: 'Loft Conversion — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to convert the existing loft space into habitable accommodation including structural alterations, floor construction, dormer or rooflight installation, staircase, internal finishes, and all associated services.',
    defaultPhases: ['Site Setup','Structural Alterations','Roof Works & Dormer','Floor & Staircase','Windows & Rooflights','Insulation','Internal Walls & Boarding','Plastering','Electrics & Plumbing','Decoration'],
    interviewQuestions: [
      'What type of loft conversion? (dormer / hip-to-gable / mansard / rooflight only)',
      'How many rooms are planned? (bedrooms, bathrooms)',
      'Is an en-suite shower room required?',
      'What type of new staircase? (straight / quarter-turn / spiral)',
      'Are there any load-bearing wall alterations required?',
      'Is there existing insulation to remove?',
    ],
  },
  {
    id: 'Bathroom Fit-Out',
    label: 'Bathroom',
    icon: '🛁',
    tagline: 'Full bathroom refurbishment or new bathroom installation',
    scopeTitle: 'Bathroom Refurbishment — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to fully refurbish the existing bathroom including strip out of existing suite, waterproofing, new sanitaryware, tiling, plumbing connections, electrics, ventilation, and all associated finishes.',
    defaultPhases: ['Strip Out','Waterproofing & Prep','First Fix Plumbing','Wall Tiling','Sanitaryware Installation','Floor Tiling','Second Fix Plumbing','Electrics & Lighting','Accessories & Finishing'],
    interviewQuestions: [
      'Is this a full strip-out and refurbishment or a partial upgrade?',
      'What size is the bathroom approximately? (m²)',
      'What sanitaryware is planned? (bath / shower / WC / basin / bidet)',
      'Is a walk-in shower or wet room planned?',
      'What tile style is preferred? (large format / mosaic / metro / stone)',
      'Is underfloor heating required?',
      'Is there a separate WC or en-suite also requiring work?',
    ],
  },
  {
    id: 'Kitchen Fit-Out',
    label: 'Kitchen',
    icon: '🍳',
    tagline: 'Kitchen installation, extension or full refurbishment',
    scopeTitle: 'Kitchen Refurbishment — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to fully refurbish the kitchen including strip out, structural alterations if required, first and second fix plumbing and electrics, kitchen unit installation, worktops, tiling, flooring, and all associated finishes.',
    defaultPhases: ['Strip Out','Structural Works','First Fix Plumbing','First Fix Electrics','Kitchen Units & Worktops','Tiling','Second Fix Plumbing','Second Fix Electrics','Flooring','Decoration'],
    interviewQuestions: [
      'Is this a kitchen-only refurbishment or combined with an extension?',
      'What is the approximate kitchen area? (m²)',
      'Is an island or breakfast bar planned?',
      'What worktop material? (quartz / granite / timber / laminate)',
      'Is a new structural opening or wall removal required?',
      'Are appliances included in the contract? (oven, hob, dishwasher, fridge)',
      'Is underfloor heating planned?',
    ],
  },
  {
    id: 'Full Refurbishment',
    label: 'Refurbishment',
    icon: '🔨',
    tagline: 'Full property refurbishment and internal reconfiguration',
    scopeTitle: 'Full Refurbishment — Scope of Works',
    defaultDescription: 'Supply all labour, materials, plant and equipment to carry out a full internal refurbishment of the property including strip out, structural alterations, new partitions, services upgrades, internal finishes throughout, bathroom and kitchen, windows and doors as required.',
    defaultPhases: ['Strip Out & Demolition','Structural Alterations','First Fix Services','Partitions & Insulation','Plastering','Flooring','Second Fix Services','Kitchen & Bathroom','Decoration','Snagging'],
    interviewQuestions: [
      'How many floors / rooms does the refurbishment cover?',
      'Is the property currently tenanted, vacant or being purchased?',
      'Is there any structural wall removal or reconfiguration required?',
      'How many bathrooms / shower rooms are being refurbished?',
      'Is a new kitchen included?',
      'Are windows and doors being replaced?',
      'What condition is the property in? (needs full gut / cosmetic only / mid-range)',
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = {
  purple: '#7c3aed', purpleLight: '#fdf4ff', purpleBorder: '#e9d5ff',
  muted: '#64748b', border: '#e2e8f0', bg: '#f8fafc',
}

const btn = (bg: string, color: string, extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '9px 16px', border: 'none', borderRadius: 7,
  background: bg, color, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  ...extra,
})
const outlineBtn = (color: string): React.CSSProperties => ({
  ...btn('transparent', color),
  border: `1.5px solid ${color}`,
})

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onBuildEstimate:  () => void
  onScopeChange:    (v: string) => void
  onJobTypeChange:  (jt: string) => void
  onBack:           () => void
  generating:       boolean
  initialJobType?:  string
}

export default function AIScopeWorkspace({
  onBuildEstimate, onScopeChange, onJobTypeChange, onBack, generating, initialJobType,
}: Props) {

  // Phase 1: job selection  Phase 2: scope editor
  const [phase, setPhase] = useState<'select' | 'editor'>(initialJobType ? 'editor' : 'select')
  const [config, setConfig] = useState<JobTypeConfig>(
    JOB_TYPE_CONFIGS.find(c => c.id === initialJobType) ?? JOB_TYPE_CONFIGS[0]
  )

  // Scope draft
  const [scopeTitle, setScopeTitle] = useState(config.scopeTitle)
  const [scopeText,  setScopeText]  = useState(config.defaultDescription)

  const [generatingScope,  setGeneratingScope]   = useState(false)

  // When job type changes
  function selectJobType(cfg: JobTypeConfig) {
    setConfig(cfg)
    setScopeTitle(cfg.scopeTitle)
    setScopeText(cfg.defaultDescription)
    setPhase('editor')
    onJobTypeChange(cfg.id)
    onScopeChange(cfg.defaultDescription)
  }

  // Keep parent scope in sync
  useEffect(() => { onScopeChange(scopeText) }, [scopeText]) // eslint-disable-line react-hooks/exhaustive-deps

  async function regenerateScope() {
    setGeneratingScope(true)
    try {
      const res = await fetch('/api/generate-scope', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType: config.id, description: config.defaultDescription }),
      })
      const data = await res.json()
      if (data.scope) { setScopeText(data.scope); onScopeChange(data.scope) }
    } catch { /* silent */ }
    finally { setGeneratingScope(false) }
  }

  // ── Phase 1: job type cards ─────────────────────────────────────────────────

  if (phase === 'select') {
    return (
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px' }}>
        <button onClick={onBack} style={{ ...outlineBtn(COLORS.muted), marginBottom: 28, fontSize: 12, padding: '6px 12px' }}>
          ← Back
        </button>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: COLORS.purpleLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px' }}>✦</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>AI Scope of Works</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: COLORS.muted }}>
            Select the job type to get started. The AI will build a tailored scope and interview you for the details.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {JOB_TYPE_CONFIGS.map(cfg => (
            <button
              key={cfg.id}
              onClick={() => selectJobType(cfg)}
              style={{
                background: '#fff', border: `2px solid ${COLORS.border}`, borderRadius: 12,
                padding: '22px 20px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.purpleBorder; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.boxShadow = 'none' }}
            >
              <span style={{ fontSize: 28 }}>{cfg.icon}</span>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{cfg.label}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>{cfg.tagline}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: COLORS.purple, fontWeight: 600 }}>
                Select →
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Phase 2: 3-column scope editor ─────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setPhase('select')} style={{ ...outlineBtn(COLORS.muted), fontSize: 11, padding: '5px 10px' }}>
          ← Job Types
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{config.icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{config.label}</span>
          <span style={{ fontSize: 12, color: COLORS.muted }}> — AI Scope Workspace</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={onBuildEstimate}
          disabled={generating || !scopeText.trim()}
          style={{
            ...btn(generating ? '#e9d5ff' : COLORS.purple, generating ? '#a78bfa' : '#fff'),
            opacity: !scopeText.trim() ? 0.5 : 1,
            cursor: !scopeText.trim() || generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? '⏳ Building…' : '✦ Export to Quote'}
        </button>
      </div>

      {/* 3-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 300px', gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── LEFT: project setup ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: COLORS.purpleLight, border: `1px solid ${COLORS.purpleBorder}`, borderRadius: 10, padding: '14px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Selected Job</div>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{config.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{config.label}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.5, marginTop: 4 }}>{config.tagline}</div>
          </div>

          {/* Default phases */}
          <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Expected Phases</div>
            {config.defaultPhases.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, color: '#374151', marginBottom: 4, alignItems: 'flex-start' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: COLORS.purple, flexShrink: 0, marginTop: 5 }} />
                {p}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={regenerateScope} disabled={generatingScope} style={{ ...outlineBtn(COLORS.muted), fontSize: 11, justifyContent: 'center', padding: '8px 12px' }}>
              {generatingScope ? '⏳ Generating…' : '↺ Regenerate Scope'}
            </button>
            <button onClick={onBack} style={{ ...outlineBtn('#e74c3c'), fontSize: 11, justifyContent: 'center', padding: '8px 12px' }}>
              ✕ Cancel
            </button>
          </div>
        </div>

        {/* ── CENTRE: scope draft ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Scope Title</label>
            <input
              value={scopeTitle}
              onChange={e => setScopeTitle(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${COLORS.border}`, borderRadius: 8, fontSize: 15, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }}
              onFocus={e => (e.target.style.borderColor = COLORS.purple)}
              onBlur={e  => (e.target.style.borderColor = COLORS.border)}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scope of Works</label>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {scopeText.trim() ? scopeText.trim().split(/\s+/).length : 0} words
              </span>
            </div>
            <textarea
              value={scopeText}
              onChange={e => setScopeText(e.target.value)}
              style={{
                flex: 1, width: '100%', padding: '14px', fontSize: 13, lineHeight: 1.7,
                border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
                resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                outline: 'none', minHeight: 360, color: '#1e293b',
              }}
              onFocus={e => (e.target.style.borderColor = COLORS.purple)}
              onBlur={e  => (e.target.style.borderColor = COLORS.border)}
              placeholder="Your scope of works will appear here. Use AI Interview to build it, or type directly."
            />
          </div>
        </div>

        {/* ── RIGHT: embedded AI chat with mic + file attach ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ScopeChat
            embedded
            quoteId={null}
            jobType={config.label}
            address=""
            phases={config.defaultPhases}
            onInsert={text => { setScopeText(text); onScopeChange(text) }}
            onClose={() => {/* no-op in embedded mode */}}
            onBuildEstimate={text => { setScopeText(text); onScopeChange(text); onBuildEstimate() }}
          />
        </div>
      </div>
    </div>
  )
}
