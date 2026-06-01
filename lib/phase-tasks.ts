/**
 * Phase Task Data — UK 2024 contractor rates (ex-VAT)
 * Covers all takeoff phases except Site Setup & Demolition (see demolition-data.ts),
 * External Walls, Floors & Screeds, and Foundations (which use build-up makeups).
 *
 * Each phase has subphases → tasks with unit rates for labour/materials/plant/subcontractor/other.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PhaseTaskUnit =
  | 'm²'    // square metres
  | 'lm'    // linear metres
  | 'm³'    // cubic metres
  | 'nr'    // number / item
  | 'day'   // day rate
  | 'wk'    // week
  | 'sum'   // lump sum / provisional
  | '%'     // percentage of contract value

export interface PhaseTask {
  id:             string
  name:           string
  unit:           PhaseTaskUnit
  defaultQty:     number
  labour:         number   // £ per unit
  materials:      number   // £ per unit
  plant:          number   // £ per unit
  subcontractor:  number   // £ per unit (specialist subcontract)
  other:          number   // £ per unit (fees, waste, provisional)
  notes?:         string   // estimator note
  visible?:       boolean  // hide from pickers if false (default true)
}

export interface PhaseSubphase {
  id:          string
  phase:       string   // matches TAKEOFF_PHASES value
  name:        string   // display name
  markupPct:   number   // default markup %
  tasks:       PhaseTask[]
  ukWarning?:  string   // Building Regs / CDM note
}

export const PHASE_TASK_UNIT_LABELS: Record<PhaseTaskUnit, string> = {
  'm²':  'm²',
  'lm':  'lm',
  'm³':  'm³',
  'nr':  'nr',
  'day': 'day',
  'wk':  'wk',
  'sum': 'sum',
  '%':   '%',
}

// ── Helper ────────────────────────────────────────────────────────────────────

function t(
  id: string, name: string, unit: PhaseTaskUnit, defaultQty: number,
  labour: number, materials: number, plant: number, subcontractor: number, other: number,
  notes = '', visible = true,
): PhaseTask {
  return { id, name, unit, defaultQty, labour, materials, plant, subcontractor, other, notes, visible }
}

// ── 1. PLASTERING & BOARDING ──────────────────────────────────────────────────

const plasterSubphases: PhaseSubphase[] = [
  {
    id: 'plaster-internal',
    phase: 'Plastering & Boarding',
    name: 'Internal Wall Plastering',
    markupPct: 20,
    tasks: [
      t('plaster-int-skim',         'Skim coat to plasterboard',              'm²',  20, 4.50,  1.20,  0,    0,    0,  'Thistle MultiFinish 2mm'),
      t('plaster-int-2coat',        'Two-coat wet plaster to masonry',        'm²',  20, 8.50,  3.20,  0,    0,    0,  'Bonding + finish coat'),
      t('plaster-int-dot-dab',      'Dot & dab plasterboard to masonry',      'm²',  20, 5.50,  8.00,  0,    0,    0,  '12.5mm Gyproc Wallboard + skim'),
      t('plaster-int-angle-beads',  'Stainless angle / stop beads',           'lm',  20, 1.20,  1.80,  0,    0,    0,  'All external angles and window reveals'),
      t('plaster-int-pva',          'PVA bonding to existing surfaces',       'm²',  20, 0.80,  0.60,  0,    0,    0,  'Unibond or similar'),
    ],
  },
  {
    id: 'plaster-ceiling',
    phase: 'Plastering & Boarding',
    name: 'Ceiling Plastering & Boarding',
    markupPct: 20,
    tasks: [
      t('plaster-ceil-board',       'Fix 12.5mm plasterboard to ceiling',     'm²',  20, 5.50,  4.50,  0,    0,    0,  'Gyproc Wallboard to joists'),
      t('plaster-ceil-skim',        'Skim coat to ceiling plasterboard',      'm²',  20, 5.00,  1.20,  0,    0,    0,  'Thistle MultiFinish 2mm'),
      t('plaster-ceil-coving',      'Plaster coving or cornice (fix only)',   'lm',  20, 4.50,  5.50,  0,    0,    0,  '100mm cove to walls/ceiling junction'),
      t('plaster-ceil-access',      'Access hatch frame & board',             'nr',   2, 45,    35,    0,    0,    0,  'Loft / service hatch'),
    ],
  },
  {
    id: 'plaster-drylining',
    phase: 'Plastering & Boarding',
    name: 'Drylining & Metal Stud Partitions',
    markupPct: 20,
    ukWarning: 'Acoustic separating partitions must meet Part E. Fire-rated partitions to habitable rooms require 2 layers 15mm FR board.',
    tasks: [
      t('plaster-ms-partition',     'Metal stud partition (per face m²)',     'm²',  20, 7.50, 12.00,  0,    0,    0,  '70mm studs + 12.5mm board both faces + skim'),
      t('plaster-ms-acoustic',      'Acoustic mineral wool between studs',    'm²',  20, 1.50,  4.50,  0,    0,    0,  '50mm Knauf Earthwool'),
      t('plaster-ms-fire-board',    '15mm fireline board (additional layer)', 'm²',  20, 3.50,  7.50,  0,    0,    0,  'Fire rating upgrade to partitions'),
      t('plaster-ms-door-frame',    'Form doorway opening in partition',      'nr',   2, 85,    45,    0,    0,    0,  'Trimmer studs + noggings + arch'),
    ],
  },
  {
    id: 'plaster-external-render',
    phase: 'Plastering & Boarding',
    name: 'External Rendering',
    markupPct: 20,
    ukWarning: 'External render system must be compatible with substrate. EWI systems require BBA Certification. Check cavity tray / DPC at junctions.',
    tasks: [
      t('plaster-ext-base',         'Render base coat (sand:cement) 11mm',   'm²',  20, 7.50,  4.50,  0,    0,    0,  'Scratch coat to masonry'),
      t('plaster-ext-float',        'Float coat 6mm',                        'm²',  20, 4.00,  3.00,  0,    0,    0,  'Intermediate float layer'),
      t('plaster-ext-silicone',     'Silicone / monocouche top coat',        'm²',  20, 5.50,  8.50,  0,    0,    0,  'Through-colour finish'),
      t('plaster-ext-mesh',         'Render mesh & bonding coat',            'm²',  20, 3.50,  4.50,  0,    0,    0,  'Fibreglass reinforcement mesh'),
      t('plaster-ext-beads',        'Render beads (stop, angle, bellcast)',   'lm',  20, 1.50,  2.50,  0,    0,    0,  'PVC or stainless render beads'),
    ],
  },
  {
    id: 'plaster-floor-levelling',
    phase: 'Plastering & Boarding',
    name: 'Floor Levelling & Screeds',
    markupPct: 18,
    tasks: [
      t('plaster-screed-sc',        'Sand:cement floor screed 65mm',         'm²',  20, 8.50,  6.50,  0,    0,    0,  'Traditional bonded or unbonded'),
      t('plaster-screed-liq',       'Liquid screed (calcium sulphate) 50mm', 'm²',  20, 3.50, 10.50,  0,    0,    0,  'Flow screed by specialist'),
      t('plaster-selflevelling',    'Self-levelling compound 10mm',          'm²',  20, 3.50,  6.50,  0,    0,    0,  'Ardex or Mapei — existing floors'),
      t('plaster-floor-prep',       'Surface preparation & priming',         'm²',  20, 2.50,  1.20,  0,    0,    0,  'Grind ridges, prime, SBR bond'),
    ],
  },
  {
    id: 'plaster-insulation',
    phase: 'Plastering & Boarding',
    name: 'Wall Insulation & Backing',
    markupPct: 20,
    ukWarning: 'Internal wall insulation must be assessed for interstitial condensation risk. Vapour control layer required on warm side.',
    tasks: [
      t('plaster-ins-pir-board',    'PIR insulated plasterboard 50+12.5mm',  'm²',  20, 5.50, 18.00,  0,    0,    0,  'Kingspan / Celotex thermal lining'),
      t('plaster-ins-vcl',          'Vapour control layer to walls',         'm²',  20, 1.50,  1.20,  0,    0,    0,  'Polythene VCL taped to studs'),
      t('plaster-ins-lath',         'Expanded metal lath (EML)',             'm²',  20, 3.50,  5.50,  0,    0,    0,  'To structural steelwork / soffits'),
    ],
  },
]

// ── 2. STRUCTURAL FRAME ───────────────────────────────────────────────────────

const structuralFrameSubphases: PhaseSubphase[] = [
  {
    id: 'sf-steelwork',
    phase: 'Structural Frame',
    name: 'Structural Steelwork',
    markupPct: 15,
    ukWarning: 'All structural steelwork requires Structural Engineer design & calculations (BC requirement). Fire protection to Part B. CE marking required.',
    tasks: [
      t('sf-rsj-supply',            'RSJ / UC steel beam (supply only)',      'nr',   2,  0,   650,    0,    0,    0,  'Universal column or beam — size varies'),
      t('sf-rsj-install',           'Structural steel beam (install)',        'nr',   2, 280,   0,    180,   0,    0,  'Includes crane or prop hire'),
      t('sf-padstone',              'Engineering brick padstone',             'nr',   4,  45,   35,    0,    0,    0,  'Both ends of each beam'),
      t('sf-acrow-props',           'Acrow props & needles (hire + labour)',  'day',  5, 120,    0,   85,    0,    0,  'Temporary support during installation'),
      t('sf-se-fee',                'Structural engineer design fee',         'sum',  1,   0,    0,    0,    0,  850,  'Including calcs & BC submission'),
      t('sf-fire-intumescent',      'Intumescent fire protection coating',    'm²',   5, 12,   18,    0,    0,    0,  'To exposed structural steel'),
      t('sf-lintels',               'Precast concrete / steel lintels',      'nr',   4,  35,   55,    0,    0,    0,  'To all new openings'),
    ],
  },
  {
    id: 'sf-timber-frame',
    phase: 'Structural Frame',
    name: 'Timber Frame & Studwork',
    markupPct: 20,
    tasks: [
      t('sf-tf-wall-frame',         'Timber stud wall frame',                'm²',  20,  9.50, 14.00,  0,    0,    0,  '140×38 C16 studs at 400mm c/c'),
      t('sf-tf-roof-joists',        'Ceiling / floor joists',                'm²',  20,  7.50, 12.50,  0,    0,    0,  '47×200 C16 at 400mm c/c'),
      t('sf-tf-osb-sheathing',      'OSB3 structural sheathing 11mm',        'm²',  20,  4.50,  8.50,  0,    0,    0,  'To wall frame external face'),
      t('sf-tf-noggins',            'Noggings & blocking (all walls)',       'm²',  20,  2.50,  2.50,  0,    0,    0,  'At 1200mm centres or as required'),
      t('sf-tf-wall-plate',         'Roof / wall plate (100×75 treated)',    'lm',  20,  3.50,  5.50,  0,    0,    0,  'Bedded in mortar to tops of walls'),
      t('sf-tf-trussed-rafters',    'Trussed rafter erection',               'nr',  10,  35,    0,    0,   180,    0,  'Supply & erect by specialist'),
    ],
  },
  {
    id: 'sf-masonry',
    phase: 'Structural Frame',
    name: 'Masonry & Blockwork',
    markupPct: 20,
    tasks: [
      t('sf-mas-blockwork',         'Dense concrete blockwork 100mm',        'm²',  20,  9.00,  8.50,  0,    0,    0,  '7.3N/mm² blocks in mortar'),
      t('sf-mas-facing-brick',      'Facing brickwork (outer leaf)',         'm²',  20, 15.00, 22.00,  0,    0,    0,  'Client to select brick type'),
      t('sf-mas-engineering-brick', 'Engineering brickwork (DPC level)',     'm²',   5, 16.00, 28.00,  0,    0,    0,  'Class B engineering brick'),
      t('sf-mas-wall-ties',         'Stainless steel wall ties',             'm²',  20,  1.50,  2.50,  0,    0,    0,  'SS double-triangle ties'),
      t('sf-mas-cavity-fill',       'Cavity wall insulation (partial fill)',  'm²',  20,  2.50,  8.50,  0,    0,    0,  '75mm mineral wool batts'),
    ],
  },
  {
    id: 'sf-openings',
    phase: 'Structural Frame',
    name: 'Openings & Propping',
    markupPct: 20,
    tasks: [
      t('sf-op-knock-through',      'Form new opening in masonry wall',      'nr',   2, 550,    0,  150,  350,   0,  'Lintel, padstones, make good. SE req.'),
      t('sf-op-form-reveal',        'Form & plaster reveals to opening',     'nr',   2,  85,   45,    0,    0,   0,  'Both jambs + head'),
      t('sf-op-block-up',           'Block up existing opening',             'nr',   2, 180,   85,    0,    0,   0,  'Build in, tie to existing, make good'),
    ],
  },
]

// ── 3. ROOF ───────────────────────────────────────────────────────────────────

const roofSubphases: PhaseSubphase[] = [
  {
    id: 'roof-structure',
    phase: 'Roof',
    name: 'Roof Structure',
    markupPct: 20,
    ukWarning: 'Roof alterations usually require Building Control approval. Structural timber to BS 5268. Span tables must be used or SE design required.',
    tasks: [
      t('roof-cut-ridge',           'Cut & pitched roof (ridge, purlins, rafters)', 'm²', 20, 18.00, 14.00,  0,    0,    0,  'Per m² of plan area — traditional cut'),
      t('roof-trussed-rafters',     'Trussed rafter roof (supply & erect)',  'm²',  20,  8.00, 16.00,  0,    0,    0,  'Machine-made trusses, crane/MEWP hire'),
      t('roof-flat-timber-joists',  'Flat roof timber deck (joists + deck)', 'm²',  20, 12.00, 18.00,  0,    0,    0,  'C16 joists, 18mm WBP ply deck'),
      t('roof-wall-plate',          'Wall plate bedded in mortar',           'lm',  20,  3.50,  5.50,  0,    0,    0,  '100×75mm treated'),
      t('roof-insulation-cold',     'Cold roof mineral wool insulation',     'm²',  20,  3.50,  7.00,  0,    0,    0,  '100mm ceiling level + 150mm cross'),
      t('roof-insulation-warm',     'Warm flat roof PIR insulation (105mm)', 'm²',  20,  4.50, 22.00,  0,    0,    0,  'PIR boards — Kingspan or Celotex'),
      t('roof-breather-membrane',   'Roofing breather membrane (underlay)',  'm²',  20,  1.50,  1.80,  0,    0,    0,  'To all pitched roof slopes'),
    ],
  },
  {
    id: 'roof-covering',
    phase: 'Roof',
    name: 'Roof Coverings',
    markupPct: 20,
    tasks: [
      t('roof-plain-tiles',         'Concrete plain tiles (hang & point)',   'm²',  20, 14.00, 22.00,  0,    0,    0,  '268×165mm, 60 tiles/m²'),
      t('roof-interlocking-tiles',  'Interlocking concrete tiles',           'm²',  20, 11.00, 18.00,  0,    0,    0,  '420×330mm (c. 8–10 tiles/m²)'),
      t('roof-clay-tiles',          'Clay plain tiles',                      'm²',  20, 15.00, 35.00,  0,    0,    0,  'Hand-made or machine-made clay'),
      t('roof-slate',               'Natural Welsh / Brazilian slate',       'm²',  20, 18.00, 45.00,  0,    0,    0,  '500×300mm laid to gauge'),
      t('roof-fibre-cement-slate',  'Fibre cement slate (Marley Cedral)',    'm²',  20, 12.00, 24.00,  0,    0,    0,  'Cost-effective slate alternative'),
      t('roof-single-ply-grp',      'GRP fibreglass flat roof (labour)',     'm²',  20, 18.00,  0,    0,    0,    0,  'Grp by specialist usually inc mat.'),
      t('roof-grp-materials',       'GRP laminate + topcoat materials',      'm²',  20,  0,   38.00,  0,    0,    0,  '450g CSM, resin, gelcoat, trim'),
      t('roof-epdm',                'EPDM rubber membrane (flat roof)',      'm²',  20, 10.00, 28.00,  0,    0,    0,  'Fully adhered Firestone or Sika'),
    ],
  },
  {
    id: 'roof-flashings',
    phase: 'Roof',
    name: 'Flashings & Weathertightness',
    markupPct: 20,
    tasks: [
      t('roof-lead-flashing',       'Lead flashing (Code 4, fixed & dressed)','lm', 10, 18.00, 32.00,  0,    0,    0,  'To abutments, valleys, soakers'),
      t('roof-aluminium-flashing',  'Aluminium / lead-free flashing',        'lm',  10, 14.00, 20.00,  0,    0,    0,  'Pre-formed or dressed on site'),
      t('roof-ridge-hip-tiles',     'Ridge / hip tiles (fix & point)',       'lm',  10,  8.50, 12.00,  0,    0,    0,  'Concrete or clay to match roof'),
      t('roof-verge-clips',         'Verge trim / dry-fix system',           'lm',  10,  4.50,  6.50,  0,    0,    0,  'EasyTrim or Marley dry verge'),
      t('roof-soakers',             'Lead soakers to slates / plain tiles',  'nr',  10,  6.50,  8.50,  0,    0,    0,  'Code 3 lead at each course'),
      t('roof-gutters',             'uPVC guttering system (half-round)',     'lm',  20,  6.50,  8.00,  0,    0,    0,  'Fix to fascia with brackets + fall'),
      t('roof-downpipes',           'uPVC downpipes + fittings',             'nr',   4,  45,   55,    0,    0,    0,  'Per pipe run from gutter to drain'),
    ],
  },
  {
    id: 'roof-fascia-soffit',
    phase: 'Roof',
    name: 'Fascias, Soffits & Barge Boards',
    markupPct: 20,
    tasks: [
      t('roof-upvc-fascia',         'uPVC fascia board (fix & seal)',        'lm',  20,  6.50, 10.00,  0,    0,    0,  '175mm white uPVC fascia'),
      t('roof-upvc-soffit',         'uPVC soffit board (fix & vent)',        'lm',  20,  5.50,  7.50,  0,    0,    0,  '300mm vented soffit board'),
      t('roof-barge-board',         'uPVC or hardwood barge board',          'lm',  10,  6.50, 12.00,  0,    0,    0,  'To gable verge'),
    ],
  },
  {
    id: 'roof-rooflights',
    phase: 'Roof',
    name: 'Rooflights & Dormers',
    markupPct: 18,
    ukWarning: 'Rooflights may require planning permission if facing highway. Conservation areas require heritage-style rooflights. Part L U-value ≤1.6 W/m²K.',
    tasks: [
      t('roof-velux-mk04',          'Velux MK04 centre-pivot (78×98cm)',     'nr',   2, 120,  320,    0,    0,    0,  'Includes flashing kit & lining'),
      t('roof-velux-mk06',          'Velux MK06 centre-pivot (78×118cm)',    'nr',   2, 130,  380,    0,    0,    0,  'Includes flashing kit & lining'),
      t('roof-velux-sk06',          'Velux SK06 centre-pivot (114×118cm)',   'nr',   2, 145,  520,    0,    0,    0,  'Includes flashing kit & lining'),
      t('roof-flat-rooflight',      'Fixed flat rooflight (800×800mm)',      'nr',   1, 180,  650,    0,    0,    0,  'Double glazed polycarbonate dome'),
    ],
  },
]

// ── 4. WINDOWS & DOORS ────────────────────────────────────────────────────────

const windowsDoorSubphases: PhaseSubphase[] = [
  {
    id: 'wd-upvc-windows',
    phase: 'Windows & Doors',
    name: 'uPVC Windows',
    markupPct: 18,
    ukWarning: 'Replacement windows in England require FENSA certification or Building Control notification. Min U-value 1.4 W/m²K (whole window). Egress opening ≥0.33m² in bedrooms.',
    tasks: [
      t('wd-upvc-win-casement',     'uPVC casement window (supply & fit)',   'nr',   4, 120,  380,    0,    0,    0,  'White, double-glazed 600×900mm typical'),
      t('wd-upvc-win-tilt-turn',    'uPVC tilt-turn window (supply & fit)',  'nr',   2, 140,  520,    0,    0,    0,  'Double-glazed, white or foil'),
      t('wd-upvc-win-bay',          'uPVC bay window (supply & fit)',        'nr',   1, 280,  950,    0,    0,    0,  '3-panel bay — price varies by size'),
      t('wd-win-reveal-lining',     'Window board, liners & cill inside',   'nr',   4,  55,   65,    0,    0,    0,  'MDF or softwood painted'),
      t('wd-win-ext-cill',          'External window cill (precast or GRP)', 'nr',   4,  35,   55,    0,    0,    0,  'Slope to shed water'),
    ],
  },
  {
    id: 'wd-aluminium-windows',
    phase: 'Windows & Doors',
    name: 'Aluminium Windows',
    markupPct: 15,
    tasks: [
      t('wd-alum-win-casement',     'Aluminium casement window (S&F)',       'nr',   2, 150,  680,    0,    0,    0,  'Thermally broken, double-glazed'),
      t('wd-alum-win-bifold',       'Aluminium bifold doors (S&F)',          'm²',   6, 180,  750,    0,    0,    0,  'Per m² opening — typically 3+ panels'),
      t('wd-alum-win-sliding',      'Aluminium sliding patio door (S&F)',    'nr',   1, 200,  950,    0,    0,    0,  '2-panel, 1800×2100mm typical'),
    ],
  },
  {
    id: 'wd-ext-doors',
    phase: 'Windows & Doors',
    name: 'External Doors',
    markupPct: 18,
    ukWarning: 'New external doorsets in England require Building Control notification or FENSA/Certass approval. Composite doors typically achieve Part L compliance.',
    tasks: [
      t('wd-composite-door',        'Composite front door (supply & fit)',   'nr',   1, 180,  950,    0,    0,    0,  'Including frame, furniture, threshold'),
      t('wd-upvc-back-door',        'uPVC back door (supply & fit)',         'nr',   1, 120,  580,    0,    0,    0,  'Includes frame, multi-point lock'),
      t('wd-french-doors-upvc',     'uPVC French doors (supply & fit)',      'nr',   1, 200,  750,    0,    0,    0,  '1500×2100mm double outswing'),
      t('wd-bi-fold-upvc',          'uPVC bifold doors (supply & fit)',      'm²',   6, 160,  620,    0,    0,    0,  'Per m² opening'),
      t('wd-garage-door-roller',    'Roller garage door (supply & fit)',     'nr',   1, 280,  850,    0,    0,    0,  'Electrically operated roller shutter'),
    ],
  },
  {
    id: 'wd-internal-doors',
    phase: 'Windows & Doors',
    name: 'Internal Doors',
    markupPct: 20,
    tasks: [
      t('wd-int-door-hollow-core',  'Internal hollow-core door (S&F)',       'nr',   6,  75,   85,    0,    0,    0,  'Painted or pre-finished, 2040×826'),
      t('wd-int-door-solid-core',   'Internal solid-core door (S&F)',        'nr',   4,  85,  150,    0,    0,    0,  'FD30 fire door or acoustic rated'),
      t('wd-int-door-frame',        'Door lining / frame set',               'nr',   6,  45,   65,    0,    0,    0,  'Softwood or MDF lining set'),
      t('wd-int-door-architrave',   'Architrave set (both sides)',           'nr',   6,  25,   30,    0,    0,    0,  'Torus or ogee profile, primed MDF'),
      t('wd-int-door-ironmongery',  'Door ironmongery (handles, hinges)',    'nr',   6,  15,   35,    0,    0,    0,  'Brushed chrome — pair handles + 3 hinges'),
      t('wd-int-pocket-door',       'Pocket slide door (supply & fit)',      'nr',   2, 150,  380,    0,    0,    0,  'Sliding into wall cavity'),
    ],
  },
]

// ── 5. INTERNAL WALLS & PARTITIONS ───────────────────────────────────────────

const internalWallsSubphases: PhaseSubphase[] = [
  {
    id: 'iw-block-masonry',
    phase: 'Internal Walls & Partitions',
    name: 'Masonry Block Partitions',
    markupPct: 20,
    tasks: [
      t('iw-block-100',             '100mm dense blockwork partition',       'm²',  20,  9.00,  8.00,  0,    0,    0,  '7.3N/mm² block in 1:3 mortar'),
      t('iw-block-100-acoustic',    '100mm dense block (acoustic party)',    'm²',  20, 11.00, 10.00,  0,    0,    0,  'Dense block to party wall / Part E'),
      t('iw-block-doorway',         'Form doorway in blockwork partition',   'nr',   2, 120,   75,    0,    0,    0,  'Cut, lintel, make good, face up'),
    ],
  },
  {
    id: 'iw-stud-partition',
    phase: 'Internal Walls & Partitions',
    name: 'Timber Stud Partitions',
    markupPct: 20,
    ukWarning: 'Fire compartmentation: FD30 (30-min fire door) required to all habitable rooms off a stairway. Check Part B compliance.',
    tasks: [
      t('iw-stud-75',               'Timber stud partition 75mm',            'm²',  20,  8.50, 10.00,  0,    0,    0,  '75×38 C16 studs + 12.5mm board both faces'),
      t('iw-stud-100',              'Timber stud partition 100mm',           'm²',  20,  9.00, 11.00,  0,    0,    0,  '100×47 studs + acoustic mineral wool'),
      t('iw-stud-acoustic',         'Additional acoustic layer (board)',      'm²',  20,  3.50,  7.50,  0,    0,    0,  'Second layer 15mm on resilient bar'),
      t('iw-stud-doorway',          'Form doorway in stud partition',        'nr',   2,  65,   35,    0,    0,    0,  'Trimmer studs + head + blocking'),
    ],
  },
  {
    id: 'iw-metal-stud',
    phase: 'Internal Walls & Partitions',
    name: 'Metal Stud Partitions',
    markupPct: 20,
    tasks: [
      t('iw-ms-70',                 'Metal stud partition 70mm (S&F)',       'm²',  20,  7.50, 12.00,  0,    0,    0,  'British Gypsum 70mm + board + skim'),
      t('iw-ms-fire-rated',         'Fire-rated metal stud (FD30 zone)',     'm²',  20,  9.50, 16.00,  0,    0,    0,  '70mm + double 15mm FR board each face'),
    ],
  },
  {
    id: 'iw-party-wall',
    phase: 'Internal Walls & Partitions',
    name: 'Party Wall Work',
    markupPct: 15,
    ukWarning: 'Party Wall etc. Act 1996: Notice must be served minimum 2 months before notifiable works. Appointing a party wall surveyor is strongly advised.',
    tasks: [
      t('iw-pw-notice',             'Party Wall Notice & surveyor fee',      'sum',  1,  0,    0,    0,    0,  650,  'Surveyor to serve notice & draft award'),
      t('iw-pw-award',              'Party Wall Award preparation',          'sum',  1,  0,    0,    0,  850,   0,  'Building owner & adjoining owner'),
      t('iw-pw-acoustic',           'Party wall acoustic upgrade',           'm²',  15, 12.00, 22.00,  0,    0,    0,  'Dense block + acoustic batts + board'),
    ],
  },
]

// ── 6. DRAINAGE & SERVICES ────────────────────────────────────────────────────

const drainageSubphases: PhaseSubphase[] = [
  {
    id: 'drain-underground',
    phase: 'Drainage & Services',
    name: 'Underground Drainage',
    markupPct: 18,
    ukWarning: 'Works to public sewers require Thames Water / local authority consent. Adoption by water company requires SuDS compliance (Schedule 3, Flood & Water Management Act 2010).',
    tasks: [
      t('drain-ug-excavate',        'Excavate drainage trench (by hand)',    'lm',  20,  25,    0,    0,    0,    0,  'Per lm, includes bedding, backfill'),
      t('drain-ug-excavate-mach',   'Excavate drainage trench (machine)',    'lm',  20,  8,     0,   22,    0,    0,  'Machine dig + gravel bed & surround'),
      t('drain-ug-110-pipe',        'UPVC 110mm drain pipe & fittings',      'lm',  20,  12,   15,    0,    0,    0,  'Polypipe or Hepworth Class S'),
      t('drain-ug-160-pipe',        'UPVC 160mm drain pipe & fittings',      'lm',  10,  16,   22,    0,    0,    0,  'Medium duty drain run'),
      t('drain-ug-ic',              'Inspection chamber (shallow, 450mm)',   'nr',   2,  85,  180,    0,    0,    0,  'UPVC chamber incl. cover/frame'),
      t('drain-ug-soakaway',        'Soakaway crate system (1m³)',           'nr',   1,  180,  350,    0,    0,    0,  'Polystorm crates + membrane wrap'),
      t('drain-ug-rodding-eye',     'Rodding eye / access fitting',          'nr',   2,  45,   35,    0,    0,    0,  '110mm rodding eye with cap'),
    ],
  },
  {
    id: 'drain-above-ground',
    phase: 'Drainage & Services',
    name: 'Above Ground Drainage',
    markupPct: 20,
    tasks: [
      t('drain-ag-soil-pipe',       '110mm soil & vent pipe (UPVC)',         'lm',  10,  14,   12,    0,    0,    0,  'Including clips and fittings'),
      t('drain-ag-waste-50',        '50mm waste pipe (basin/bath)',          'lm',  10,   9,    7,    0,    0,    0,  'UPVC including elbows, tee'),
      t('drain-ag-waste-40',        '40mm waste pipe (basin)',               'lm',   8,   8,    5.50,  0,    0,    0,  'Shorter runs to trap'),
      t('drain-ag-aar-valve',       'Air admittance valve (AAV)',            'nr',   2,  28,   25,    0,    0,    0,  'Studor or McAlpine fitting'),
      t('drain-ag-svp-top',         'SVP roof flashing / terminal',         'nr',   1,  45,   35,    0,    0,    0,  'Stack vent terminal at roof level'),
    ],
  },
  {
    id: 'drain-cap-off',
    phase: 'Drainage & Services',
    name: 'Services Cap-off & Diversions',
    markupPct: 20,
    ukWarning: 'Gas work must be carried out by a Gas Safe registered engineer. WRAS-approved materials required for water supply.',
    tasks: [
      t('drain-cap-gas',            'Gas supply cap-off & reinstatement',    'sum',  1,   0,    0,    0,  280,    0,  'Gas Safe engineer — provisional sum'),
      t('drain-cap-water',          'Water supply cap-off',                  'nr',   1,  55,   35,    0,    0,    0,  'WRAS-approved stopcock fitting'),
      t('drain-cap-elec',           'Electrical services isolation',         'sum',  1,   0,    0,    0,  120,    0,  'NICEIC Part P electrician'),
      t('drain-divert-drain',       'Drain diversion / new connection',      'sum',  1, 180,   80,  120,    0,    0,  'Excavate, cut & re-route drain run'),
    ],
  },
  {
    id: 'drain-rainwater',
    phase: 'Drainage & Services',
    name: 'Rainwater & Surface Water',
    markupPct: 18,
    tasks: [
      t('drain-rw-channel-drain',   'ACO / channel drain (surface water)',   'lm',   5,  18,   35,    0,    0,    0,  'Polymer concrete channel + grate'),
      t('drain-rw-gully',           'Yard / trapped gully & cover',          'nr',   2,  65,   75,    0,    0,    0,  'UPVC gully with grating'),
      t('drain-rw-downpipe-connect','Downpipe connection to drain',          'nr',   4,  45,   35,    0,    0,    0,  'Pipe run from downpipe to drain'),
    ],
  },
]

// ── 7. ELECTRICS ──────────────────────────────────────────────────────────────

const electricsSubphases: PhaseSubphase[] = [
  {
    id: 'elec-first-fix',
    phase: 'Electrics',
    name: 'First Fix Electrics',
    markupPct: 20,
    ukWarning: 'All electrical work in England must comply with BS 7671:2018 (18th Edition). Notifiable work requires a Part P registered electrician (NICEIC/NAPIT) or Building Control notification.',
    tasks: [
      t('elec-ff-consumer-unit',    'Consumer unit relocation / upgrade',    'nr',   1,   0,    0,    0,  450,    0,  'NICEIC electrician — provisional sum'),
      t('elec-ff-circuit',          'New radial / ring circuit (1st fix)',   'nr',   4,   0,    0,    0,  120,    0,  'Per circuit — includes cable & back boxes'),
      t('elec-ff-downlight-prep',   'Downlight back boxes & cable drops',    'nr',  12,   0,    0,    0,   35,    0,  'Per light position — 1st fix'),
      t('elec-ff-socket-prep',      'Socket & switch back boxes',            'nr',  20,   0,    0,    0,   15,    0,  'Per position — surface or flush'),
      t('elec-ff-data-prep',        'Data / Cat 6 cable drops',              'nr',   6,   0,    0,    0,   25,    0,  'Per RJ45 outlet position'),
      t('elec-ff-smoke-heat',       'Smoke & heat detector positions',       'nr',   4,   0,    0,    0,   45,    0,  'LD2 grade to Part B / BS 5839'),
    ],
  },
  {
    id: 'elec-second-fix',
    phase: 'Electrics',
    name: 'Second Fix & Testing',
    markupPct: 20,
    tasks: [
      t('elec-sf-sockets',          'Double socket & switch (2nd fix)',      'nr',  20,   0,    0,    0,   22,    0,  'Includes plate and final connection'),
      t('elec-sf-downlights',       'LED downlight fitting (2nd fix)',       'nr',  12,   0,    0,    0,   25,    0,  'Recess, bezel & lamp supplied'),
      t('elec-sf-pendant',          'Pendant / ceiling light fitting',       'nr',   6,   0,    0,    0,   18,    0,  'Rose, flex & lampholder'),
      t('elec-sf-extractor',        'Bathroom extractor fan (wired)',        'nr',   1,   0,    0,    0,  120,    0,  'Continuous running or humidity controlled'),
      t('elec-sf-test-cert',        'EICR electrical installation cert.',    'sum',  1,   0,    0,    0,  250,    0,  'Periodic inspection & report — Part P'),
      t('elec-sf-underfloor',       'Electric underfloor heating mat (S&F)', 'm²',  10,   0,    0,    0,   55,    0,  '150W/m² bathroom mat + thermostat'),
    ],
  },
  {
    id: 'elec-external',
    phase: 'Electrics',
    name: 'External Electrics',
    markupPct: 18,
    tasks: [
      t('elec-ext-lighting',        'External wall / security lighting',     'nr',   4,   0,    0,    0,   65,    0,  'PIR or dusk-to-dawn LED fitting'),
      t('elec-ext-socket',          'External weatherproof socket (IP65)',   'nr',   2,   0,    0,    0,   85,    0,  'Garden / patio power point'),
      t('elec-ext-ev-charger',      'EV charge point (7kW tethered)',        'nr',   1,   0,    0,    0,  650,    0,  'OZEV grant may be available'),
    ],
  },
]

// ── 8. PLUMBING & HEATING ─────────────────────────────────────────────────────

const plumbingSubphases: PhaseSubphase[] = [
  {
    id: 'plumb-first-fix',
    phase: 'Plumbing & Heating',
    name: 'First Fix Plumbing',
    markupPct: 20,
    ukWarning: 'Gas work must be carried out by a Gas Safe registered engineer. Water supply requires WRAS-approved materials. Unvented cylinders require G3 qualified installer.',
    tasks: [
      t('plumb-ff-copper-15',       '15mm copper supply pipework',           'lm',  20,  12,   6.50,  0,    0,    0,  'Push-fit or solder fittings'),
      t('plumb-ff-copper-22',       '22mm copper supply pipework',           'lm',  10,  14,   9.50,  0,    0,    0,  'For boiler / cylinder connections'),
      t('plumb-ff-manifold-ufh',    'UFH manifold & controls (install)',     'nr',   1,   0,    0,    0,  450,    0,  'Installer to commission system'),
      t('plumb-ff-boiler-flue',     'Boiler position & flue route',          'sum',  1,   0,    0,    0,  180,    0,  '1st fix boiler position, flue penetration'),
    ],
  },
  {
    id: 'plumb-second-fix',
    phase: 'Plumbing & Heating',
    name: 'Second Fix & Sanitaryware',
    markupPct: 20,
    tasks: [
      t('plumb-sf-wc',              'WC suite (supply & fix)',               'nr',   2,  95,  180,    0,    0,    0,  'Close-coupled — PC sum for suite'),
      t('plumb-sf-basin',           'Wash basin (supply & fix)',             'nr',   2,  85,  120,    0,    0,    0,  'With pedestal / semi-pedestal'),
      t('plumb-sf-bath',            'Bath (supply & fix)',                   'nr',   1, 120,  250,    0,    0,    0,  'Standard 1700×700 — PC sum'),
      t('plumb-sf-shower-encl',     'Shower enclosure & tray (supply & fix)','nr',   1, 150,  380,    0,    0,    0,  '900×900 enclosure + stone tray'),
      t('plumb-sf-shower-valve',    'Concealed / thermostatic shower valve', 'nr',   1,  85,  280,    0,    0,    0,  'Including riser rail & head'),
      t('plumb-sf-kitchen-sink',    'Kitchen sink (supply & fix)',           'nr',   1, 120,  220,    0,    0,    0,  'Inset or undermount 1.5-bowl'),
      t('plumb-sf-radiators',       'Steel panel radiator (supply & fit)',   'nr',   8,  65,   95,    0,    0,    0,  'Per standard panel rad — TRV included'),
      t('plumb-sf-towel-rail',      'Heated towel rail (chrome)',            'nr',   2,  65,  120,    0,    0,    0,  'Dual fuel or plumbed'),
    ],
  },
  {
    id: 'plumb-boiler-heating',
    phase: 'Plumbing & Heating',
    name: 'Boiler & Heating System',
    markupPct: 15,
    ukWarning: 'Gas Safe registered engineer MUST install and commission boiler. Gas boiler replacement requires Building Regulations notification. Heat pump installations require MCS-certified installer for RHI eligibility.',
    tasks: [
      t('plumb-boiler-combi',       'Combi boiler (supply & commission)',    'nr',   1,   0,    0,    0, 2200,    0,  'E.g. Vaillant ecoTEC 30kW — inc. flue'),
      t('plumb-boiler-system',      'System boiler + unvented cylinder',     'sum',  1,   0,    0,    0, 3800,    0,  'For multiple bathrooms — G3 installer'),
      t('plumb-boiler-flue-ext',    'Boiler flue through external wall',     'nr',   1,   0,    0,    0,  280,    0,  'Includes core drill, sleeve & terminal'),
      t('plumb-heat-pump-ashp',     'Air source heat pump (supply & inst.)', 'sum',  1,   0,    0,    0, 8500,    0,  'MCS certified — qualifies for BUS grant'),
      t('plumb-heat-commission',    'System flush, balance & commission',    'sum',  1,   0,    0,    0,  320,    0,  'MagnaCleanse + inhibitor, pressure test'),
    ],
  },
]

// ── 9. JOINERY & FIXTURES ─────────────────────────────────────────────────────

const joinerySubphases: PhaseSubphase[] = [
  {
    id: 'join-staircase',
    phase: 'Joinery & Fixtures',
    name: 'Staircase & Balustrade',
    markupPct: 20,
    ukWarning: 'Stairs must comply with Part K: rise max 220mm, going min 220mm. Balustrade: min 900mm height, max 100mm gap between balusters. Open risers not permitted where children under 5 present.',
    tasks: [
      t('join-stair-straight',      'Straight staircase (supply & fit)',     'nr',   1, 350, 1200,    0,    0,    0,  'Softwood with MDF risers & handrail'),
      t('join-stair-quarter-turn',  'Quarter-turn staircase (S&F)',          'nr',   1, 450, 1800,    0,    0,    0,  'Winder treads — hardwood optional'),
      t('join-stair-glass-balust',  'Glass balustrade panels (supply & fit)','lm',   4, 120,  280,    0,    0,    0,  'Toughened glass + stainless fixings'),
      t('join-stair-oak-tread',     'Oak veneer tread & riser cladding',     'nr',  12,  35,   55,    0,    0,    0,  'Refurb over existing softwood stairs'),
      t('join-stair-handrail',      'Hardwood / steel handrail (fix)',       'lm',   6,  18,   28,    0,    0,    0,  'Continuous wall-side handrail'),
    ],
  },
  {
    id: 'join-fitted-furniture',
    phase: 'Joinery & Fixtures',
    name: 'Fitted Furniture & Wardrobes',
    markupPct: 20,
    tasks: [
      t('join-wardrobe-slid',       'Fitted wardrobe with sliding doors',    'lm',   3,  180,  350,    0,    0,    0,  'Floor-to-ceiling — per lm run'),
      t('join-wardrobe-hinged',     'Fitted wardrobe with hinged doors',     'lm',   3,  150,  280,    0,    0,    0,  'With internal shelf & rail'),
      t('join-bookcase-alcove',     'Alcove shelving / bookcase',            'nr',   1,  180,  150,    0,    0,    0,  'Painted MDF, adjustable shelves'),
      t('join-under-stair',         'Under-stair storage cupboard',         'nr',   1,  250,  180,    0,    0,    0,  'Hinged or push-to-open door'),
    ],
  },
  {
    id: 'join-kitchen',
    phase: 'Joinery & Fixtures',
    name: 'Kitchen Installation',
    markupPct: 18,
    tasks: [
      t('join-kitchen-units',       'Kitchen unit fit & install (labour)',   'day',  3,  250,    0,    0,    0,    0,  'Labour only — units by client/supplier'),
      t('join-kitchen-worktop',     'Worktop cut & fit (labour)',            'lm',   5,   45,    0,    0,    0,    0,  'Template, cut to length, end cap'),
      t('join-kitchen-appliances',  'Appliance integration labour',          'nr',   5,   55,    0,    0,    0,    0,  'Oven, hob, dishwasher, fridge'),
    ],
  },
  {
    id: 'join-skirting-arch',
    phase: 'Joinery & Fixtures',
    name: 'Skirtings, Architraves & Trim',
    markupPct: 22,
    tasks: [
      t('join-skirting',            'MDF skirting board (supply & fix)',     'lm',  50,   4.50,  3.50,  0,    0,    0,  '95×18mm chamfer + round, primed MDF'),
      t('join-architrave',          'MDF architrave (supply & fix)',         'lm',  30,   3.50,  2.50,  0,    0,    0,  'Per lm — both sides of all doors'),
      t('join-casing',              'Window / door casing (hardwood)',       'lm',  20,   6.00,  8.00,  0,    0,    0,  'Hardwood section, oiled'),
      t('join-window-board',        'Window board / sill (MDF or hardwood)', 'nr',   8,   35,   45,    0,    0,    0,  'Internal painted or hardwood'),
    ],
  },
]

// ── 10. TILING & FINISHES ─────────────────────────────────────────────────────

const tilingSubphases: PhaseSubphase[] = [
  {
    id: 'tile-wall',
    phase: 'Tiling & Finishes',
    name: 'Wall Tiling',
    markupPct: 22,
    ukWarning: 'Wet room / shower walls must use water-resistant (WR) board with waterproofing membrane. BS 5385 Part 1 covers ceramic wall tiling.',
    tasks: [
      t('tile-wall-ceramic-sm',     'Ceramic wall tile (up to 300×300mm)',   'm²',  15,  18,   22,    0,    0,    0,  'Labour + adhesive + grout included'),
      t('tile-wall-ceramic-lg',     'Large format wall tile (600×300+)',     'm²',  15,  24,   32,    0,    0,    0,  'Requires better surface tolerance'),
      t('tile-wall-porcelain',      'Porcelain wall tile (rectified edge)',  'm²',  15,  26,   38,    0,    0,    0,  'Thinner joint, butt / 1mm'),
      t('tile-wall-mosaic',         'Mosaic tile sheet (sheet-mounted)',     'm²',   5,  35,   45,    0,    0,    0,  '300×300mm sheet — slow to lay'),
      t('tile-wall-wet-room-prep',  'Wet room tanking / waterproof membrane','m²',  10,  12,   10,    0,    0,    0,  'Schluter KERDI or BAL tank/tite'),
      t('tile-wall-trims',          'Tile edge / corner trim (chrome)',      'lm',  15,   4.50,  3.50,  0,    0,    0,  'Schluter Rondec or similar'),
    ],
  },
  {
    id: 'tile-floor',
    phase: 'Tiling & Finishes',
    name: 'Floor Tiling',
    markupPct: 22,
    tasks: [
      t('tile-floor-ceramic',       'Ceramic floor tile (300×300mm)',        'm²',  20,  18,   18,    0,    0,    0,  'Wall / floor adhesive + grout'),
      t('tile-floor-porcelain',     'Porcelain floor tile (600×600mm)',      'm²',  20,  22,   32,    0,    0,    0,  'Including levelling compound prep'),
      t('tile-floor-stone',         'Natural stone floor tile (600×400mm)', 'm²',  15,  30,   55,    0,    0,    0,  'Limestone, travertine — PC sum for stone'),
      t('tile-floor-decoupling',    'Decoupling mat (Ditra or Protec)',      'm²',  20,   6,    9,    0,    0,    0,  'Over screed with expansion risk'),
      t('tile-floor-expansion',     'Expansion joints & trims',              'lm',  15,   4.50,  3.50,  0,    0,    0,  'Movement joints per BS 5385'),
    ],
  },
  {
    id: 'tile-surface-prep',
    phase: 'Tiling & Finishes',
    name: 'Surface Preparation for Tiling',
    markupPct: 20,
    tasks: [
      t('tile-prep-wb-board',       'Water-resistant (WR) board to walls',   'm²',  15,   8,   12,    0,    0,    0,  'Aquapanel or Hardiebacker to studs'),
      t('tile-prep-wb-floor',       'WR backer board to floor (Hardie)',     'm²',  10,   8,   10,    0,    0,    0,  'Screwed to timber sub-floor'),
      t('tile-prep-self-level',     'Self-levelling compound (before tile)',  'm²',  20,   3.50,  6.50,  0,    0,    0,  'Level out floor prior to tiling'),
    ],
  },
]

// ── 11. DECORATION ────────────────────────────────────────────────────────────

const decorationSubphases: PhaseSubphase[] = [
  {
    id: 'deco-internal-walls',
    phase: 'Decoration',
    name: 'Internal Wall & Ceiling Painting',
    markupPct: 22,
    tasks: [
      t('deco-paint-mist',          'Mist coat (new plaster)',               'm²',  80,  1.80,  0.60,  0,    0,    0,  'Watered down emulsion first coat'),
      t('deco-paint-emulsion',      'Emulsion 2 coats (walls & ceilings)',   'm²',  80,  3.50,  1.20,  0,    0,    0,  'Mid-sheen or matt — PC sum for paint'),
      t('deco-paint-primer',        'Primer / sealer coat',                  'm²',  20,  2.00,  1.50,  0,    0,    0,  'To new MDF or bare timber'),
      t('deco-paint-gloss-ww',      'Gloss / satinwood to woodwork',         'lm',  50,  3.00,  1.00,  0,    0,    0,  '2 coats on skirting, architrave, doors'),
    ],
  },
  {
    id: 'deco-specialist',
    phase: 'Decoration',
    name: 'Specialist Finishes',
    markupPct: 22,
    tasks: [
      t('deco-wallpaper',           'Wallpaper hang (lining paper + paper)', 'm²',  20,   8.50,  6.00,  0,    0,    0,  'Single room as feature wall — PC sum'),
      t('deco-microcement',         'Micro-cement / polished plaster',       'm²',  10,   0,     0,    0,  95,    0,  'Specialist subcontract finish'),
      t('deco-venetian',            'Venetian plaster finish',               'm²',   5,   0,     0,    0, 120,    0,  'Specialist subcontract — multi-coat'),
    ],
  },
  {
    id: 'deco-external',
    phase: 'Decoration',
    name: 'External Painting & Finishing',
    markupPct: 20,
    tasks: [
      t('deco-ext-masonry',         'External masonry paint (2 coats)',      'm²',  30,   4.50,  2.50,  0,    0,    0,  'Sandtex or Dulux Weathershield'),
      t('deco-ext-timber',          'External timber windows/doors (2 coat)','m²',  10,  12,    5.50,  0,    0,    0,  'Sand, prime, u/c, top coat'),
      t('deco-ext-fascia-soffit',   'Fascia & soffit paint (timber)',        'lm',  20,   4.50,  1.50,  0,    0,    0,  'Gloss or satin'),
    ],
  },
  {
    id: 'deco-floor-finishes',
    phase: 'Decoration',
    name: 'Floor Finishes',
    markupPct: 20,
    tasks: [
      t('deco-engineered-wood',     'Engineered wood floor (supply & lay)',  'm²',  20,  12,   45,    0,    0,    0,  'Click-lock — PC sum for board grade'),
      t('deco-laminate',            'Laminate floor (supply & lay)',         'm²',  20,   8,   18,    0,    0,    0,  'Class 32+ AC4 — with underlay'),
      t('deco-carpet',              'Carpet (supply & lay)',                 'm²',  20,  10,   22,    0,    0,    0,  'Mid-spec — PC sum for carpet grade'),
      t('deco-lvt',                 'LVT / vinyl plank (supply & lay)',      'm²',  20,  10,   28,    0,    0,    0,  'Karndean / Amtico quality — with prep'),
      t('deco-underlay',            'Carpet underlay (supply & lay)',        'm²',  20,   4,    5,    0,    0,    0,  'Cloud 9 or equivalent thick underlay'),
      t('deco-floor-threshold',     'Door threshold trims',                  'nr',   8,  12,   12,    0,    0,    0,  'Flat-bar aluminium or T-bar'),
    ],
  },
]

// ── 12. EXTERNAL WORKS & LANDSCAPING ─────────────────────────────────────────

const externalSubphases: PhaseSubphase[] = [
  {
    id: 'ext-excavation-prep',
    phase: 'External Works & Landscaping',
    name: 'Excavation & Ground Preparation',
    markupPct: 18,
    tasks: [
      t('ext-bulk-excavate',        'Bulk excavation (topsoil strip)',        'm³',  20,  12,    0,   18,    0,    0,  'Mini-excavator + skip loading'),
      t('ext-spoil-removal',        'Spoil removal by skip',                 'nr',   3,  80,    0,    0,    0,  310,  'Skip hire includes loading'),
      t('ext-ground-prep',          'Ground preparation & level',            'm²',  50,   3.50,  0,    0,    0,    0,  'Hand rake, compact, grade'),
      t('ext-sub-base',             'MOT Type 1 sub-base (100mm)',           'm²',  50,   3.50,  8.50, 8.50,  0,    0,  'Machine lay & compact'),
    ],
  },
  {
    id: 'ext-paving-driveways',
    phase: 'External Works & Landscaping',
    name: 'Paving & Driveways',
    markupPct: 20,
    ukWarning: 'Front garden driveways over 5m² require planning permission unless permeable surfacing used — per GPDO 2008. Block paving in flood risk zones may require SuDS assessment.',
    tasks: [
      t('ext-block-paving',         'Block paving (supply & lay)',           'm²',  30,  18,   32,    0,    0,    0,  'Marshalls or Brett 60mm block'),
      t('ext-indian-stone',         'Indian sandstone paving (supply & lay)','m²',  20,  22,   38,    0,    0,    0,  '600×600mm natural stone, jointed'),
      t('ext-concrete-paving',      'Pre-cast concrete flags (supply & lay)','m²',  30,  14,   18,    0,    0,    0,  '600×600×50mm grey flags'),
      t('ext-resin-driveway',       'Resin-bound aggregate (supply & apply)','m²',  20,   0,    0,    0,   55,    0,  'SuDS compliant — specialist subcontract'),
      t('ext-tarmac-drive',         'Macadam / tarmac (supply & lay)',       'm²',  30,  12,   18,  12,    0,    0,  'Hot-roll 40mm binder + 20mm wearing'),
    ],
  },
  {
    id: 'ext-retaining-boundary',
    phase: 'External Works & Landscaping',
    name: 'Retaining Walls & Boundary',
    markupPct: 20,
    ukWarning: 'Retaining walls over 1m high require SE design. Boundary walls require permitted development / planning check. Party Wall Act may apply to party boundary works.',
    tasks: [
      t('ext-brick-wall',           'Brick boundary wall (½ brick, 1m high)','lm',  10,  55,   75,    0,    0,    0,  'Including foundation & capping'),
      t('ext-block-retaining',      'Concrete block retaining wall',         'm²',  10,  45,   55,    0,    0,    0,  '440×215mm dense block — with drainage'),
      t('ext-timber-fence-close',   'Close-board timber fence (1.8m)',       'lm',  15,  25,   35,    0,    0,    0,  'Posts, rails, boards & arris rails'),
      t('ext-timber-fence-post',    'Fence post (concrete-in)',              'nr',  10,  22,   18,    0,    0,    0,  '100×100mm UC post, 450mm concrete'),
      t('ext-garden-wall-coping',   'Coping stones to wall top',             'lm',  10,   8,   18,    0,    0,    0,  'Precast saddle-back or natural stone'),
    ],
  },
  {
    id: 'ext-soft-landscaping',
    phase: 'External Works & Landscaping',
    name: 'Soft Landscaping',
    markupPct: 18,
    tasks: [
      t('ext-topsoil',              'Topsoil supply & spread (100mm)',       'm²',  50,   1.50,  4.50,  0,    0,    0,  'Screened topsoil, spread & rake'),
      t('ext-turf',                 'Turf supply & lay',                     'm²',  50,   3.50,  5.50,  0,    0,    0,  'Rolawn or similar quality lawn turf'),
      t('ext-seeding',              'Grass seed (hydraulic or hand-spread)',  'm²', 100,   1.80,  0.80,  0,    0,    0,  'Suitable for domestic lawns'),
      t('ext-planting',             'Planting scheme (PC sum)',               'sum',  1,   0,    0,    0,    0,  500,  'Provisional sum — design required'),
      t('ext-bark-mulch',           'Bark chip mulch to beds (75mm)',        'm²',  20,   2.50,  3.50,  0,    0,    0,  'Weed-suppressant membrane underneath'),
    ],
  },
  {
    id: 'ext-drainage-drainage',
    phase: 'External Works & Landscaping',
    name: 'External Drainage & Services',
    markupPct: 18,
    tasks: [
      t('ext-soakaway',             'French drain / soakaway trench',        'lm',  10,  18,   22,   12,    0,    0,  '600mm deep, gravel-filled, membrane'),
      t('ext-manhole-cover',        'Manhole / access cover replacement',    'nr',   1,  55,   75,    0,    0,    0,  '600×450 recessed B125 cover & frame'),
      t('ext-tap-external',         'External tap (supply & fit)',           'nr',   1,   0,    0,    0,   95,    0,  'WRAS backflow preventer included'),
    ],
  },
]

// ── 13. PRELIMINARIES ────────────────────────────────────────────────────────

const prelimSubphases: PhaseSubphase[] = [
  {
    id: 'prelim-site-setup',
    phase: 'Preliminaries',
    name: 'Site Establishment',
    markupPct: 10,
    ukWarning: 'CDM 2015: Projects where construction phase > 30 working days or >500 person-days require F10 notification to HSE and appointment of Principal Designer and Principal Contractor.',
    tasks: [
      t('prelim-site-manager',      'Site manager / foreman (on-site)',      'day',  10, 350,    0,    0,    0,    0,  'Daily rate includes travel'),
      t('prelim-welfare-unit',      'Welfare / toilet unit (hire)',          'wk',    8,   0,    0,    0,    0,  180,  'Portable welfare unit hire'),
      t('prelim-skip-perm',         'Permitting for skip on highway',        'nr',    2,   0,    0,    0,    0,   55,  'Local authority skip licence'),
      t('prelim-hoarding',          'Site hoarding / security (supply)',      'lm',   20,   8,   14,    0,    0,    0,  'Heras fencing or timber hoarding'),
      t('prelim-scaffold',          'Scaffold (erect / dismantle)',          'sum',   1,   0,    0,    0, 1800,    0,  'Scaffold subcontract — adjust to project'),
    ],
  },
  {
    id: 'prelim-insurance-fees',
    phase: 'Preliminaries',
    name: 'Insurance, Fees & Compliance',
    markupPct: 5,
    tasks: [
      t('prelim-bc-application',    'Building Control application fee',      'sum',   1,   0,    0,    0,    0,  750,  'Full plans — Local Authority / Approved'),
      t('prelim-structural-eng',    'Structural engineer fee (design)',       'sum',   1,   0,    0,    0,    0, 1200,  'Calcs & drawings — adjust to complexity'),
      t('prelim-arch-drawings',     'Architect / technician drawings',       'sum',   1,   0,    0,    0,    0, 2500,  'Working drawings for BC submission'),
      t('prelim-cdm-notifications', 'CDM F10 notification to HSE',           'sum',   1,   0,    0,    0,    0,  150,  'If project meets F10 threshold'),
      t('prelim-insurance-ci',      'Contractors All Risk insurance',        'sum',   1,   0,    0,    0,    0,  650,  'Annual policy — provisional sum'),
      t('prelim-party-wall',        'Party Wall surveyor fees',              'sum',   1,   0,    0,    0,    0,  900,  'Both surveyors — if applicable'),
    ],
  },
  {
    id: 'prelim-accommodation',
    phase: 'Preliminaries',
    name: 'Temporary Works & Accommodation',
    markupPct: 10,
    tasks: [
      t('prelim-temp-elec',         'Temporary electrical supply',           'sum',   1,   0,    0,    0,    0,  350,  'Temporary consumer unit & distribution'),
      t('prelim-temp-water',        'Temporary water supply',                'sum',   1,  80,   20,    0,    0,    0,  'Hose connections and distribution'),
      t('prelim-protection',        'Floor / surface protection',            'm²',   50,   1.50,  2.50,  0,    0,    0,  'Correx, hardboard protection'),
      t('prelim-clean',             'Final clean (internal)',                 'sum',   1,  280,    0,    0,    0,    0,  'After completion — snagging clean'),
    ],
  },
  {
    id: 'prelim-plant-logistics',
    phase: 'Preliminaries',
    name: 'Plant & Logistics',
    markupPct: 10,
    tasks: [
      t('prelim-skip-14',           'Skip hire (14-yard builders skip)',      'nr',    3,  40,    0,  310,    0,    0,  'Labour loading, hire & disposal'),
      t('prelim-crane',             'Mobile crane hire (half-day)',           'nr',    1,   0,    0,    0,    0, 950,  'For structural steel / heavy lifts'),
      t('prelim-mewp',              'MEWP / cherry picker (day rate)',        'day',   2,   0,    0,  350,    0,    0,  'Scissor lift or cherry picker hire'),
      t('prelim-transport',         'Materials delivery & transport',        'sum',   1, 120,    0,  180,    0,    0,  'Allowance for delivery charges'),
    ],
  },
]

// ── FLOORS & SCREEDS — build-up sub-phases ───────────────────────────────────
// Each FLOOR_MAKEUPS build-up type becomes a sub-phase under 'Floors & Screeds'.
// Layers become tasks. Rates start at £0 — edit in Back Office → Phases & Tasks.

const floorsScreedsSubphases: PhaseSubphase[] = [
  {
    id: 'fs-block-beam',
    phase: 'Floors & Screeds',
    name: 'Block and Beam Floor',
    markupPct: 18,
    tasks: [
      t('fs-bb-hardcore',   'Hardcore sub-base (MOT Type 1)',   'm³', 10, 0, 0, 8.5, 0, 0, 'Compacted MOT Type 1 hardcore 200mm'),
      t('fs-bb-sand-blind', 'Sand blinding',                    'm²', 20, 0, 0, 0, 0, 0,   'Sand blinding layer to hardcore'),
      t('fs-bb-dpm',        'DPC / DPM (1200g polythene)',      'm²', 20, 0, 0, 0, 0, 0,   '1200g polythene DPM'),
      t('fs-bb-beam-block', 'Beam and block structure',         'm²', 20, 0, 0, 0, 0, 0,   'Pre-stressed T-beams with dense concrete block infill'),
      t('fs-bb-insulation', 'PIR insulation 100mm',             'm²', 20, 0, 0, 0, 0, 0,   '100mm rigid PIR boards (Part L compliant)'),
      t('fs-bb-screed',     'Sand:cement screed 65mm',          'm²', 20, 0, 0, 0, 0, 0,   '65mm sand:cement floor screed'),
      t('fs-bb-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-concrete-slab',
    phase: 'Floors & Screeds',
    name: 'Concrete Slab Floor',
    markupPct: 18,
    tasks: [
      t('fs-cs-hardcore',   'Hardcore sub-base (MOT Type 1)',   'm³', 10, 0, 0, 8.5, 0, 0, 'Compacted MOT Type 1 hardcore 150mm'),
      t('fs-cs-sand-blind', 'Sand blinding',                    'm²', 20, 0, 0, 0, 0, 0,   'Sand blinding layer'),
      t('fs-cs-dpm',        'DPC / DPM (1200g polythene)',      'm²', 20, 0, 0, 0, 0, 0,   '1200g polythene DPM'),
      t('fs-cs-insulation', 'PIR insulation 100mm',             'm²', 20, 0, 0, 0, 0, 0,   '100mm rigid PIR boards (Part L compliant)'),
      t('fs-cs-concrete',   'Concrete slab C25/30',             'm³',  5, 0, 0, 0, 0, 0,   'C25/30 reinforced concrete slab with A142 mesh'),
      t('fs-cs-screed',     'Sand:cement screed 65mm',          'm²', 20, 0, 0, 0, 0, 0,   '65mm sand:cement floor screed'),
      t('fs-cs-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-suspended-timber',
    phase: 'Floors & Screeds',
    name: 'Suspended Timber Floor',
    markupPct: 18,
    tasks: [
      t('fs-st-sleepers',   'Honeycomb sleeper walls',          'lm', 10, 0, 0, 0, 0, 0,   'Half-brick honeycomb sleeper walls at DPC level'),
      t('fs-st-dpc',        'DPC to sleeper walls',             'lm', 10, 0, 0, 0, 0, 0,   'DPC strip to all sleeper walls'),
      t('fs-st-joists',     'Timber floor joists C16',          'm²', 20, 0, 0, 0, 0, 0,   '50×200 C16 joists at 400mm centres'),
      t('fs-st-insulation', 'Mineral wool insulation 200mm',    'm²', 20, 0, 0, 0, 0, 0,   '200mm mineral wool between joists (Part L)'),
      t('fs-st-vcl',        'Vapour control layer',             'm²', 20, 0, 0, 0, 0, 0,   'Polythene VCL over joists'),
      t('fs-st-chipboard',  'T&G chipboard deck 22mm',          'm²', 20, 0, 0, 0, 0, 0,   '22mm T&G moisture-resistant P5 chipboard'),
      t('fs-st-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-insulated-concrete',
    phase: 'Floors & Screeds',
    name: 'Insulated Concrete Floor',
    markupPct: 18,
    tasks: [
      t('fs-ic-hardcore',   'Hardcore sub-base (MOT Type 1)',   'm³', 10, 0, 0, 8.5, 0, 0, 'Compacted MOT Type 1 hardcore 150mm'),
      t('fs-ic-sand-blind', 'Sand blinding',                    'm²', 20, 0, 0, 0, 0, 0,   'Sand blinding layer'),
      t('fs-ic-dpm',        'DPC / DPM (1200g polythene)',      'm²', 20, 0, 0, 0, 0, 0,   '1200g polythene DPM'),
      t('fs-ic-insulation', 'PIR insulation 150mm (enhanced)',  'm²', 20, 0, 0, 0, 0, 0,   '150mm rigid PIR — enhanced Part L compliance'),
      t('fs-ic-concrete',   'Concrete slab C25',                'm³',  5, 0, 0, 0, 0, 0,   'C25 concrete slab on insulation'),
      t('fs-ic-screed',     'Sand:cement screed 65mm',          'm²', 20, 0, 0, 0, 0, 0,   '65mm sand:cement floor screed'),
      t('fs-ic-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-screeded-floor',
    phase: 'Floors & Screeds',
    name: 'Screeded Floor',
    markupPct: 18,
    tasks: [
      t('fs-sf-prep',       'Surface preparation & priming',    'm²', 20, 0, 0, 0, 0, 0,   'Clean, prime and prepare existing floor surface'),
      t('fs-sf-bonding',    'Bonding agent (SBR)',               'm²', 20, 0, 0, 0, 0, 0,   'SBR bonding agent to existing slab'),
      t('fs-sf-screed',     'Sand:cement screed 65mm',          'm²', 20, 0, 0, 0, 0, 0,   '65mm sand:cement screed (1:3.5 mix)'),
      t('fs-sf-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-ufh-screed',
    phase: 'Floors & Screeds',
    name: 'Screed with Underfloor Heating',
    markupPct: 20,
    tasks: [
      t('fs-ufh-prep',      'Surface preparation',              'm²', 20, 0, 0, 0, 0, 0,   'Clean and prepare existing floor surface'),
      t('fs-ufh-edge-strip','Edge insulation strip 10mm',       'lm', 10, 0, 0, 0, 0, 0,   '10mm perimeter edge insulation strip'),
      t('fs-ufh-pipe',      'UFH pipework (16mm PERT-AL-PERT)', 'lm',100, 0, 0, 0, 0, 0,   '16mm PERT-AL-PERT UFH pipe at 200mm centres'),
      t('fs-ufh-manifold',  'UFH manifold & controls',          'nr',  1, 0, 0, 0, 0, 0,   'Stainless manifold, actuators, thermostat & controls'),
      t('fs-ufh-screed',    'Liquid screed 75mm (UFH grade)',   'm²', 20, 0, 0, 0, 0, 0,   '75mm calcium sulphate liquid screed'),
      t('fs-ufh-finish',    'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
  {
    id: 'fs-floor-overlay',
    phase: 'Floors & Screeds',
    name: 'Existing Floor Overlay',
    markupPct: 18,
    tasks: [
      t('fs-fo-prep',       'Surface preparation & priming',    'm²', 20, 0, 0, 0, 0, 0,   'Clean, prime and prepare existing floor'),
      t('fs-fo-self-level', 'Self-levelling compound 10mm',     'm²', 20, 0, 0, 0, 0, 0,   '10mm self-levelling compound (Ardex or similar)'),
      t('fs-fo-finish',     'Floor finish allowance (PC sum)',  'm²', 20, 0, 0, 0, 0, 0,   'PC sum — client to specify floor finish'),
    ],
  },
]

// ── EXTERNAL WALLS — build-up sub-phases ─────────────────────────────────────
// Each wall construction type from WALL_MAKEUPS becomes a sub-phase under
// 'External Walls' so it appears in Back Office → Phases & Tasks → External Walls.
// Layers become tasks. Rates start at £0 — edit in Back Office to set defaults.

const externalWallsSubphases: PhaseSubphase[] = [
  {
    id: 'ew-cav-partial',
    phase: 'External Walls',
    name: 'Cavity Wall – Partial Fill',
    markupPct: 20,
    ukWarning: 'Cavity wall construction must comply with Part L (thermal) and Part C (moisture). Cavity insulation requires BBA certification. Stainless steel wall ties to BS EN 845-1.',
    tasks: [
      t('ew-cp-labour',       'Brickwork & blockwork labour',          'm²', 20, 0, 0, 0, 0, 0, 'Labour – build outer brick leaf, cavity, inner block leaf'),
      t('ew-cp-outer-brick',  'Outer leaf facing brickwork 102.5mm',   'm²', 20, 0, 0, 0, 0, 0, 'Facing brickwork 102.5mm – client to specify brick type'),
      t('ew-cp-cavity-batt',  'Cavity insulation – partial fill 75mm', 'm²', 20, 0, 0, 0, 0, 0, 'Rockwool or Knauf partial-fill cavity batts 75mm (Part L)'),
      t('ew-cp-wall-ties',    'Stainless steel wall ties',             'm²', 20, 0, 0, 0, 0, 0, 'SS double-triangle wall ties at 900×450mm centres'),
      t('ew-cp-inner-block',  'Inner leaf blockwork 100mm',            'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² medium-density concrete block 100mm'),
      t('ew-cp-dpc',          'DPC to base of wall',                   'lm', 20, 0, 0, 0, 0, 0, '112mm polythene DPC at base of cavity wall'),
    ],
  },
  {
    id: 'ew-cav-full',
    phase: 'External Walls',
    name: 'Cavity Wall – Full Fill',
    markupPct: 20,
    ukWarning: 'Full-fill mineral wool requires BBA-certified system. Check cavity width — minimum 75mm clear after insulation. Not suitable for exposed sites (NHBC Chapter 6.1).',
    tasks: [
      t('ew-cf-labour',       'Brickwork & blockwork labour',          'm²', 20, 0, 0, 0, 0, 0, 'Labour – build outer brick, full-fill cavity, inner block'),
      t('ew-cf-outer-brick',  'Outer leaf facing brickwork 102.5mm',   'm²', 20, 0, 0, 0, 0, 0, 'Facing brickwork 102.5mm – client to specify brick type'),
      t('ew-cf-full-fill',    'Full-fill mineral wool batts 100mm',    'm²', 20, 0, 0, 0, 0, 0, 'Full-fill mineral wool cavity batts 100mm (Part L)'),
      t('ew-cf-wall-ties',    'Stainless steel wall ties',             'm²', 20, 0, 0, 0, 0, 0, 'SS wall ties at 900×450mm centres'),
      t('ew-cf-inner-block',  'Inner leaf blockwork 100mm',            'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² medium-density concrete block 100mm'),
      t('ew-cf-dpc',          'DPC to base of wall',                   'lm', 20, 0, 0, 0, 0, 0, '112mm polythene DPC at base of cavity wall'),
    ],
  },
  {
    id: 'ew-solid-brick',
    phase: 'External Walls',
    name: 'Solid Brick 225mm',
    markupPct: 20,
    ukWarning: 'Solid brick walls require internal insulated dry-lining to meet Part L. Check condensation risk. Vapour control layer required on warm side.',
    tasks: [
      t('ew-sb-labour',       'Brickwork labour',                      'm²', 20, 0, 0, 0, 0, 0, 'Labour – build 225mm solid brick wall'),
      t('ew-sb-brickwork',    'Solid brickwork 225mm',                 'm²', 20, 0, 0, 0, 0, 0, 'Engineering or facing brick 225mm solid wall'),
      t('ew-sb-dpc',          'DPC to base of wall',                   'lm', 20, 0, 0, 0, 0, 0, 'Polythene DPC at base of wall'),
      t('ew-sb-dry-lining',   'Insulated dry-lining (internal) 72mm',  'm²', 20, 0, 0, 0, 0, 0, '50mm PIR insulated plasterboard dry-lining to internal face'),
    ],
  },
  {
    id: 'ew-timber-frame',
    phase: 'External Walls',
    name: 'Timber Frame Wall',
    markupPct: 20,
    ukWarning: 'Timber frame requires structural design and engineer sign-off. VCL on warm side, breather membrane on cold side. Airtightness testing recommended (Part L).',
    tasks: [
      t('ew-tf-labour',       'Frame erection labour',                 'm²', 20, 0, 0, 0, 0, 0, 'Labour – erect stud frame, insulate, board and membrane'),
      t('ew-tf-sole-plate',   'Sole plate treated timber',             'lm', 20, 0, 0, 0, 0, 0, '75×50mm treated timber sole plate with DPC underneath'),
      t('ew-tf-studs',        'Timber studwork 140×38 C16',            'm²', 20, 0, 0, 0, 0, 0, '140×38mm C16 timber studs at 400mm or 600mm centres'),
      t('ew-tf-insulation',   'Mineral wool insulation 140mm',         'm²', 20, 0, 0, 0, 0, 0, '140mm mineral wool between studs (Part L compliant)'),
      t('ew-tf-osb',          'OSB structural sheathing 11mm',         'm²', 20, 0, 0, 0, 0, 0, '11mm OSB3 structural sheathing to external face'),
      t('ew-tf-vcl',          'Vapour control layer',                  'm²', 20, 0, 0, 0, 0, 0, '500g polythene VCL to warm side of insulation'),
      t('ew-tf-membrane',     'Breather membrane',                     'm²', 20, 0, 0, 0, 0, 0, 'Tyvek or similar breather membrane to external face'),
    ],
  },
  {
    id: 'ew-blockwork-100',
    phase: 'External Walls',
    name: 'Concrete Blockwork 100mm',
    markupPct: 20,
    tasks: [
      t('ew-bk-labour',       'Blockwork labour',                      'm²', 20, 0, 0, 0, 0, 0, 'Labour – build 100mm concrete blockwork wall'),
      t('ew-bk-blocks',       'Dense concrete blocks 100mm',           'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² dense concrete block 100mm, mortar-set'),
      t('ew-bk-dpc',          'DPC to base of wall',                   'lm', 20, 0, 0, 0, 0, 0, 'Polythene DPC at base of blockwork wall'),
    ],
  },
]

// ── EXTERNAL WALL CONSTRUCTION ────────────────────────────────────────────────
// Sub-phases mirror the WALL_MAKEUPS build-up types so every construction type
// is editable in Back Office → Phases & Tasks with its own task/rate rows.
// All rates start at £0 — edit in Back Office to set your defaults.

const externalWallConstructionSubphases: PhaseSubphase[] = [
  {
    id: 'ewc-cav-partial',
    phase: 'External Wall Construction',
    name: 'Cavity Wall – Partial Fill',
    markupPct: 20,
    ukWarning: 'Cavity wall construction must comply with Part L (thermal) and Part C (moisture). Cavity insulation requires BBA certification. Stainless steel wall ties to BS EN 845-1.',
    tasks: [
      t('ewc-cp-labour',       'Brickwork & blockwork labour',         'm²', 20, 0, 0, 0, 0, 0, 'Labour – build outer brick leaf, cavity, inner block leaf'),
      t('ewc-cp-outer-brick',  'Outer leaf facing brickwork 102.5mm',  'm²', 20, 0, 0, 0, 0, 0, 'Facing brickwork 102.5mm – client to specify brick type'),
      t('ewc-cp-cavity-batt',  'Cavity insulation – partial fill 75mm','m²', 20, 0, 0, 0, 0, 0, 'Rockwool or Knauf partial-fill cavity batts 75mm (Part L compliant)'),
      t('ewc-cp-wall-ties',    'Stainless steel wall ties',            'm²', 20, 0, 0, 0, 0, 0, 'SS double-triangle wall ties at 900×450mm centres'),
      t('ewc-cp-inner-block',  'Inner leaf blockwork 100mm',           'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² medium-density concrete block 100mm'),
      t('ewc-cp-dpc',          'DPC to base of wall',                  'lm', 20, 0, 0, 0, 0, 0, '112mm polythene DPC at base of cavity wall'),
    ],
  },
  {
    id: 'ewc-cav-full',
    phase: 'External Wall Construction',
    name: 'Cavity Wall – Full Fill',
    markupPct: 20,
    ukWarning: 'Full-fill mineral wool requires BBA-certified system. Check cavity width — minimum 75mm clear after insulation. Not suitable for exposed sites (NHBC Chapter 6.1).',
    tasks: [
      t('ewc-cf-labour',       'Brickwork & blockwork labour',         'm²', 20, 0, 0, 0, 0, 0, 'Labour – build outer brick, full-fill cavity, inner block'),
      t('ewc-cf-outer-brick',  'Outer leaf facing brickwork 102.5mm',  'm²', 20, 0, 0, 0, 0, 0, 'Facing brickwork 102.5mm – client to specify brick type'),
      t('ewc-cf-full-fill',    'Full-fill mineral wool batts 100mm',   'm²', 20, 0, 0, 0, 0, 0, 'Full-fill mineral wool cavity batts 100mm (Part L compliant)'),
      t('ewc-cf-wall-ties',    'Stainless steel wall ties',            'm²', 20, 0, 0, 0, 0, 0, 'SS wall ties at 900×450mm centres'),
      t('ewc-cf-inner-block',  'Inner leaf blockwork 100mm',           'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² medium-density concrete block 100mm'),
      t('ewc-cf-dpc',          'DPC to base of wall',                  'lm', 20, 0, 0, 0, 0, 0, '112mm polythene DPC at base of cavity wall'),
    ],
  },
  {
    id: 'ewc-solid-brick',
    phase: 'External Wall Construction',
    name: 'Solid Brick 225mm',
    markupPct: 20,
    ukWarning: 'Solid brick walls require internal insulated dry-lining to meet Part L. Check condensation risk (interstitial condensation analysis recommended). Vapour control layer required.',
    tasks: [
      t('ewc-sb-labour',       'Brickwork labour',                     'm²', 20, 0, 0, 0, 0, 0, 'Labour – build 225mm solid brick wall'),
      t('ewc-sb-brickwork',    'Solid brickwork 225mm',                'm²', 20, 0, 0, 0, 0, 0, 'Engineering or facing brick 225mm solid wall'),
      t('ewc-sb-dpc',          'DPC to base of wall',                  'lm', 20, 0, 0, 0, 0, 0, 'Polythene DPC at base of wall'),
      t('ewc-sb-dry-lining',   'Insulated dry-lining (internal) 72mm', 'm²', 20, 0, 0, 0, 0, 0, '50mm PIR insulated plasterboard dry-lining to internal face'),
    ],
  },
  {
    id: 'ewc-timber-frame',
    phase: 'External Wall Construction',
    name: 'Timber Frame Wall',
    markupPct: 20,
    ukWarning: 'Timber frame requires structural design and engineer sign-off. Vapour control layer on warm side. Breather membrane on cold side. Airtightness testing recommended (Part L).',
    tasks: [
      t('ewc-tf-labour',       'Frame erection labour',                'm²', 20, 0, 0, 0, 0, 0, 'Labour – erect stud frame, insulate, board and membrane'),
      t('ewc-tf-sole-plate',   'Sole plate treated timber',            'lm', 20, 0, 0, 0, 0, 0, '75×50mm treated timber sole plate with DPC underneath'),
      t('ewc-tf-studs',        'Timber studwork 140×38 C16',           'm²', 20, 0, 0, 0, 0, 0, '140×38mm C16 timber studs at 400mm or 600mm centres'),
      t('ewc-tf-insulation',   'Mineral wool insulation 140mm',        'm²', 20, 0, 0, 0, 0, 0, '140mm mineral wool between studs (Part L compliant)'),
      t('ewc-tf-osb',          'OSB structural sheathing 11mm',        'm²', 20, 0, 0, 0, 0, 0, '11mm OSB3 structural sheathing to external face'),
      t('ewc-tf-vcl',          'Vapour control layer',                 'm²', 20, 0, 0, 0, 0, 0, '500g polythene VCL to warm side of insulation'),
      t('ewc-tf-membrane',     'Breather membrane',                    'm²', 20, 0, 0, 0, 0, 0, 'Tyvek or similar breather membrane to external face'),
    ],
  },
  {
    id: 'ewc-blockwork-100',
    phase: 'External Wall Construction',
    name: 'Concrete Blockwork 100mm',
    markupPct: 20,
    tasks: [
      t('ewc-bk-labour',       'Blockwork labour',                     'm²', 20, 0, 0, 0, 0, 0, 'Labour – build 100mm concrete blockwork wall'),
      t('ewc-bk-blocks',       'Dense concrete blocks 100mm',          'm²', 20, 0, 0, 0, 0, 0, '7.3N/mm² dense concrete block 100mm, mortar-set'),
      t('ewc-bk-dpc',          'DPC to base of wall',                  'lm', 20, 0, 0, 0, 0, 0, 'Polythene DPC at base of blockwork wall'),
    ],
  },
]

// ── Master export ─────────────────────────────────────────────────────────────

export const ALL_PHASE_SUBPHASES: PhaseSubphase[] = [
  ...plasterSubphases,
  ...structuralFrameSubphases,
  ...roofSubphases,
  ...windowsDoorSubphases,
  ...internalWallsSubphases,
  ...drainageSubphases,
  ...electricsSubphases,
  ...plumbingSubphases,
  ...joinerySubphases,
  ...tilingSubphases,
  ...decorationSubphases,
  ...externalSubphases,
  ...prelimSubphases,
  ...floorsScreedsSubphases,
  ...externalWallsSubphases,
]

/** Return subphases for a specific takeoff phase */
export function getSubphasesForPhase(phase: string): PhaseSubphase[] {
  return ALL_PHASE_SUBPHASES.filter(s => s.phase === phase)
}

/** Return all tasks for a specific subphase */
export function getTasksForSubphase(subphaseId: string): PhaseTask[] {
  const sp = ALL_PHASE_SUBPHASES.find(s => s.id === subphaseId)
  return sp?.tasks ?? []
}

// ── localStorage ──────────────────────────────────────────────────────────────

const CUSTOM_PHASE_SUBPHASES_KEY = 'sbc_custom_phase_subphases'

export function loadCustomPhaseSubphases(): PhaseSubphase[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_PHASE_SUBPHASES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCustomPhaseSubphases(subs: PhaseSubphase[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_PHASE_SUBPHASES_KEY, JSON.stringify(subs))
  } catch {}
}

export function getAllSubphasesForPhase(phase: string): PhaseSubphase[] {
  const custom = loadCustomPhaseSubphases().filter(s => s.phase === phase)
  const defaults = getSubphasesForPhase(phase)
  const defaultIds = new Set(defaults.map(s => s.id))
  const customOnly = custom.filter(s => !defaultIds.has(s.id))
  // Merge: for each default, use custom version if present, then add custom-only
  return [
    ...defaults.map(d => custom.find(c => c.id === d.id) ?? d),
    ...customOnly,
  ]
}

/** Calculate total selling price from costs and markup */
export function calcPhaseTaskSellingPrice(
  labour: number,
  materials: number,
  plant: number,
  subcontractor: number,
  other: number,
  markupPct: number,
): number {
  const cost = labour + materials + plant + subcontractor + other
  return +(cost * (1 + markupPct / 100)).toFixed(2)
}

/** Keyword matcher for AI scope-writer pre-fill */
export function matchPhaseTasksFromScope(
  phase: string,
  scopeText: string,
): { subphaseId: string; taskId: string }[] {
  const lower = scopeText.toLowerCase()
  const subphases = getSubphasesForPhase(phase)
  const matches: { subphaseId: string; taskId: string }[] = []

  // Simple keyword matching — pair keywords to task IDs
  const KEYWORDS: [string[], string, string][] = [
    // Plastering
    [['skim','plasterboard','plaster out'], 'plaster-internal',     'plaster-int-skim'],
    [['dot and dab','dot & dab'],          'plaster-internal',     'plaster-int-dot-dab'],
    [['external render','render external'],'plaster-external-render','plaster-ext-silicone'],
    [['screed','floor screed'],            'plaster-floor-levelling','plaster-screed-sc'],
    [['ceiling board','plasterboard ceil'],'plaster-ceiling',       'plaster-ceil-board'],
    // Structural Frame
    [['steel beam','rsj','universal beam'], 'sf-steelwork',         'sf-rsj-supply'],
    [['lintel'],                            'sf-steelwork',         'sf-lintels'],
    [['knock through','new opening'],       'sf-openings',          'sf-op-knock-through'],
    [['block up'],                          'sf-openings',          'sf-op-block-up'],
    [['blockwork','block work'],            'sf-masonry',           'sf-mas-blockwork'],
    [['facing brick','brickwork'],          'sf-masonry',           'sf-mas-facing-brick'],
    // Roof
    [['cut roof','pitched roof'],           'roof-structure',       'roof-cut-ridge'],
    [['truss','trussed rafter'],            'roof-structure',       'roof-trussed-rafters'],
    [['flat roof','grp','fibreglass roof'], 'roof-covering',        'roof-single-ply-grp'],
    [['velux','rooflight'],                 'roof-rooflights',      'roof-velux-mk06'],
    [['gutters','fascia','soffit'],         'roof-fascia-soffit',   'roof-upvc-fascia'],
    [['lead flashing','flashing'],          'roof-flashings',       'roof-lead-flashing'],
    [['slate','plain tile','interlocking'], 'roof-covering',        'roof-interlocking-tiles'],
    // Windows & Doors
    [['upvc window','replace window'],      'wd-upvc-windows',      'wd-upvc-win-casement'],
    [['bifold','bi-fold door'],             'wd-aluminium-windows', 'wd-alum-win-bifold'],
    [['composite door','front door'],       'wd-ext-doors',         'wd-composite-door'],
    [['french door'],                       'wd-ext-doors',         'wd-french-doors-upvc'],
    [['internal door','hollow core'],       'wd-internal-doors',    'wd-int-door-hollow-core'],
    [['skirting','architrave'],             'join-skirting-arch',   'join-skirting'],
    // Internal Walls
    [['stud partition','stud wall'],        'iw-stud-partition',    'iw-stud-75'],
    [['party wall'],                        'iw-party-wall',        'iw-pw-notice'],
    [['block partition','internal block'],  'iw-block-masonry',     'iw-block-100'],
    // Drainage
    [['underground drain','drainage run'],  'drain-underground',    'drain-ug-110-pipe'],
    [['inspection chamber','ic'],           'drain-underground',    'drain-ug-ic'],
    [['soil pipe','soil stack'],            'drain-above-ground',   'drain-ag-soil-pipe'],
    [['cap off','cap-off gas'],             'drain-cap-off',        'drain-cap-gas'],
    // Electrics
    [['first fix electric','1st fix elec'], 'elec-first-fix',       'elec-ff-circuit'],
    [['socket','sockets'],                  'elec-second-fix',      'elec-sf-sockets'],
    [['downlight','downlights'],            'elec-first-fix',       'elec-ff-downlight-prep'],
    [['ev charge','ev charger'],            'elec-external',        'elec-ext-ev-charger'],
    // Plumbing
    [['bathroom','sanitaryware'],           'plumb-second-fix',     'plumb-sf-wc'],
    [['combi boiler','replace boiler'],     'plumb-boiler-heating', 'plumb-boiler-combi'],
    [['heat pump','ashp'],                  'plumb-boiler-heating', 'plumb-heat-pump-ashp'],
    [['radiator'],                          'plumb-second-fix',     'plumb-sf-radiators'],
    [['shower'],                            'plumb-second-fix',     'plumb-sf-shower-encl'],
    // Joinery
    [['staircase','stairs'],               'join-staircase',        'join-stair-straight'],
    [['kitchen fit','kitchen installation'],'join-kitchen',         'join-kitchen-units'],
    [['wardrobe','fitted wardrobe'],        'join-fitted-furniture', 'join-wardrobe-slid'],
    // Tiling
    [['wall tile','tiling walls'],          'tile-wall',            'tile-wall-ceramic-sm'],
    [['floor tile','tiling floor'],         'tile-floor',           'tile-floor-porcelain'],
    [['wet room'],                          'tile-wall',            'tile-wall-wet-room-prep'],
    // Decoration
    [['emulsion','paint walls','decor'],    'deco-internal-walls',  'deco-paint-emulsion'],
    [['engineered wood floor','wood floor'],'deco-floor-finishes',  'deco-engineered-wood'],
    [['carpet'],                            'deco-floor-finishes',  'deco-carpet'],
    [['lvt','vinyl plank'],                 'deco-floor-finishes',  'deco-lvt'],
    // External
    [['cavity wall','partial fill'],         'ewc-cav-partial',      'ewc-cp-labour'],
    [['full fill cavity','full fill wall'],  'ewc-cav-full',         'ewc-cf-labour'],
    [['solid brick','225mm brick'],          'ewc-solid-brick',      'ewc-sb-labour'],
    [['timber frame','stud frame wall'],     'ewc-timber-frame',     'ewc-tf-labour'],
    [['blockwork 100','block wall 100'],     'ewc-blockwork-100',    'ewc-bk-labour'],
    [['block paving','driveway'],           'ext-paving-driveways', 'ext-block-paving'],
    [['indian stone','patio paving'],       'ext-paving-driveways', 'ext-indian-stone'],
    [['boundary wall','brick wall ext'],    'ext-retaining-boundary','ext-brick-wall'],
    [['fence','close-board'],              'ext-retaining-boundary','ext-timber-fence-close'],
    [['turf','lawn'],                       'ext-soft-landscaping', 'ext-turf'],
    // Prelims
    [['scaffold','scaffolding'],            'prelim-site-setup',    'prelim-scaffold'],
    [['building control','bc application'], 'prelim-insurance-fees','prelim-bc-application'],
    [['structural engineer','se fee'],      'prelim-insurance-fees','prelim-structural-eng'],
  ]

  for (const [keywords, subphaseId, taskId] of KEYWORDS) {
    const sub = subphases.find(s => s.id === subphaseId)
    if (!sub) continue
    if (keywords.some(kw => lower.includes(kw))) {
      if (!matches.find(m => m.taskId === taskId)) {
        matches.push({ subphaseId, taskId })
      }
    }
  }

  return matches
}
