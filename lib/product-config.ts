/**
 * Product Configuration — Canonical Source of Truth
 *
 * ═══════════════════════════════════════════════════════════════
 * THREE-TIER ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 * Tier 1 — Product Structure  (this file + lib/ TypeScript files)
 *   Controlled by: code / product team
 *   Contains:      phases, tools, measurement logic, material recipes,
 *                  floor/wall/plaster makeups, quote export schema,
 *                  AI mapping rules, Gantt mapping
 *   Stored:        TypeScript source — version-controlled in git
 *   Change by:     code change + deploy
 *   Key files:     lib/takeoff-types.ts, lib/material-recipes.ts,
 *                  lib/demolition-data.ts, lib/phase-tasks.ts, lib/utils.ts
 *
 * Tier 2 — Business Defaults  (Supabase bo_* tables)
 *   Controlled by: each customer (the builder / company)
 *   Contains:      labour rates, trade rates, plant rates, material prices,
 *                  markups, VAT, company details, quote terms, payment terms
 *   Stored:        Supabase (per user_id, RLS protected)
 *   Change by:     Back Office settings page
 *   Key tables:    bo_labour_trades, bo_products, bo_plant_items,
 *                  settings (extended in phase11.sql)
 *
 * Tier 3 — Project Overrides  (Supabase takeoff_projects + localStorage)
 *   Controlled by: per-project (customer's estimator)
 *   Contains:      quantities, measurements, room names, drawing labels,
 *                  project-specific notes, construction choices, openings
 *   Stored:        Supabase (per project_id + user_id) AND
 *                  localStorage (immediate cache + offline/recovery fallback)
 *   Change by:     Takeoff tool / quote builder
 *   Key tables:    takeoff_projects (created in phase11.sql)
 *   Exception:     planImageUrl — localStorage only (too large for Supabase)
 *
 * ═══════════════════════════════════════════════════════════════
 * RULES
 * ═══════════════════════════════════════════════════════════════
 * 1. Customers never build the phase/tool structure themselves —
 *    they receive a professional ready-to-use system.
 * 2. Customers configure their business defaults (rates, markup, VAT)
 *    via the Back Office. These override product defaults at quote time.
 * 3. Each project stores its own measurements and choices —
 *    they do not modify the product structure or business defaults.
 * 4. The takeoff tool is the development environment for refining
 *    phases, measurement logic, and material recipes. Changes are
 *    made via code, not the UI.
 * 5. localStorage is used for: immediate writes, offline recovery,
 *    plan images. It is NOT the system of record for project data.
 * ═══════════════════════════════════════════════════════════════
 */

export const PRODUCT_VERSION = '1.0.0'
export const PRODUCT_NAME    = 'Small Build Company Pro'

// ── Canonical phase IDs ───────────────────────────────────────────────────────
// Stable short IDs for each takeoff phase.
// Used when seeding bo_phases, cross-system references, and future versioning.
// IMPORTANT: never rename these IDs once data has been seeded — it would break
// existing records. Only add new entries; never remove or rename.

export const CANONICAL_PHASE_IDS: Record<string, string> = {
  'Site Setup & Demolition':     'phase_site_setup',
  'Foundations':                  'phase_foundations',
  'Structural Frame':             'phase_structural_frame',
  'External Walls':               'phase_external_walls',
  'Roof':                         'phase_roof',
  'Windows & Doors':              'phase_windows_doors',
  'Internal Walls & Partitions':  'phase_internal_walls',
  'Floors & Screeds':             'phase_floors_screeds',
  'Drainage & Services':          'phase_drainage',
  'Electrics':                    'phase_electrics',
  'Plumbing & Heating':           'phase_plumbing',
  'Plastering & Boarding':        'phase_plastering',
  'Joinery & Fixtures':           'phase_joinery',
  'Tiling & Finishes':            'phase_tiling',
  'Decoration':                   'phase_decoration',
  'External Works & Landscaping': 'phase_external_works',
  'Preliminaries':                'phase_preliminaries',
  'Other':                        'phase_other',
  'External Wall Construction':   'phase_ext_wall_construction',
}

// ── Business defaults interface (Tier 2) ──────────────────────────────────────
// Typed reference for the settings fields added in supabase/phase11.sql.
// The Back Office page reads these from Supabase; falls back to DEFAULT_BUSINESS_SETTINGS.

export interface BusinessDefaults {
  // VAT
  vatRegistered:   boolean
  vatNumber:       string
  vatRate:         number    // % e.g. 20

  // Financial
  defaultMarkup:   number    // % e.g. 20
  paymentTerms:    string
  currency:        string    // 'GBP' | 'EUR' | 'USD'

  // Company registration
  companyNumber:   string
  insuranceNumber: string
  cisRegistered:   boolean
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessDefaults = {
  vatRegistered:   false,
  vatNumber:       '',
  vatRate:         20,
  defaultMarkup:   20,
  paymentTerms:    'Stage payments due at agreed milestones. Final payment due on practical completion.',
  currency:        'GBP',
  companyNumber:   '',
  insuranceNumber: '',
  cisRegistered:   false,
}

// ── Takeoff project tier boundaries (Tier 3) ──────────────────────────────────
// Documents which fields are Supabase-persisted vs localStorage-only.

export const TAKEOFF_PROJECT_STORAGE = {
  /** Fields upserted to the takeoff_projects Supabase table. */
  supabase: [
    'id', 'name', 'address', 'jobType',
    'calibration', 'elements', 'items',
    'createdAt', 'updatedAt',
  ] as const,
  /** Fields kept in localStorage only — excluded from Supabase. */
  localOnly: [
    'planImageUrl',  // data URI — can be MB in size
  ] as const,
}
