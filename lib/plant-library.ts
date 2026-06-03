// Standard UK construction Plant & Equipment library.
// Seeded into a user's bo_plant_items via the "Load Standard Library" button
// in Back Office → Plant & Equipment. Categories must match PLANT_CATEGORIES.
//
// `cost` is the COST RATE (what it costs us to hire/run, per `unit`).
// charge_rate is auto-derived from cost + markup at seed time.

export interface PlantLibraryItem {
  name: string
  description: string
  unit: 'hr' | 'day' | 'week' | 'item'
  cost: number
  markup?: number      // default 25
  operator?: boolean   // operator typically required
}

export const PLANT_LIBRARY: Record<string, PlantLibraryItem[]> = {
  'Site Setup & Welfare': [
    { name: 'Mobile Welfare Unit (towable)', description: 'Self-contained welfare with toilet, canteen, drying room', unit: 'week', cost: 180 },
    { name: 'Site Office Cabin',             description: 'Portable office / meeting cabin',                       unit: 'week', cost: 90 },
    { name: 'Portable Toilet',               description: 'Single chemical WC, serviced',                          unit: 'week', cost: 25 },
    { name: 'Storage Container 20ft',        description: 'Lockable steel store container',                        unit: 'week', cost: 35 },
    { name: 'Generator 6kVA',                description: 'Towable / standalone site generator',                   unit: 'day',  cost: 45 },
    { name: 'Tower Light',                    description: 'Mobile lighting tower',                                 unit: 'day',  cost: 35 },
    { name: 'Heras Fencing (per 10 panels)',  description: 'Temporary site fencing with feet and clips',           unit: 'week', cost: 30 },
  ],
  'Excavation & Groundworks': [
    { name: 'Micro Excavator 0.8T', description: 'Compact digger for restricted access', unit: 'day', cost: 70 },
    { name: 'Mini Excavator 1.5T',  description: '1.5 tonne tracked excavator',          unit: 'day', cost: 90 },
    { name: 'Mini Excavator 3T',    description: '3 tonne tracked excavator',            unit: 'day', cost: 120 },
    { name: 'Midi Excavator 5T',    description: '5 tonne tracked excavator',            unit: 'day', cost: 170 },
    { name: 'Tracked Dumper',       description: 'High-tip tracked dumper',              unit: 'day', cost: 75 },
    { name: 'Wheeled Dumper',       description: 'Swivel-tip wheeled dumper',            unit: 'day', cost: 70 },
    { name: 'Plate Compactor',      description: 'Forward plate / wacker',               unit: 'day', cost: 30 },
    { name: 'Reversible Wacker Plate', description: 'Heavy reversible compaction plate',  unit: 'day', cost: 55 },
    { name: 'Roller (pedestrian)',  description: 'Twin drum pedestrian roller',          unit: 'day', cost: 60 },
    { name: 'Trench Rammer',        description: 'Trench foot / upright rammer',         unit: 'day', cost: 35 },
    { name: 'Hydraulic Breaker (excavator attachment)', description: 'Breaker attachment for excavator', unit: 'day', cost: 45 },
    { name: 'Auger Attachment',     description: 'Excavator-mounted earth auger',        unit: 'day', cost: 40 },
  ],
  'Concrete & Foundations': [
    { name: 'Cement Mixer (electric)', description: 'Tip-up drum mixer',                  unit: 'day', cost: 25 },
    { name: 'Concrete Pump',           description: 'Boom / line concrete pump',          unit: 'day', cost: 600, operator: true },
    { name: 'Screed Pump',             description: 'Liquid / sand-cement screed pump',   unit: 'day', cost: 250, operator: true },
    { name: 'Power Float',             description: 'Petrol power float / trowel',        unit: 'day', cost: 45 },
    { name: 'Poker Vibrator',          description: 'Concrete poker / vibrating unit',    unit: 'day', cost: 35 },
    { name: 'Concrete Skip',           description: 'Crane-lift concrete pour skip',      unit: 'day', cost: 30 },
  ],
  'Brickwork & Masonry': [
    { name: 'Mortar Mixer',          description: 'Forced-action / paddle mortar mixer', unit: 'day',  cost: 30 },
    { name: 'Material Hoist',        description: 'Scaffold-mounted material hoist',     unit: 'week', cost: 120 },
    { name: 'Brick Saw (bench)',     description: 'Bench-mounted wet brick/block saw',   unit: 'day',  cost: 40 },
    { name: 'Telehandler',           description: 'Telescopic handler / forklift',       unit: 'day',  cost: 130, operator: true },
  ],
  'Structural Steel Installation': [
    { name: 'Acrow Props (per 10)',     description: 'Adjustable steel props',           unit: 'week', cost: 25 },
    { name: 'Strongboy Supports (pair)', description: 'Wall support attachments for props', unit: 'week', cost: 15 },
    { name: 'Hiab / Lorry Loader',      description: 'Crane-mounted delivery lorry',     unit: 'day',  cost: 350, operator: true },
    { name: 'Mobile Crane (small)',     description: 'Compact mobile crane',             unit: 'day',  cost: 700, operator: true },
    { name: 'Genie Material Lift',      description: 'Manual material lift for beams',   unit: 'day',  cost: 60 },
    { name: 'Magnetic Drill',          description: 'Mag-base drill for steel',         unit: 'day',  cost: 35 },
  ],
  'Carpentry & Joinery': [
    { name: 'Chop / Mitre Saw',          description: 'Sliding compound mitre saw',     unit: 'day', cost: 25 },
    { name: 'Table Saw',                 description: 'Site table / rip saw',           unit: 'day', cost: 35 },
    { name: 'Nail Gun + Compressor',     description: '1st-fix nail gun and compressor', unit: 'day', cost: 40 },
    { name: 'Router',                    description: 'Plunge / fixed-base router',     unit: 'day', cost: 20 },
    { name: 'Planer Thicknesser',        description: 'Bench planer / thicknesser',     unit: 'day', cost: 45 },
  ],
  'Roofing': [
    { name: 'Roof / Cat Ladder',        description: 'Roof access / ridge hook ladder', unit: 'week', cost: 20 },
    { name: 'Gas Torch Kit',            description: 'Torch-on felt roofing kit',       unit: 'day',  cost: 25 },
    { name: 'Slate Cutter',             description: 'Guillotine slate cutter',         unit: 'day',  cost: 20 },
    { name: 'Tile Hoist / Conveyor',    description: 'Powered tile conveyor / hoist',   unit: 'day',  cost: 70 },
    { name: 'Edge Protection (per 5m)', description: 'Temporary roof edge guardrail',   unit: 'week', cost: 30 },
  ],
  'Plastering & Drylining': [
    { name: 'Plastering Stilts',        description: 'Adjustable drywall stilts',       unit: 'day',  cost: 15 },
    { name: 'Mixing Paddle & Drill',    description: 'Plaster mixing drill and paddle', unit: 'day',  cost: 20 },
    { name: 'Spray Plaster Machine',    description: 'Plaster / render spray unit',     unit: 'day',  cost: 120 },
    { name: 'Drywall Screw Gun',        description: 'Auto-feed collated screw gun',    unit: 'day',  cost: 15 },
    { name: 'Board Lifter / Panel Hoist', description: 'Plasterboard panel lift',       unit: 'day',  cost: 30 },
    { name: 'Dehumidifier',             description: 'Building dry-out dehumidifier',   unit: 'week', cost: 60 },
  ],
  'Plumbing & Heating': [
    { name: 'Pipe Freezing Kit',        description: 'Pipe freezer for live alterations', unit: 'day', cost: 45 },
    { name: 'Press Fit Tool',           description: 'Battery press-fit jaw tool',      unit: 'day', cost: 55 },
    { name: 'Power Flush Machine',      description: 'Central heating power flush unit', unit: 'day', cost: 60 },
    { name: 'Pipe Threading Machine',   description: 'Steel pipe threading machine',    unit: 'day', cost: 50 },
    { name: 'Drain Cleaning Machine',   description: 'Electric drain / rod machine',    unit: 'day', cost: 55 },
  ],
  'Electrical': [
    { name: 'Cable Rod Set',            description: 'Draw rods for cable runs',        unit: 'day',  cost: 15 },
    { name: 'Multifunction Tester',     description: '18th-edition installation tester', unit: 'week', cost: 70 },
    { name: 'SDS Drill',                description: 'SDS hammer drill',                unit: 'day',  cost: 20 },
    { name: 'Wall / Floor Chaser',      description: 'Twin-blade chasing machine',      unit: 'day',  cost: 45 },
    { name: 'Conduit Bender',           description: 'Conduit bending machine',         unit: 'day',  cost: 20 },
  ],
  'Landscaping & External Works': [
    { name: 'Turf Cutter',     description: 'Powered turf / sod cutter',     unit: 'day', cost: 45 },
    { name: 'Lawn Roller',     description: 'Ballast lawn roller',           unit: 'day', cost: 20 },
    { name: 'Rotavator',       description: 'Petrol rotavator / tiller',     unit: 'day', cost: 40 },
    { name: 'Stump Grinder',   description: 'Self-propelled stump grinder',  unit: 'day', cost: 90 },
    { name: 'Wood Chipper',    description: 'Towable wood chipper',          unit: 'day', cost: 120 },
    { name: 'Brush Cutter',    description: 'Heavy-duty strimmer / brushcutter', unit: 'day', cost: 35 },
    { name: 'Post Hole Auger', description: 'One/two-man post hole borer',   unit: 'day', cost: 40 },
    { name: 'Pressure Washer', description: 'Petrol pressure washer',        unit: 'day', cost: 35 },
  ],
  'Demolition': [
    { name: 'Hydraulic Breaker (handheld)', description: 'Heavy demolition breaker',    unit: 'day', cost: 35 },
    { name: 'Demolition Hammer (electric)', description: 'Electric demolition hammer',  unit: 'day', cost: 30 },
    { name: 'Dust Suppression Unit',        description: 'Misting dust suppression fan', unit: 'day', cost: 50 },
    { name: 'Grab Lorry',                   description: 'Muck-away grab lorry load',   unit: 'item', cost: 280, operator: true },
    { name: 'RSJ / Beam Trolley',           description: 'Steel beam moving trolley',   unit: 'day', cost: 25 },
  ],
  'Access Equipment': [
    { name: 'Scaffold Tower (alloy)',       description: 'Mobile alloy access tower',    unit: 'week', cost: 80 },
    { name: 'Podium Steps',                 description: 'Low-level work platform',      unit: 'week', cost: 25 },
    { name: 'Cherry Picker (trailer)',      description: 'Trailer-mounted boom platform', unit: 'day', cost: 150 },
    { name: 'Scissor Lift (electric 8m)',   description: 'Electric scissor lift',        unit: 'day',  cost: 90 },
    { name: 'Boom Lift (articulated)',      description: 'Articulated boom lift',        unit: 'day',  cost: 220 },
    { name: 'Extension / Step Ladder',      description: 'Ladders and steps',            unit: 'week', cost: 15 },
  ],
  'Lifting Equipment': [
    { name: 'Engine / Folding Crane',  description: 'Workshop folding crane',     unit: 'day',  cost: 25 },
    { name: 'Chain Block / Hoist 1T',  description: '1 tonne manual chain hoist',  unit: 'week', cost: 30 },
    { name: 'Genie Lift',              description: 'Material lift up to 4m',      unit: 'day',  cost: 60 },
    { name: 'Pallet Truck',            description: 'Hand pallet truck',           unit: 'week', cost: 20 },
    { name: 'Gin Wheel & Rope',        description: 'Scaffold gin wheel set',      unit: 'week', cost: 10 },
  ],
  'Cleaning & Finishing': [
    { name: 'Builders Vacuum (M-class)', description: 'M-class dust extraction vacuum', unit: 'day', cost: 30 },
    { name: 'Floor Sander',              description: 'Drum / belt floor sander',       unit: 'day', cost: 45 },
    { name: 'Dust Extraction Unit',      description: 'Air scrubber / dust extractor',  unit: 'day', cost: 40 },
    { name: 'Pressure Washer (electric)', description: 'Electric pressure washer',       unit: 'day', cost: 30 },
  ],
  'Transport': [
    { name: 'Tipper Van',        description: 'Tipper van for muck-away / deliveries', unit: 'day', cost: 75 },
    { name: 'Luton Van',         description: 'Box / Luton van',                       unit: 'day', cost: 65 },
    { name: 'Flatbed Truck',     description: 'Flatbed delivery truck',                unit: 'day', cost: 110 },
    { name: 'Plant Trailer',     description: 'Plant / machinery trailer',             unit: 'day', cost: 40 },
  ],
  'Temporary Protection': [
    { name: 'Correx Floor Protection (roll)', description: 'Corrugated floor protection roll', unit: 'item', cost: 20 },
    { name: 'Dust Barrier / Zip Wall Kit',    description: 'Temporary dust screen system',     unit: 'week', cost: 35 },
    { name: 'Hoarding Panels (per 5)',        description: 'Plywood / ply hoarding panels',    unit: 'week', cost: 40 },
    { name: 'Debris Netting / Sheeting (roll)', description: 'Scaffold debris netting',        unit: 'week', cost: 25 },
    { name: 'Temporary Door Set',             description: 'Lockable temporary doorset',       unit: 'week', cost: 30 },
    { name: 'Corner / Edge Protection',       description: 'Reusable corner / edge guards',    unit: 'week', cost: 15 },
  ],
}
