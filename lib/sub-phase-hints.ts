// "What this covers" for each Back Office sub-phase, in plain words, so the AI quote can tell which sub-phase a piece of work belongs to
// (and which it does NOT). The company's own wording (the "What this covers (for the AI)" box in Phases & Tasks, stored in
// bo_sub_phases.ai_hint) always wins; these are the starting suggestions for the built-in sub-phases. Keyed by canonical id.

const HINTS: Record<string, string> = {
  // External walls (calculators)
  'ew-cav-partial': 'new external cavity wall: facing brick or block outer leaf, cavity with partial-fill rigid insulation, block inner leaf, DPC to wall plate',
  'ew-cav-full': 'new external cavity wall with full-fill mineral wool in the cavity, brick or block outer leaf, block inner leaf',
  'ew-blockwork-100': 'single-leaf 100mm concrete blockwork wall (not a cavity wall)',
  'ew-blockwork-215': 'single-leaf 215mm concrete block wall laid flat (not a cavity wall)',
  'ew-garden-room-timber': 'timber-frame garden room wall',
  'ew-dwarf-wall': 'dwarf / load-bearing wall below floor level',
  'ew-sleeper-wall': 'sleeper wall under a block-and-beam floor',
  'ew-parapet-wall': 'parapet wall at roof edge',
  'ew-solid-brick': 'solid brick external wall, 225mm thick',
  'ew-timber-frame': 'timber-frame external wall',
  // Internal walls
  'iw-stud-partition': 'internal timber stud partition wall',
  'iw-metal-stud': 'internal metal stud partition wall',
  'iw-block-masonry': 'internal blockwork partition wall',
  'iw-party-wall': 'work to party walls, including fire stopping',
  // Roof
  'roof-flat': 'complete flat roof (structure, covering and gutters together)',
  'roof-structure': 'roof structure: flat, mono-pitch, gable or hip roof timbers',
  'roof-covering': 'roof covering: GRP, EPDM, TPO, tiles or slate',
  'roof-rainwater': 'gutters and downpipes',
  'roof-rooflights': 'rooflights, lanterns, roof windows, domes and hatches',
  'roof-fascia-soffit': 'fascias, soffits and barge boards',
  'roof-flashings': 'lead and other flashings, abutments and weathering details',
  // Site setup
  site_scaffold: 'scaffolding erected, hired and dismantled for the job',
  site_hoarding: 'site fencing, hoarding, security and signage',
  site_welfare: 'welfare unit, temporary electric and water, initial site clearance',
  site_access: 'skips, floor and surface protection, temporary access road',
  site_disposal_waste: 'rubbish removal and disposal from site',
  // Plastering and boarding
  'plaster-internal': 'plastering internal walls: skim, hard wall plaster, patching',
  'plaster-ceiling': 'ceiling boarding and plastering or skimming',
  'plaster-drylining': 'plasterboard drylining and metal stud lining to walls (lining, not new masonry)',
  'plaster-external-render': 'rendering the outside of walls: sand and cement, monocouche',
  'plaster-floor-levelling': 'self-levelling compound and screeds to floors',
  'plaster-insulation': 'insulation fixed to walls: PIR boards, internal wall insulation and backing',
  // Structural frame
  'sf-steelwork': 'structural steel beams (RSJs), columns and padstones',
  'sf-timber-frame': 'timber frame and studwork forming the structure',
  'sf-masonry': 'general structural masonry and repairs. Not a new external wall: use the External Walls calculators for that',
  'sf-openings': 'forming openings in existing walls with propping and needles, for example a knock-through',
  // Windows and doors
  'wd-upvc-windows': 'uPVC windows supplied and fitted',
  'wd-aluminium-windows': 'aluminium windows supplied and fitted',
  'wd-ext-doors': 'external doors: front, back, French, bifold and sliding doors',
  'wd-internal-doors': 'internal doors, frames and ironmongery',
  // Drainage
  'drain-underground': 'underground foul and surface water drainage, manholes and sewer connections',
  'drain-above-ground': 'soil and waste pipes above ground, stacks and vents',
  'drain-cap-off': 'capping off, diverting or moving existing drains and services',
  'drain-rainwater': 'rainwater and surface water disposal at ground level: soakaways and drains',
  // Heating, joinery, tiling, decoration
  'plumb-boiler-heating': 'boiler, radiators and the central heating system',
  'join-staircase': 'new staircase and balustrade',
  'join-fitted-furniture': 'fitted wardrobes and bespoke furniture',
  'join-kitchen': 'fitting a kitchen: units, worktops and appliance installation',
  'join-skirting-arch': 'skirting boards, architraves and trim',
  'tile-wall': 'wall tiling in bathrooms, kitchens and splashbacks',
  'tile-floor': 'floor tiling',
  'tile-surface-prep': 'preparing surfaces for tiling: boarding, waterproofing and levelling',
  'deco-internal-walls': 'painting and decorating internal walls and ceilings',
  'deco-specialist': 'specialist finishes: wallpaper, feature walls, decorative plaster',
  'deco-external': 'painting and finishing the outside: masonry paint and woodwork',
  'deco-floor-finishes': 'floor coverings: carpet, vinyl, LVT, laminate and timber flooring',
  // External works
  'ext-excavation-prep': 'excavation and ground preparation for external works',
  'ext-paving-driveways': 'paving, driveways and patios',
  'ext-retaining-boundary': 'retaining walls, fences and boundary walls',
  'ext-soft-landscaping': 'turf, planting, topsoil and soft landscaping',
  'ext-drainage-drainage': 'drainage and services in external areas',
  // Floors and screeds
  'fs-block-beam': 'block and beam ground floor: beams, blocks, grouting and insulation',
  'fs-concrete-slab': 'concrete ground floor slab with hardcore, DPM and insulation',
  'fs-suspended-timber': 'suspended timber floor: joists and decking',
  'fs-insulated-concrete': 'insulated concrete ground floor',
  'fs-screeded-floor': 'sand and cement or liquid screed',
  'fs-ufh-screed': 'screed over underfloor heating',
  'fs-floor-overlay': 'new floor build-up over an existing floor',
  // General preliminaries
  'prelim-projects-manager': "project manager's time on the job",
  'prelim-quantity-surveyor': "quantity surveyor's time",
  'prelim-foreman-supervisor': 'foreman or site supervisor',
  'prelim-general-labourers': 'general labourers on site',
  'prelim-sign-boards': 'site sign boards',
  'prelim-health-safety': 'health and safety: file, signage, first aid and CDM',
  'prelim-parking-permits': 'parking permits and suspensions',
  'prelim-congestion-charge': 'congestion charge costs',
  'prelim-temporary-services': 'temporary electricity, water and toilets',
  'prelim-site-accommodation': 'site cabins and accommodation',
  'prelim-cleaning': 'cleaning on site and the final clean',
  'prelim-fuel': 'fuel costs',
  'prelim-travel-cost': 'travel costs',
  'prelim-insurance-fees': 'insurance, building control and other fees, and compliance costs',
}

/** The suggested "what this covers" for a built-in sub-phase. Room-based electrics, plumbing and demolition ones are worded from their name. '' when there is none. */
export function defaultHintFor(canonicalId: string | null | undefined, name: string): string {
  if (!canonicalId) return ''
  if (HINTS[canonicalId]) return HINTS[canonicalId]
  const n = (name || '').trim().toLowerCase()
  if (canonicalId.startsWith('elec-')) return `electrical first and second fix for the ${n}`
  if (canonicalId.startsWith('plumb-')) return `plumbing and heating pipework and fittings for the ${n}`
  if (canonicalId.startsWith('demo-')) return `demolition and strip-out: ${n}`
  return ''
}

/** What the AI is told for a sub-phase: the company's own wording if it has written some, otherwise the suggestion. */
export function hintForAi(own: string | null | undefined, canonicalId: string | null | undefined, name: string): string {
  const mine = (own ?? '').trim()
  return mine || defaultHintFor(canonicalId, name)
}
