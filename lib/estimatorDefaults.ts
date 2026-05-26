// ── Default estimator breakdown items per phase ────────────────────────────
// Keyed by phase name (QuotePhase.phase).  When a new quote is created, each
// phase whose name appears here gets these items pre-loaded as EstimatorItems
// with zero measurements (user enters dimensions to get costs).

import type { EstimatorItemTemplate, MeasurementType } from './estimator'

let _idSeq = 0
function it(
  name: string,
  description: string,
  m: MeasurementType,
  unit: string,
  lab = 0, mat = 0, plant = 0, sub = 0, other = 0, waste = 0,
): EstimatorItemTemplate {
  return { id: `edt-${++_idSeq}`, name, description, measurementType: m, unit, labourRate: lab, materialsRate: mat, plantRate: plant, subRate: sub, otherRate: other, wastePercent: waste }
}

// ── Each key matches QuotePhase.phase ──────────────────────────────────────
export const ESTIMATOR_PHASE_DEFAULTS: Record<string, EstimatorItemTemplate[]> = {

  'Preliminaries': [
    it('Site hoarding / compound setup',    'Erect hoarding, welfare unit, signage',           'quantity', 'item',   800, 400,   0, 0,   0),
    it('Site welfare cabin',                'Weekly hire of welfare unit',                     'quantity', 'wk',       0,   0,  85, 0,   0),
    it('Scaffold erect & dismantle',        'Full working scaffold + hire',                    'quantity', 'item',   400,   0, 900, 0,   0),
    it('Skip hire',                         'General waste skips throughout project',          'quantity', 'nr',       0,   0, 320, 0,   0),
    it('Temporary services connection',     'Temp water + electrical site supply',             'quantity', 'item',   200, 150,   0, 0,   0),
    it('Project management',               'PM allowance for duration',                        'quantity', 'wk',     400,   0,   0, 0,   0),
    it('Building Control application',      'BC application + inspection fees',                'quantity', 'item',     0,   0,   0, 0, 850),
    it('Insurance / prelim allowance',      'Site insurance and additional prelims',           'quantity', 'item',     0,   0,   0, 0, 500),
  ],

  'Groundworks': [
    it('Site clearance & strip topsoil',    'Machine strip topsoil 150mm & cart away',         'area',   'm²',    4,  0, 2, 0, 0),
    it('Protect existing hard surfaces',    'Ply boards / matting over existing paving',       'area',   'm²',    2, 12, 0, 0, 0),
    it('Reduce dig to formation level',     'Machine reduce to required formation depth',      'volume', 'm³',   12,  0,22, 0, 0),
    it('Excavate strip foundations',        'Hand-trim and excavate strip foundations',        'volume', 'm³',   35,  0,18, 0, 0),
    it('Remove spoil off site',             'Load & cart excavated material off site',         'volume', 'm³',    0,  0,28, 0, 0),
    it('Hardcore to base (MOT Type 1)',     'Lay and compact hardcore sub-base',               'area',   'm²',    4, 18, 0, 0, 0),
    it('Sand blinding (50mm)',              'Sharp sand blinding layer',                       'area',   'm²',    2,  6, 0, 0, 0),
    it('Concrete strip foundations (C25)',  'Pour concrete foundations',                       'volume', 'm³',   48,125, 0, 0, 0),
    it('Spoil removal by grab lorry',       'Grab lorry clearance of surplus material',       'quantity','nr',    0,  0,480, 0, 0),
  ],

  'Drainage': [
    it('Excavate drainage trench',          'Machine excavation of drainage runs',             'linear', 'm',    8,  0,12, 0, 0),
    it('110mm PVC drain (laid & haunched)', 'Supply and lay 110mm PVC drainage pipe',          'linear', 'm',    8, 14, 0, 0, 0),
    it('160mm PVC drain (laid & haunched)', 'Supply and lay 160mm PVC drainage pipe',          'linear', 'm',   10, 22, 0, 0, 0),
    it('Inspection chamber (450mm)',        'Install plastic inspection chamber',              'quantity','nr',   60,180, 0, 0, 0),
    it('Inspection chamber (600mm)',        'Install 600mm deep inspection chamber',           'quantity','nr',   80,280, 0, 0, 0),
    it('Rainwater connection',              'Connect new RWP to existing drainage',            'quantity','nr',   60, 40, 0, 0, 0),
    it('Gully trap installation',           'Install rodding eye / gully trap',                'quantity','nr',   45, 65, 0, 0, 0),
    it('Backfill trench with gravel',       'Backfill drainage trench with gravel surround',   'linear', 'm',    4, 18, 0, 0, 0),
    it('Service ducting',                   'UPVC ducting for gas/water/electric services',    'linear', 'm',    6, 12, 0, 0, 0),
  ],

  'Substructure': [
    it('DPM (1200g polyethylene)',          'Lay DPM over full floor area',                    'area',   'm²',   2,  4, 0, 0, 0),
    it('Floor insulation (rigid board)',    'Lay 100mm rigid insulation boards',               'area',   'm²',   5, 28, 0, 0, 0),
    it('Blockwork to DPC (140mm solid)',    'Lay blockwork from foundations to DPC level',     'area',   'm²',  45, 22, 0, 0, 0),
    it('DPC (100mm plastic)',               'Install horizontal DPC course',                   'linear', 'm',    2,  3, 0, 0, 0),
    it('Concrete ground floor slab (C25)', 'Pour reinforced 150mm concrete slab',             'area',   'm²',  28, 85, 0, 0, 0),
    it('A193 mesh reinforcement',           'Steel fabric mesh in slab',                       'area',   'm²',   4, 12, 0, 0, 0),
    it('Compaction of subbase',             'Plate compact all subbase areas',                 'area',   'm²',   3,  0,  8, 0, 0),
  ],

  'Superstructure': [
    it('Cavity wall (102.5mm facing brick)','Lay facing brickwork outer leaf 102.5mm',        'area',   'm²',  58, 38, 0, 0, 0),
    it('Inner leaf (100mm blockwork)',      'Lay 100mm coursing blockwork inner leaf',         'area',   'm²',  38, 16, 0, 0, 0),
    it('Cavity wall insulation (100mm)',    'Full-fill cavity wall insulation batts',          'area',   'm²',   6, 18, 0, 0, 0),
    it('Wall ties',                         'Stainless wall ties at correct centres',          'area',   'm²',   2,  3, 0, 0, 0),
    it('Cavity closers',                    'UPVC cavity closers at all openings',             'linear', 'm',    8, 12, 0, 0, 0),
    it('Lintels (galvanised steel)',        'Catnic or similar lintel to all openings',        'linear', 'm',   12, 45, 0, 0, 0),
    it('DPC over openings',                 'Cavity tray DPC at all opening heads',            'linear', 'm',    4,  6, 0, 0, 0),
  ],

  'Structural Steels': [
    it('RSJ beam supply & fix',             'Supply and install RSJ beam(s)',                  'linear', 'm',    80,380, 0, 0, 0),
    it('Padstones (engineering brick)',     'Concrete padstones to beam bearings',             'quantity','nr',   60, 45, 0, 0, 0),
    it('Propping & temporary works',        'Temporary acrow props and needles',               'quantity','item',400,  0,250, 0, 0),
    it('Hiab / crane for steel delivery',   'Crane offload of steels on delivery',             'quantity','item',  0,  0,320, 0, 0),
    it('Fire protection to steels',         'Intumescent paint or board encasement',           'linear', 'm',    20, 35, 0, 0, 0),
  ],

  'Roof Structure & Covering': [
    it('Roof joists / rafters',             'Timber roof joists or rafters at 400 crs',        'area',   'm²',  28, 42, 0, 0, 0),
    it('OSB decking (18mm)',                '18mm OSB structural deck to flat roof',           'area',   'm²',   8, 18, 0, 0, 0),
    it('Firrings (for falls)',              'Tapered firrings to create drainage falls',       'area',   'm²',   6, 12, 0, 0, 0),
    it('EPDM flat roof system',             'EPDM rubber flat roofing fully adhered',          'area',   'm²',  22, 65, 0, 0, 0),
    it('GRP flat roof system',              'GRP fibreglass flat roofing system',              'area',   'm²',  28, 78, 0, 0, 0),
    it('Breathable roofing membrane',       'Breather membrane to pitched roof',               'area',   'm²',   4, 12, 0, 0, 0),
    it('Roof tiles / slates',               'Concrete tiles or natural slate on battens',      'area',   'm²',  32, 55, 0, 0, 0),
    it('Lead flashings',                    'Code 4 or 5 lead to all abutments & valleys',    'linear', 'm',   18, 38, 0, 0, 0),
    it('Fascia & soffits (UPVC)',           'UPVC fascia, soffits and barge boards',           'linear', 'm',   22, 28, 0, 0, 0),
    it('Guttering & downpipes',             'UPVC guttering and downpipe installation',        'linear', 'm',   12, 22, 0, 0, 0),
    it('Roof lantern / rooflight',          'Supply and fix roof lantern or rooflight',        'quantity','nr',  250,1800, 0, 0, 0),
  ],

  'Windows & Doors': [
    it('UPVC window (standard)',            'Supply and install UPVC double-glazed window',    'quantity','nr',  180,780, 0, 0, 0),
    it('Aluminium window',                  'Supply and install aluminium window',              'quantity','nr',  200,1200, 0, 0, 0),
    it('External door (composite)',         'Supply and install composite external door',       'quantity','nr',  200,850, 0, 0, 0),
    it('Bifold doors (3-pane)',             'Supply and install aluminium bifold doors',        'linear', 'm',   280,1100, 0, 0, 0),
    it('French / patio doors',             'Supply and install double french / patio doors',   'quantity','nr',  220,1400, 0, 0, 0),
    it('External door threshold',           'Powder-coated threshold bar installation',         'linear', 'm',   25, 45, 0, 0, 0),
    it('Sill (stone / timber)',             'External window sill supply and fix',              'linear', 'm',   18, 55, 0, 0, 0),
    it('Mastic sealant / weatherproofing', 'Seal all external frames on both faces',           'linear', 'm',    6,  4, 0, 0, 0),
  ],

  'First Fix Plumbing': [
    it('Hot & cold pipework runs',          'Copper or plastic first fix pipework',            'linear', 'm',   18, 14, 0, 0, 0),
    it('Soil / waste pipework',             'First fix soil and waste pipe runs',              'linear', 'm',   14, 18, 0, 0, 0),
    it('Boiler upgrade / relocation',       'New combi or system boiler supply & fit',         'quantity','item',0, 1800, 0, 0, 0),
    it('UFH pipe installation',             'Underfloor heating pipe at 200mm centres',        'area',   'm²',  18, 24, 0, 0, 0),
    it('UFH manifold & controls',           'Manifold, actuators and programmable stat',       'quantity','nr',  0, 380, 0, 0, 0),
    it('Isolating valves',                  'Service valves at all appliance connections',     'quantity','nr',  12, 18, 0, 0, 0),
    it('Kitchen waste connection',          'Stub-off for sink waste to below floor',          'quantity','item',80, 45, 0, 0, 0),
  ],

  'First Fix Electrics': [
    it('Cable containment / conduit',       'Install trunking, conduit and back boxes',        'linear', 'm',    8,  6, 0, 0, 0),
    it('Circuit wiring (ring / radial)',    'Wire socket, lighting and power circuits',        'linear', 'm',    4,  3, 0, 0, 0),
    it('Consumer unit upgrade',             'New 18-way consumer unit with RCBO protection',  'quantity','item',180,280, 0, 0, 0),
    it('Back boxes (35mm)',                 'Flush or surface back boxes to all positions',    'quantity','nr',   5,  4, 0, 0, 0),
    it('Alarm / data cabling',              'Cat6 data and alarm circuit cabling',             'linear', 'm',    3,  2, 0, 0, 0),
    it('Kitchen extract wiring',            'Wiring for island, hob and extract',              'quantity','item', 90, 40, 0, 0, 0),
  ],

  'Insulation & Plasterboarding': [
    it('Wall insulation (rigid board)',     'Fix rigid insulation boards to walls',            'area',   'm²',   6, 25, 0, 0, 0),
    it('Ceiling insulation (100mm quilt)', 'Lay 100mm mineral wool quilt over ceiling',       'area',   'm²',   3, 10, 0, 0, 0),
    it('Rafter insulation (Kingspan)',      'Fit between-rafter rigid insulation board',       'area',   'm²',  12, 32, 0, 0, 0),
    it('Plasterboard (12.5mm)',             'Fix 12.5mm plasterboard to walls & ceiling',      'area',   'm²',  10, 10, 0, 0, 0),
    it('Moisture-resistant board (WBP)',    'Fix moisture board to wet areas',                 'area',   'm²',  12, 18, 0, 0, 0),
    it('Fire board (15mm)',                 'Install 15mm fire rated board where required',    'area',   'm²',  14, 22, 0, 0, 0),
    it('Stud partitions (C16 timber)',      'Form new stud partition walls',                   'area',   'm²',  22, 18, 0, 0, 0),
    it('Acoustic insulation',              'Fill stud partitions with acoustic quilt',         'area',   'm²',   5, 12, 0, 0, 0),
    it('Screwfix / joint tape / beads',     'Consumables — screws, tape, angle beads',         'area',   'm²',   2,  3, 0, 0, 0),
  ],

  'Plastering': [
    it('Bonding coat (parge)',              'Apply bonding coat to masonry backgrounds',       'area',   'm²',  10,  6, 0, 0, 0),
    it('Skim coat (2mm finish)',            'Apply 2mm finish plaster to all surfaces',        'area',   'm²',  12,  4, 0, 0, 0),
    it('Dry-out / dehumidification',        'Dehumidifier hire during dry-out period',         'quantity','wk',   0,  0,180, 0, 0),
    it('Beads & scrim tape',                'Angle beads, stop beads, scrim tape',             'area',   'm²',   2,  2, 0, 0, 0),
    it('Make good existing plaster',        'Patch and make good disturbed existing plaster',  'area',   'm²',  18,  8, 0, 0, 0),
  ],

  'Screed & Floor Build-Up': [
    it('Sand / cement screed (65mm)',       'Lay 65mm sand/cement floor screed',               'area',   'm²',  18, 22, 0, 0, 0),
    it('Liquid screed (50mm)',              'Pump-applied liquid anhydrite screed',             'area',   'm²',   0, 32, 0, 0, 0),
    it('Screed primer',                     'Prime hardened screed before floor finish',       'area',   'm²',   2,  3, 0, 0, 0),
    it('Acoustic mat under screed',         '5mm acoustic mat below screed',                   'area',   'm²',   3,  8, 0, 0, 0),
    it('Edge insulation (EPS strip)',        'Expansion strip around perimeter',                'linear', 'm',    2,  3, 0, 0, 0),
  ],

  'Second Fix': [
    it('Skirting boards (ogee / torus)',    'Fix MDF skirting throughout',                     'linear', 'm',   12, 10, 0, 0, 0),
    it('Architraves',                       'Fix MDF architraves to all door openings',        'linear', 'm',   10,  8, 0, 0, 0),
    it('Internal doors (pre-hung)',         'Hang internal door sets with ironmongery',         'quantity','nr', 120,220, 0, 0, 0),
    it('Fire doors (FD30)',                 'Hang FD30 fire door sets',                         'quantity','nr', 140,320, 0, 0, 0),
    it('Sockets & switches (white)',        'Install double sockets and plates',                'quantity','nr',  18, 22, 0, 0, 0),
    it('Light fittings installation',       'Fix and connect light fittings',                   'quantity','nr',  15, 35, 0, 0, 0),
    it('Radiators & TRVs',                  'Install radiators with TRV and lockshield',        'quantity','nr',  65,180, 0, 0, 0),
    it('Bathroom accessories',              'TP holders, robe hooks, towel rail',               'quantity','item',120,180, 0, 0, 0),
    it('Electrical testing & certs',        'NICEIC / ECA test and certification',             'quantity','item', 0, 0, 0, 0, 280),
  ],

  'Kitchen & Client Items': [
    it('Kitchen units supply & fit',        'Fit client-supplied or specified kitchen units',   'quantity','item',900,4200, 0, 0, 0),
    it('Worktops (templated & fitted)',     'Template, cut and fit worktops',                   'linear', 'm',   80, 420, 0, 0, 0),
    it('Appliance installation',            'Install and commission oven/hob/dishwasher',       'quantity','item',350,2200, 0, 0, 0),
    it('Sink & tap installation',           'Install sink, tap, waste and connections',         'quantity','nr',  90, 250, 0, 0, 0),
    it('Splashback (glass or tile)',        'Supply and fit splashback',                         'area',   'm²',  45, 180, 0, 0, 0),
    it('Appliance electrical connection',   'Final connection to oven, hob, dishwasher',        'quantity','item', 60, 20, 0, 0, 0),
    it('Client-supplied item allowance',    'Provisional allowance for CS items',               'quantity','item',  0,  0, 0, 0, 0),
  ],

  'Decoration': [
    it('Mist coat (new plaster)',           'Apply diluted mist coat to new plaster',           'area',   'm²',   4,  2, 0, 0, 0),
    it('2 x coats emulsion (walls)',        'Full finish two-coat emulsion to walls',            'area',   'm²',   6,  3, 0, 0, 0),
    it('2 x coats emulsion (ceilings)',     'Full finish two-coat emulsion to ceilings',         'area',   'm²',   7,  3, 0, 0, 0),
    it('Gloss / satinwood to joinery',      'Sand, prime and 2 x gloss coats to woodwork',      'linear', 'm',    8,  3, 0, 0, 0),
    it('Feature wall / specialist finish', 'Allowance for feature wall or specialist paint',    'area',   'm²',  14,  8, 0, 0, 0),
    it('Door & frame painting',             'Paint internal door and frame',                     'quantity','nr',  45, 12, 0, 0, 0),
  ],

  'External Works': [
    it('Break up existing paving',          'Break out and remove existing patio / drive',      'area',   'm²',   8,  0, 4, 0, 0),
    it('Excavate and remove topsoil',       'Excavate garden area and remove topsoil',          'area',   'm²',   5,  0, 3, 0, 0),
    it('Sub-base (MOT Type 1, 100mm)',      'Lay and compact 100mm MOT sub-base',               'area',   'm²',   5, 14, 0, 0, 0),
    it('Patio (porcelain, 600×600)',        'Supply and lay 600×600 porcelain paving',           'area',   'm²',  38, 55, 0, 0, 0),
    it('Patio (natural stone)',             'Supply and lay natural stone paving',               'area',   'm²',  42, 70, 0, 0, 0),
    it('Block paving',                      'Supply and lay block paving on compacted base',    'area',   'm²',  32, 48, 0, 0, 0),
    it('Turfing',                           'Supply and lay cultivated turf',                    'area',   'm²',   8, 10, 0, 0, 0),
    it('Brick boundary wall',               'Build new brick boundary wall (1 brick thick)',    'area',   'm²',  55, 62, 0, 0, 0),
    it('Fencing (closeboard)',              'Supply and erect closeboard fencing',              'linear', 'm',   28, 45, 0, 0, 0),
    it('Final skip / site clearance',       'Clearance skip at project completion',              'quantity','nr',   0,  0, 320, 0, 0),
  ],

  'Completion & Handover': [
    it('Snagging works',                    'Address snagging items after client walkthrough',  'quantity','day', 350,  0, 0, 0, 0),
    it('Builders clean',                    'Full professional builders clean',                 'quantity','item',250, 80, 0, 0, 0),
    it('Building Control final inspection', 'BC final inspection and completion certificate',  'quantity','item',  0,  0, 0, 0, 500),
    it('O&M manual / warranties',           'Compile operation manuals and warranties',         'quantity','item',120,  0, 0, 0, 0),
    it('Touch-up materials allowance',      'Paints, sealants, filler for snagging',            'quantity','item',  0, 80, 0, 0, 0),
  ],

  // ── Fit-out / specialist phases ─────────────────────────────────────────

  'Bathroom Fit-Out': [
    it('Strip existing bathroom',           'Strip all sanitaryware, tiles, floor',             'quantity','item',380,  0, 150, 0, 0),
    it('Waterproof tanking',                'Tanking membrane to all wet surfaces',             'area',   'm²',  18, 22, 0, 0, 0),
    it('Wall tiling',                       'Supply and lay porcelain wall tiles',              'area',   'm²',  35, 55, 0, 0,10),
    it('Floor tiling',                      'Supply and lay porcelain floor tiles',             'area',   'm²',  38, 65, 0, 0, 5),
    it('Bath installation',                 'Supply and fit freestanding or panel bath',        'quantity','nr',  120,580, 0, 0, 0),
    it('Shower enclosure / wet room',       'Supply and install shower tray, enclosure',        'quantity','nr',  180,680, 0, 0, 0),
    it('WC & basin',                        'Supply and install WC and basin',                  'quantity','nr',  120,420, 0, 0, 0),
    it('Heated towel rail',                 'Supply and install electric or wet towel rail',    'quantity','nr',   80,180, 0, 0, 0),
    it('Downlights & extractor',            'Install downlights and mechanical extract fan',   'quantity','item',200,150, 0, 0, 0),
  ],

  'Kitchen Fit-Out': [
    it('Strip existing kitchen',            'Remove all existing units, appliances, floor',     'quantity','item',450,  0,200, 0, 0),
    it('Wall tiling (splashback area)',      'Tile above worktop / splashback zone',             'area',   'm²',  38, 52, 0, 0,10),
    it('Floor tiling',                      'Supply and lay floor tiles',                       'area',   'm²',  38, 65, 0, 0, 5),
    it('Kitchen units supply & fit',        'Install kitchen unit carcasses',                   'quantity','item',900,4200, 0, 0, 0),
    it('Worktops (quartz / granite)',        'Template, cut and fit stone worktops',             'linear', 'm',  100, 680, 0, 0, 0),
    it('Appliances',                         'Fit all appliances and commission',               'quantity','item',350,2200, 0, 0, 0),
    it('Sink & tap',                         'Install sink, tap and waste',                     'quantity','nr',   90, 250, 0, 0, 0),
    it('Extract fan & ducting',              'Install kitchen extract and external duct',       'quantity','item',180, 220, 0, 0, 0),
    it('Electrical second fix',              'Sockets, switches, under-unit lighting, certs',  'quantity','item',350, 300, 0, 0, 0),
  ],

  'Landscaping': [
    it('Site clearance & strip topsoil',    'Clear vegetation, strip 150mm topsoil',            'area',   'm²',   4,  0, 2, 0, 0),
    it('Excavate and reduce levels',        'Machine excavate to required finished level',      'volume', 'm³',  12,  0,22, 0, 0),
    it('Remove spoil off site',             'Excavated material carted off site',               'volume', 'm³',   0,  0,28, 0, 0),
    it('Sub-base (MOT Type 1)',             'Lay and compact hardcore sub-base',                'area',   'm²',   5, 14, 0, 0, 0),
    it('Porcelain patio paving',            'Supply and lay 600×600 porcelain slabs',           'area',   'm²',  38, 55, 0, 0, 0),
    it('Block paving (driveway)',           'Supply and lay block paving on compacted base',    'area',   'm²',  32, 48, 0, 0, 0),
    it('Turfing',                           'Supply and lay cultivated turf',                   'area',   'm²',   8, 10, 0, 0, 0),
    it('Brick retaining wall',              'Build brick retaining wall',                       'area',   'm²',  55, 62, 0, 0, 0),
    it('Closeboard fencing',                'Supply and erect closeboard fence',                'linear', 'm',   28, 45, 0, 0, 0),
    it('Garden lighting installation',      'Install low-voltage garden lighting',              'quantity','item',280,420, 0, 0, 0),
    it('Drainage channel (linear)',         'Supply and fit linear drainage channel',           'linear', 'm',   18, 48, 0, 0, 0),
  ],

  // ── Loft-specific phases ────────────────────────────────────────────────

  'Loft Structure & Steelwork': [
    it('Ridge beam (RSJ) supply & fix',     'Supply and install ridge beam steel',              'linear', 'm',   80,380, 0, 0, 0),
    it('Purlin steel supply & fix',         'Supply and install purlin steels',                 'linear', 'm',   65,280, 0, 0, 0),
    it('Trimmer joists to floor',           'Install trimmer joists to existing floor',         'quantity','nr',  90,120, 0, 0, 0),
    it('Hiab / crane for steel delivery',   'Crane offload on delivery day',                    'quantity','item',  0,  0,320, 0, 0),
    it('Temporary propping',                'Acrow props and needles during works',             'quantity','item',380,  0,250, 0, 0),
  ],

  'Dormer & Roof Works': [
    it('Raise wallplate & re-rafter',       'Raise wallplate and install new rafters',          'area',   'm²',  28, 42, 0, 0, 0),
    it('Dormer frame (structural timber)',  'Build dormer box frame structure',                 'area',   'm²',  38, 35, 0, 0, 0),
    it('OSB sheathing to dormer',           '18mm OSB sheathing to dormer cheeks',              'area',   'm²',  10, 18, 0, 0, 0),
    it('Roof tiles / slates (re-roofing)',  'Strip and re-tile / re-slate roof',                'area',   'm²',  32, 55, 0, 0, 0),
    it('Zinc / fibre cladding to dormer',   'Supply and fix cladding to dormer cheeks',         'area',   'm²',  35, 68, 0, 0, 0),
    it('Velux / rooflight installation',   'Supply and fix conservation rooflights',            'quantity','nr', 220,680, 0, 0, 0),
    it('Dormer window supply & fit',        'Supply and install dormer window',                 'quantity','nr', 280,1100, 0, 0, 0),
    it('Lead valley / abutment flashings', 'Code 5 lead at all valleys and abutments',          'linear', 'm',   18, 38, 0, 0, 0),
  ],

  'Staircase & Access': [
    it('Staircase supply & installation',   'Supply and install new staircase',                 'quantity','item',600,2200, 0, 0, 0),
    it('Trim opening in floor',             'Form staircase opening in existing floor',         'quantity','item',280,  80, 0, 0, 0),
    it('Handrail & balustrade',             'Install handrail and spindles',                    'linear', 'm',   45, 95, 0, 0, 0),
    it('Landing boards',                    'Form new landing / floor boards',                  'area',   'm²',  22, 35, 0, 0, 0),
    it('Fire doors to loft access',         'FD30 fire doors to loft staircase enclosure',     'quantity','nr',  140,320, 0, 0, 0),
  ],

  // ── Refurb-specific ─────────────────────────────────────────────────────

  'Strip-Out & Demolition': [
    it('Full property strip-out',           'Remove all fixtures, fittings and finishes',       'quantity','item',1800,  0,1200, 0, 0),
    it('Remove non-structural partitions',  'Take down and remove internal stud walls',         'area',   'm²',  12,  0,  0, 0, 0),
    it('Remove window / door',              'Remove existing window or door and frame',          'quantity','nr',   80,  0,  0, 0, 0),
    it('Skip hire',                         'General waste skips during strip-out',              'quantity','nr',    0,  0, 320, 0, 0),
    it('Asbestos survey / removal',         'Asbestos survey and professional removal',         'quantity','item',   0,  0, 0, 800,0),
  ],

  'Roof Strip & Re-Cover': [
    it('Strip existing roof covering',      'Strip tiles / slates, felt and battens',           'area',   'm²',  10,  0,  0, 0, 0),
    it('Repair / replace roof structure',  'Replace damaged timbers, noggins etc.',             'area',   'm²',  28, 22,  0, 0, 0),
    it('New roof tiles / slates',           'Supply and lay new tiles or slates',               'area',   'm²',  32, 55,  0, 0, 0),
    it('Roofing felt & battens',            'Lay breathable roofing felt and battens',          'area',   'm²',   4, 10,  0, 0, 0),
    it('Ridge & hip tiles',                 'Form new ridges and hips with mortar',             'linear', 'm',   18, 22,  0, 0, 0),
    it('Fascia, soffits & guttering',       'Replace all fascia, soffits and guttering',        'linear', 'm',   22, 38,  0, 0, 0),
    it('Lead valley / flashings',           'Replace lead valleys and flashings',               'linear', 'm',   18, 38,  0, 0, 0),
  ],

  'Flooring': [
    it('Porcelain / ceramic floor tiles',   'Supply and lay floor tiles with adhesive',         'area',   'm²',  38, 65, 0, 0, 5),
    it('Natural stone floor tiles',         'Supply and lay natural stone floor tiles',         'area',   'm²',  45, 85, 0, 0, 5),
    it('Engineered wood flooring',          'Supply and lay engineered hardwood',               'area',   'm²',  28, 55, 0, 0, 0),
    it('Luxury vinyl tile (LVT)',           'Supply and lay LVT flooring',                      'area',   'm²',  18, 38, 0, 0, 0),
    it('Carpet & underlay',                 'Supply and lay carpet with 10mm underlay',         'area',   'm²',  12, 28, 0, 0, 0),
    it('Floor prep & levelling compound',  'Apply levelling compound to imperfect floor',       'area',   'm²',   6,  8, 0, 0, 0),
  ],
}

/** Returns default estimator items for a given phase name (or empty array) */
export function getPhaseEstimatorDefaults(phaseName: string): EstimatorItemTemplate[] {
  return ESTIMATOR_PHASE_DEFAULTS[phaseName] || []
}
