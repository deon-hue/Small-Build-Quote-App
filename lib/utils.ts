import type { Quote, QuotePhase, QuoteItem, TemplatePhaseData } from './types'
import { getPhaseEstimatorDefaults } from './estimatorDefaults'

export const VAT = 0.20

export const UNITS = ['Item','m','m²','m³','Nr','Hr','Day','Set','Kg','Tonne']

export function uid(): string {
  return Date.now() + '-' + Math.floor(Math.random() * 10000)
}

export function fmt(n: number): string {
  return '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtK(n: number): string {
  return n >= 1000 ? '£' + (n / 1000).toFixed(0) + 'k' : fmt(n)
}

export function calcItem(i: QuoteItem): number {
  return (Number(i.labour) || 0) + (Number(i.materials) || 0) + (Number(i.plantHire) || 0)
    + (Number(i.subcontractors) || 0) + (Number(i.other) || 0)
}

export function calcPhase(p: QuotePhase): number {
  return p.items.reduce((s, i) => s + calcItem(i), 0)
}

export function calcItemSell(i: QuoteItem, mkp: number): number {
  return calcItem(i) * (1 + mkp / 100)
}

export function calcPhaseSell(p: QuotePhase, mkp: number): number {
  return p.items.reduce((s, i) => s + calcItemSell(i, mkp), 0)
}

export function quoteTotal(q: Quote): number {
  const net = q.phases.reduce((s, p) => s + calcPhase(p), 0)
  const sub = net * (1 + (q.markup || 0) / 100)
  return sub * (q.vatIncluded ? 1 + VAT : 1)
}

// ── Per-job unique colours (matches calendar view) ───────────────────────────
// Each job gets a persistent colour derived from its ID so the dot / badge on
// the Jobs list page uses the same colour the user sees on the Calendar page.
export const JOB_COLORS = [
  '#4a90a4', '#7ab533', '#e07b22', '#9b59b6', '#2980b9',
  '#e74c3c', '#1abc9c', '#b5870a', '#16a085', '#c0392b',
]
function _hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
export function jobColor(jobId: string): string {
  return JOB_COLORS[Math.abs(_hashCode(jobId)) % JOB_COLORS.length]
}

export const STAGE_COLOR: Record<string, string> = {
  planning: '#4a90a4', active: '#7ab533', onhold: '#e67e22', complete: '#9aa3ad',
}
export const STAGE_BADGE: Record<string, string> = {
  planning: 'b-planning', active: 'b-active', onhold: 'b-onhold', complete: 'b-complete',
}
export const STAGE_LABEL: Record<string, string> = {
  planning: 'Planning', active: 'On Site', onhold: 'On Hold', complete: 'Complete',
}
export const Q_BADGE: Record<string, string> = {
  pending: 'b-pending', sent: 'b-sent', accepted: 'b-accepted', declined: 'b-declined',
}
export const Q_LABEL: Record<string, string> = {
  pending: 'Pending', sent: 'Sent', accepted: 'Accepted', declined: 'Declined',
}

export const JOB_TYPES = [
  'Rear Extension','Side Extension','Loft Conversion','Full Refurbishment',
  'Kitchen Extension','Kitchen Fit-Out','Bathroom Fit-Out','Garden Room',
  'Landscaping','New Build','Other',
]

// tp(parentPhase, subPhase, labour, materials, plant, subcontractors, other, labourNotes, materialsNotes, plantNotes, subNotes, otherNotes)
function tp(
  pp: string, ph: string,
  l: number, m: number, p: number, s = 0, o = 0,
  nl = '', nm = '', np = '', ns = '', no = ''
): TemplatePhaseData {
  return {
    parentPhase: pp,
    phase: ph,
    estimatorItems: getPhaseEstimatorDefaults(ph),
    items: [
      { desc: '', qty: 1, unit: 'Item', labour: l,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: nl, itemType: 'labour'        as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: m, plantHire: 0, subcontractors: 0, other: 0, notes: nm, itemType: 'materials'     as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: p, subcontractors: 0, other: 0, notes: np, itemType: 'plant'         as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: s, other: 0, notes: ns, itemType: 'subcontractors' as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: o, notes: no, itemType: 'other'         as const },
    ],
  }
}

// ft — flat template phase (no parent grouping; embeds estimator defaults automatically)
function ft(
  ph: string,
  l: number, m: number, p: number, s = 0, o = 0,
  nl = '', nm = '', np = '', ns = '', no = ''
): TemplatePhaseData {
  return {
    parentPhase: '',
    phase: ph,
    estimatorItems: getPhaseEstimatorDefaults(ph),
    items: [
      { desc: '', qty: 1, unit: 'Item', labour: l,   materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: nl, itemType: 'labour'        as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: m, plantHire: 0, subcontractors: 0, other: 0, notes: nm, itemType: 'materials'     as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: p, subcontractors: 0, other: 0, notes: np, itemType: 'plant'         as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: s, other: 0, notes: ns, itemType: 'subcontractors' as const },
      { desc: '', qty: 1, unit: 'Item', labour: 0,   materials: 0, plantHire: 0, subcontractors: 0, other: o, notes: no, itemType: 'other'         as const },
    ],
  }
}

export const JOB_TEMPLATES: Record<string, TemplatePhaseData[]> = {

  // ─── Rear Extension (flat 18-phase structure) ────────────────────────────────
  'Rear Extension': [
    ft('Preliminaries',            800,400,600,0,300,
      'Site manager, H&S plan, welfare setup, Building Control liaison',
      'Hoarding, protection sheets, heras fencing, signage',
      'Scaffold erection and hire',
      '',
      'Building Control application fee, structural engineer fee'),
    ft('Groundworks',              2200,0,1800,0,0,
      'Groundworkers — strip topsoil, bulk excavation, setting out',
      'Disposal of arisings, imported fill if required',
      'Excavator, dumper truck hire'),
    ft('Drainage',                 900,1200,300,0,0,
      'Groundworkers — underground drainage, inspection chambers, connections',
      'Drainage pipes, inspection chambers, connectors, channel drain',
      'Mini excavator'),
    ft('Substructure',             2000,4000,600,0,0,
      'Groundworkers — concrete foundations, blockwork to DPC, hardcore, floor slab',
      'Concrete (C25), foundation blocks, DPC, hardcore, sand blinding, DPM, rigid insulation',
      'Concrete pump, compactor plate'),
    ft('Superstructure',           2800,3200,200,0,0,
      'Bricklayers/blocklayers — cavity walls, DPC course, lintels, wall ties',
      'Facing bricks, blocks, cavity insulation, lintels, wall ties, mortar',
      'Mortar mixer, material hoist'),
    ft('Structural Steels',        600,2200,400,0,0,
      'Steel fixers — RSJ beam install, padstones, propping, knock-through rear wall',
      'RSJ steels, padstones, structural fixings, making-good materials',
      'Hiab/crane for steel delivery, propping kit'),
    ft('Roof Structure & Covering',2400,4000,300,0,0,
      'Carpenter — roof joists, firrings, OSB decking; roofer — EPDM/GRP/tiles, fascia, guttering, rooflight',
      'Roof joists, OSB, EPDM/GRP kit, lead flashing, fascia, soffits, guttering, rooflight if spec\'d',
      'Scissor lift / hop-up scaffold'),
    ft('Windows & Doors',          900,5400,0,0,0,
      'Window and door installation, sealing, making good reveals',
      'Windows, bifold/French doors — supply and fit, sealant, thresholds'),
    ft('First Fix Plumbing',       900,800,0,0,0,
      'Plumber — hot/cold pipework, waste runs, boiler alteration, UFH manifold',
      'Pipework, fittings, waste pipes, UFH kit and manifold'),
    ft('First Fix Electrics',      700,600,0,0,0,
      'Electrician — cable runs, circuits, back boxes, consumer unit alteration',
      'Cables, containment, back boxes, consumer unit upgrade'),
    ft('Insulation & Plasterboarding',1200,1800,0,0,0,
      'Fix rigid insulation, CLS stud framing, plasterboard all surfaces',
      'Rigid insulation (Kingspan/Celotex), CLS stud, plasterboard, joint tape, screws'),
    ft('Plastering',               1800,700,350,0,0,
      'Plasterer — skim walls and ceilings throughout, make good existing surfaces',
      'Bonding, finish plaster, angle beads, scrim tape',
      'Dehumidifiers for dry-out period'),
    ft('Screed & Floor Build-Up',  500,1200,150,0,0,
      'Screed laying, floor level build-up, prep for floor finish',
      'Floor screed, primer, DPM tape, expansion edge strip',
      'Pump if liquid screed'),
    ft('Second Fix',               1800,1600,0,0,0,
      'Plumber, electrician, carpenter — all second fix throughout',
      'Sockets, switches, lights, skirting, architraves, doors, ironmongery, sanitaryware'),
    ft('Kitchen & Client Items',   1200,5500,0,0,0,
      'Kitchen fitter — unit installation, worktop template and fit, appliance integration',
      'Kitchen units, worktops, appliances, sink, tap, fixings, splashback'),
    ft('Decoration',               800,350,0,0,0,
      'Decorator — mist coat and two finish coats throughout',
      'Mist coat, emulsion, gloss, filler, tape, caulk'),
    ft('External Works',           1200,1800,400,0,0,
      'Patio/drive reinstatement, make good brickwork externally, garden tidy',
      'Paving slabs, pointing mortar, topsoil, turf allowance',
      'Mini excavator, final skip'),
    ft('Completion & Handover',    400,100,0,0,300,
      'Snagging works, builders clean, client walkthrough',
      'Touch-up materials, remediation sundries',
      '',
      '',
      'Building Control final inspection fee, certification'),
  ],

  // ─── Side Extension ──────────────────────────────────────────────────────────
  'Side Extension': [
    tp('Phase 1 – Site Setup & Preparation','Site Establishment',        600,350,750,0,200,'Welfare, site management, H&S setup','Hoarding, protection sheets, heras fencing','Scaffold erect/dismantle','','Building Control application fee'),
    tp('Phase 1 – Site Setup & Preparation','Strip-Out & Demolition',    800,0,250,0,0,'Demolition of side wall/openings, strip paths/drives','Skip for arisings','Skip hire'),
    tp('Phase 2 – Groundworks & Foundations','Excavation',               1100,0,1100,0,0,'Groundworkers — setting out and excavation','','Excavator, dumper truck hire'),
    tp('Phase 2 – Groundworks & Foundations','Concrete Foundations & DPC Blockwork',1100,2000,350,0,0,'Foundation concrete and blockwork to DPC','Concrete (C25), foundation blocks, DPC, mortar','Concrete pump'),
    tp('Phase 2 – Groundworks & Foundations','Underground Drainage & Services',800,1000,150,0,0,'Drainage, inspection chambers, service ducting','Drainage pipes, chambers, connectors, ducting','Mini excavator'),
    tp('Phase 2 – Groundworks & Foundations','Oversite Preparation & Floor Slab',600,1600,350,0,0,'Hardcore, sand blinding, insulation, DPM, slab','Hardcore, sand, DPM, insulation, concrete slab','Compactor, concrete pump'),
    tp('Phase 3 – Structural Shell','External Walls & Blockwork',        2600,3000,200,0,0,'Bricklayers/blocklayers — cavity walls, DPC, lintels','Blocks, facing bricks, cavity insulation, lintels','Mortar mixer'),
    tp('Phase 3 – Structural Shell','Structural Steelwork & Party Wall Works',600,2000,350,0,0,'RSJ beam install, padstones, party wall award compliance','RSJ steels, padstones, structural fixings','Hiab/crane'),
    tp('Phase 3 – Structural Shell','Knock-Through & Making Good',       500,250,0,0,0,'Form opening between existing house and extension','Making-good materials, lintels',''),
    tp('Phase 4 – Roof Construction','Roof Structure & Decking',         1300,1600,250,0,0,'Carpenter — roof joists, firrings, OSB decking','Timber, OSB, joist hangers','Scissor lift'),
    tp('Phase 4 – Roof Construction','Roof Coverings & Weatherproofing', 900,2000,0,0,0,'Roofer — EPDM/GRP flat, lead flashings','EPDM/GRP kit, lead flashing',''),
    tp('Phase 4 – Roof Construction','Fascia, Soffits & Guttering',      350,350,0,0,0,'Fascia, soffit boards, guttering','UPVC fascia, soffits, guttering',''),
    tp('Phase 5 – External Envelope','Windows',                          350,1800,0,0,0,'Window installation, sealing, making good','Windows — supply and fit',''),
    tp('Phase 5 – External Envelope','External Doors',                   400,2500,0,0,0,'External door installation','External door — supply and fit',''),
    tp('Phase 6 – First Fix Services','Plumbing & Heating First Fix',    800,700,0,0,0,'Plumber — pipework, radiator circuit extension','Pipework, fittings, radiator',''),
    tp('Phase 6 – First Fix Services','Electrical First Fix',            600,500,0,0,0,'Electrician — cable runs, circuits, back boxes','Cables, containment, back boxes',''),
    tp('Phase 6 – First Fix Services','Ventilation',                     250,250,0,0,0,'Extraction ducting and fan wiring','Extractor fan, ducting, grilles',''),
    tp('Phase 7 – Internal Construction','Insulation & Plasterboarding', 1000,1600,0,0,0,'Insulation fix, plasterboard all surfaces','Rigid insulation, plasterboard',''),
    tp('Phase 7 – Internal Construction','Plastering & Dry-Out',         1600,600,300,0,0,'Plasterer — skim walls and ceilings, make good','Bonding, finish plaster, beads','Dehumidifiers'),
    tp('Phase 8 – Second Fix & Finishes','Second Fix Plumbing',          500,400,0,0,0,'Plumber — sanitaryware, commissioning','Sanitaryware, valves, controls',''),
    tp('Phase 8 – Second Fix & Finishes','Second Fix Electrical',        600,600,0,0,0,'Electrician — sockets, switches, lights, certs','Sockets, switches, fittings, certs',''),
    tp('Phase 8 – Second Fix & Finishes','Second Fix Carpentry',         500,350,0,0,0,'Skirting, architraves, internal doors','Skirting, architraves, doors, ironmongery',''),
    tp('Phase 9 – Flooring & Decoration','Floor Finishes',               700,1600,0,0,0,'Tiler/flooring fitter','Tiles, engineered floor, adhesive',''),
    tp('Phase 9 – Flooring & Decoration','Decoration',                   700,300,0,0,0,'Decorator — mist coat and finish','Paint, filler, tape',''),
    tp('Phase 10 – External Works & Completion','External Paving & Making Good',700,1000,250,0,0,'Patio/driveway reinstatement, make good externally','Paving, pointing mortar, topsoil','Mini excavator, final skip'),
    tp('Phase 10 – External Works & Completion','Snagging, Clean & Handover',350,100,0,0,250,'Snagging, builders clean, handover','Touch-up materials','','','Building Control final inspection fee'),
  ],

  // ─── Loft Conversion ─────────────────────────────────────────────────────────
  'Loft Conversion': [
    tp('Phase 1 – Site Setup & Preparation','Site Establishment & Scaffold',500,200,800,0,200,'Welfare, site setup, dust protection','Dust sheets, hatch protection, access tower','Scaffold erection and hire','','Building Control application fee'),
    tp('Phase 2 – Structural Steelwork','Ridge Beam & Purlin Installation',1800,2800,800,0,0,'Steel fixers — ridge beam, purlin structure, temporary propping','Ridge beam, purlins, padstones, joist hangers, structural fixings','Hiab/crane for steel delivery'),
    tp('Phase 2 – Structural Steelwork','Floor Structure Alterations',   800,600,0,0,0,'Carpenter — trimmer joists, trimming existing floor','Trimmer joists, joist hangers, fixings',''),
    tp('Phase 3 – Roof Works','Roof Structure Alterations',              1800,1400,300,0,0,'Carpenter — raising wallplate, new rafters, strapping','Timber, wallplate, straps, noggins, OSB','Hop-up scaffold'),
    tp('Phase 3 – Roof Works','Dormer Construction',                     1800,1600,300,0,0,'Carpenter — dormer frame, structural decking, weatherproofing','Dormer framing timber, OSB, breathable membrane','Scissor lift'),
    tp('Phase 3 – Roof Works','Roof Coverings & Weatherproofing',        1000,1800,200,0,0,'Roofer — tiles/slates to dormer, lead flashings, EPDM flat','Tiles/slates, lead, EPDM/GRP, roofing felt, battens',''),
    tp('Phase 3 – Roof Works','Rooflights & Dormer Windows',             700,3800,0,0,0,'Rooflight and dormer window installation, cladding','Velux/fixed rooflights, dormer windows, zinc/fibre cladding',''),
    tp('Phase 4 – Staircase & Access','Staircase Installation',          800,2400,0,0,0,'Carpenter — new staircase, trimming opening in existing floor','Staircase supply, balustrade, handrail, fixings',''),
    tp('Phase 4 – Staircase & Access','Landing Alterations & Fire Doors',500,400,0,0,0,'Carpenter — new landing framing, fire door installation','Fire doors, door sets, landing board, ironmongery',''),
    tp('Phase 5 – First Fix Services','Plumbing & Heating',              900,700,0,0,0,'Plumber — en-suite pipework, heating extension','Pipework, fittings, towel rail supply',''),
    tp('Phase 5 – First Fix Services','Electrical First Fix',            700,600,0,0,0,'Electrician — cable runs, circuits, lighting','Cables, back boxes, containment',''),
    tp('Phase 5 – First Fix Services','Ventilation',                     300,300,0,0,0,'Mechanical ventilation, en-suite extract ducting','MVHR unit or extractor, ducting, grilles',''),
    tp('Phase 6 – Internal Construction','Insulation — Roof & Walls',    1000,2200,0,0,0,'Fix rafter insulation, warm roof build-up, wall insulation','Kingspan/Celotex, rafter insulation, service void battens',''),
    tp('Phase 6 – Internal Construction','Plasterboarding & Fire Protection',1200,1600,0,0,0,'Plasterboard walls, ceiling, fire protection requirements','Plasterboard, fire board, acoustic mat, screws, joint tape',''),
    tp('Phase 6 – Internal Construction','Plastering & Dry-Out',         1600,600,300,0,0,'Plasterer — skim all surfaces, make good','Bonding, finish plaster, beads, scrim','Dehumidifiers for dry-out'),
    tp('Phase 7 – Second Fix & En-Suite','En-Suite Fit Out',             1000,2200,0,0,0,'Plumber — shower, basin, WC, tiling allowance','Shower enclosure, basin, WC, taps, tiles, adhesive',''),
    tp('Phase 7 – Second Fix & En-Suite','Second Fix Electrical',        600,600,0,0,0,'Electrician — sockets, switches, lights, testing and certs','Sockets, switches, light fittings, consumer unit, certs',''),
    tp('Phase 7 – Second Fix & En-Suite','Second Fix Carpentry',         500,350,0,0,0,'Skirting, architraves, wardrobe framing if required','Skirting, architraves, ironmongery',''),
    tp('Phase 8 – Flooring & Decoration','Floor Finishes',               600,1600,0,0,0,'Flooring fitter — engineered or carpet installation','Engineered floor, carpet, underlay, adhesive',''),
    tp('Phase 8 – Flooring & Decoration','Decoration',                   700,300,0,0,0,'Decorator — mist coat and full decoration','Paint, filler, tape',''),
    tp('Phase 9 – Completion','Snagging, Certification & Handover',      500,200,0,0,300,'Snagging works, final clean, Building Control inspection','Touch-up materials','','','Building Control final inspection fee'),
  ],

  // ─── Full Refurbishment ───────────────────────────────────────────────────────
  'Full Refurbishment': [
    tp('Phase 1 – Strip-Out & Enabling','Full Strip-Out',                2400,600,1200,0,0,'Site welfare, full strip-out, demolition of partitions','Skips, hoarding, protection','Multiple skip hire'),
    tp('Phase 2 – Structural Works','Structural Alterations & New Openings',2000,2200,600,0,0,'Form new openings, remove partitions, beam installation','RSJ steels, padstones, lintels, blockwork','Propping equipment, hiab'),
    tp('Phase 2 – Structural Works','Fabric Repairs',                   1200,800,0,0,0,'Repair walls, floors, chimney breasts as required','Brickwork, mortar, hardcore, DPC materials',''),
    tp('Phase 3 – Roof Works','Roof Strip & Re-Cover',                  1800,3200,500,0,0,'Strip existing roof, repair structure, re-tile or re-slate','Tiles/slates, roofing felt, battens, nails','Scaffold hire'),
    tp('Phase 3 – Roof Works','Fascia, Soffits, Guttering & Leadwork',  800,1200,0,0,0,'Replace fascia, soffits, guttering, lead flashings','UPVC fascia/soffits, guttering, lead',''),
    tp('Phase 4 – External Envelope','Window Replacement',              1200,5500,300,0,0,'Remove and fit new windows throughout','New windows — supply and fit','Skip for old frames'),
    tp('Phase 4 – External Envelope','External Door Replacement',       500,2500,0,0,0,'Remove and fit new front and rear doors','Front/rear doors — supply and fit',''),
    tp('Phase 4 – External Envelope','External Decoration & Rendering', 1200,1400,200,0,0,'External masonry paint, render repairs, pointing','Masonry paint, render, pointing mortar','Access platform'),
    tp('Phase 5 – First Fix Services','Full Replumb — Plumbing & Heating',2800,3200,0,0,0,'Full replumb hot/cold, new heating system and boiler','Boiler, pipework, radiators, cylinder, valves',''),
    tp('Phase 5 – First Fix Services','Full Rewire — Electrical',       2200,1800,0,0,0,'Full rewire, new consumer unit, all circuits','Consumer unit, cables, back boxes, containment',''),
    tp('Phase 6 – Internal Construction','Stud Partitions & Ceilings',  2200,2800,0,0,0,'New stud partitions, ceiling framing, service drops','CLS stud, ceiling battens, fixings, noggins',''),
    tp('Phase 6 – Internal Construction','Insulation & Plasterboarding',2200,3200,0,0,0,'Wall and ceiling insulation, plasterboarding throughout','Plasterboard, insulation, fire board, acoustic mat',''),
    tp('Phase 6 – Internal Construction','Plastering',                  3200,1200,600,0,0,'Full skim — walls and ceilings throughout','Bonding, finish plaster, beads, scrim','Dehumidifiers for extended dry-out'),
    tp('Phase 7 – Bathrooms & Kitchen','Bathroom & En-Suite Fit Out',   2000,3500,0,0,0,'Bathroom, en-suite, WC fit out including tiling','Sanitaryware, shower, tiling, adhesive, accessories',''),
    tp('Phase 7 – Bathrooms & Kitchen','Kitchen Fit Out',               2200,5500,0,0,0,'Kitchen installation, worktops, appliances','Kitchen units, worktops, appliances, sink, tap',''),
    tp('Phase 8 – Second Fix Services','Second Fix Plumbing & Electrical',3800,3200,0,0,0,'Plumber + electrician second fix throughout','Sockets, switches, lights, controls, sanitaryware fittings',''),
    tp('Phase 9 – Flooring & Decoration','Flooring Throughout',         2400,4500,0,0,0,'Flooring fitter — tiles, engineered, carpet throughout','Tiles, engineered floor, carpet, adhesive, underlay',''),
    tp('Phase 9 – Flooring & Decoration','Full Internal Decoration',    3500,2000,0,0,0,'Decorator — mist coat and full finish throughout','Paint, filler, tape, skirting, architraves, doors',''),
    tp('Phase 10 – External Works & Completion','External Works',       1200,1200,300,0,0,'Patio reinstatement, paths, make good grounds','Paving, gravel, topsoil, turf allowance','Final skip, mini excavator'),
    tp('Phase 10 – External Works & Completion','Snagging & Handover',  500,150,0,0,300,'Snagging, final clean, certification','Touch-up materials','','','Building Control sign-off fee'),
  ],

  // ─── Kitchen Extension ───────────────────────────────────────────────────────
  'Kitchen Extension': [
    tp('Phase 1 – Site Setup & Demolition','Site Establishment',        700,350,700,0,200,'Welfare, site setup, H&S','Hoarding, protection sheets','Scaffold erect/dismantle','','Building Control application'),
    tp('Phase 1 – Site Setup & Demolition','Strip-Out & Demolition',    800,0,300,0,0,'Demolish rear wall and openings, remove existing kitchen','Skip for arisings','Skip hire'),
    tp('Phase 2 – Groundworks & Foundations','Excavation',              1200,0,1100,0,0,'Groundworkers — setting out and excavation','','Excavator, dumper'),
    tp('Phase 2 – Groundworks & Foundations','Concrete Foundations & DPC Blockwork',1100,2000,350,0,0,'Foundation concrete and blockwork to DPC','Concrete, blocks, DPC, mortar','Concrete pump'),
    tp('Phase 2 – Groundworks & Foundations','Underground Drainage & Services',800,1000,150,0,0,'Drainage, inspection chambers, service connections','Drainage pipes, chambers, connectors','Mini excavator'),
    tp('Phase 2 – Groundworks & Foundations','Oversite Preparation & Floor Slab',600,1600,350,0,0,'Hardcore, insulation, DPM, concrete slab','Hardcore, DPM, insulation, slab concrete','Compactor, concrete pump'),
    tp('Phase 3 – Structural Shell','External Walls & Blockwork',       2600,3000,200,0,0,'Bricklayers/blocklayers — cavity walls, lintels','Blocks, facing bricks, insulation, lintels','Mortar mixer'),
    tp('Phase 3 – Structural Shell','Structural Steelwork & Knock-Through',600,2200,400,0,0,'RSJ installation, knock-through to existing house','RSJ steels, padstones, structural fixings','Hiab for steels'),
    tp('Phase 4 – Roof Construction','Roof Structure & Coverings',      1800,2200,300,0,0,'Carpenter/roofer — flat roof structure, EPDM, fascia','Joists, OSB, EPDM/GRP kit, fascia, guttering','Scissor lift'),
    tp('Phase 4 – Roof Construction','Roof Lantern / Rooflight',        350,2200,0,0,0,'Roof lantern or rooflight installation','Roof lantern/rooflight — supply and fit',''),
    tp('Phase 5 – External Envelope','Bifold / French Doors',           500,3200,0,0,0,'Bifold or French door installation','Bifold/French doors — supply and fit',''),
    tp('Phase 5 – External Envelope','Windows',                         350,1600,0,0,0,'Window installation, sealing','Windows — supply and fit',''),
    tp('Phase 6 – First Fix Services','Plumbing & Heating First Fix',   1200,1000,0,0,0,'Plumber — pipework, waste, boiler alteration, UFH','Pipework, waste pipes, UFH kit, manifold',''),
    tp('Phase 6 – First Fix Services','Electrical First Fix',           700,600,0,0,0,'Electrician — cable runs, circuits, islands, back boxes','Cables, containment, back boxes',''),
    tp('Phase 6 – First Fix Services','Ventilation',                    300,300,0,0,0,'Kitchen extraction, ducting, fan wiring','Extractor fan, ducting, grilles, vent cap',''),
    tp('Phase 7 – Internal Construction & Plastering','Insulation & Plasterboarding',1200,1600,0,0,0,'Insulation, plasterboard all surfaces','Rigid insulation, plasterboard',''),
    tp('Phase 7 – Internal Construction & Plastering','Plastering & Dry-Out',1600,600,300,0,0,'Plasterer — full skim, make good existing areas','Bonding, finish plaster, beads','Dehumidifiers'),
    tp('Phase 8 – Kitchen Installation','Kitchen Units & Worktops',     1200,5500,0,0,0,'Kitchen fitter — unit install, worktop template and fit','Kitchen units, worktops (quartz/granite/oak), fixings',''),
    tp('Phase 8 – Kitchen Installation','Appliances & Splashbacks',     600,2800,0,0,0,'Appliance installation, splashback fitting','Oven, hob, hood, dishwasher, fridge, splashback',''),
    tp('Phase 8 – Kitchen Installation','Sink, Tap & Waste',            300,600,0,0,0,'Plumber — sink and tap install, waste connection','Sink, tap, waste trap, pipework',''),
    tp('Phase 9 – Second Fix Services','Second Fix Plumbing & Electrical',1800,1600,0,0,0,'Plumber + electrician second fix, commissioning','Sockets, switches, under-unit lighting, heating controls',''),
    tp('Phase 10 – Flooring & Decoration','Floor Tiling',               800,1600,0,0,0,'Floor tiler — porcelain or stone tile installation','Porcelain/stone tiles, adhesive, grout, silicone',''),
    tp('Phase 10 – Flooring & Decoration','Decoration',                 700,300,0,0,0,'Decorator — mist coat and finish','Paint, filler, tape',''),
    tp('Phase 11 – External Works & Completion','External Paving & Making Good',700,1000,250,0,0,'Patio reinstatement, make good externally','Paving, pointing, topsoil/turf allowance','Mini excavator, final skip'),
    tp('Phase 11 – External Works & Completion','Snagging & Handover',  350,100,0,0,250,'Snagging, clean, handover','Touch-up materials','','','Building Control sign-off'),
  ],

  // ─── Kitchen Fit-Out ─────────────────────────────────────────────────────────
  'Kitchen Fit-Out': [
    tp('Phase 1 – Strip-Out & Preparation','Strip Out Existing Kitchen', 500,0,200,0,0,'Remove existing units, worktops, appliances, flooring','Skip for arisings','Skip hire'),
    tp('Phase 1 – Strip-Out & Preparation','Making Good & Preparation',  400,300,0,0,0,'Make good walls, floor, ceiling; patch plaster','Patching plaster, filler, primer, battens',''),
    tp('Phase 2 – First Fix Services','Plumbing First Fix',              600,500,0,0,0,'Plumber — new pipework positions, waste routes','Pipework, fittings, waste pipes, isolation valves',''),
    tp('Phase 2 – First Fix Services','Electrical First Fix',            500,400,0,0,0,'Electrician — new circuit positions, island sockets, extract','Cables, back boxes, cooker switch, containment',''),
    tp('Phase 2 – First Fix Services','Ventilation',                     250,280,0,0,0,'Kitchen extract fan, ducting to outside','Extractor fan, ducting, external vent cap',''),
    tp('Phase 3 – Tiling & Preparation','Wall Tiling',                  500,600,0,0,0,'Tiler — kitchen wall tiles or splashback','Wall tiles, adhesive, grout, silicone',''),
    tp('Phase 3 – Tiling & Preparation','Floor Tiling',                 600,1000,0,0,0,'Tiler — floor tile installation','Porcelain/stone floor tiles, adhesive, grout',''),
    tp('Phase 3 – Tiling & Preparation','Plastering & Decoration',      600,280,0,0,0,'Patch plaster, mist coat, full decoration','Plaster, paint, filler, tape',''),
    tp('Phase 4 – Kitchen Installation','Kitchen Units',                 1000,4500,0,0,0,'Kitchen fitter — unit installation, levelling, securing','Kitchen unit range, cornice, plinths, fixings',''),
    tp('Phase 4 – Kitchen Installation','Worktops',                     400,1800,0,0,0,'Worktop template, cut and fit','Quartz, granite, oak or laminate worktop',''),
    tp('Phase 4 – Kitchen Installation','Appliances',                   350,2200,0,0,0,'Appliance installation and integration','Oven, hob, extractor, dishwasher, fridge/freezer',''),
    tp('Phase 5 – Second Fix Services','Second Fix Plumbing',           400,350,0,0,0,'Plumber — sink, tap, waste, dishwasher connection','Sink, tap, waste trap, flexi hoses',''),
    tp('Phase 5 – Second Fix Services','Second Fix Electrical',         350,300,0,0,0,'Electrician — sockets, switches, under-unit lighting, certs','Sockets, switches, LED strip, RCBO',''),
    tp('Phase 6 – Completion','Snagging & Handover',                    200,50,0,0,0,'Snagging, final clean, client demonstration','Touch-up materials',''),
  ],

  // ─── Bathroom Fit-Out ────────────────────────────────────────────────────────
  'Bathroom Fit-Out': [
    tp('Phase 1 – Strip-Out','Remove Existing Bathroom',                400,0,150,0,0,'Strip out existing sanitaryware, tiles, floor, ceiling','Skip for arisings','Skip hire'),
    tp('Phase 1 – Strip-Out','Making Good & Preparation',               350,200,0,0,0,'Make good walls, floor, ceiling; cut back to substrate','Patching plaster, filler, primer',''),
    tp('Phase 2 – First Fix Services','Plumbing First Fix',             600,500,0,0,0,'Plumber — reposition/install hot/cold, waste, soil pipe','Pipework, fittings, waste pipes, soil pipe',''),
    tp('Phase 2 – First Fix Services','Electrical First Fix',           400,350,0,0,0,'Electrician — lighting circuit, shaver socket, towel rail','Cables, back boxes, downlight prep',''),
    tp('Phase 2 – First Fix Services','Ventilation',                    250,250,0,0,0,'Mechanical extract ventilation','Fan unit, ducting, external vent grille',''),
    tp('Phase 3 – Waterproofing & Tiling','Tanking & Waterproofing',   350,300,0,0,0,'Waterproof all wet areas — shower, bath surround','Tanking membrane, primer, corner tape',''),
    tp('Phase 3 – Waterproofing & Tiling','Wall Tiling',                700,900,0,0,0,'Tiler — full wall tile installation','Wall tiles (porcelain/ceramic), adhesive, grout, silicone',''),
    tp('Phase 3 – Waterproofing & Tiling','Floor Tiling',               400,600,0,0,0,'Tiler — floor tile installation, level and screed if needed','Porcelain floor tiles, adhesive, grout',''),
    tp('Phase 4 – Sanitaryware & Fittings','Bath / Shower / Wet Room',  600,1800,0,0,0,'Plumber — bath or shower installation, enclosure fit','Bath, shower tray/wet room former, screen/enclosure',''),
    tp('Phase 4 – Sanitaryware & Fittings','WC & Basin',                400,800,0,0,0,'Plumber — WC and basin installation','WC, basin, pedestal/vanity unit, cistern',''),
    tp('Phase 4 – Sanitaryware & Fittings','Accessories & Towel Rail',  200,400,0,0,0,'Fix accessories, heated towel rail','Towel rail, mirror, toilet roll holder, robe hooks',''),
    tp('Phase 5 – Second Fix Services','Second Fix Plumbing',           350,250,0,0,0,'Plumber — taps, wastes, shower, commissioning','Taps, shower valves, wastes, flexi hoses',''),
    tp('Phase 5 – Second Fix Services','Second Fix Electrical',         300,350,0,0,0,'Electrician — downlights, shaver socket, towel rail wiring, certs','Downlight fittings, shaver socket, RCBO, certs',''),
    tp('Phase 6 – Completion','Decoration & Handover',                  300,150,0,0,0,'Decorator — ceiling and non-tiled walls; snagging and clean','Paint, filler; touch-up materials',''),
  ],

  // ─── Garden Room ─────────────────────────────────────────────────────────────
  'Garden Room': [
    tp('Phase 1 – Site Preparation','Site Clearance & Setting Out',     400,150,500,0,0,'Clear area, set out footprint','Protection, stakes, string line','Mini excavator'),
    tp('Phase 1 – Site Preparation','Excavation & Levelling',           700,0,600,0,0,'Excavate and level site for base','','Excavator, dumper'),
    tp('Phase 2 – Foundations & Base','Concrete Foundations or Ground Screw Base',800,1400,300,0,0,'Foundation / ground screw installation and concrete base','Concrete, ground screws or timber post bases, DPM','Concrete pump'),
    tp('Phase 2 – Foundations & Base','Floor Deck or Concrete Slab',   600,1000,200,0,0,'Timber deck frame or concrete slab — floor of garden room','Decking or screed, joists, fixings, DPM, insulation','Compactor'),
    tp('Phase 3 – Structure & Frame','Structural Frame',                1200,2800,0,0,0,'Erect timber or SIP frame structure','Timber frame/SIPs, fixings, DPC',''),
    tp('Phase 3 – Structure & Frame','Roof Structure & Coverings',      800,1600,0,0,0,'Roof joists, decking, EPDM/GRP flat or pitched','Roof structure, EPDM/GRP kit or tiles, felt, battens',''),
    tp('Phase 4 – External Envelope','Cladding & External Finishes',    700,1800,0,0,0,'External cladding, rendering or timber boarding','Cladding boards, render, fixings, treatment',''),
    tp('Phase 4 – External Envelope','Windows & Doors',                 400,3200,0,0,0,'Window and door installation','Windows, glazed door — supply and fit',''),
    tp('Phase 5 – Services & Insulation','Electrical Installation',     800,700,0,0,0,'Electrician — power, lighting, consumer unit or fuse spur','Cables, back boxes, consumer unit/spur, conduit',''),
    tp('Phase 5 – Services & Insulation','Insulation & Internal Lining',700,1200,0,0,0,'Insulate walls/roof/floor, internal boarding','Insulation, plasterboard or timber panelling, vapour barrier',''),
    tp('Phase 5 – Services & Insulation','Optional Plumbing',           400,400,0,0,0,'Plumber — connect water supply and waste if required','Pipework, fittings, waste',''),
    tp('Phase 6 – Internal Fit-Out','Flooring',                        400,800,0,0,0,'Flooring fitter — engineered timber, laminate or vinyl','Engineered floor or vinyl, underlay, adhesive',''),
    tp('Phase 6 – Internal Fit-Out','Decoration & Second Fix',          500,350,0,0,0,'Decorator and electrician — finish, sockets, lights','Paint, sockets, switch, downlights',''),
    tp('Phase 7 – External Works & Completion','Patio / Decking',       600,1200,200,0,0,'Patio or decking outside garden room entrance','Paving or decking boards, mortar/fixings','Mini excavator for patio prep'),
    tp('Phase 7 – External Works & Completion','Landscaping & Completion',400,400,0,0,0,'Make good grounds, turf, snagging, clean, handover','Topsoil, turf, touch-up materials',''),
  ],

  // ─── Landscaping ─────────────────────────────────────────────────────────────
  'Landscaping': [
    tp('Phase 1 – Site Setup & Clearance','Site Establishment',         300,150,300,0,0,'Site welfare, temporary access','Protection materials','Skip hire'),
    tp('Phase 1 – Site Setup & Clearance','Strip-Out & Clearance',      700,0,600,0,0,'Strip existing lawn, remove structures and arisings','Skip for arisings','Mini excavator, skip hire'),
    tp('Phase 2 – Excavation & Groundworks','Bulk Excavation & Levelling',1000,0,1200,0,0,'Bulk dig to levels, grade site','','Excavator, dumper truck hire'),
    tp('Phase 2 – Excavation & Groundworks','Sub-Base Construction',    700,1600,400,0,0,'Hardcore sub-base, sand blinding, compaction','MOT type 1 hardcore, sharp sand, geotextile membrane','Compactor plate'),
    tp('Phase 3 – Drainage & Services','Surface & Underground Drainage',1200,1100,300,0,0,'Install drainage, inspection chambers, soakaways, gullies','Drainage pipes, chambers, soakaway crates, channel drain','Mini excavator for drainage runs'),
    tp('Phase 3 – Drainage & Services','Utility Ducting',               400,300,0,0,0,'Service ducting for lighting and irrigation cables','Ducting, draw wire, inspection pits',''),
    tp('Phase 4 – Patios & Paving','Patio Construction',                1800,3500,300,0,0,'Patio laying — screed bed, lay slabs, pointing','Porcelain or sandstone slabs, mortar, jointing compound','Slab splitter, mixing station'),
    tp('Phase 4 – Patios & Paving','Pathways & Steps',                  600,800,0,0,0,'Pathway laying, step construction','Slabs, setts, steps, edgings',''),
    tp('Phase 5 – Driveways','Driveway Sub-Base & Construction',        1200,2800,500,0,0,'Driveway construction — tarmac, block paving or resin bound','Tarmac/block pavers/resin, sub-base, edging, membrane','Compactor, plate vibrator'),
    tp('Phase 6 – Fencing, Walls & Gates','Fencing',                    1000,1800,150,0,0,'Fence erection — closeboard, post and rail, or hit and miss','Fence panels/boards, posts, concrete, gravel boards','Post hole borer'),
    tp('Phase 6 – Fencing, Walls & Gates','Garden Walls',               900,1600,100,0,0,'Brickwork or block garden walls, coping','Bricks/blocks, mortar, coping stones','Mortar mixer'),
    tp('Phase 6 – Fencing, Walls & Gates','Gates',                      300,1200,0,0,0,'Gate supply and hang — timber or metal','Gate supply, posts, hinges, locks, automation if required',''),
    tp('Phase 7 – Soft Landscaping','Topsoil & Turfing',                800,1400,150,0,0,'Topsoil spread, turf laying','Topsoil, premium turf, edging','Turf cutter/rotavator'),
    tp('Phase 7 – Soft Landscaping','Planting & Beds',                  600,1200,0,0,0,'Planting — shrubs, hedging, perennials; bark mulch','Plants, bark mulch, weed membrane, compost',''),
    tp('Phase 8 – Finishing','External Lighting',                       700,1200,0,0,0,'Electrician — low voltage garden lighting, festoon, pillars','Garden lights, cables, transformer, IP connectors',''),
    tp('Phase 8 – Finishing','Irrigation & Water Feature',              400,600,0,0,0,'Irrigation system or water feature installation','Irrigation heads, timer, pipework, water feature',''),
    tp('Phase 9 – Completion','Final Clean & Handover',                 350,100,200,0,0,'Final clean, remove surplus, client walkthrough','Sundries, touch-up','Final skip'),
  ],

  // ─── New Build ───────────────────────────────────────────────────────────────
  'New Build': [
    tp('Phase 1 – Pre-Construction & Site Setup','Site Establishment & Enabling Works',2000,1200,2400,0,500,'Site welfare, fencing, compound, temporary services','Heras fencing, welfare unit hire, temporary electricity/water','Scaffold erect (initial), site compound','','Planning/BC application fees, structural engineer drawings'),
    tp('Phase 2 – Groundworks & Foundations','Excavation & Setting Out',1800,0,2200,0,0,'Groundworkers — bulk dig, setting out foundations','','Excavator, dumper truck'),
    tp('Phase 2 – Groundworks & Foundations','Concrete Foundations',    2000,3200,800,0,0,'Concrete strip/raft foundations, foundation blockwork to DPC','Concrete (C30), foundation blocks, DPC, reinforcement','Concrete pump'),
    tp('Phase 2 – Groundworks & Foundations','Underground Drainage & Services',1800,3200,600,0,0,'Full drainage system, inspection chambers, service connections','Drainage pipes, chambers, soakaway, service ducting','Mini excavator'),
    tp('Phase 3 – Substructure','Oversite & Ground Floor Construction', 2800,4500,1200,0,0,'Hardcore, insulation, DPM, ground beam or beam and block floor','Hardcore, beam and block/slab, insulation, screed','Concrete pump, compactor'),
    tp('Phase 4 – Superstructure — Walls & Frame','Cavity Walls — Ground Floor',4500,6000,600,0,0,'Bricklayers/blocklayers — ground floor cavity walls','Blocks, facing bricks, cavity insulation, lintels, wall ties','Mortar mixer, material hoist'),
    tp('Phase 4 – Superstructure — Walls & Frame','First Floor Structure & Cavity Walls',3800,5500,400,0,0,'Bricklayers, joists, first floor deck, gable ends','Floor joists, decking, blocks, bricks, lintels','Scaffold lifts'),
    tp('Phase 5 – Roof Structure & Coverings','Roof Carpentry',         2800,3800,300,0,0,'Carpenter — roof structure, trussed rafters or cut roof','Trussed rafters or timber, OSB, breathable membrane','Crane for trusses'),
    tp('Phase 5 – Roof Structure & Coverings','Roof Tiles & Weatherproofing',1800,3000,200,0,0,'Roofer — tile/slate, felt, battens, lead flashings','Tiles/slates, battens, nails, lead flashing, ridge/hip',''),
    tp('Phase 5 – Roof Structure & Coverings','Fascia, Soffits & Guttering',600,800,0,0,0,'Fascia, soffit boards, guttering and downpipes','UPVC fascia, soffits, guttering',''),
    tp('Phase 6 – External Envelope','Windows',                         1500,6500,300,0,0,'Window installation, sealing, temporary weatherproofing','Windows — supply and fit',''),
    tp('Phase 6 – External Envelope','External Doors',                  600,3500,0,0,0,'Front, rear and any French/bifold doors installation','Doors — supply and fit',''),
    tp('Phase 7 – First Fix Services','Plumbing & Heating First Fix',   2800,2800,0,0,0,'Plumber — full first fix hot/cold, waste, heating, boiler','Pipework, boiler, UFH kit, radiators, cylinder',''),
    tp('Phase 7 – First Fix Services','Electrical First Fix',           2200,2000,0,0,0,'Full electrician first fix — all circuits, consumer unit','Consumer unit, cables, back boxes, containment',''),
    tp('Phase 7 – First Fix Services','Ventilation & Ductwork',         600,600,0,0,0,'Ventilation system, extract ducting, MVHR if specified','MVHR or individual fans, ducting, grilles',''),
    tp('Phase 8 – Internal Construction','Insulation & Plasterboarding',3500,5000,0,0,0,'Insulation throughout, plasterboard all surfaces','Cavity/stud insulation, plasterboard, fire board, acoustic mat',''),
    tp('Phase 8 – Internal Construction','Staircase',                   600,2200,0,0,0,'Carpenter — staircase installation, balustrade, handrail','Staircase supply, balustrade, handrail',''),
    tp('Phase 8 – Internal Construction','Plastering',                  4500,1800,800,0,0,'Plasterer — full skim walls and ceilings throughout','Bonding, finish plaster, beads, scrim tape','Dehumidifiers for extended dry-out'),
    tp('Phase 9 – Second Fix Services','Second Fix Plumbing & Heating', 3000,2500,0,0,0,'Plumber — sanitaryware, taps, heating controls, commissioning','Sanitaryware, taps, valves, thermostat, pressure test',''),
    tp('Phase 9 – Second Fix Services','Second Fix Electrical',         2500,2800,0,0,0,'Electrician — sockets, switches, lights, testing and certs','Sockets, switches, fittings, consumer unit, Part P cert',''),
    tp('Phase 9 – Second Fix Services','Second Fix Carpentry',          2000,2200,0,0,0,'Carpenter — skirting, architraves, doors, ironmongery','Skirting, architraves, internal doors, ironmongery',''),
    tp('Phase 10 – Kitchen, Bathrooms & Sanitaryware','Kitchen Fit Out',2000,6500,0,0,0,'Kitchen fitter — unit install, worktops, appliances','Kitchen units, worktops, appliances, sink, tap',''),
    tp('Phase 10 – Kitchen, Bathrooms & Sanitaryware','Bathrooms Fit Out',1800,4500,0,0,0,'Bathroom, en-suite and WC fit out with tiling','Sanitaryware, shower, tiles, accessories',''),
    tp('Phase 11 – Flooring & Internal Decoration','Flooring Throughout',2800,5000,0,0,0,'Flooring fitter — tiles, engineered, carpet throughout','Tiles, engineered floor, carpet, adhesive, underlay',''),
    tp('Phase 11 – Flooring & Internal Decoration','Full Internal Decoration',3200,2000,0,0,0,'Decorator — mist coat and full finish throughout','Paint, filler, caulk, tape',''),
    tp('Phase 12 – External Works & Landscaping','Drainage & External Services',1200,1800,400,0,0,'External drainage connections, manhole, utility entries','Drainage, chamber covers, utility seals','Mini excavator'),
    tp('Phase 12 – External Works & Landscaping','Driveways & Paths',   1200,3500,500,0,0,'Driveway and path construction','Tarmac/block paving/resin, sub-base, edging','Compactor, plate vibrator'),
    tp('Phase 12 – External Works & Landscaping','Soft Landscaping',    800,1500,150,0,0,'Turf, planting, fencing boundary','Topsoil, turf, plants, fence panels',''),
    tp('Phase 13 – Completion & Handover','Snagging & Certification',   1200,500,0,0,600,'Snagging works, final clean, Building Control inspection','Touch-up materials, remediation sundries','','','BC final inspection fee, NHBC warranty, electrical certification, gas safe cert'),
  ],

  // ─── Other ───────────────────────────────────────────────────────────────────
  'Other': [
    tp('Phase 1 – Site Setup','Site Establishment',                     500,250,400,0,0,'Welfare, access, H&S setup, protection','Hoarding, protection, welfare consumables','Skip hire'),
    tp('Phase 2 – Structural Works','Structural Works',                 2500,3000,400,0,0,'Structural labour as required for this job type','Structural materials as required','Plant as required'),
    tp('Phase 3 – Services','First Fix Services',                       1800,1500,0,0,0,'Plumber, electrician first fix','Pipework, cables, back boxes',''),
    tp('Phase 4 – Internal Works','Internal Construction & Plastering', 2200,2500,250,0,0,'Carpenter, insulation, plasterboard, plasterer','Framing, plasterboard, insulation, plaster','Dehumidifiers'),
    tp('Phase 5 – Services & Finishes','Second Fix Services & Decoration',2500,2000,0,0,0,'Plumber, electrician second fix; decorator','Fixtures, fittings, sockets, lights, paint',''),
    tp('Phase 6 – Flooring & External','Flooring & External Works',     1500,2000,300,0,0,'Flooring installation, external making good','Floor finish, external materials','Skip, access platform'),
    tp('Phase 7 – Completion','Completion & Handover',                  500,150,0,0,0,'Snagging, clean, handover','Touch-up materials',''),
  ],
}
