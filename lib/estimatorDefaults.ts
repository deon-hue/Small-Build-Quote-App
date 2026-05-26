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

  // ── Site setup / prelims variants ───────────────────────────────────────

  'Site Establishment': [
    it('Site compound & hoarding',        'Erect hoarding, welfare unit, signage',          'quantity','item', 600, 350,   0, 0, 0),
    it('Scaffold erect & dismantle',      'Full working scaffold + hire',                   'quantity','item', 400,   0, 900, 0, 0),
    it('Skip hire',                       'General waste skips throughout project',          'quantity','nr',    0,   0, 320, 0, 0),
    it('Project management',              'PM allowance for project duration',               'quantity','wk',  400,   0,   0, 0, 0),
    it('Building Control application',    'BC application + inspection fees',                'quantity','item',  0,   0,   0, 0, 850),
    it('Site insurance & prelims',        'Site insurance and prelim allowance',             'quantity','item',  0,   0,   0, 0, 500),
  ],

  'Site Establishment & Scaffold': [
    it('Site compound setup',             'Welfare unit, signage, hoarding',                'quantity','item', 600, 350,   0, 0, 0),
    it('Scaffold erect & dismantle',      'Full working scaffold + weekly hire',             'quantity','item', 400,   0, 900, 0, 0),
    it('Scaffold weekly hire',            'Weekly scaffold hire charge',                    'quantity','wk',    0,   0, 120, 0, 0),
    it('Skip hire',                       'General waste skips throughout project',          'quantity','nr',    0,   0, 320, 0, 0),
    it('Project management',              'PM allowance for project duration',               'quantity','wk',  400,   0,   0, 0, 0),
    it('Building Control fees',           'BC application + inspection fees',                'quantity','item',  0,   0,   0, 0, 850),
    it('Site insurance',                  'Site insurance allowance',                        'quantity','item',  0,   0,   0, 0, 500),
  ],

  'Site Establishment & Enabling Works': [
    it('Site compound & welfare',         'Welfare unit, hoarding, signage',                'quantity','item', 600, 350,   0, 0, 0),
    it('Scaffold erect & dismantle',      'Full working scaffold + hire',                   'quantity','item', 400,   0, 900, 0, 0),
    it('Enabling works — demolition',     'Remove obstructions, break out paving, etc.',    'quantity','item', 800,   0, 480, 0, 0),
    it('Skip hire',                       'Waste skips for enabling phase',                  'quantity','nr',    0,   0, 320, 0, 0),
    it('Tree removal / clearance',        'Remove trees, shrubs, roots as required',         'quantity','item', 600,   0, 350, 0, 0),
    it('Building Control application',    'BC application + inspection fees',                'quantity','item',  0,   0,   0, 0, 850),
    it('Project management',              'PM allowance for project duration',               'quantity','wk',  400,   0,   0, 0, 0),
  ],

  'Site Clearance & Setting Out': [
    it('Strip topsoil (150mm)',           'Machine strip topsoil and cart away',             'area',   'm²',   4,   0,  2, 0, 0),
    it('Remove vegetation / scrub',       'Clear and remove all vegetation',                 'area',   'm²',   3,   0,  0, 0, 0),
    it('Setting out (pegs & profiles)',   'Engineer set out foundation positions',           'quantity','item', 280, 80,   0, 0, 0),
    it('Skip hire — clearance',           'Skip for cleared material',                       'quantity','nr',    0,   0, 320, 0, 0),
    it('Protect existing surfaces',       'Ply boards / matting over existing paving',       'area',   'm²',   2,  12,   0, 0, 0),
  ],

  'Strip-Out & Clearance': [
    it('Strip existing finishes',         'Remove floor coverings, tiles, wall finishes',    'area',   'm²',   8,   0,  0, 0, 0),
    it('Remove existing fixtures',        'Strip sanitaryware, kitchen units, radiators',    'quantity','item', 550,  0, 200, 0, 0),
    it('Remove internal doors & frames',  'Take out existing doors and frames',              'quantity','nr',   35,   0,  0, 0, 0),
    it('Skip hire',                       'Skips for strip-out material',                    'quantity','nr',    0,   0, 320, 0, 0),
    it('Asbestos survey',                 'Asbestos refurbishment survey',                   'quantity','item',  0,   0,  0, 0, 350),
  ],

  'Full Strip-Out': [
    it('Full property strip-out',         'Remove all fixtures, fittings and finishes',      'quantity','item',1800,  0,1200, 0, 0),
    it('Remove non-structural partitions','Take down internal stud / timber walls',           'area',   'm²',  12,   0,   0, 0, 0),
    it('Remove existing windows / doors', 'Remove existing windows and door frames',          'quantity','nr',   80,   0,   0, 0, 0),
    it('Skip hire',                       'Multiple skips for full strip-out',               'quantity','nr',    0,   0, 320, 0, 0),
    it('Asbestos survey / removal',       'Survey and specialist removal if found',           'quantity','item',  0,   0,   0, 800, 0),
  ],

  'Making Good & Preparation': [
    it('Hack off loose plaster',          'Remove blown / loose existing plaster',           'area',   'm²',  10,   0,   0, 0, 0),
    it('Fill / patch masonry',            'Fill cracks, voids and make good brickwork',      'area',   'm²',  14,   8,   0, 0, 0),
    it('Prep walls for decoration',       'Sand, fill and prime walls before painting',      'area',   'm²',   5,   3,   0, 0, 0),
    it('Prepare floors',                  'Clean, level and prepare floors for finishing',   'area',   'm²',   6,   5,   0, 0, 0),
    it('Seal / prime surfaces',           'Apply sealer / primer to prepared surfaces',      'area',   'm²',   3,   2,   0, 0, 0),
  ],

  'Strip Out Existing Kitchen': [
    it('Remove kitchen units & worktops', 'Strip all base and wall units, worktops',         'quantity','item', 350,  0, 0, 0, 0),
    it('Remove appliances',               'Disconnect and remove all appliances',             'quantity','item', 180,  0, 0, 0, 0),
    it('Remove floor covering',           'Strip existing floor tiles / vinyl / wood',       'area',   'm²',   8,   0,   0, 0, 0),
    it('Cap off plumbing stubs',          'Cap off water feeds and waste connections',        'quantity','item', 120,  35,  0, 0, 0),
    it('Skip hire',                       'Skip for kitchen waste material',                  'quantity','nr',    0,   0, 320, 0, 0),
  ],

  'Remove Existing Bathroom': [
    it('Remove sanitaryware',             'Disconnect and remove WC, basin, bath/shower',    'quantity','item', 280,  0, 0, 0, 0),
    it('Remove floor & wall tiles',       'Hack off all existing tiles',                     'area',   'm²',  10,   0,   0, 0, 0),
    it('Remove floor covering',           'Strip existing floor finish',                     'area',   'm²',   8,   0,   0, 0, 0),
    it('Cap off plumbing stubs',          'Cap off all water and waste connections',          'quantity','item', 100,  30,  0, 0, 0),
    it('Skip hire',                       'Skip for bathroom waste material',                 'quantity','nr',    0,   0, 320, 0, 0),
  ],

  // ── Groundworks / foundations variants ────────────────────────────────────

  'Excavation': [
    it('Site strip topsoil (150mm)',      'Machine strip topsoil and cart away',             'area',   'm²',   4,   0,   2, 0, 0),
    it('Excavate to formation level',     'Machine excavate to required depth',              'volume', 'm³',  12,   0,  22, 0, 0),
    it('Excavate strip foundations',      'Hand-trim strip foundation trenches',             'volume', 'm³',  35,   0,  18, 0, 0),
    it('Remove spoil off site',           'Load and cart excavated material off site',       'volume', 'm³',   0,   0,  28, 0, 0),
    it('Grab lorry clearance',            'Grab lorry for surplus excavated material',       'quantity','nr',   0,   0, 480, 0, 0),
  ],

  'Excavation & Setting Out': [
    it('Setting out (pegs & profiles)',   'Engineer set out foundation positions',           'quantity','item', 280,  80,   0, 0, 0),
    it('Strip topsoil (150mm)',           'Machine strip topsoil and cart away',             'area',   'm²',   4,   0,   2, 0, 0),
    it('Excavate strip foundations',      'Machine + hand-trim strip foundation trenches',   'volume', 'm³',  35,   0,  18, 0, 0),
    it('Remove spoil off site',           'Load and cart excavated material',                'volume', 'm³',   0,   0,  28, 0, 0),
    it('Hardcore backfill to trenches',   'Compact hardcore around drainage / ducts',        'volume', 'm³',   8,  18,   0, 0, 0),
  ],

  'Excavation & Levelling': [
    it('Strip topsoil (150mm)',           'Machine strip and cart away topsoil',             'area',   'm²',   4,   0,   2, 0, 0),
    it('Machine reduce to level',         'Machine excavate to required formation level',    'volume', 'm³',  12,   0,  22, 0, 0),
    it('Remove spoil off site',           'Load and cart excavated material',                'volume', 'm³',   0,   0,  28, 0, 0),
    it('Hardcore fill & level',           'Lay and compact hardcore to levelled base',       'area',   'm²',   5,  16,   0, 0, 0),
    it('Plate compaction',                'Plate compact hardcore sub-base',                 'area',   'm²',   2,   0,   4, 0, 0),
  ],

  'Bulk Excavation & Levelling': [
    it('Machine bulk excavation',         'Large-scale machine excavation to formation',     'volume', 'm³',  10,   0,  22, 0, 0),
    it('Remove spoil off site',           'Load and cart excavated material',                'volume', 'm³',   0,   0,  28, 0, 0),
    it('Grab lorry clearance',            'Grab lorry for bulk surplus material',            'quantity','nr',   0,   0, 480, 0, 0),
    it('Hardcore fill & level',           'Lay and compact hardcore to required level',      'area',   'm²',   5,  16,   0, 0, 0),
    it('Plate compaction',                'Plate compact all sub-base areas',                'area',   'm²',   2,   0,   4, 0, 0),
    it('Setting out after bulk dig',      'Set out final positions after bulk excavation',   'quantity','item', 200,  60,   0, 0, 0),
  ],

  'Concrete Foundations': [
    it('Excavate strip foundations',      'Hand-trim strip foundation trenches',             'volume', 'm³',  35,   0,  18, 0, 0),
    it('Concrete (C25) strip foundations','Pour concrete into strip foundation trenches',    'volume', 'm³',  48, 125,   0, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                    'volume', 'm³',   0,   0,  28, 0, 0),
    it('Formwork to edges',               'Timber formwork at foundation edges',             'linear', 'm',   10,   8,   0, 0, 0),
  ],

  'Concrete Foundations & DPC Blockwork': [
    it('Excavate strip foundations',      'Hand-trim strip foundation trenches',             'volume', 'm³',  35,   0,  18, 0, 0),
    it('Concrete (C25) strip foundations','Pour concrete into foundation trenches',          'volume', 'm³',  48, 125,   0, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                    'volume', 'm³',   0,   0,  28, 0, 0),
    it('Blockwork to DPC (140mm)',        'Lay coursing blockwork from found. to DPC',       'area',   'm²',  45,  22,   0, 0, 0),
    it('DPC (100mm plastic)',             'Install horizontal DPC course',                   'linear', 'm',    2,   3,   0, 0, 0),
    it('Hardcore to base (MOT Type 1)',   'Lay and compact hardcore sub-base',               'area',   'm²',   4,  18,   0, 0, 0),
  ],

  'Concrete Foundations or Ground Screw Base': [
    it('Ground investigation / perc test','Trial pits or ground investigation report',       'quantity','item', 300, 200,   0, 0, 0),
    it('Option A: concrete foundations',  'Concrete strip or pad foundations',               'volume', 'm³',  48, 125,   0, 0, 0),
    it('Option B: ground screws',         'Supply and install helical ground screws',        'quantity','nr',    0,   0,   0, 280, 0),
    it('DPC / sill plate to base',        'Install DPC and sill plate to base',              'linear', 'm',    6,  12,   0, 0, 0),
  ],

  'Underground Drainage & Services': [
    it('Excavate drainage trench',        'Machine excavation of drainage runs',             'linear', 'm',    8,   0,  12, 0, 0),
    it('110mm PVC drain (laid)',          'Supply and lay 110mm PVC drainage pipe',           'linear', 'm',    8,  14,   0, 0, 0),
    it('Inspection chamber (450mm)',      'Install plastic inspection chamber',              'quantity','nr',   60, 180,   0, 0, 0),
    it('Connect to existing manhole',     'Break into and connect new drain to existing',    'quantity','nr',  150,  80,   0, 0, 0),
    it('Service ducting',                 'UPVC ducting for gas / water / electric',          'linear', 'm',    6,  12,   0, 0, 0),
    it('Backfill trench with gravel',     'Gravel surround to drainage pipe',                'linear', 'm',    4,  18,   0, 0, 0),
  ],

  'Oversite Preparation & Floor Slab': [
    it('Hardcore sub-base (MOT Type 1)',  'Lay and compact 150mm hardcore',                  'area',   'm²',   4,  18,   0, 0, 0),
    it('Sand blinding (50mm)',            'Sharp sand blinding layer',                       'area',   'm²',   2,   6,   0, 0, 0),
    it('DPM (1200g polyethylene)',        'Lay DPM over full floor area',                    'area',   'm²',   2,   4,   0, 0, 0),
    it('Floor insulation (rigid 100mm)', 'Lay 100mm rigid insulation boards',                'area',   'm²',   5,  28,   0, 0, 0),
    it('A193 mesh reinforcement',         'Steel fabric mesh in slab',                       'area',   'm²',   4,  12,   0, 0, 0),
    it('Concrete ground floor slab (C25)','Pour reinforced 150mm concrete slab',            'area',   'm²',  28,  85,   0, 0, 0),
  ],

  'Oversite & Ground Floor Construction': [
    it('Hardcore sub-base (MOT Type 1)',  'Lay and compact hardcore sub-base',               'area',   'm²',   4,  18,   0, 0, 0),
    it('DPM (1200g polyethylene)',        'Lay DPM over full floor area',                    'area',   'm²',   2,   4,   0, 0, 0),
    it('Floor insulation (rigid 100mm)', '100mm rigid insulation to floor',                  'area',   'm²',   5,  28,   0, 0, 0),
    it('Concrete ground floor slab (C25)','150mm reinforced concrete slab',                  'area',   'm²',  28,  85,   0, 0, 0),
    it('Sand / cement screed (65mm)',     'Lay 65mm floor screed over slab',                 'area',   'm²',  18,  22,   0, 0, 0),
  ],

  'Floor Deck or Concrete Slab': [
    it('Option A: concrete slab (C25)',   'Pour reinforced 150mm concrete slab',             'area',   'm²',  28,  85,   0, 0, 0),
    it('Option B: timber floor deck',     'C16 joists + 22mm T&G floor deck',               'area',   'm²',  22,  32,   0, 0, 0),
    it('Floor insulation (rigid 100mm)', '100mm rigid insulation below deck',                'area',   'm²',   5,  28,   0, 0, 0),
    it('DPM (1200g)',                     'DPM to ground floor',                             'area',   'm²',   2,   4,   0, 0, 0),
  ],

  'Sub-Base Construction': [
    it('Excavate to formation level',     'Machine excavate to sub-base formation',          'volume', 'm³',  12,   0,  22, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                    'volume', 'm³',   0,   0,  28, 0, 0),
    it('MOT Type 1 sub-base (150mm)',     'Lay and compact 150mm Type 1 hardcore',           'area',   'm²',   5,  16,   0, 0, 0),
    it('Sand blinding (25mm)',            'Sand blinding layer over compacted base',         'area',   'm²',   2,   5,   0, 0, 0),
    it('Plate compaction',                'Plate compact all sub-base areas',                'area',   'm²',   2,   0,   4, 0, 0),
  ],

  'Surface & Underground Drainage': [
    it('Excavate drainage trench',        'Machine excavation of drainage runs',             'linear', 'm',    8,   0,  12, 0, 0),
    it('110mm underground drain',         'Supply and lay 110mm PVC drain in gravel bed',   'linear', 'm',    8,  14,   0, 0, 0),
    it('Inspection chamber (450mm)',      'Install plastic inspection chamber',              'quantity','nr',   60, 180,   0, 0, 0),
    it('Linear drainage channel',         'Supply and fit surface drainage channel',         'linear', 'm',   18,  48,   0, 0, 0),
    it('Gulley / rainwater connection',   'Connect RWPs and surface water to drainage',     'quantity','nr',   60,  40,   0, 0, 0),
    it('Backfill and reinstate',          'Backfill trench and reinstate surface',           'linear', 'm',    6,  12,   0, 0, 0),
  ],

  'Utility Ducting': [
    it('Excavate utility trenches',       'Machine excavate trenches for services',          'linear', 'm',    8,   0,  12, 0, 0),
    it('Gas service duct (100mm MDPE)',   'Install gas service duct and marker tape',        'linear', 'm',    6,  10,   0, 0, 0),
    it('Water service duct (50mm MDPE)',  'Install water service duct',                      'linear', 'm',    5,   8,   0, 0, 0),
    it('Electric duct (100mm UPVC)',      'Install electric service duct',                   'linear', 'm',    5,   8,   0, 0, 0),
    it('Telecom / data duct',             'Install telecoms duct',                           'linear', 'm',    4,   6,   0, 0, 0),
    it('Backfill trenches',               'Backfill service trenches and compact',           'linear', 'm',    4,   8,   0, 0, 0),
  ],


  // ── Structural variants ───────────────────────────────────────────────────

  'External Walls & Blockwork': [
    it('Facing brickwork outer leaf',     'Lay 102.5mm facing brick outer leaf',             'area',   'm²',  58,  38,   0, 0, 0),
    it('Inner leaf (100mm blockwork)',    'Lay 100mm coursing blockwork inner leaf',          'area',   'm²',  38,  16,   0, 0, 0),
    it('Cavity wall insulation (100mm)', 'Full-fill cavity wall insulation batts',            'area',   'm²',   6,  18,   0, 0, 0),
    it('Wall ties (stainless)',           'Stainless wall ties at correct centres',           'area',   'm²',   2,   3,   0, 0, 0),
    it('Lintels (galvanised steel)',      'Catnic or similar lintels to openings',            'linear', 'm',   12,  45,   0, 0, 0),
    it('Cavity closers (UPVC)',           'UPVC cavity closers at all openings',              'linear', 'm',    8,  12,   0, 0, 0),
  ],

  'Structural Steelwork & Party Wall Works': [
    it('Party wall surveyor',             'Appoint / award party wall surveyor',              'quantity','item',  0,   0,   0, 0, 900),
    it('RSJ beam(s) supply & fix',        'Supply and install RSJ steel beams',               'linear', 'm',   80, 380,   0, 0, 0),
    it('Padstones (concrete / eng brick)','Padstones to beam bearings',                       'quantity','nr',   60,  45,   0, 0, 0),
    it('Temporary propping',              'Acrow props and needles',                          'quantity','item', 400,   0, 250, 0, 0),
    it('Hiab / crane offload',            'Crane offload of steels',                          'quantity','item',   0,   0, 320, 0, 0),
  ],

  'Structural Steelwork & Knock-Through': [
    it('RSJ beam(s) supply & fix',        'Supply and install RSJ steel beams',               'linear', 'm',   80, 380,   0, 0, 0),
    it('Padstones (concrete)',            'Padstones to beam bearings',                       'quantity','nr',   60,  45,   0, 0, 0),
    it('Temporary propping',              'Acrow props during knock-through',                 'quantity','item', 400,   0, 250, 0, 0),
    it('Knock-through masonry',           'Break out and remove masonry to form opening',     'quantity','nr',  280,   0,   0, 0, 0),
    it('Make good reveals',               'Plaster / brick make good at opening reveals',     'quantity','nr',  120,  45,   0, 0, 0),
  ],

  'Knock-Through & Making Good': [
    it('Temporary propping',              'Acrow props and needles before knock-through',     'quantity','item', 380,   0, 250, 0, 0),
    it('Lintel (galvanised)',             'Supply and install lintel over opening',            'quantity','nr',   80,  95,   0, 0, 0),
    it('Knock-through masonry',           'Break out masonry and form opening',               'quantity','nr',  280,   0,   0, 0, 0),
    it('Make good reveals & jambs',       'Brick / plaster make good to reveals',             'quantity','nr',  140,  50,   0, 0, 0),
    it('Patch ceiling / floor',           'Make good ceiling, floor and skirting',            'quantity','item', 180,  60,   0, 0, 0),
  ],

  'Structural Alterations & New Openings': [
    it('Structural engineer design',      'SE drawings and calculations',                     'quantity','item',  0,   0,   0, 0, 900),
    it('RSJ / lintel to new openings',    'Steel or concrete lintel to all new openings',    'quantity','nr',   80, 180,   0, 0, 0),
    it('Temporary propping',              'Acrow props and temporary works',                  'quantity','item', 400,   0, 250, 0, 0),
    it('Form new doorway / opening',      'Cut and form new masonry opening',                 'quantity','nr',  280,   0,   0, 0, 0),
    it('Make good plaster / brickwork',   'Make good all disturbed masonry and plaster',      'area',   'm²',  18,   8,   0, 0, 0),
  ],

  'Structural Works': [
    it('Structural engineer design',      'SE drawings and calculations',                     'quantity','item',  0,   0,   0, 0, 900),
    it('RSJ beam(s) supply & fix',        'Supply and install RSJ steel beams',               'linear', 'm',   80, 380,   0, 0, 0),
    it('Padstones',                       'Padstones to beam bearings',                       'quantity','nr',   60,  45,   0, 0, 0),
    it('Temporary propping',              'Acrow props and temporary works',                  'quantity','item', 400,   0, 250, 0, 0),
    it('Make good plaster / brickwork',   'Make good all disturbed surfaces',                 'area',   'm²',  18,   8,   0, 0, 0),
  ],

  'Fabric Repairs': [
    it('Repoint external brickwork',      'Rake out and repoint defective mortar joints',    'area',   'm²',  18,   6,   0, 0, 0),
    it('Repair defective render',         'Hack off, background coat and skim',               'area',   'm²',  20,  12,   0, 0, 0),
    it('Repair roof structure',           'Replace damaged roof timbers and boarding',        'area',   'm²',  28,  22,   0, 0, 0),
    it('Damp-proof injection',            'Chemical DPC injection to defective walls',        'linear', 'm',   12,  18,   0, 0, 0),
    it('Crack stitching / repair',        'Carbon fibre stitching to structural cracks',     'quantity','nr',  180, 120,   0, 0, 0),
  ],

  'Floor Structure Alterations': [
    it('Trim / form new floor opening',   'Form structural opening in existing floor',        'quantity','nr',  280,  80,   0, 0, 0),
    it('New trimmer joists',              'Install trimmer joists to opening edges',          'quantity','nr',   90, 120,   0, 0, 0),
    it('Strengthen existing joists',      'Sister or strengthen existing floor joists',       'area',   'm²',  18,  22,   0, 0, 0),
    it('New 22mm T&G floor deck',         'Fix 22mm T&G boarding over altered structure',    'area',   'm²',  12,  18,   0, 0, 0),
    it('Make good ceiling below',         'Patch and skim ceiling to altered areas',          'area',   'm²',  20,  10,   0, 0, 0),
  ],

  'Ridge Beam & Purlin Installation': [
    it('Ridge beam (RSJ) supply & fix',   'Supply and install ridge beam steel',              'linear', 'm',   80, 380,   0, 0, 0),
    it('Purlin steel(s) supply & fix',    'Supply and install purlin steels',                 'linear', 'm',   65, 280,   0, 0, 0),
    it('Temporary propping',              'Acrow props during steel installation',            'quantity','item', 380,   0, 250, 0, 0),
    it('Hiab / crane for steel delivery', 'Crane offload on delivery day',                   'quantity','item',   0,   0, 320, 0, 0),
    it('Padstones to bearings',           'Concrete padstones to all beam bearings',         'quantity','nr',   60,  45,   0, 0, 0),
  ],

  'Structural Frame': [
    it('Timber sole plate',               'Fix treated timber sole plate to base',            'linear', 'm',    8,  12,   0, 0, 0),
    it('Structural timber wall frame',    'Erect C16/C24 timber frame panels',               'area',   'm²',  28,  35,   0, 0, 0),
    it('OSB sheathing (11mm)',            'Fix 11mm OSB racking boards to frame',            'area',   'm²',   8,  14,   0, 0, 0),
    it('Roof ridge beam (timber/steel)',  'Install ridge beam to frame roof',                'linear', 'm',   50, 180,   0, 0, 0),
    it('Roof rafters / joists',           'Install roof rafters and ceiling joists',          'area',   'm²',  28,  42,   0, 0, 0),
    it('Breather membrane',               'Fix breather membrane to external frame',          'area',   'm²',   4,  10,   0, 0, 0),
  ],

  'Cavity Walls — Ground Floor': [
    it('Facing brickwork outer leaf',     '102.5mm facing brickwork ground floor',           'area',   'm²',  58,  38,   0, 0, 0),
    it('Inner leaf (100mm blockwork)',    '100mm coursing blockwork inner leaf',              'area',   'm²',  38,  16,   0, 0, 0),
    it('Cavity wall insulation (100mm)', 'Full-fill cavity insulation batts',                'area',   'm²',   6,  18,   0, 0, 0),
    it('Wall ties & cavity closers',      'Stainless ties + UPVC cavity closers',            'area',   'm²',   4,   5,   0, 0, 0),
    it('Lintels to openings',             'Galvanised lintels to all openings',               'linear', 'm',   12,  45,   0, 0, 0),
  ],

  'First Floor Structure & Cavity Walls': [
    it('First floor joists (C16)',        'Install C16 floor joists at 400 centres',         'area',   'm²',  18,  28,   0, 0, 0),
    it('22mm T&G floor deck',             'Fix 22mm T&G flooring grade boarding',            'area',   'm²',  12,  18,   0, 0, 0),
    it('Facing brickwork outer leaf',     '102.5mm facing brickwork first floor',            'area',   'm²',  58,  38,   0, 0, 0),
    it('Inner leaf (100mm blockwork)',    '100mm coursing blockwork inner leaf',              'area',   'm²',  38,  16,   0, 0, 0),
    it('Cavity wall insulation (100mm)', 'Full-fill cavity insulation batts',                'area',   'm²',   6,  18,   0, 0, 0),
    it('Lintels to openings',             'Galvanised lintels to all openings',               'linear', 'm',   12,  45,   0, 0, 0),
  ],

  // ── Roof variants ─────────────────────────────────────────────────────────

  'Roof Structure & Coverings': [
    it('Roof rafters / joists (C24)',     'Timber roof rafters at 400mm centres',            'area',   'm²',  28,  42,   0, 0, 0),
    it('OSB decking (18mm) — flat',       '18mm OSB structural deck to flat roof',           'area',   'm²',   8,  18,   0, 0, 0),
    it('Breather membrane (pitched)',     'Breather membrane to pitched roof',               'area',   'm²',   4,  12,   0, 0, 0),
    it('Roof tiles on battens',           'Concrete tiles or natural slate on battens',      'area',   'm²',  32,  55,   0, 0, 0),
    it('EPDM flat roof covering',         'EPDM fully adhered to flat roof deck',            'area',   'm²',  22,  65,   0, 0, 0),
    it('Lead flashings',                  'Code 4/5 lead to abutments and valleys',          'linear', 'm',   18,  38,   0, 0, 0),
    it('Guttering & downpipes (UPVC)',    'UPVC guttering and downpipe installation',         'linear', 'm',   12,  22,   0, 0, 0),
  ],

  'Roof Structure & Decking': [
    it('Flat roof joists / firrings',     'Timber flat roof joists with tapered firrings',   'area',   'm²',  28,  38,   0, 0, 0),
    it('18mm OSB structural deck',        'Fix 18mm OSB to flat roof joists',                'area',   'm²',   8,  18,   0, 0, 0),
    it('Vapour control layer',            'Fix VCL to underside of joists',                  'area',   'm²',   3,   6,   0, 0, 0),
    it('Rigid insulation above deck',     '150mm rigid PIR insulation above deck',           'area',   'm²',  10,  45,   0, 0, 0),
    it('Cover board (12mm WBP)',          'Fix 12mm WBP cover board over insulation',        'area',   'm²',   6,  12,   0, 0, 0),
  ],

  'Roof Carpentry': [
    it('Roof rafters (C24 timber)',       'Cut and fix C24 rafters at 400 centres',          'area',   'm²',  28,  42,   0, 0, 0),
    it('Ridge board',                     'Install ridge board to apex',                     'linear', 'm',   10,  14,   0, 0, 0),
    it('Hip / valley rafters',            'Cut and fix hip and valley rafters',               'quantity','nr',  120, 180,   0, 0, 0),
    it('Ceiling joists',                  'Fix ceiling joists at 400 centres',               'area',   'm²',  14,  22,   0, 0, 0),
    it('Noggins & strutting',             'Install strutting and noggins to joists',          'area',   'm²',   5,   6,   0, 0, 0),
    it('Fascia & barge boards (timber)',  'Fix timber fascia and barge boards',               'linear', 'm',   15,  18,   0, 0, 0),
  ],

  'Roof Tiles & Weatherproofing': [
    it('Breathable roofing felt',         'Fix breathable underlay on battens',              'area',   'm²',   4,  12,   0, 0, 0),
    it('Tiling battens (25×50mm)',        'Fix tiling battens over underlay',                'area',   'm²',   4,   5,   0, 0, 0),
    it('Roof tiles / slates',             'Supply and fix concrete tiles or natural slate',  'area',   'm²',  32,  55,   0, 0, 0),
    it('Ridge / hip tiles (mortar-bed)',  'Form ridge and hips with mortar-bedded tiles',    'linear', 'm',   18,  22,   0, 0, 0),
    it('Lead valley / abutment flashings','Code 4/5 lead to all valleys and abutments',     'linear', 'm',   18,  38,   0, 0, 0),
    it('Guttering & downpipes (UPVC)',    'UPVC guttering and downpipe',                     'linear', 'm',   12,  22,   0, 0, 0),
  ],

  'Roof Coverings & Weatherproofing': [
    it('EPDM flat roof (fully adhered)',  'EPDM rubber membrane fully adhered',              'area',   'm²',  22,  65,   0, 0, 0),
    it('GRP flat roof system',            'GRP fibreglass roofing system',                   'area',   'm²',  28,  78,   0, 0, 0),
    it('Lead flashings',                  'Code 4/5 lead to all abutments and upstands',    'linear', 'm',   18,  38,   0, 0, 0),
    it('Upstand insulation (rigid)',      'Rigid insulation to flat roof upstands',           'linear', 'm',    5,  18,   0, 0, 0),
    it('Guttering & downpipes (UPVC)',    'UPVC guttering and downpipe installation',         'linear', 'm',   12,  22,   0, 0, 0),
  ],

  'Roof Structure Alterations': [
    it('Remove existing roof covering',   'Strip tiles, felt and battens',                   'area',   'm²',  10,   0,   0, 0, 0),
    it('Replace defective timbers',       'Replace damaged rafters, ridge, valleys',         'area',   'm²',  28,  22,   0, 0, 0),
    it('New roof structure elements',     'New timbers, noggins, strutting as required',     'area',   'm²',  20,  18,   0, 0, 0),
    it('New breathable felt & battens',   'Lay breathable roofing felt and battens',         'area',   'm²',   4,  12,   0, 0, 0),
    it('New roof tiles / slates',         'Supply and fix new tiles or slates',              'area',   'm²',  32,  55,   0, 0, 0),
    it('Lead flashings',                  'Replace lead valleys and abutment flashings',     'linear', 'm',   18,  38,   0, 0, 0),
  ],

  'Roof Lantern / Rooflight': [
    it('Roof lantern supply & fix',       'Supply and install aluminium roof lantern',        'quantity','nr',  350,2400,   0, 0, 0),
    it('Flat rooflight (fixed)',          'Supply and fix fixed flat rooflight',              'quantity','nr',  250,1200,   0, 0, 0),
    it('Kerb / upstand to rooflight',     'Form structural kerb upstand for rooflight',      'quantity','nr',  180, 280,   0, 0, 0),
    it('Lead / EPDM weathering detail',   'Flash and weather around lantern perimeter',      'linear', 'm',   18,  38,   0, 0, 0),
    it('Internal plasterboard reveal',    'Board, skim and paint internal reveal',            'quantity','nr',  180,  55,   0, 0, 0),
  ],

  'Fascia, Soffits & Guttering': [
    it('UPVC fascia boards',              'Supply and fix UPVC fascia boards',                'linear', 'm',   14,  18,   0, 0, 0),
    it('UPVC soffit boards',              'Supply and fix UPVC soffit boards',                'linear', 'm',   12,  16,   0, 0, 0),
    it('Barge boards (gable ends)',        'Supply and fix UPVC barge boards',                'linear', 'm',   14,  18,   0, 0, 0),
    it('UPVC guttering (half-round)',      'Supply and fix UPVC guttering',                   'linear', 'm',   10,  18,   0, 0, 0),
    it('UPVC downpipes',                  'Supply and fix UPVC downpipes with brackets',     'linear', 'm',   12,  16,   0, 0, 0),
  ],

  'Fascia, Soffits, Guttering & Leadwork': [
    it('UPVC fascia & soffit boards',     'Supply and fix UPVC fascia and soffit',            'linear', 'm',   22,  28,   0, 0, 0),
    it('UPVC guttering & downpipes',      'Supply and fix UPVC guttering system',             'linear', 'm',   12,  22,   0, 0, 0),
    it('Lead valley linings',             'Code 5 lead to all valley gutters',               'linear', 'm',   18,  38,   0, 0, 0),
    it('Lead abutment flashings',         'Code 4/5 lead to wall and chimney abutments',     'linear', 'm',   18,  38,   0, 0, 0),
    it('Lead soakers (interlocking)',     'Code 3 lead soakers at abutments',                'linear', 'm',   12,  22,   0, 0, 0),
  ],

  'Dormer Construction': [
    it('Dormer structural frame (timber)','Erect dormer box frame — sole, studs, head',      'area',   'm²',  38,  35,   0, 0, 0),
    it('OSB sheathing to dormer',         '18mm OSB to dormer cheeks and flat roof',         'area',   'm²',  10,  18,   0, 0, 0),
    it('Zinc cladding to cheeks',         'Supply and fix zinc standing-seam cladding',      'area',   'm²',  35,  68,   0, 0, 0),
    it('EPDM to dormer flat roof',        'EPDM fully adhered to dormer flat roof',           'area',   'm²',  22,  65,   0, 0, 0),
    it('Dormer window supply & fix',      'Supply and install dormer window unit',            'quantity','nr', 280,1100,   0, 0, 0),
    it('Lead flashings',                  'Lead to dormer cheek / main roof junction',       'linear', 'm',   18,  38,   0, 0, 0),
  ],

  'Rooflights & Dormer Windows': [
    it('Velux conservation rooflight',    'Supply and fix conservation-spec Velux',          'quantity','nr', 220, 680,   0, 0, 0),
    it('Flat rooflight (fixed)',          'Supply and fix fixed flat rooflight',              'quantity','nr', 250,1200,   0, 0, 0),
    it('Dormer window supply & fix',      'Supply and install dormer window unit',            'quantity','nr', 280,1100,   0, 0, 0),
    it('Form opening in roof structure',  'Cut and trim structural opening in roof',          'quantity','nr', 180,  60,   0, 0, 0),
    it('Weather / flash around units',    'Lead / EPDM weathering to all window perimeters', 'quantity','nr',  80,  55,   0, 0, 0),
  ],

  // ── Staircase / access variants ────────────────────────────────────────────

  'Staircase': [
    it('Staircase supply & installation', 'Supply and install new staircase',                'quantity','item', 600,2200,   0, 0, 0),
    it('Handrail & newel posts',          'Install handrail, newels and spindles',            'linear', 'm',   45,  95,   0, 0, 0),
    it('Landing floor boards',            'Form new landing / floor boards',                  'area',   'm²',  22,  35,   0, 0, 0),
    it('Trim staircase opening',          'Form or trim opening in existing floor',           'quantity','item', 280,  80,   0, 0, 0),
    it('Fire doors to stair enclosure',   'FD30 fire doors to staircase enclosure',           'quantity','nr',  140, 320,   0, 0, 0),
  ],

  'Staircase Installation': [
    it('Staircase supply & installation', 'Supply and install new staircase',                'quantity','item', 600,2200,   0, 0, 0),
    it('Handrail & balustrade',           'Install handrail, spindles and newels',            'linear', 'm',   45,  95,   0, 0, 0),
    it('Landing boards',                  'Form new landing / floor boards',                  'area',   'm²',  22,  35,   0, 0, 0),
    it('Form staircase opening',          'Cut and trim structural opening in floor',         'quantity','item', 280,  80,   0, 0, 0),
  ],

  'Landing Alterations & Fire Doors': [
    it('Alter landing layout',            'Reframe / extend landing floor structure',         'quantity','item', 380, 120,   0, 0, 0),
    it('Landing floor boards',            'Fix new floor boards to landing',                  'area',   'm²',  14,  22,   0, 0, 0),
    it('FD30 fire doors (hung)',          'Supply and hang FD30 fire door sets',              'quantity','nr',  140, 320,   0, 0, 0),
    it('Smoke / heat alarm installation', 'Install interlinked mains smoke alarms',           'quantity','nr',   45,  65,   0, 0, 0),
    it('Loft hatch (insulated)',          'Supply and install insulated loft hatch',          'quantity','nr',   90, 180,   0, 0, 0),
  ],

  // ── Windows & Doors variants ───────────────────────────────────────────────

  'Windows': [
    it('UPVC window supply & fit',        'Supply and install UPVC double-glazed windows',   'quantity','nr',  180, 780,   0, 0, 0),
    it('Aluminium window supply & fit',   'Supply and install aluminium slim-frame windows', 'quantity','nr',  200,1200,   0, 0, 0),
    it('External window sill (stone)',    'Supply and fix stone or composite window sills',  'linear', 'm',   18,  55,   0, 0, 0),
    it('Mastic sealant & weatherproofing','Seal all external frames on both faces',           'linear', 'm',    6,   4,   0, 0, 0),
    it('Internal window board / reveal', 'Form and skim internal reveal and window board',   'quantity','nr',   55,  35,   0, 0, 0),
  ],

  'External Doors': [
    it('Composite external door (supply & fit)','Supply and install composite external door','quantity','nr',  200, 850,   0, 0, 0),
    it('Aluminium external door',         'Supply and install aluminium external door',       'quantity','nr',  220,1100,   0, 0, 0),
    it('Door threshold (powder-coated)',  'Install threshold bar and weatherbar',             'linear', 'm',   25,  45,   0, 0, 0),
    it('Mastic sealant & weatherproofing','Seal all door frames externally',                  'linear', 'm',    6,   4,   0, 0, 0),
  ],

  'Bifold / French Doors': [
    it('Aluminium bifold doors (supply & fit)','Supply and install aluminium bifold doors',  'linear', 'm',  280,1100,   0, 0, 0),
    it('French / patio doors (supply & fit)','Supply and install double French doors',       'quantity','nr',  220,1400,   0, 0, 0),
    it('Structural lintel over opening',  'Galvanised or steel lintel over door head',       'linear', 'm',   12,  55,   0, 0, 0),
    it('Door threshold (powder-coated)',  'Aluminium threshold bar at cill level',           'linear', 'm',   25,  45,   0, 0, 0),
    it('Mastic / weatherproofing',        'Seal all frames internally and externally',        'linear', 'm',    6,   4,   0, 0, 0),
  ],

  'Window Replacement': [
    it('Remove existing windows',         'Take out existing window units and frames',        'quantity','nr',   55,   0,   0, 0, 0),
    it('Make good reveals',               'Repair masonry / plaster at reveals',              'quantity','nr',   80,  35,   0, 0, 0),
    it('New UPVC windows (supply & fit)', 'Supply and install UPVC double-glazed units',     'quantity','nr',  180, 780,   0, 0, 0),
    it('External sill (stone / comp.)',   'Supply and fix stone or composite sills',          'linear', 'm',   18,  55,   0, 0, 0),
    it('Mastic sealant & weatherproofing','Seal all new frames internally and externally',    'linear', 'm',    6,   4,   0, 0, 0),
  ],

  'External Door Replacement': [
    it('Remove existing external door',   'Take out existing door, frame and architrave',    'quantity','nr',   55,   0,   0, 0, 0),
    it('Make good opening reveals',       'Repair masonry / plaster at door reveal',         'quantity','nr',   80,  35,   0, 0, 0),
    it('New composite door (supply & fit)','Supply and install composite external door',      'quantity','nr',  200, 850,   0, 0, 0),
    it('Threshold & weatherbar',          'Install threshold and weatherbar',                 'linear', 'm',   25,  45,   0, 0, 0),
    it('Mastic sealant',                  'Seal new door frame on all faces',                 'linear', 'm',    6,   4,   0, 0, 0),
  ],

  'Cladding & External Finishes': [
    it('Timber cladding (rebated)',       'Supply and fix rebated softwood cladding',         'area',   'm²',  28,  45,   0, 0, 0),
    it('Composite cladding',              'Supply and fix composite / fibre cement cladding','area',   'm²',  32,  65,   0, 0, 0),
    it('Render (scraped / smooth)',       'Apply base and finish render coat',                'area',   'm²',  24,  18,   0, 0, 0),
    it('Breather membrane behind clad',   'Fix breather membrane before cladding',            'area',   'm²',   4,  10,   0, 0, 0),
    it('Treated battens (25×50mm)',       'Fix treated vertical battens for cladding',        'area',   'm²',   6,   8,   0, 0, 0),
    it('External decoration (paint)',     'Two coats exterior masonry / wood paint',          'area',   'm²',   8,   4,   0, 0, 0),
  ],

  'External Decoration & Rendering': [
    it('Render (base coat)',              'Apply 15mm undercoat render to masonry',           'area',   'm²',  14,  10,   0, 0, 0),
    it('Render (finish coat)',            'Apply 5mm finish / scraped render coat',           'area',   'm²',  10,   6,   0, 0, 0),
    it('External masonry paint (2 coats)','Two coats exterior masonry paint',                 'area',   'm²',   7,   4,   0, 0, 0),
    it('External woodwork — gloss',       'Sand, prime and two coats gloss to woodwork',      'linear', 'm',    8,   3,   0, 0, 0),
    it('Mastic seal at junctions',        'Flexible mastic at render / window junctions',    'linear', 'm',    6,   4,   0, 0, 0),
  ],


  // ── Services — first fix variants ─────────────────────────────────────────

  'Plumbing & Heating': [
    it('Hot & cold pipework (first fix)', 'Copper / plastic first fix pipework runs',        'linear', 'm',   18,  14,   0, 0, 0),
    it('Soil & waste pipe runs',          'First fix soil and waste pipework',               'linear', 'm',   14,  18,   0, 0, 0),
    it('Combi boiler supply & fit',       'New combi boiler supply and installation',         'quantity','item',  0,1800,   0, 0, 0),
    it('UFH pipe at 200 crs',             'Underfloor heating pipe at 200mm centres',         'area',   'm²',  18,  24,   0, 0, 0),
    it('UFH manifold & controls',         'Manifold, actuators and programmable stat',        'quantity','nr',    0, 380,   0, 0, 0),
    it('Radiators & TRVs (first fix)',    'First fix radiator tails and brackets',            'quantity','nr',   18,  12,   0, 0, 0),
  ],

  'Plumbing First Fix': [
    it('Hot & cold pipework',             'First fix copper / plastic pipework runs',         'linear', 'm',   18,  14,   0, 0, 0),
    it('Soil & waste pipework',           'First fix soil and waste pipe runs',               'linear', 'm',   14,  18,   0, 0, 0),
    it('UFH pipe at 200 crs',             'Underfloor heating pipe at 200mm centres',         'area',   'm²',  18,  24,   0, 0, 0),
    it('Isolating valves',                'Service valves at all appliance connections',      'quantity','nr',   12,  18,   0, 0, 0),
    it('Kitchen waste stub-off',          'Stub-off for sink waste to below floor',           'quantity','item', 80,  45,   0, 0, 0),
  ],

  'Electrical First Fix': [
    it('Cable containment / conduit',     'Trunking, conduit and back boxes',                 'linear', 'm',    8,   6,   0, 0, 0),
    it('Socket & power circuit wiring',   'Wire ring and radial socket circuits',             'linear', 'm',    4,   3,   0, 0, 0),
    it('Lighting circuit wiring',         'Wire lighting circuits',                           'linear', 'm',    3,   2,   0, 0, 0),
    it('Consumer unit upgrade',           '18-way consumer unit with RCBO protection',        'quantity','item', 180, 280,   0, 0, 0),
    it('Back boxes (35mm)',               'Flush back boxes to all positions',                'quantity','nr',    5,   4,   0, 0, 0),
    it('Kitchen appliance wiring',        'Wiring for island, hob, extract and oven',         'quantity','item',  90,  40,   0, 0, 0),
  ],

  'Ventilation': [
    it('MEV unit supply & install',       'Continuous mechanical extract ventilation unit',   'quantity','item',  0, 380,   0, 0, 0),
    it('Bathroom extractor fan',          'Supply and install SELV extractor fan',            'quantity','nr',   45,  95,   0, 0, 0),
    it('Kitchen extract fan',             'Supply and install kitchen extract fan',           'quantity','item',  80, 150,   0, 0, 0),
    it('Ductwork to external grille',     'Rigid / flexi duct run to external wall grille',   'linear', 'm',    8,  12,   0, 0, 0),
    it('External wall core drill',        'Core drill and fit external grille',               'quantity','nr',   55,  35,   0, 0, 0),
  ],

  'Ventilation & Ductwork': [
    it('MVHR unit supply & install',      'Mechanical ventilation with heat recovery unit',   'quantity','item',  0, 1800,  0, 0, 0),
    it('MEV unit supply & install',       'Continuous mechanical extract ventilation',        'quantity','item',  0, 380,   0, 0, 0),
    it('Rigid ductwork runs',             'Insulated rigid duct runs throughout',             'linear', 'm',   12,  18,   0, 0, 0),
    it('Flexible duct tails',             'Flexible duct tails to each valve / grille',      'quantity','nr',   18,  22,   0, 0, 0),
    it('Supply & extract valves',         'Adjustable supply and extract valves',             'quantity','nr',   22,  35,   0, 0, 0),
    it('External wall cores',             'Core drill and fit external wall grilles',         'quantity','nr',   55,  35,   0, 0, 0),
  ],

  'Full Replumb — Plumbing & Heating': [
    it('Hot & cold pipework (full house)','Complete new copper / plastic pipework',           'linear', 'm',   18,  14,   0, 0, 0),
    it('Soil & waste stack replacement',  'Replace soil stack and waste runs',               'linear', 'm',   18,  22,   0, 0, 0),
    it('New boiler supply & fit',         'New combi or system boiler supply and fit',        'quantity','item',  0,1800,   0, 0, 0),
    it('Central heating pipework',        'New radiator circuit pipework',                    'linear', 'm',   16,  12,   0, 0, 0),
    it('Cylinder / pressurised system',   'Unvented hot water cylinder supply and fit',       'quantity','item',  0, 950,   0, 0, 0),
    it('Pressure / flow test',            'System pressure test and certification',           'quantity','item', 120,   0,   0, 0, 0),
  ],

  'Full Rewire — Electrical': [
    it('Full rewire (strip out)',         'Remove all existing wiring and back boxes',        'quantity','item', 600,   0,   0, 0, 0),
    it('Cable runs (circuits)',           'Wire all ring, radial and lighting circuits',      'linear', 'm',    4,   3,   0, 0, 0),
    it('Consumer unit (18-way RCBO)',     'New 18-way consumer unit',                         'quantity','item', 180, 280,   0, 0, 0),
    it('Back boxes to all positions',     'Fix flush back boxes throughout',                  'quantity','nr',    5,   4,   0, 0, 0),
    it('Alarm & data cabling',            'Cat6 data and alarm circuit cabling',              'linear', 'm',    3,   2,   0, 0, 0),
    it('Electrical installation condition report','EICR and NICEIC certification',           'quantity','item',  0,   0,   0, 0, 280),
  ],

  'First Fix Services': [
    it('Hot & cold pipework',             'First fix plumbing pipework runs',                 'linear', 'm',   18,  14,   0, 0, 0),
    it('Soil & waste pipework',           'First fix soil and waste pipe runs',               'linear', 'm',   14,  18,   0, 0, 0),
    it('Electrical cable runs',           'Wire socket, lighting and power circuits',         'linear', 'm',    4,   3,   0, 0, 0),
    it('Consumer unit',                   'New consumer unit with RCBO protection',           'quantity','item', 180, 280,   0, 0, 0),
    it('Back boxes & containment',        'Back boxes, conduit and trunking',                 'linear', 'm',    6,   5,   0, 0, 0),
    it('Extractor fan wiring',            'Wire bathroom extract fan circuit',                'quantity','nr',   28,  12,   0, 0, 0),
  ],

  'Electrical Installation': [
    it('First fix — cable runs',          'Wire all socket, lighting and power circuits',    'linear', 'm',    4,   3,   0, 0, 0),
    it('Consumer unit (18-way RCBO)',     'New consumer unit and earthing',                   'quantity','item', 180, 280,   0, 0, 0),
    it('Back boxes & containment',        'Back boxes, conduit and trunking',                 'linear', 'm',    6,   5,   0, 0, 0),
    it('Sockets & switches (2nd fix)',    'Install socket faceplates and switch plates',      'quantity','nr',   18,  22,   0, 0, 0),
    it('Light fittings (2nd fix)',        'Fix and connect light fittings',                   'quantity','nr',   15,  35,   0, 0, 0),
    it('Electrical testing & certs',      'NICEIC test and certification',                    'quantity','item',  0,   0,   0, 0, 280),
  ],

  // ── Internal construction variants ────────────────────────────────────────

  'Insulation — Roof & Walls': [
    it('Rafter insulation (Kingspan)',    'Between-rafter rigid insulation boards',           'area',   'm²',  12,  32,   0, 0, 0),
    it('Wall insulation (rigid board)',   'Fix rigid insulation boards to walls',             'area',   'm²',   6,  25,   0, 0, 0),
    it('Ceiling quilt insulation',        '100mm mineral wool quilt over flat ceiling',       'area',   'm²',   3,  10,   0, 0, 0),
    it('Insulation taping / sealing',     'Tape joints and seal insulation layers',           'area',   'm²',   2,   2,   0, 0, 0),
  ],

  'Plasterboarding & Fire Protection': [
    it('Plasterboard (12.5mm)',           'Fix 12.5mm plasterboard to walls and ceiling',    'area',   'm²',  10,  10,   0, 0, 0),
    it('Fire board (15mm)',               'Install 15mm fire rated board where req\'d',       'area',   'm²',  14,  22,   0, 0, 0),
    it('Moisture-resistant board',        'MR board to wet areas',                            'area',   'm²',  12,  18,   0, 0, 0),
    it('Angle beads & stop beads',        'Fix angle and stop beads throughout',              'linear', 'm',    3,   4,   0, 0, 0),
    it('Scrim tape & joint compound',     'Tape and fill all board joints',                   'area',   'm²',   2,   3,   0, 0, 0),
  ],

  'Stud Partitions & Ceilings': [
    it('Stud partition (100mm C16)',      'Form new 100mm stud partition walls',              'area',   'm²',  22,  18,   0, 0, 0),
    it('Acoustic insulation in stud',     'Fill stud partitions with acoustic quilt',         'area',   'm²',   5,  12,   0, 0, 0),
    it('Ceiling joists (independent)',    'New independent ceiling joist structure',           'area',   'm²',  14,  22,   0, 0, 0),
    it('Plasterboard (12.5mm)',           'Fix 12.5mm plasterboard to partitions / ceiling', 'area',   'm²',  10,  10,   0, 0, 0),
    it('Angle beads & scrim',             'Fix beads and tape all joints',                    'area',   'm²',   2,   3,   0, 0, 0),
  ],

  'Plastering & Dry-Out': [
    it('Bonding coat (parge)',            'Apply bonding coat to masonry backgrounds',        'area',   'm²',  10,   6,   0, 0, 0),
    it('Skim coat (2mm finish)',          'Apply 2mm finish plaster to all surfaces',         'area',   'm²',  12,   4,   0, 0, 0),
    it('Beads & scrim tape',              'Angle beads, stop beads, scrim tape',              'area',   'm²',   2,   2,   0, 0, 0),
    it('Dehumidifier hire (dry-out)',     'Dehumidifier hire during plastering dry-out',      'quantity','wk',   0,   0, 180, 0, 0),
    it('Make good existing plaster',      'Patch and make good disturbed plaster',            'area',   'm²',  18,   8,   0, 0, 0),
  ],

  'Plastering & Decoration': [
    it('Skim coat (2mm finish)',          'Apply finish plaster to all surfaces',             'area',   'm²',  12,   4,   0, 0, 0),
    it('Beads & scrim',                   'Angle beads, stop beads, scrim tape',              'area',   'm²',   2,   2,   0, 0, 0),
    it('Mist coat (new plaster)',         'Diluted mist coat on new plaster',                 'area',   'm²',   4,   2,   0, 0, 0),
    it('2 × coats emulsion (walls)',      'Full finish two-coat emulsion',                    'area',   'm²',   6,   3,   0, 0, 0),
    it('2 × coats emulsion (ceilings)',   'Full finish two-coat emulsion to ceilings',        'area',   'm²',   7,   3,   0, 0, 0),
    it('Gloss to joinery',                'Sand, prime and 2 × gloss coats to woodwork',     'linear', 'm',    8,   3,   0, 0, 0),
  ],

  'Internal Construction & Plastering': [
    it('Stud partition (100mm C16)',      'Form new internal stud partition walls',            'area',   'm²',  22,  18,   0, 0, 0),
    it('Plasterboard (12.5mm)',           'Fix 12.5mm plasterboard to walls and ceiling',    'area',   'm²',  10,  10,   0, 0, 0),
    it('Insulation in stud / ceiling',    'Fill studs and ceiling with mineral wool',          'area',   'm²',   4,  12,   0, 0, 0),
    it('Skim coat (2mm finish)',          'Apply finish plaster to all surfaces',             'area',   'm²',  12,   4,   0, 0, 0),
    it('Angle beads & scrim',             'Angle beads, stop beads, scrim tape',              'area',   'm²',   2,   2,   0, 0, 0),
    it('Dehumidifier hire (dry-out)',     'Dehumidifier hire during dry-out period',          'quantity','wk',   0,   0, 180, 0, 0),
  ],

  // ── Tiling & wet finishes ──────────────────────────────────────────────────

  'Wall Tiling': [
    it('Waterproof adhesive & grout',     'Flexible adhesive and grout for wall tiles',       'area',   'm²',   6,   8,   0, 0,10),
    it('Porcelain wall tiles (supply)',   'Supply porcelain or ceramic wall tiles',           'area',   'm²',   0,  55,   0, 0,10),
    it('Wall tiling (lay)',               'Fix tiles to walls on prepared background',        'area',   'm²',  35,   0,   0, 0, 0),
    it('Grouting & pointing',             'Grout wall tiles and silicone at junctions',       'area',   'm²',   6,   3,   0, 0, 0),
    it('Trim tiles & edge beads',         'Fix tile edge trims and external corners',         'linear', 'm',    6,   8,   0, 0, 0),
  ],

  'Floor Tiling': [
    it('Floor prep & levelling compound','Apply self-levelling compound to floor',            'area',   'm²',   6,   8,   0, 0, 0),
    it('Flexible tile adhesive',          'Apply flexible adhesive to floor',                 'area',   'm²',   5,   6,   0, 0, 5),
    it('Porcelain floor tiles (supply)',  'Supply 600×600 porcelain floor tiles',             'area',   'm²',   0,  65,   0, 0, 5),
    it('Floor tiling (lay)',              'Lay tiles to floor on prepared background',        'area',   'm²',  38,   0,   0, 0, 0),
    it('Grouting & silicone at skirt',    'Grout floor tiles and seal at skirting',           'area',   'm²',   5,   3,   0, 0, 0),
  ],

  'Tanking & Waterproofing': [
    it('Bonding slurry (prep coat)',      'Apply bonding slurry to all surfaces',             'area',   'm²',   5,   6,   0, 0, 0),
    it('Tanking membrane (2 coats)',      'Apply 2-coat tanking system to all surfaces',      'area',   'm²',  14,  18,   0, 0, 0),
    it('Fibretape to joints / corners',  'Embed fibretape into all internal corners',         'linear', 'm',    4,   5,   0, 0, 0),
    it('Pre-formed corner pieces',        'Fix pre-formed waterproof corner angles',          'quantity','nr',    8,  14,   0, 0, 0),
    it('Dry time / protection',           'Allow for drying between coats',                   'quantity','item',  60,   0,   0, 0, 0),
  ],

  // ── Second fix variants ────────────────────────────────────────────────────

  'Second Fix Plumbing': [
    it('Sanitaryware installation',       'Set and connect bath, WC, basins, shower',        'quantity','item', 480, 380,   0, 0, 0),
    it('Radiators & TRVs',                'Hang radiators, TRVs and lockshields',             'quantity','nr',   65, 180,   0, 0, 0),
    it('Boiler commission',               'Commission boiler, fill and vent system',          'quantity','item', 160,  40,   0, 0, 0),
    it('Kitchen sink & tap',              'Install sink, tap, waste and connections',          'quantity','nr',   90, 250,   0, 0, 0),
    it('Gas safety certificate',          'Gas Safe inspection and certificate',              'quantity','item',   0,   0,   0, 0, 120),
  ],

  'Second Fix Electrical': [
    it('Sockets & switches (fit)',        'Install socket and switch faceplates',             'quantity','nr',   18,  22,   0, 0, 0),
    it('Light fittings (fit)',            'Fix and connect all light fittings',               'quantity','nr',   15,  35,   0, 0, 0),
    it('Extractor fan (connect)',         'Final connection of extractor fans',               'quantity','nr',   28,  12,   0, 0, 0),
    it('Oven / hob connection',           'Final connection of electric oven and hob',        'quantity','item',  60,  20,   0, 0, 0),
    it('Electrical testing & certs',      'NICEIC / ECA test, inspect and certificate',      'quantity','item',   0,   0,   0, 0, 280),
  ],

  'Second Fix Carpentry': [
    it('Skirting boards (MDF)',           'Fix MDF skirting throughout',                      'linear', 'm',   12,  10,   0, 0, 0),
    it('Architraves (MDF)',               'Fix MDF architraves to all door openings',         'linear', 'm',   10,   8,   0, 0, 0),
    it('Internal doors (hang)',           'Hang internal door sets with ironmongery',          'quantity','nr',  120, 220,   0, 0, 0),
    it('FD30 fire doors (hang)',          'Hang FD30 fire door sets',                          'quantity','nr',  140, 320,   0, 0, 0),
    it('Loft hatch (fit)',                'Fit insulated loft hatch and frame',               'quantity','nr',   90, 180,   0, 0, 0),
    it('Airing cupboard / shelving',      'Form airing cupboard or fitted shelving',          'quantity','item', 180, 120,   0, 0, 0),
  ],

  'Second Fix Plumbing & Electrical': [
    it('Sanitaryware installation',       'Set and connect bath, WC, basins, shower',        'quantity','item', 480, 380,   0, 0, 0),
    it('Radiators & TRVs',                'Hang radiators, TRVs and lockshields',             'quantity','nr',   65, 180,   0, 0, 0),
    it('Kitchen sink & tap',              'Install sink, tap, waste and connections',          'quantity','nr',   90, 250,   0, 0, 0),
    it('Sockets & switches (fit)',        'Install socket and switch faceplates',             'quantity','nr',   18,  22,   0, 0, 0),
    it('Light fittings (fit)',            'Fix and connect all light fittings',               'quantity','nr',   15,  35,   0, 0, 0),
    it('Electrical testing & certs',      'NICEIC test and certification',                    'quantity','item',   0,   0,   0, 0, 280),
    it('Gas safety certificate',          'Gas Safe inspection and certificate',              'quantity','item',   0,   0,   0, 0, 120),
  ],

  'Second Fix Plumbing & Heating': [
    it('Sanitaryware installation',       'Set and connect bath, WC, basins, shower',        'quantity','item', 480, 380,   0, 0, 0),
    it('Radiators & TRVs',                'Hang radiators, TRVs and lockshields',             'quantity','nr',   65, 180,   0, 0, 0),
    it('Boiler commission',               'Commission boiler, fill and vent system',          'quantity','item', 160,  40,   0, 0, 0),
    it('Thermostat & controls',           'Install programmable room stat and timeclock',     'quantity','item',  45, 120,   0, 0, 0),
    it('Gas safety certificate',          'Gas Safe inspection and certificate',              'quantity','item',   0,   0,   0, 0, 120),
  ],

  'Second Fix Services & Decoration': [
    it('Sockets & switches (fit)',        'Install socket and switch faceplates',             'quantity','nr',   18,  22,   0, 0, 0),
    it('Light fittings (fit)',            'Fix and connect all light fittings',               'quantity','nr',   15,  35,   0, 0, 0),
    it('Sanitaryware / sink fit',         'Connect WC, basin, or sink where applicable',     'quantity','item', 280, 200,   0, 0, 0),
    it('Mist coat (new plaster)',         'Apply diluted mist coat to new plaster',            'area',   'm²',   4,   2,   0, 0, 0),
    it('2 × coats emulsion (walls)',      'Full finish two-coat emulsion to walls',            'area',   'm²',   6,   3,   0, 0, 0),
    it('2 × coats emulsion (ceilings)',   'Full finish two-coat emulsion to ceilings',        'area',   'm²',   7,   3,   0, 0, 0),
    it('Gloss to joinery',                'Sand, prime and 2 × gloss coats to woodwork',     'linear', 'm',    8,   3,   0, 0, 0),
  ],


  // ── Kitchen fit-out variants ───────────────────────────────────────────────

  'Kitchen Units': [
    it('Kitchen unit carcasses (supply)', 'Supply kitchen base and wall unit carcasses',     'quantity','item',  0,3800,   0, 0, 0),
    it('Kitchen units (fit)',             'Install carcasses, plinths and cornice',           'quantity','item', 900,   0,   0, 0, 0),
    it('Wall units (hang)',               'Hang and level wall unit carcasses',               'quantity','nr',   35,   0,   0, 0, 0),
    it('Plinths & cornices',              'Fix plinths and cornice / pelmet rails',           'linear', 'm',    8,  12,   0, 0, 0),
  ],

  'Worktops': [
    it('Laminate worktop supply & fit',   'Supply and fit laminate worktops',                 'linear', 'm',   35, 120,   0, 0, 0),
    it('Quartz / granite worktop',        'Template, supply and fit quartz / granite',        'linear', 'm',  100, 680,   0, 0, 0),
    it('Solid wood worktop',              'Supply and fit solid timber worktops',             'linear', 'm',   55, 280,   0, 0, 0),
    it('Worktop junctions & cut-outs',    'Jigs, cut-outs for sink and hob',                  'quantity','item',  80,  20,   0, 0, 0),
  ],

  'Appliances': [
    it('Oven & hob supply & fit',         'Supply and install oven and hob',                  'quantity','item', 180,1200,   0, 0, 0),
    it('Dishwasher supply & fit',         'Supply and install dishwasher',                    'quantity','item',  90, 450,   0, 0, 0),
    it('Fridge freezer integration',      'Fit integrated fridge-freezer panels',             'quantity','item',  80, 180,   0, 0, 0),
    it('Extract fan & duct',              'Install kitchen extract fan and ductwork',          'quantity','item', 180, 220,   0, 0, 0),
    it('Appliance electrical connection', 'Final electrical connection to all appliances',    'quantity','item',  60,  20,   0, 0, 0),
  ],

  'Kitchen Units & Worktops': [
    it('Kitchen unit carcasses (supply)', 'Supply kitchen unit carcasses',                   'quantity','item',  0,3800,   0, 0, 0),
    it('Kitchen units (fit)',             'Install carcasses, plinths and cornices',          'quantity','item', 900,   0,   0, 0, 0),
    it('Quartz / granite worktops',       'Template, supply and fit stone worktops',          'linear', 'm',  100, 680,   0, 0, 0),
    it('Worktop cut-outs (sink / hob)',   'Jigs and cut-outs for sink and hob',               'quantity','item',  80,  20,   0, 0, 0),
    it('Sink & tap installation',         'Install sink, tap, waste and connections',          'quantity','nr',   90, 250,   0, 0, 0),
  ],

  'Appliances & Splashbacks': [
    it('Appliance supply & fit',          'Supply and install oven, hob, dishwasher',         'quantity','item', 350,2200,   0, 0, 0),
    it('Extract fan & duct',              'Install extract fan and ductwork',                 'quantity','item', 180, 220,   0, 0, 0),
    it('Splashback (glass)',              'Supply and fit glass splashback',                   'area',   'm²',   45, 220,   0, 0, 0),
    it('Splashback (porcelain tiles)',    'Supply and lay porcelain tile splashback',          'area',   'm²',   38,  55,   0, 0,10),
    it('Electrical connection (appliances)','Final connection to all appliances',              'quantity','item',  60,  20,   0, 0, 0),
  ],

  'Sink, Tap & Waste': [
    it('Kitchen sink (supply & fit)',     'Supply and install kitchen sink',                  'quantity','nr',   45, 180,   0, 0, 0),
    it('Mixer tap (supply & fit)',        'Supply and install mixer tap',                     'quantity','nr',   45,  95,   0, 0, 0),
    it('Waste & overflow',                'Install waste, overflow and bottle trap',           'quantity','nr',   28,  35,   0, 0, 0),
    it('Hot & cold connections',          'Connect hot and cold feeds to tap',                'quantity','nr',   18,  12,   0, 0, 0),
  ],

  'Kitchen Fit Out': [
    it('Strip existing kitchen',          'Remove all existing units, appliances, flooring', 'quantity','item', 450,   0, 200, 0, 0),
    it('Wall tiling (splashback area)',   'Tile above worktop / splashback zone',             'area',   'm²',   38,  52,   0, 0,10),
    it('Floor tiling',                    'Supply and lay floor tiles',                       'area',   'm²',   38,  65,   0, 0, 5),
    it('Kitchen units (supply & fit)',    'Install kitchen unit carcasses',                   'quantity','item', 900,4200,   0, 0, 0),
    it('Worktops (quartz / granite)',     'Template, cut and fit stone worktops',             'linear', 'm',  100, 680,   0, 0, 0),
    it('Appliances',                       'Fit all appliances and commission',               'quantity','item', 350,2200,   0, 0, 0),
    it('Sink & tap',                       'Install sink, tap and waste',                     'quantity','nr',   90, 250,   0, 0, 0),
    it('Extract fan & ducting',            'Install kitchen extract and external duct',       'quantity','item', 180, 220,   0, 0, 0),
  ],

  // ── Bathroom fit-out variants ──────────────────────────────────────────────

  'Bath / Shower / Wet Room': [
    it('Bath supply & installation',      'Supply and fit freestanding or panel bath',        'quantity','nr',  120, 580,   0, 0, 0),
    it('Shower enclosure / tray',         'Supply and install shower tray and enclosure',     'quantity','nr',  180, 680,   0, 0, 0),
    it('Wet room former & screen',        'Supply and install wet room former and screen',    'quantity','nr',  220, 850,   0, 0, 0),
    it('Shower valve & fittings',         'Supply and install thermostatic shower valve',     'quantity','nr',   80, 280,   0, 0, 0),
    it('Plumbing connections',            'Connect hot and cold feeds and waste',             'quantity','nr',   90, 120,   0, 0, 0),
  ],

  'WC & Basin': [
    it('WC (close-coupled / wall-hung)',  'Supply and install WC and cistern',                'quantity','nr',   80, 280,   0, 0, 0),
    it('Basin supply & installation',     'Supply and install wall-hung or pedestal basin',  'quantity','nr',   70, 180,   0, 0, 0),
    it('Mixer tap (basin)',               'Supply and install basin mixer tap',               'quantity','nr',   40,  85,   0, 0, 0),
    it('Waste & trap',                    'Install waste and trap to basin',                   'quantity','nr',   20,  25,   0, 0, 0),
    it('Plumbing connections',            'Connect hot and cold feeds and soil pipe',          'quantity','nr',   90, 120,   0, 0, 0),
  ],

  'Accessories & Towel Rail': [
    it('Heated towel rail',               'Supply and install electric or wet towel rail',    'quantity','nr',   80, 180,   0, 0, 0),
    it('Toilet roll holder & robe hooks', 'Fix TP holder and robe hooks to tiled wall',       'quantity','item',  45,  55,   0, 0, 0),
    it('Mirror / mirror cabinet',         'Supply and fix bathroom mirror or cabinet',        'quantity','nr',   45, 120,   0, 0, 0),
    it('Bathroom accessories (set)',      'Full accessory set — soap dish, brush etc.',       'quantity','item',  55,  80,   0, 0, 0),
  ],

  'Bathroom & En-Suite Fit Out': [
    it('Tanking / waterproofing',         'Tanking membrane to all wet surfaces',             'area',   'm²',  18,  22,   0, 0, 0),
    it('Wall tiling',                     'Supply and lay porcelain wall tiles',              'area',   'm²',  35,  55,   0, 0,10),
    it('Floor tiling',                    'Supply and lay porcelain floor tiles',             'area',   'm²',  38,  65,   0, 0, 5),
    it('Bath / shower installation',      'Supply and fit bath or shower enclosure',          'quantity','nr',  180, 680,   0, 0, 0),
    it('WC & basin (main bathroom)',      'Supply and install WC and basin',                  'quantity','nr',  120, 420,   0, 0, 0),
    it('En-suite WC & basin',             'Supply and install en-suite WC and basin',         'quantity','nr',  120, 420,   0, 0, 0),
    it('Heated towel rails (× 2)',        'Supply and install towel rails to both rooms',     'quantity','nr',   80, 180,   0, 0, 0),
    it('Downlights & extractor fans',     'Install downlights and mechanical extract',        'quantity','item', 200, 150,   0, 0, 0),
  ],

  'En-Suite Fit Out': [
    it('Tanking / waterproofing',         'Tanking membrane to all wet surfaces',             'area',   'm²',  18,  22,   0, 0, 0),
    it('Wall tiling',                     'Supply and lay porcelain wall tiles',              'area',   'm²',  35,  55,   0, 0,10),
    it('Floor tiling',                    'Supply and lay porcelain floor tiles',             'area',   'm²',  38,  65,   0, 0, 5),
    it('Shower enclosure / wet room',     'Supply and install shower tray and enclosure',     'quantity','nr',  180, 680,   0, 0, 0),
    it('WC & basin',                      'Supply and install WC and basin',                  'quantity','nr',  120, 420,   0, 0, 0),
    it('Heated towel rail',               'Supply and install towel rail',                    'quantity','nr',   80, 180,   0, 0, 0),
    it('Downlights & extractor',          'Install downlights and mechanical extract',        'quantity','item', 160, 150,   0, 0, 0),
  ],

  'Bathrooms Fit Out': [
    it('Tanking / waterproofing',         'Tanking membrane to all wet surfaces',             'area',   'm²',  18,  22,   0, 0, 0),
    it('Wall tiling',                     'Supply and lay porcelain wall tiles',              'area',   'm²',  35,  55,   0, 0,10),
    it('Floor tiling',                    'Supply and lay porcelain floor tiles',             'area',   'm²',  38,  65,   0, 0, 5),
    it('Bath supply & installation',      'Supply and fit bath',                              'quantity','nr',  120, 580,   0, 0, 0),
    it('Shower enclosure / wet room',     'Supply and install shower tray and enclosure',     'quantity','nr',  180, 680,   0, 0, 0),
    it('WC & basin (per bathroom)',       'Supply and install WC and basin',                  'quantity','nr',  120, 420,   0, 0, 0),
    it('Heated towel rail (per room)',    'Supply and install heated towel rail',              'quantity','nr',   80, 180,   0, 0, 0),
    it('Downlights & extractor fans',     'Install downlights and mechanical extract',        'quantity','item', 200, 150,   0, 0, 0),
  ],

  // ── Garden room specific ───────────────────────────────────────────────────

  'Insulation & Internal Lining': [
    it('Roof insulation (rigid 150mm)',   'Fit 150mm rigid PIR insulation between rafters',   'area',   'm²',  12,  45,   0, 0, 0),
    it('Wall insulation (rigid 100mm)',   'Fix 100mm rigid insulation to wall studs',          'area',   'm²',   6,  32,   0, 0, 0),
    it('Floor insulation (rigid 75mm)',   '75mm rigid insulation under floor deck',            'area',   'm²',   5,  22,   0, 0, 0),
    it('Plasterboard lining (12.5mm)',   'Fix 12.5mm plasterboard to walls and ceiling',     'area',   'm²',  10,  10,   0, 0, 0),
    it('Skim coat to plasterboard',       'Apply 2mm finish skim to plasterboard',            'area',   'm²',  12,   4,   0, 0, 0),
  ],

  'Optional Plumbing': [
    it('Cold water supply run',           'Run cold feed from house to garden room',          'linear', 'm',   18,  12,   0, 0, 0),
    it('Waste pipe run',                  'Run waste pipe from garden room to drain',          'linear', 'm',   14,  18,   0, 0, 0),
    it('Sink unit (optional)',            'Supply and fit sink unit',                          'quantity','nr',   80, 220,   0, 0, 0),
    it('Outdoor tap connection',          'Supply and install outdoor tap',                    'quantity','nr',   55,  45,   0, 0, 0),
  ],

  // ── Flooring & Decoration variants ────────────────────────────────────────

  'Floor Finishes': [
    it('Engineered wood flooring',        'Supply and lay engineered hardwood',               'area',   'm²',  28,  55,   0, 0, 0),
    it('Luxury vinyl tile (LVT)',         'Supply and lay LVT flooring',                      'area',   'm²',  18,  38,   0, 0, 0),
    it('Carpet & underlay',               'Supply and lay carpet with 10mm underlay',         'area',   'm²',  12,  28,   0, 0, 0),
    it('Porcelain floor tiles',           'Supply and lay 600×600 porcelain floor tiles',     'area',   'm²',  38,  65,   0, 0, 5),
    it('Floor prep & levelling',          'Self-levelling compound to prepare floor',          'area',   'm²',   6,   8,   0, 0, 0),
  ],

  'Flooring Throughout': [
    it('Floor prep & levelling',          'Self-levelling compound throughout',               'area',   'm²',   6,   8,   0, 0, 0),
    it('Engineered wood (living areas)',  'Supply and lay engineered hardwood',               'area',   'm²',  28,  55,   0, 0, 0),
    it('Luxury vinyl tile (wet / utility)','LVT to kitchen, bathrooms, utility',              'area',   'm²',  18,  38,   0, 0, 0),
    it('Carpet & underlay (bedrooms)',    'Supply and lay carpet with underlay',               'area',   'm²',  12,  28,   0, 0, 0),
    it('Porcelain tiles (bathroom floors)','600×600 porcelain floor tiles to bathrooms',      'area',   'm²',  38,  65,   0, 0, 5),
    it('Threshold bars',                  'Install threshold bars at floor transitions',       'quantity','nr',   12,  18,   0, 0, 0),
  ],

  'Full Internal Decoration': [
    it('Mist coat (new plaster)',         'Apply diluted mist coat to new plaster',            'area',   'm²',   4,   2,   0, 0, 0),
    it('2 × coats emulsion (walls)',      'Full finish two-coat emulsion to all walls',        'area',   'm²',   6,   3,   0, 0, 0),
    it('2 × coats emulsion (ceilings)',   'Two-coat emulsion to all ceilings',                'area',   'm²',   7,   3,   0, 0, 0),
    it('Gloss to all joinery',            'Sand, prime and 2 × gloss coats to woodwork',     'linear', 'm',    8,   3,   0, 0, 0),
    it('Door & frame painting',           'Paint internal door and frame',                     'quantity','nr',   45,  12,   0, 0, 0),
    it('Feature wall / specialist finish','Allowance for feature wall treatment',             'area',   'm²',  14,   8,   0, 0, 0),
  ],

  'Decoration & Second Fix': [
    it('Mist coat (new plaster)',         'Apply diluted mist coat to new plaster',            'area',   'm²',   4,   2,   0, 0, 0),
    it('2 × coats emulsion (walls)',      'Two-coat emulsion to all walls',                    'area',   'm²',   6,   3,   0, 0, 0),
    it('2 × coats emulsion (ceilings)',   'Two-coat emulsion to all ceilings',                'area',   'm²',   7,   3,   0, 0, 0),
    it('Skirting boards (MDF)',           'Fix MDF skirting throughout',                      'linear', 'm',   12,  10,   0, 0, 0),
    it('Architraves (MDF)',               'Fix MDF architraves to all doors',                  'linear', 'm',   10,   8,   0, 0, 0),
    it('Internal doors (hang)',           'Hang internal door sets with ironmongery',           'quantity','nr',  120, 220,   0, 0, 0),
    it('Gloss to joinery',                'Sand, prime and 2 × gloss coats',                  'linear', 'm',    8,   3,   0, 0, 0),
  ],

  'Decoration & Handover': [
    it('Mist coat (new plaster)',         'Apply diluted mist coat to new plaster',            'area',   'm²',   4,   2,   0, 0, 0),
    it('2 × coats emulsion (walls)',      'Two-coat emulsion to all walls',                    'area',   'm²',   6,   3,   0, 0, 0),
    it('2 × coats emulsion (ceilings)',   'Two-coat emulsion to all ceilings',                'area',   'm²',   7,   3,   0, 0, 0),
    it('Gloss to joinery',                'Sand, prime and 2 × gloss coats',                  'linear', 'm',    8,   3,   0, 0, 0),
    it('Builders clean',                  'Full professional builders clean',                  'quantity','item', 250,  80,   0, 0, 0),
    it('Snagging works',                  'Address snagging items after client walk',          'quantity','day', 350,   0,   0, 0, 0),
  ],

  // ── External / Garden work variants ───────────────────────────────────────

  'Fencing': [
    it('Excavate post holes',             'Dig post holes at 1.8m centres',                   'quantity','nr',   12,   0,   0, 0, 0),
    it('Concrete post bases',             'Set posts in concrete',                             'quantity','nr',    8,  10,   0, 0, 0),
    it('Closeboard fencing panels',       'Supply and erect closeboard fence panels',          'linear', 'm',   28,  45,   0, 0, 0),
    it('Feather-edge board fencing',      'Supply and erect feather-edge boarding',            'linear', 'm',   22,  38,   0, 0, 0),
    it('Capping rail & gravel boards',    'Fix capping rails and gravel boards',               'linear', 'm',    6,  10,   0, 0, 0),
  ],

  'Garden Walls': [
    it('Excavate and concrete footings',  'Strip and concrete footings for garden wall',      'linear', 'm',   14,  22,   0, 0, 0),
    it('Brick garden wall (one-brick)',   '215mm one-brick garden wall',                       'area',   'm²',  55,  62,   0, 0, 0),
    it('Brick pier (215×215)',            'Reinforced brick pier at ends and gates',           'quantity','nr',  120, 95,   0, 0, 0),
    it('Coping stones (blue / natural)', 'Supply and fix coping stones to wall top',          'linear', 'm',   14,  28,   0, 0, 0),
    it('DPC to wall top',                 'Install horizontal DPC below coping',               'linear', 'm',    2,   3,   0, 0, 0),
  ],

  'Gates': [
    it('Timber driveway gates (pair)',    'Supply and hang pair of hardwood gates',            'quantity','nr',  180,1200,   0, 0, 0),
    it('Metal / steel gates (pair)',      'Supply and install metal driveway gates',           'quantity','nr',  220,1800,   0, 0, 0),
    it('Gate posts (concrete base)',      'Set gate posts in concrete',                        'quantity','nr',   65,  80,   0, 0, 0),
    it('Gate hinges & latch hardware',   'Fit heavy-duty hinges and security latch',           'quantity','nr',   35,  55,   0, 0, 0),
    it('Pedestrian wicket gate',          'Supply and hang pedestrian wicket gate',            'quantity','nr',  120, 380,   0, 0, 0),
  ],

  'Patio Construction': [
    it('Excavate to formation',           'Machine excavate garden area to formation level',   'area',   'm²',   5,   0,   3, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                      'volume', 'm³',   0,   0,  28, 0, 0),
    it('MOT Type 1 sub-base (100mm)',     'Lay and compact 100mm sub-base',                    'area',   'm²',   5,  16,   0, 0, 0),
    it('Porcelain patio slabs (600×600)','Supply and lay 600×600 porcelain paving',           'area',   'm²',  38,  55,   0, 0, 0),
    it('Natural stone paving',            'Supply and lay natural stone paving',               'area',   'm²',  42,  70,   0, 0, 0),
    it('Pointing / jointing compound',   'Point joints with kiln-dried or mortar',            'area',   'm²',   4,   5,   0, 0, 0),
  ],

  'Pathways & Steps': [
    it('Excavate path areas',             'Excavate pathway areas to sub-base depth',          'area',   'm²',   5,   0,   3, 0, 0),
    it('MOT Type 1 sub-base (75mm)',      'Compact 75mm sub-base to path areas',               'area',   'm²',   4,  12,   0, 0, 0),
    it('Paving slabs (path)',             'Supply and lay 600×300 path paving slabs',          'area',   'm²',  28,  38,   0, 0, 0),
    it('Step construction (masonry)',     'Build brick or block steps on concrete base',       'quantity','nr',  120, 180,   0, 0, 0),
    it('Step nosing / coping',            'Supply and fix step nosing or coping',              'linear', 'm',   14,  22,   0, 0, 0),
  ],

  'Driveway Sub-Base & Construction': [
    it('Excavate driveway to formation',  'Machine excavate driveway area to formation',       'area',   'm²',   6,   0,   4, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                      'volume', 'm³',   0,   0,  28, 0, 0),
    it('MOT Type 1 sub-base (150mm)',     'Lay and compact 150mm Type 1 sub-base',             'area',   'm²',   5,  16,   0, 0, 0),
    it('Block paving (driveway)',         'Supply and lay block paving on compacted base',     'area',   'm²',  32,  48,   0, 0, 0),
    it('Tarmac / asphalt (driveway)',     'Supply and lay tarmac surface course',               'area',   'm²',   8,  28,   0, 0, 0),
    it('Edging courses / restraints',    'Lay block edging courses to all edges',              'linear', 'm',   10,  14,   0, 0, 0),
    it('Drop kerb (if required)',         'Council drop kerb application + contractor works',  'quantity','item',  0,   0,   0, 0,1200),
  ],

  'Patio / Decking': [
    it('Excavate to formation',           'Excavate garden area to formation level',           'area',   'm²',   5,   0,   3, 0, 0),
    it('MOT sub-base (100mm)',            'Compact 100mm sub-base',                            'area',   'm²',   5,  16,   0, 0, 0),
    it('Porcelain patio paving',          'Supply and lay 600×600 porcelain slabs',            'area',   'm²',  38,  55,   0, 0, 0),
    it('Composite decking frame',         'Lay pressure-treated timber decking frame',         'area',   'm²',  22,  28,   0, 0, 0),
    it('Composite deck boards (lay)',     'Supply and fix composite deck boards',               'area',   'm²',  18,  65,   0, 0, 0),
    it('Decking fascia & trim',           'Fix fascia boards and edge trim to decking',        'linear', 'm',   10,  18,   0, 0, 0),
    it('Decking balustrade / handrail',  'Install balustrade and handrail to decking',         'linear', 'm',   38,  65,   0, 0, 0),
  ],

  'Topsoil & Turfing': [
    it('Rotavate / prepare sub-soil',     'Rotavate and prepare sub-soil for topsoil',         'area',   'm²',   2,   0,   3, 0, 0),
    it('Topsoil (100mm supply & spread)', 'Supply and spread 100mm certified topsoil',         'area',   'm²',   3,  12,   0, 0, 0),
    it('Cultivated turf (lay)',           'Supply and lay cultivated turf',                    'area',   'm²',   8,  10,   0, 0, 0),
    it('Edging strips (steel / plas.)',   'Install edging strips to turf borders',             'linear', 'm',    5,   8,   0, 0, 0),
    it('Watering in / aftercare',         'Water in and initial aftercare allowance',           'quantity','item',  80,  20,   0, 0, 0),
  ],

  'Planting & Beds': [
    it('Raised bed construction',         'Build raised planting beds (brick / timber)',       'linear', 'm',   55,  48,   0, 0, 0),
    it('Planting compost / mulch',        'Supply and spread planting compost and mulch',      'area',   'm²',   2,   8,   0, 0, 0),
    it('Shrubs & perennials (allowance)', 'Allowance for shrub and perennial supply',          'area',   'm²',  12,  18,   0, 0, 0),
    it('Climbers & wall plants',          'Plant climbers on wire / trellis framework',        'quantity','nr',   22,  35,   0, 0, 0),
    it('Tree planting',                   'Excavate, plant and stake semi-mature trees',       'quantity','nr',   80, 280,   0, 0, 0),
  ],

  'External Lighting': [
    it('Low-voltage garden lighting',     'Install low-voltage LED garden light fittings',    'quantity','item', 280, 420,   0, 0, 0),
    it('Outdoor socket / power point',   'Install weatherproof outdoor power outlet',         'quantity','nr',   55,  65,   0, 0, 0),
    it('Cable trenching',                 'Excavate and lay armoured cable run',               'linear', 'm',    8,  10,   0, 0, 0),
    it('Lighting control / transformer', 'Install 12V transformer and control unit',          'quantity','item', 120, 180,   0, 0, 0),
    it('Step / decking lights',           'Recessed LED step and decking lights',              'quantity','nr',   28,  55,   0, 0, 0),
  ],

  'Irrigation & Water Feature': [
    it('Irrigation pipe runs',            'Lay mainline and lateral irrigation pipe',           'linear', 'm',    6,  10,   0, 0, 0),
    it('Irrigation controller & valves', 'Supply and install controller and solenoid valves', 'quantity','item', 120, 280,   0, 0, 0),
    it('Pop-up sprinklers / drippers',   'Install pop-up heads or dripper outlets',            'quantity','nr',   18,  22,   0, 0, 0),
    it('Water feature (supply & install)','Supply and install water feature / pond pump',      'quantity','item', 350, 950,   0, 0, 0),
    it('External tap connection',         'Connect to mains via backflow preventer',           'quantity','item',  55,  45,   0, 0, 0),
  ],

  'Soft Landscaping': [
    it('Rotavate & prepare sub-soil',     'Rotavate and prepare sub-soil',                     'area',   'm²',   2,   0,   3, 0, 0),
    it('Topsoil (100mm)',                 'Supply and spread 100mm certified topsoil',         'area',   'm²',   3,  12,   0, 0, 0),
    it('Cultivated turf (lay)',           'Supply and lay cultivated turf',                    'area',   'm²',   8,  10,   0, 0, 0),
    it('Shrubs & perennials',             'Allowance for shrub and perennial planting',        'area',   'm²',  12,  18,   0, 0, 0),
    it('Planting compost & mulch',        'Supply and spread compost and mulch',               'area',   'm²',   2,   8,   0, 0, 0),
  ],

  'Driveways & Paths': [
    it('Excavate to formation',           'Machine excavate driveway / path areas',            'area',   'm²',   6,   0,   4, 0, 0),
    it('Remove spoil off site',           'Cart away excavated material',                      'volume', 'm³',   0,   0,  28, 0, 0),
    it('MOT Type 1 sub-base',             'Lay and compact Type 1 sub-base',                   'area',   'm²',   5,  16,   0, 0, 0),
    it('Block paving (driveway)',         'Supply and lay block paving',                       'area',   'm²',  32,  48,   0, 0, 0),
    it('Path paving slabs',               'Supply and lay path paving slabs',                  'area',   'm²',  28,  38,   0, 0, 0),
    it('Edging courses',                  'Lay block or stone edging to all edges',            'linear', 'm',   10,  14,   0, 0, 0),
  ],

  'Drainage & External Services': [
    it('Excavate drainage trench',        'Machine excavate drainage runs',                    'linear', 'm',    8,   0,  12, 0, 0),
    it('110mm underground drain',         'Supply and lay 110mm PVC drain',                    'linear', 'm',    8,  14,   0, 0, 0),
    it('Inspection chamber (450mm)',      'Install plastic inspection chamber',                'quantity','nr',   60, 180,   0, 0, 0),
    it('Surface water connection',        'Connect to soakaway or surface water drain',        'quantity','nr',  120,  80,   0, 0, 0),
    it('Utility ducting (service runs)',  'Lay UPVC ducting for gas / water / electric',       'linear', 'm',    5,   8,   0, 0, 0),
    it('Backfill & compact trenches',     'Backfill all service trenches',                     'linear', 'm',    4,   8,   0, 0, 0),
  ],

  'Landscaping & Completion': [
    it('Final site clearance',            'Clear and remove all building waste',               'quantity','nr',    0,   0, 320, 0, 0),
    it('Reinstate garden (topsoil/turf)', 'Topsoil and turf disturbed garden areas',           'area',   'm²',   8,  12,   0, 0, 0),
    it('Patio / decking (rear)',          'Supply and lay patio or decking to rear',            'area',   'm²',  38,  55,   0, 0, 0),
    it('Builders clean',                  'Full professional builders clean',                   'quantity','item', 250,  80,   0, 0, 0),
    it('Snagging works',                  'Address snagging items after client walk',           'quantity','day', 350,   0,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and completion certificate',    'quantity','item',   0,   0,   0, 0, 500),
  ],

  'External Paving & Making Good': [
    it('Break up / remove existing paving','Break out and remove existing patio/drive',        'area',   'm²',   8,   0,   4, 0, 0),
    it('MOT Type 1 sub-base (100mm)',     'Lay and compact 100mm sub-base',                    'area',   'm²',   5,  16,   0, 0, 0),
    it('Porcelain paving (new)',          'Supply and lay 600×600 porcelain paving',            'area',   'm²',  38,  55,   0, 0, 0),
    it('Reinstate garden soil / turf',    'Reinstate disturbed garden areas with topsoil/turf','area',   'm²',   8,  12,   0, 0, 0),
    it('Make good boundary walls / fences','Make good any disturbed walls or fencing',          'quantity','item', 180,  80,   0, 0, 0),
  ],

  // ── Completion variants ────────────────────────────────────────────────────

  'Snagging & Handover': [
    it('Snagging inspection & works',     'Carry out and address snagging list items',         'quantity','day', 350,   0,   0, 0, 0),
    it('Touch-up materials',              'Paints, sealants, filler for snagging touches',    'quantity','item',   0,  80,   0, 0, 0),
    it('Builders clean',                  'Full professional builders clean',                  'quantity','item', 250,  80,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and completion certificate',    'quantity','item',   0,   0,   0, 0, 500),
    it('O&M / warranties pack',           'Compile operation manuals and warranties',          'quantity','item', 120,   0,   0, 0, 0),
  ],

  'Snagging, Clean & Handover': [
    it('Snagging inspection & works',     'Carry out and address snagging list items',         'quantity','day', 350,   0,   0, 0, 0),
    it('Touch-up materials',              'Paints, sealants, filler for snag touches',        'quantity','item',   0,  80,   0, 0, 0),
    it('Professional builders clean',     'Full professional deep clean',                      'quantity','item', 300,  80,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and certificate',               'quantity','item',   0,   0,   0, 0, 500),
    it('O&M / warranties pack',           'Compile operation manuals and warranties',          'quantity','item', 120,   0,   0, 0, 0),
  ],

  'Snagging & Certification': [
    it('Snagging inspection & works',     'Carry out and address snagging list items',         'quantity','day', 350,   0,   0, 0, 0),
    it('Touch-up materials',              'Paints, sealants, filler for snagging',            'quantity','item',   0,  80,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and completion certificate',    'quantity','item',   0,   0,   0, 0, 500),
    it('Electrical installation cert',    'NICEIC electrical installation certificate',        'quantity','item',   0,   0,   0, 0, 280),
    it('Gas safety certificate',          'Gas Safe inspection and certificate',               'quantity','item',   0,   0,   0, 0, 120),
    it('O&M / warranties pack',           'Compile operation manuals and warranties',          'quantity','item', 120,   0,   0, 0, 0),
  ],

  'Snagging, Certification & Handover': [
    it('Snagging inspection & works',     'Carry out and address snagging list items',         'quantity','day', 350,   0,   0, 0, 0),
    it('Touch-up materials',              'Paints, sealants, filler',                          'quantity','item',   0,  80,   0, 0, 0),
    it('Professional builders clean',     'Full professional deep clean',                      'quantity','item', 300,  80,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and certificate',               'quantity','item',   0,   0,   0, 0, 500),
    it('Electrical installation cert',    'NICEIC / ECA electrical certificate',               'quantity','item',   0,   0,   0, 0, 280),
    it('Gas safety certificate',          'Gas Safe inspection and certificate',               'quantity','item',   0,   0,   0, 0, 120),
    it('O&M / warranties pack',           'Compile operation manuals and warranties',          'quantity','item', 120,   0,   0, 0, 0),
  ],

  'Final Clean & Handover': [
    it('Snagging works',                  'Carry out final snagging list items',               'quantity','day', 350,   0,   0, 0, 0),
    it('Professional deep clean',         'Full professional builders deep clean',              'quantity','item', 300,  80,   0, 0, 0),
    it('Touch-up materials',              'Paints, sealants, filler for final touches',        'quantity','item',   0,  80,   0, 0, 0),
    it('O&M manual compilation',          'Compile operation manuals and warranties',          'quantity','item', 120,   0,   0, 0, 0),
    it('Building Control final cert',     'BC final inspection and certificate',               'quantity','item',   0,   0,   0, 0, 500),
    it('Keys & possession handover',      'Final walk-through and key handover',               'quantity','item',  60,   0,   0, 0, 0),
  ],

}

/** Returns default estimator items for a given phase name (or empty array) */
export function getPhaseEstimatorDefaults(phaseName: string): EstimatorItemTemplate[] {
  return ESTIMATOR_PHASE_DEFAULTS[phaseName] || []
}
