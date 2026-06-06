/**
 * phase-visuals.ts
 * Maps every Takeoff/Quote phase to an emoji, brand colour and Unsplash
 * search keywords. Used by the AI phase-review to stamp a visual on each
 * completed phase section in the client-facing quote.
 */

export interface PhaseVisual {
  emoji:    string
  color:    string   // CSS hex — used as accent / card border
  keywords: string   // Unsplash query string
}

export interface PhaseImage {
  emoji:     string
  color:     string
  photoUrl?: string  // Unsplash small image URL (undefined if no API key)
}

export const PHASE_VISUALS: Record<string, PhaseVisual> = {
  'Site Setup':                   { emoji: '🏗️', color: '#f59e0b', keywords: 'construction site setup scaffold hoarding' },
  'Demolition':                   { emoji: '🔨', color: '#e74c3c', keywords: 'demolition construction site excavator strip out' },
  'Site Setup & Demolition':      { emoji: '🔨', color: '#e74c3c', keywords: 'construction site demolition excavator' },  // legacy
  'Foundations':                  { emoji: '⛏️', color: '#8e44ad', keywords: 'concrete foundations construction trench' },
  'Structural Frame':             { emoji: '🏗️', color: '#2c3e50', keywords: 'steel frame structural construction building' },
  'External Walls':               { emoji: '🧱', color: '#e67e22', keywords: 'brick wall construction masonry exterior' },
  'Roof':                         { emoji: '🏠', color: '#c0392b', keywords: 'roof tiles roofing construction pitched' },
  'Windows & Doors':              { emoji: '🪟', color: '#27ae60', keywords: 'window installation door modern house' },
  'Internal Walls & Partitions':  { emoji: '🏗️', color: '#3498db', keywords: 'interior wall partition stud construction' },
  'Floors & Screeds':             { emoji: '📐', color: '#f39c12', keywords: 'floor screed concrete levelling construction' },
  'Drainage & Services':          { emoji: '🔧', color: '#16a085', keywords: 'drainage pipe underground utilities' },
  'Electrics':                    { emoji: '⚡', color: '#f1c40f', keywords: 'electrical wiring installation modern' },
  'Plumbing & Heating':           { emoji: '🚿', color: '#1abc9c', keywords: 'plumbing heating installation boiler' },
  'Plastering & Boarding':        { emoji: '🪣', color: '#95a5a6', keywords: 'plastering interior finish smooth wall' },
  'Joinery & Fixtures':           { emoji: '🪵', color: '#795548', keywords: 'joinery woodwork kitchen fixtures interior' },
  'Tiling & Finishes':            { emoji: '🏺', color: '#e91e63', keywords: 'tiling floor wall bathroom modern finish' },
  'Decoration':                   { emoji: '🎨', color: '#9c27b0', keywords: 'interior painting decoration modern home' },
  'External Works & Landscaping': { emoji: '🌿', color: '#388e3c', keywords: 'landscaping garden patio outdoor' },
  'Preliminaries':                { emoji: '📋', color: '#607d8b', keywords: 'construction site management safety' },
}

/** Fallback for any phase not in the map above */
export const DEFAULT_VISUAL: PhaseVisual = {
  emoji:    '🏗️',
  color:    '#7ab533',
  keywords: 'construction building site',
}

export function getPhaseVisual(phaseName: string): PhaseVisual {
  // Try exact match first
  if (PHASE_VISUALS[phaseName]) return PHASE_VISUALS[phaseName]
  // Try partial keyword match
  const lower = phaseName.toLowerCase()
  for (const [key, vis] of Object.entries(PHASE_VISUALS)) {
    if (lower.includes(key.toLowerCase().split(' ')[0])) return vis
  }
  return DEFAULT_VISUAL
}
