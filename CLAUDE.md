# Small Build Company — Claude Code Instructions

## Phase Structure (REQUIRED — do not change without explicit instruction)

The quote builder uses a two-level hierarchical phase structure that is **job-type dependent**.

### Hierarchy
```
Main Phase (parentPhase)  e.g. "Phase 3 – Structural Shell"
  └── Sub-Phase (phase)   e.g. "External Walls & Blockwork"
        ├── 🔨 Labour
        ├── 📦 Materials
        ├── 🚜 Plant Hire
        ├── 👷 Subcontractors
        └── 📋 Other
```

### Job Types and Their Phase Templates
Each job type has its own default template in `lib/utils.ts` → `JOB_TEMPLATES`:
- **Rear Extension** — 10 main phases, ~30 sub-phases
- **Side Extension** — 10 main phases, ~26 sub-phases
- **Loft Conversion** — 9 main phases, ~20 sub-phases
- **Full Refurbishment** — 10 main phases, ~20 sub-phases
- **Kitchen Extension** — 11 main phases, ~25 sub-phases
- **Kitchen Fit-Out** — 6 main phases, ~14 sub-phases
- **Bathroom Fit-Out** — 6 main phases, ~13 sub-phases
- **Garden Room** — 7 main phases, ~15 sub-phases
- **Landscaping** — 9 main phases, ~17 sub-phases
- **New Build** — 13 main phases, ~28 sub-phases
- **Other** — 7 generic main phases

### Data Model
- `QuotePhase.parentPhase?: string` — main phase group name
- `QuotePhase.phase: string` — sub-phase / category name
- `QuoteItem.itemType` — one of: `'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'`
- `QuoteItem.subcontractors?: number` — specialist subcontract cost
- `QuoteItem.other?: number` — fees, provisional sums, miscellaneous

### Template Helper (`lib/utils.ts`)
```typescript
tp(parentPhase, subPhase, labour, materials, plant, subcontractors=0, other=0,
   labourNotes='', materialsNotes='', plantNotes='', subNotes='', otherNotes='')
```

### AI Generate Phases (`app/api/generate-phases/route.ts`)
The AI prompt asks for `parentPhase`, `phase`, plus all five cost fields per sub-phase.
Response is mapped directly to the typed item structure.

### Rules
1. Every new phase created (via template, AI, or "+ Add Phase" button) must auto-generate all 5 typed rows
2. Legacy saved quotes (3-row format) are auto-converted to 5 rows on load
3. The user can add/edit/remove/rename main phases and sub-phases independently without changing the master template
4. Cost tracking is per sub-phase, per cost type — never aggregate to a single number

## Assembly Calculators (REQUIRED for every new calculator)

Assembly calculators price a Back Office sub-phase from geometry (wall length/height, foundation, etc.).
Built so far: internal stud/metal/block partitions, external cavity walls, 100mm and 215mm blockwork,
timber garden room wall, dwarf wall, sleeper wall (block & beam floor), parapet wall, and the Roof phase's
structure, covering and gutters. Every new one follows the same
pattern, and **is used from Take-off in the same way** — do not invent a different one.

**Electrics (`elec-install`) is the one calculator that is not drawn geometry.** It prices the whole electrical installation room by room,
per point at an electrician's all-in rate (`lib/electrics-units.ts` engine, `lib/electrics-description.ts`, `components/AssemblyElectricsDemo.tsx`).
Rooms start empty (added from a kind of room, which brings its usual points); a situation uplift % applies to points for the job or one room; a
special fitting (chandelier etc.) is an extra install line on top of its point, client-supplied or ours; a room can be priced by the day instead;
whole-house items (consumer unit, testing/certificate, circuits) are separate, only the certificate in the starting price. In Take-off (Electrics
phase) the ⚡ tool places electrical points on the plan (`lib/electric-points.ts`, `app/(app)/takeoff/components/ElectricalPointsPanel.tsx`): they are
kept on ONE Take-off item (`electricsSummary`, id `electrics-summary`, holding `electricPoints`, the calculator's `electricsState` and its priced
`assemblyResult`) so they save with the project, and `planRoomsFromPoints` turns them into room counts that feed the calculator
(`mergePlanRooms` in `lib/electrics-units.ts`: a count follows the plan until typed over). Do not add per-room sub-phases for it.

**Internal decoration (`deco-internal-walls`) is the second room-by-room calculator** (`lib/decoration-units.ts` engine, `lib/decoration-description.ts`,
`components/AssemblyDecorationDemo.tsx`). ONE calculator covers prep, walls and ceilings, woodwork (skirting, architrave, rails), doors and window frames; each
room is sized and each surface says its condition (new plaster / painted good / painted poor / wallpaper) and filling-and-sanding level, because that
changes the price (mist coat, sealer, stripping + steamer hire, filler). Lines and labour tasks are per room and per kind of work; the painter trade is
`'painter'` in `lib/flat-roof-labour.ts`. All rates and hours are samples to check against real jobs. Rooms start empty. In Take-off, Decoration is a task phase: an area drawn there with the Internal decoration sub-phase picked is only a marker and the
calculator card opens like the roof's (`isDecoCalc` in `app/(app)/takeoff/page.tsx`; an item that already carries a flat `taskId` stays a task item). Still to do:
Specialist Finishes and External Painting calculators (Deon unsure on specialist), the AI interview asking about wall condition and prep, and moving Floor
Finishes out of Decoration into an Internal Finishes phase (needs his real Back Office data first).

**Plumbing installation (`plumb-install`) is the third room-by-room calculator**, built on the Electrics pattern (`lib/plumbing-units.ts` engine, `lib/plumbing-description.ts`, `lib/plumbing-wording.ts`, `components/AssemblyPlumbingDemo.tsx`): rooms start empty and are added from a kind of room, which brings its usual fittings (bath, shower, basin, WC, sink, appliance connections, radiators...) priced per fitting at the plumber's all-in rate (category subcontractors); a situation uplift % for the job or one room; special fittings (freestanding bath, wet room, boiling tap...) as an extra install on top; a room can be priced by plumber days; each room says whether the CLIENT or WE supply sanitaryware/taps/radiators (we supply = a PC sum line per fitting); whole-house items (pressure test and commissioning is the only one in the starting price, then stop tap, main, manifold, booster pump). Its state is kept with `useCalcState` (not the electrics-style saved state). In Take-off, the Plumbing & Heating phase is a line phase, but picking the Plumbing Installation (by room) sub-phase makes the item a marker like Decoration (`isDecoCalc` now covers both phases): the calculator card opens as for Decoration. The Heating plant calculator (`plumb-heating-plant`, sub-phase "Heating Plant (by system)", `lib/heating-units.ts`, `lib/heating-description.ts`, `components/AssemblyHeatingDemo.tsx`) prices a gas COMBI boiler itemised (boiler by kW, the Gas Safe engineer's fitting, flue, controls, magnetic filter, chemical clean, moved pipework, old boiler away, commissioning); radiators stay in the plumbing rooms; the older "Boiler & Heating System" sub-phase stays for system boilers, cylinders and heat pumps until the calculator covers them. The Underfloor heating calculator (`plumb-ufh`, sub-phase "Underfloor Heating", `lib/ufh-units.ts`, `lib/ufh-description.ts`, `components/AssemblyUfhDemo.tsx`) is WATER underfloor heating priced zone by zone (area, how the pipe is laid, spacing, distance to the manifold): pipe, loops kept to about 100m, floor fixing, manifold, actuators, thermostats, mixing group, installer fitting and commissioning; the floor insulation, edge strip and the screed over it are the Screeded Floor calculator, electric mats are the Electric Underfloor Heating calculator in Tiling & Finishes, the heat source is the Heating plant calculator. The Pipework runs calculator (`plumb-pipework`, sub-phase "Pipework Runs", `lib/pipework-units.ts`, `lib/pipework-description.ts`, `components/AssemblyPipeworkDemo.tsx`) prices pipe by the run (cold, hot, heating flow and return pair, gas, waste, soil: size, material, length, route, optional lagging) at the installer's all-in £ per metre with a route factor and the job situation uplift, plus isolation valves, boxing and a pressure test; it is for the lengths a fitting's all-in price in the room calculator does not cover, so use it alongside, not instead of, the room fittings (typed lengths only: a Take-off line length does not feed it yet). The AI quote prices all four plumbing calculators (`lib/plumbing-ai.ts` checks what the AI heard, `components/ai-plumbing-pricing.ts` prices it and hands back the calculator's `calcState` so the quote opens it as priced, wired in `app/(app)/new-quote/page.tsx` and the prompt in `app/api/scope-to-quote/route.ts`; the AI puts what it heard in a "calc" object, never inventing a room, area or length: a zone without an area or a run without a length is left out, a named room with no fittings gets the usual set and is said so in the review note). Still to do: system boiler with an unvented cylinder and heat pump options in the heating calculator, pipework runs, and the AI quote pick-up (nothing in `scope-to-quote` knows plumbing rooms yet), and the Take-off plan placement of fittings like the electrical points.

**Drainage & Services — Underground Drainage (by run)** (`drain-runs`, `lib/drain-units.ts`, `lib/drain-description.ts`, `suggestUndergroundDrainageLabour` in `lib/flat-roof-labour.ts`, `components/AssemblyDrainageDemo.tsx`) is a new sub-phase beside the existing task-based Drainage sub-phases (untouched, Deon chose this): runs of drain (use, size 110/160/225, length, average trench depth, dug by machine or hand, surface crossed) give the trench, pipe, granular bed and surround, backfill and soil away (or imported backfill), trench support past 1.2m deep and the surface put back; the digger is priced in days on site like the foundations (`DiggerOnSiteSection`); chambers, manholes, rodding eyes, connections (a sewer connection is a provisional sum) and a CCTV survey are counted for the job. In Take-off, Drainage & Services is a marker phase like Decoration and Plumbing (`MARKER_CALC_PHASES`): pick the sub-phase on a line and the calculator opens; the lengths are typed in the calculator, a drawn line length does not feed it yet. The Soakaway & Rainwater calculator (`drain-soakaway`, `lib/soakaway-units.ts`, `lib/soakaway-description.ts`, `suggestSoakawayLabour`, `components/AssemblySoakawayDemo.tsx`) sizes a soakaway from the roof and paving that drain to it (all the roof, 80% of paving, times a depth of rain to hold, 20mm to start; or the designer's own storage) and builds it from crates, a stone-filled pit or concrete rings, with the hole, geotextile, silt chamber, soil away and the digger in days; channel drains, yard gullies, downpipe connections and water butts are counted alongside. The pipes from downpipes to the soakaway are surface water runs in Underground Drainage, not here. The Services Connections calculator (`drain-services`, `lib/services-units.ts`, `lib/services-description.ts`, `suggestServicesLabour`, `components/AssemblyServicesDemo.tsx`) prices a service per supply (water, gas, electricity, telecoms; a new connection, a diversion or a cap-off): the utility company's own charge is a provisional sum (typed over per service), and the builder's part is the trench, the duct or pipe, sand bed, warning tape, backfill, reinstated surface and meter box, with the digger in days on site. The AI quote prices all three (`lib/drainage-ai.ts` checks what the AI heard, `components/ai-drainage-pricing.ts` prices it with the calculator's own engine, labour suggestions and digger days and hands back the `calcState`, wired in `new-quote/page.tsx` beside plumbing, prompt in `lib/drainage-ai.ts` `drainagePromptGuide`): a run without a length, or a soakaway with no roof or paved area, is left out, never invented; an unstated trench depth (900mm) or service trench length is said in the review note. Still to do in this phase: septic tanks and treatment plants.

**Demolition — Wall Removal / Knock-Through** (`demo-wall-removal-calc`, `lib/wall-removal-units.ts`, `lib/wall-removal-description.ts`, `suggestWallRemovalLabour`, `components/AssemblyWallRemovalDemo.tsx`) prices taking out a wall or knocking through from the length, height, thickness and kind of wall (stud, block, brick, cavity): rubble and skips, making good and a floor patch, and for a load-bearing wall the props and needles, an indicative steel beam sized from the span (the engineer designs the real one), padstones, boxing in, the engineer fee and a Building Control sum. Demolition keeps its own item fields (`demo*`) but its Construction Type list now FOLLOWS BACK OFFICE like every other phase (`liveDemoSubs` in Take-off: the Back Office Demolition sub-phases and tasks, names, order, prices, markups, only what is kept; a standard entry keeps its old id `structural`, `wall-removal-calc` ... from its canonical_id `demo-…` so saved items still find it). `DEFAULT_DEMO_SUBPHASES` in `lib/demolition-data.ts` is only the seed Back Office creates from and the fallback when Back Office has no Demolition sub-phases. A `DemoSubphase` with a `calculatorId` (and no tasks) is a calculator entry; a new line starts on the first sub-phase that has tasks. Picking it in Take-off (`demoCalcSub`, `isDemoCalc`, `applyDemoCalc`) makes the drawn line's length the length of wall removed; its Back Office sub-phase is `demo-` + the entry id, so the quote can reopen it. Three more Demolition calculators sit beside it the same way (calculator entries last in `DEFAULT_DEMO_SUBPHASES`): **Strip-Out by Room** (`demo-strip-out-calc`, `lib/strip-out-units.ts`, `lib/strip-out-description.ts`, `suggestStripOutLabour`, `components/AssemblyStripOutDemo.tsx`: rooms start empty and are added from a kind of room, which brings its usual items for that size; each item (floor/ceiling/wall finishes, skirting, doors, fireplace, kitchen units, sanitaryware, radiators) has labour hours and waste volume, plus dust protection, plumber/electrician disconnection and an asbestos survey count; skips follow from the total waste), **Waste & Skips** (`demo-waste-skips-calc`, `lib/waste-units.ts`, `lib/waste-description.ts`, `suggestWasteLabour`, `components/AssemblyWasteDemo.tsx`: waste by kind, general/inert/soil/plasterboard/timber/metal/green, each with its skip size and fill, optional grab lorry for heavy waste, hazardous loads and road permits as counted lines) and **Outbuildings & External** (`demo-external-calc`, `lib/external-demo-units.ts`, `lib/external-demo-description.ts`, `suggestExternalDemoLabour`, `components/AssemblyExternalDemoDemo.tsx`: garages, sheds, outbuildings, hard surfaces, walls and fences, with the base broken out by mini excavator or by hand, rubble and general skips or a grab lorry, and an asbestos roof as a provisional sum). Their lengths and areas are typed in the calculator, a drawn line does not feed them. The AI quote prices all four (`lib/demolition-ai.ts` checks what the AI heard, `components/ai-demolition-pricing.ts` prices it, same wiring as drainage and plumbing, instructions in `demolitionPromptGuide`, hints in `lib/sub-phase-hints.ts` so the AI picks the calculator line instead of the older demolition task lines for that work): one wall only for the wall calculator, a wall with no length, waste with no volume or a building with no area is left out; a room named with no items gets the usual items at a typical size and says so; an unstated wall kind (solid brick, so load-bearing with a beam) is said in the review note. Nothing in Demolition is still to do except Take-off passing a drawn length to the other three.

**Plastering & Boarding — Internal Plastering & Boarding (by room)** (`plaster-rooms`, `lib/plaster-units.ts` engine, `lib/plaster-description.ts`, `suggestPlasterLabour` in `lib/flat-roof-labour.ts`, `components/AssemblyPlasterRoomsDemo.tsx`) is the fourth room-by-room calculator, built on the Decoration/Strip-Out pattern: rooms start empty and are added from a kind of room (size, doors, windows), and each wall and ceiling says what it gets (a skim over existing board or plaster with or without a bonding coat, two-coat wet plaster to masonry, plasterboard dot-and-dabbed to masonry or fixed to studs/joists and skimmed, new board over an old ceiling, or board taped and jointed only), with beads (from the windows unless typed), coving and access hatches; board, plaster bags, adhesive and sundries come from the areas and sample coverages, the plasterer's hours (trade kind `renderer`, "Plasterer / renderer") from the areas times a rate, a labourer at 20% of those hours, a situation uplift (occupied house, hard to reach) for the job or one room, an optional access tower. New rooms start with dot-and-dab walls and board-and-skim ceilings (changeable in the calculator for the next room added). Vaulted ceilings are NOT here (their tasks stay in Ceiling Plastering & Boarding, and the vaulted-ceiling reminder still looks for them); partitions are Internal Walls; floor screeds are Floors & Screeds. **External Render (by wall)** (`plaster-render`, `lib/render-units.ts`, `lib/render-description.ts`, `suggestRenderLabour`, `components/AssemblyRenderDemo.tsx`) is the wall-by-wall sibling: each wall (an elevation) has a length, height, windows, doors and any gable above the eaves (area = length x height + gable, less openings, plus the reveals put back), a render system (sand and cement scratch and float coats, monocouche on a scratch coat, or thin-coat silicone on a mesh base coat), what it goes onto (new masonry, existing render cleaned and keyed, painted masonry with a bonding coat), beads (worked out from the corners, base and reveals unless typed), movement joints and an optional masonry paint over sand and cement; a labourer at 25% of the plasterer's hours, a situation uplift (from scaffold, hard to reach), and SCAFFOLD ONLY when ticked (off by default: it is usually priced once under Site Setup, so ticking it double counts). From Take-off the drawn line's length is the first wall's length (it follows the line, like Wall Removal) and the card shows Length, not Marker (`_lengthFedCalc`). External wall INSULATION systems are not in it yet. **Wall Insulation & Backing (by wall)** (`plaster-insul-wall`, `lib/wall-insulation-units.ts`, `lib/wall-insulation-description.ts`, `suggestInsulationLabour`, `components/AssemblyWallInsulationDemo.tsx`) is the third calculator in the phase, wall by wall like the render and with the same drawn-length feed (`_lengthFedCalc` covers both): each wall (length, height, windows, doors, less openings) gets PIR insulated plasterboard fixed to the wall, PIR between timber battens with plasterboard over, or mineral wool between a stud lining with plasterboard over, at a chosen thickness (the room gets smaller by the thickness, shown per wall), an optional taped vapour control layer (on by default for batten and stud linings, with a warning when it is off), insulated reveals, expanded metal lath to steelwork or soffits (typed m²) and timber backing for heavy fixings (typed lm, a carpenter's hours); a labourer at 20% of the fixers' hours and a situation uplift. The SKIM over the board is the Internal Plastering & Boarding calculator, not this one, and it always warns to have the condensation risk assessed and the wall checked for damp. EXTERNAL wall insulation (boards outside under the render) is not built. The AI quote prices all three plastering calculators (`lib/plaster-ai.ts` checks what the AI heard, `components/ai-plaster-pricing.ts` prices it with each calculator's own engine and labour and hands back the `calcState`, same wiring as plumbing, drainage and demolition, instructions in `plasterPromptGuide`): a render or insulation wall with no stated length (or lath/backing), is left out and windows or doors not mentioned are not counted, never invented; a room named with no size gets its kind's typical size and one with no finish gets dot-and-dab walls and a board-and-skim ceiling, both said in the review note; an unstated render system (monocouche) or insulation lining and thickness is said too. The AI is told vaulted ceilings stay on their own task lines. Still to do in this phase: EWI render systems. In Take-off, Plastering & Boarding is a line phase priced by Finish Type (build-ups, wall height, openings) as before, and is now also in `MARKER_CALC_PHASES`: a "Priced by" choice on a plaster line (or the Sub-Phase picked before drawing) switches that line to the room calculator, which opens from the card like Decoration, with a way back to Finish Type (`_plasterCalc` in `app/(app)/takeoff/page.tsx` keeps the Finish Type, wall height and build-up UI off while the calculator prices the line).

**Tiling & Finishes — four room-by-room calculators** (shared pieces: `lib/tiling-common.ts` room kinds, job situations, tile sizes, layouts, grouts and the grout-weight formula; `lib/tiling-description.ts` the words for all four; `components/TilingCalcFrame.tsx` the body they share — header, quote line and full description that follow the rooms until edited, error banner, labour, misc materials, profit, breakdown — plus `TileSpecFields`; `suggestTilingLabour` and the `tiler` trade kind in `lib/flat-roof-labour.ts`). Each is built on the plastering by-room pattern: rooms start empty and are added from a kind of room, a job situation uplift (a room can override it), a labourer at 10-15% of the hours, a profit margin that is the sub-phase's markup. **Floor Tiling (by room)** (`tile-floor-rooms`, `lib/tile-floor-units.ts`, `components/AssemblyTileFloorDemo.tsx`): floor area less the floor under fixed things, a tile size (mosaic to 600x1200 and planks) and layout (straight, brick, diagonal, herringbone: waste and tiler time), our supply at an allowance £/m² or the client's own (no tile line), flexible or standard adhesive, grout (cement/flexible/epoxy, kg from the tile and joint), thresholds, tiled skirting, movement joints, sealing, with a warning for large tiles on a floor that may not be flat and for rooms over 8m with no movement joint. **Wall Tiling (by room)** (`tile-wall-rooms`, `lib/tile-wall-units.ts`, `AssemblyTileWallDemo.tsx`): each room has tiled AREAS (bath surround, shower walls, splashback, or "all the walls": length x height less a deduction), a tile spec per room, edge trim worked out from the areas that stop short of the ceiling, external corners, niches and silicone from the areas. **Tiling Preparation (by room)** (`tile-prep-rooms`, `lib/tile-prep-units.ts`, `AssemblyTilePrepDemo.tsx`): per room the floor (primer, self-levelling compound to a depth, tile backer board or a decoupling mat, tanking with a 150mm upstand), each wall area (backer board 6/10mm foam or 12.5mm cement board, stud-fixed or bonded to masonry, tanked or not) and the ceiling (moisture-resistant plasterboard taped and jointed, or backer board to be tiled); liquid or sheet waterproofing with tape from the corners, collars and waste cuffs; it warns when a tanked wall has no backer board. The ceiling board is the plasterer/dryliner (trade kind `renderer`), everything else the tiler. **Electric Underfloor Heating** (`tile-ufh-electric`, `lib/tile-ufh-units.ts`, `AssemblyTileUfhDemo.tsx`): Deon decided electric mats belong HERE and not in Electrics (this replaces the old note); heated area = floor less fixed things less a 5cm margin round the walls, mats chosen from standard sizes (150 or 200 W/m²; `fitMats` takes the biggest that fits, again and again) or loose cable for awkward shapes, one thermostat with sensor per room, insulation board under the mat, primer, optional levelling over the mat, and the electrician's connection as a SUBCONTRACT line per thermostat (first £185, then £95; one tick turns it off for the client's own electrician and the quote says so); it warns over 3kW a room, with no insulation and when a mat leaves 0.5m² or more unheated. WATER underfloor heating stays under Plumbing. In Take-off, Tiling & Finishes is in `MARKER_CALC_PHASES` like Decoration: picking one of the four sub-phases on an area drops the flat task and the card opens the calculator (a marker; every size is typed). All rates and hours are samples to check against real jobs. Still to do: AI quote pick-up for the four, Take-off feeding a drawn area into a room, and a wall-tiling zone list shared with preparation (they are separate saved states today).

**Pitched roof structure extras** (gable, hip, mono-pitch; shared in `lib/roof-extras.ts`, `lib/roof-extras-layers.ts`, `components/RoofExtras.tsx`): a VAULTED ceiling (no ceiling joists, a ridge beam instead of a ridge board, never the insulation or plasterboard, which are priced under Plastering & Boarding as the "Vaulted ceiling" tasks; the saved phase carries `vaultedCeiling` and the quote shows `VaultedCeilingReminder` until a vaulted line exists elsewhere), and an end/high edge that JOINS AN EXISTING ROOF (`roof-abut` goes up onto the slope, `roof-valley` ridge runs into it with valleys, `roof-over` built over part of it; the mono-pitch has abut and over only). The structure side prices the bearer, ties, valley rafters, trimmers, opening up and protection; the covering side (lead flashing, valley lead, tiling made good) is in the pitched covering calculator, which has its own copy of the end/high-edge choices. A join end counts as an existing wall for the rafters, wall plates and straps.

**Floors & Screeds** is a shape (the floor's footprint), sized from the drawn AREA and PERIMETER (`externalAreaM2` / `externalPerimeterM`, from `drawnAreaPerimeter` in Take-off). Built so far: the screeded floor (`fs-screeded-floor`, `lib/screed-floor.ts`, `components/AssemblyScreedFloorDemo.tsx`), paired with the Build-Up Type `screeded_floor` in `WALL_MAKEUP_TO_SUBPHASE_CANONICAL` and listed in `FLOOR_SHAPE_CALCS` in Take-off. The screeding firm is a SUBCONTRACT rate per m² worked out from the thickness and the volume (laying charge + per m³), with their materials, pump and machinery included and a minimum charge; our own lines are the insulation, membrane, edge strip and mesh, with labour only for fitting those. Underfloor heating is NOT built here: Deon decided its pipework and manifold belong under Plumbing (a UFH floor's screed is just the Screeded Floor calculator with liquid screed). The existing floor overlay (`fs-floor-overlay`, `lib/floor-overlay.ts`, `components/AssemblyFloorOverlayDemo.tsx`, Build-Up Type `floor_overlay`) is built too: self-levelling compound (bags from area, depth and 1.7kg per m² per mm, with primer and edge strip) or a plywood overlay, all our own materials and labour, no subcontract line. The concrete slab floor (`fs-concrete-slab`, `lib/concrete-slab-floor.ts`, `components/AssemblyConcreteSlabFloorDemo.tsx`, Build-Up Type `concrete_slab`) is built: optional dig-out (digger days/fuel/delivery via `lib/digger-on-site.ts` plus spoil away), hardcore, blinding, membrane, insulation under the slab, mesh, edge strip, ready-mix concrete (lorry, pump or barrow via `lib/concrete-placing.ts`) and an optional power float; a screed on top is priced with the Screeded Floor calculator, not here. The block and beam floor (`fs-block-beam`, `lib/block-beam-floor.ts`, `components/AssemblyBlockBeamFloorDemo.tsx`, Build-Up Type `block_beam`) is built: beams priced per lm at centres across the drawn floor (the span follows the shorter side of a rectangle with the drawn area and perimeter, `sidesFromAreaPerimeter`, until typed over), infill blocks and grout, DPC under the beam ends, insulation, membrane, edge strip, a lorry crane for the lift, and optional hardcore/blinding and dig-out; the sleeper walls and their vents are priced under External Walls and the screed in the Screeded Floor calculator, neither here. The suspended timber floor (`fs-suspended-timber`, `lib/suspended-timber-floor.ts`, `components/AssemblySuspendedTimberFloorDemo.tsx`, Build-Up Type `suspended_timber`) is ONE calculator for a ground floor (void, sleeper-wall rows worked out from the span and joist, wall plates on DPC, optional gravel/concrete ground cover), an upper floor and a loft floor (room or storage-only): the kind picks the loads (the flat roof span chart at floor loads, `FLOOR_KINDS`), default joist depth, insulation and whether joists bear on plates or hang in hangers. Sleeper walls and vents are priced under External Walls, the ceiling under an upper/loft floor under Plastering & Boarding, neither here. The insulated concrete floor (`fs-insulated-concrete`, Build-Up Type `insulated_concrete`) is the SAME screen as the concrete slab, `AssemblyConcreteSlabFloorDemo` with `variant="insulated"` (its own saved state and name, starting with 150mm of insulation under a 100mm slab, and its words say insulated and high-performance PIR). Every structural floor in this phase is now built; what is left is the AI quote and Back Office pick-up if wanted.

**Strip foundation and trench fill (`fnd-strip`, `fnd-trench-fill`, one engine `lib/strip-foundation.ts`, screen `AssemblyStripFoundationDemo.tsx`)**: the wall up to the DPC now defaults to two 100mm block leaves with the cavity filled with concrete, built in COURSES (`coursing` on the input; brick course 75mm, block course 225mm, so 3 brick = 1 block): facing brick splash courses at the top of the outer leaf (default 3), block under them (worked out by default, or typed), the inner leaf block to the DPC. The courses decide the wall height: a shortfall to the DPC level is made up in the concrete thickness (never a low DPC), courses taller than the space put the DPC higher (both warned, and the DPC under 150mm above ground warns), and the section drawing shows every course with its dimensions. A saved calculator that was solid 215mm flat blocks stays that way; without `coursing` the engine is exactly as before (tested). The AI quote prices the new default (cavity, 3 brick courses).

**Cavity wall openings** (`calculateCavityGeometry` in `lib/assembly-calc.ts`, screen `AssemblyCavityWallDemo.tsx`): each opening is a window, door, BI-FOLD DOOR (starts 3000 x 2100 to the floor under a steel beam) or custom, with its own lintel: steel cavity lintel, two concrete lintels, concrete + angle, or a specified STEEL BEAM (a section from `STEEL_BEAM_SIZES`, priced per metre including 150mm bearing each end, with two padstones and a cavity tray; the section is the designer's, the calculator only prices it). An opening over 2.4m under a standard lintel warns. Every opening gets cavity closers down both jambs (`closerLm`) and, unless switched off, its INSIDE REVEALS finished: returns of plasterboard (with adhesive for dot-and-dab) or plaster over both jambs and the head at a typed depth (150mm), with angle bead and stop bead (`revealLm`, `revealAreaM2`). A cill or window board is not counted. The AI quote prices the same.

**A calculator's profit % is the sub-phase's margin, not a cost row.** When a calculator is saved into a quote (Save & Price, the AI quote, or Take-off
import) its "Profit (n%)" line is dropped from the quote items and its % is stored on the sub-phase as `QuotePhase.markupPct`; `calcPhaseSell` (and every
item-level sell) uses `phaseMarkup(p, quoteMarkup)`, so a calculator sub-phase takes ITS margin instead of the quote's overall markup (no double profit).
Margin means "% added on top of cost", shown as Cost (ex VAT) / Margin n% on cost / Sell (ex VAT). Never show a client the margin: client-facing views
go through `lib/client-items.ts` (folds any old "Profit" rows into the other rows and drops calculator cost-rate notes).

**Build it**
1. Engine: its own pure module — in `lib/assembly-calc.ts` for a wall/roof costed from drawn geometry
   (geometry + `calculate…Cost`, reusing `costLayer`; add its quantity-source type to the
   `AssemblyQuantitySource` union), or its own `lib/<name>-units.ts` for a calculator priced from a list of
   items rather than a drawn length/height (see `lib/rooflight-units.ts`: `priceRooflightItem` for one item's
   parts, a `resolve…Materials` that combines several into lines, `costLayer` called directly with
   `layer.fixedQty` as the raw quantity — no geometry object to thread through). A companion `lib/<name>-labour.ts`
   / `lib/<name>-description.ts` may live alongside an engine that already has one (`lib/flat-roof-labour.ts`,
   `lib/flat-roof-description.ts`) rather than each calculator inventing its own. Hand-work the numbers and
   test the engine (`node file.mts` with `file:///` import URLs) before building the screen.
   **Every `lib/*-description.ts` and `lib/*-labour.ts` module takes only *type* imports from the engine file
   it describes/costs** (`import type { … } from './x-units'`), never a runtime value import — this repo's
   extension-less relative imports (`moduleResolution: "bundler"`) can't be resolved by plain Node at
   `node --experimental-strip-types` test time, only by the bundler. If a description/labour function needs a
   label map or a pricing function from the engine, give it its own small local copy (see `KIND_LABEL` in
   `lib/rooflight-description.ts`, `KIND_PHRASE` in `lib/flat-roof-description.ts`) or have the caller (the
   screen, which has no such constraint) pass the already-computed numbers in.
2. Screen: `components/Assembly<Name>Demo.tsx`, props `{ onClose?, onSave?, labourTrades?, externalLengthMm? }`,
   built from `components/assembly-ui.tsx`. Must have: the materials print/CSV list (`MaterialsListButtons`),
   sample rates editable per line, labour section, misc materials, waste/profit, a quote description, and a
   drawing. An engine error is shown as a **banner above the controls — never instead of them** (typing a
   value digit by digit passes through invalid ones, and the controls must stay to correct it).
   **Defaults**: profit margin defaults to **20%** (`useState(20)` for `profitPct`), not 0. Optional extras the
   job may not have (rooflight openings, and anything similar in future calculators) start **empty/off** —
   never pre-seeded with a sample one — so the price starts at what's actually there and the estimator adds
   what the job needs. Every named block of properties (Build-up, Joists, Edges, Foundation, Piers, ...) is a
   `CollapsibleSection` (`components/assembly-ui.tsx`) — **collapsed by default**, so the panel opens showing
   only the length/height and the section headings, not every control at once. Never use a plain `<div>` +
   heading for a properties block again.
   Back Office's own **Assemblies list** (`app/(app)/back-office/components/SectionAssemblies.tsx`) follows the
   same rule: every phase group starts collapsed, whether or not it has a built calculator — don't special-case
   "phases with a built assembly start open" again.
   **Quote description is two-tier**: `onSave` passes a short one-line `description` (becomes the phase's
   `taskName`, printed everywhere) and may pass a full part-by-part `detail` (becomes `QuotePhase.scopeDetail`,
   shown on the online/HTML quote behind a "What's included" toggle and on paper only if "full descriptions"
   is ticked). Write both with pure functions in `lib/<name>-description.ts` (see `lib/flat-roof-description.ts`:
   `describeFlatRoofShort` / `describeFlatRoof`, tested) so they follow the inputs until hand-edited — never a
   snapshot taken when the calculator opens. `detail` is optional; a calculator with only `description` is fine.
3. Register: id in `lib/built-assembly-ids.ts` (`BUILT_ASSEMBLY_CANONICAL_IDS`), icon glyph + entry in
   `lib/built-assemblies.tsx`, and the sub-phase itself in `lib/phase-tasks.ts` (an existing sub-phase is just
   registered; a new one gets an entry in the right sub-phase array).

**How Take-off uses it (already wired — registering is enough for walls)**
- The calculator NEVER renders inline in Take-off's ~300px properties panel. The panel shows a summary card
  (name, length, price, "Open calculator"); the calculator opens full size in a window over the drawing
  (`AssemblyItemPanel` in `app/(app)/takeoff/components/AssemblyWindow.tsx`, called via `renderAssemblyPanel`).
  It opens from the button, a Schedule row click, or double-clicking the wall. Save & Price closes it.
- `resolveBuiltAssembly` (Take-off `page.tsx`) decides whether an item has a calculator. External walls:
  the item's `taskSubphaseId` first, then its Build-up Type via `WALL_MAKEUP_TO_SUBPHASE_CANONICAL`
  (`lib/built-assembly-ids.ts`). If the new calculator pairs with an existing Build-up Type, add that pairing;
  if it has none, it appears automatically in the Build-up Type dropdown's "Calculators" group. Internal walls
  resolve through the sub-phase picker.
- A Sub-Phase picked in the panel *before* drawing carries onto the drawn wall (the queued-element effect in
  `page.tsx`); a calculator sub-phase hides the empty Task dropdown and shows a note instead.
- Phases wired so far: External Walls, Internal Walls and **Roof**. **The roof is priced in its own sub-phases,
  one calculator each, never one big screen**: `roof-structure` (Roof Structure — a roof type drop-down; flat,
  mono-pitch/lean-to, gable and hip are all built, each its own calculator behind it), `roof-covering`
  (Roof Coverings — a family drop-down; flat GRP/EPDM/TPO with trims built, and pitched tiles/slate now too),
  `roof-rainwater` (Gutters &
  Downpipes), `roof-rooflights` (Rooflights & Dormers — the glazed units/hatches themselves: lantern, roof
  window, fixed flat rooflight, dome, hatch; its own module `lib/rooflight-units.ts` + `lib/rooflight-description.ts`,
  no drawn geometry, no items pre-added — see the calculator defaults rule above), `roof-fascia-soffit`
  (Fascias, Soffits & Barge Boards — sized from the drawn bounding box like structure/covering/gutters, with
  its own Edges classifying each of the four sides as eaves/verge/none; `lib/fascia-soffit-units.ts` +
  `lib/fascia-soffit-description.ts`), and the parapet wall is `ew-parapet-wall` under External Walls (a line,
  like any wall). The three flat-roof parts are
  `AssemblyFlatRoofDemo` with a `part` prop ('structure' | 'covering' | 'gutters'; 'complete', the old
  all-in-one `roof-flat`, is kept only until it's retired) — each shows only its own inputs, layers, labour
  (`suggestFlatRoofLabour(…, scope)`) and description (`describeFlatRoof(…, part)`), and the parts' totals add
  up to the complete roof's. Mono-pitch/lean-to structure is its own component, `AssemblyMonoPitchRoofDemo.tsx`
  (engine `lib/mono-pitch-roof.ts`, description `lib/mono-pitch-roof-description.ts`, labour
  `suggestMonoPitchRoofLabour` in `lib/flat-roof-labour.ts`) — rafters, a wall plate at the low (eaves) wall
  always, and a ledger+hangers or a wall plate+straps at the high wall (the same choice the flat roof offers
  at an existing wall), with a Swap button for length/span if the roof was drawn the other way round. Its
  rafter section reuses the flat roof's own span chart (`lib/flat-roof-joist-spans.ts`,
  `checkFlatRoofJoist`/`flatRoofSpanChart`), passing the roof's true sloped rafter length in as the span,
  rather than duplicating the span-chart physics. It also has its own roof-window openings — trimmed rafters
  (doubled/tripled) and a kerb, positioned in plan and draggable on a plan-view SVG (shown above the
  cross-section) — mirroring the flat roof's own opening system (`monoPitchRafterLayout`/`openingTrimZoneMm`
  in `lib/mono-pitch-roof.ts`, a self-contained copy of `flatRoofJoistLayout`'s logic): a member running
  parallel to the rafters (a side trimmer, or a kerb side up the slope) is true (sloped) length, one running
  parallel to the eaves (a header, or a kerb side across the slope) is horizontal and unscaled. The rooflight
  units themselves are still priced separately, under `roof-rooflights`. Gable structure is its own component,
  `AssemblyGableRoofDemo.tsx` (engine `lib/gable-roof.ts`, description `lib/gable-roof-description.ts`, labour
  `suggestGableRoofLabour` in `lib/flat-roof-labour.ts`) — two rafter faces to a ridge, a wall plate + straps
  at each of the two eaves walls (always standalone, no ledger option — a gable roof doesn't bear on an
  existing wall the way a lean-to does), and ceiling joists tying the rafter feet together across the full
  span; a new gable end wall is priced under External Walls, not here. Its rafter section reuses
  the same span chart the same way (true sloped length = half the span plus the overhang, over cos(pitch));
  ceiling joists get a section picker but no span-chart check (a long span needs a binder or an engineer's
  design — noted, not modelled). No roof-window openings yet (mono-pitch's plan-view/trimmer pattern in
  `lib/mono-pitch-roof.ts` is ready to reuse there when asked). Each of the gable roof's two ends is
  independently `'gable' | 'existing-wall'` (`GableEndTreatment`), same real case as the hip roof's per-end
  treatment (a rear extension tied into the house at one end). Unlike hip, a gable end never got a wall-plate
  credit either way (that was already true before this — the new wall's own top plate is its own build's
  scope), so `'existing-wall'` only *adds* restraint straps tying the ridge and end rafters back to it — the
  default (both `'gable'`) case is priced byte-for-byte the same as before this was added, confirmed by
  re-running the original hand-test unchanged. Rafter/ridge framing is identical for either end treatment
  (the ridge always runs the full length on a gable roof, unlike a hip's). Hip structure is its own component,
  `AssemblyHipRoofDemo.tsx` (engine `lib/hip-roof.ts`, description `lib/hip-roof-description.ts`, labour
  `suggestHipRoofLabour` in `lib/flat-roof-labour.ts`) — common rafters along the ridge zone on the two long
  sides, four hip rafters at 45° from each corner to a ridge end, jack rafters filling each hip triangle, a
  wall plate + straps round the full perimeter (every wall is an eaves wall on a hip roof — no gable ends to
  price under External Walls here), and ceiling joists across the full length. If the span is at least as
  long as the ridge-direction length the ridge length comes out at zero — a pyramid hip, no ridge board, the
  four hips meeting at a single apex instead; the engine and screen both handle this without a special case
  breaking (`isPyramid` flag, checked everywhere a ridge would otherwise be priced or drawn). The roof surface
  is one uniform pitch everywhere (commons, hips and jacks all lie in the same sloped planes), so the slope
  area is simply the overhung plan area over cos(pitch) — no need to sum every rafter's own strip, and a
  cleaner formula than the flat/mono-pitch/gable roofs use, worth carrying back to them if they ever need it.
  A jack rafter shares its roof plane's pitch with the common rafters it's parallel to, so it uses the very
  same true-length formula, just with its own (shorter) distance in from the corner as the run; a hip rafter's
  own run is on the diagonal (a 45° hip, stretched by √2), reaching the same rise, so its length comes from
  Pythagoras rather than the roof's pitch angle directly. Only the common-rafter length is checked against the
  span chart; hip and jack rafters (and the ridge board) take the next timber size up, same convention as the
  ledger/kerb sizing elsewhere. No roof-window openings yet, same as gable.

  **Pitched roof covering** (`roof-covering`'s `pitched` family, `AssemblyPitchedRoofCoveringDemo.tsx`, engine
  `lib/pitched-roof-covering.ts`, description `lib/pitched-roof-covering-description.ts`, labour
  `suggestPitchedRoofCoveringLabour` in `lib/flat-roof-labour.ts`) is a different pattern from every other
  covering/structure calculator: `lib/pitched-roof-covering.ts` itself is roof-shape-agnostic — it only takes
  already-worked-out edge lengths (slope area, ridge/hip/verge/abutment/eaves lm) and adds the one covering-
  specific number, the batten run (`slopeAreaM2 × 1000 / gaugeMm` — an area/gauge identity that holds for a
  hip's trapezoidal faces too, not just a plain rectangle, since a batten course's length is proportional to
  local face width and courses are evenly spaced). Which roof type (mono/gable/hip) and which per-end choice
  gives which edge lengths is worked out by the **screen**, calling `calculateMonoPitchRoofGeometry`/
  `calculateGableRoofGeometry`/`calculateHipRoofGeometry` **directly at runtime** — screens have no
  type-only-import restriction, only `lib/*-description.ts`/`lib/*-labour.ts` modules do, so this is fine and
  reuses the already-tested structure trig rather than re-deriving it a third time. The mapping: a ridge only
  exists for gable/hip; a hip cap follows the hip rafters' own line (`hipRafterLm`, reused directly); a verge
  runs up the slope (the true rafter length) at any new-wall gable end, or a hip's non-hipped `'gable'` end;
  an abutment (lead flashing) runs wherever the roof meets an **existing** wall instead — always at a
  mono-pitch's high wall (whichever way it's fixed there), or any gable/hip end set to `'existing-wall'`;
  eaves are simply wherever the structure's own geometry credits a wall plate (`wallPlateLm`, or `lengthM` for
  mono's one low wall) — "eaves" and "gets a wall plate" are the same thing in every one of these engines, so
  it's reused rather than re-derived. If a future covering calculator needs the same shape-agnostic-engine
  pattern, this is the one to copy — not the structure calculators' own self-contained-engine pattern. Each of the hip roof's two ends
  (along the ridge direction, not the long eaves) is independently `'hip' | 'gable' | 'existing-wall'`
  (`HipEndTreatment`) — a real case: hipped at the garden end, tied into the house at the other. A gabled or
  existing-wall end gets no hip/jack rafters at all (the ridge and common rafters simply run the full way to
  it, exactly like a gable roof's), and only an existing-wall end skips the wall-plate credit there (nothing
  new is built — still gets restraint straps back to it, same as every other end). Both ends non-hip and the
  ridge runs the full length, same numbers a gable roof would give for that length/span — a good consistency
  check when extending an engine like this. `isPyramid` only applies when *both* ends are `'hip'` and the
  ridge would go to zero; a single hip end reaching zero (too short a length for even its own half-span) is a
  different, genuine problem, warned separately. `roof-structure`'s "Include fitting the rooflights" optional
  labour line points the estimator at `roof-rooflights` instead of duplicating it — a new calculator that also
  fits something another one prices should do the same, not silently double-count. `roof-structure` pairs with
  the `cold_flat_roof`/`warm_flat_roof` Build-Up Types (flat only so far); the others appear under
  "Calculators". A roof is sized from the bounding box of the drawn shape via `drawnBoxMm`, passed as
  `externalLengthMm` + `externalWidthMm`, and the panel card shows "Size" not "Length" — `roof-rooflights`
  ignores both (it has no drawn geometry; any small shape drawn for it is just a placemarker). A calculator
  for any other phase (floors, plastering, ...) needs
  `resolveBuiltAssembly`, the properties panel's Build-Up Type/sub-phase picker, the `hideForBuiltAssembly`
  flag, and the carry-over extended to that phase — do it the same way, don't fork a new pattern.
- Take-off needs a login, so it can't be driven in the preview browser: test the screen on a temporary
  `/get-quote/<name>-test` page (public per `middleware.ts`), delete it before committing, and ask the user to
  check the Take-off flow live.

## AI scope chat and quote files (REQUIRED if you touch `components/ScopeChat.tsx`)

Plans and photos attached in the AI scope chat are saved as the quote's own attachments (`uploadQuoteDocument`, category plan) against `quoteId || localKey`, where the key is the quote's real id or the page's per-session `draft-…` key (NEVER the bare shared literal 'draft': files saved that way belong to no quote and can never be shown). The pages pass `quoteId={editingId || draftKey}` and `onFilesChanged` (so the quote's Attachments list stays in step), and on the first save `reassignDraftDocuments` links everything under the draft key to the new quote (`new-quote` and `quick-quote`, beside `reassignQuoteDocuments`). Opened on a saved quote the chat lists its saved files with View and "Show the AI" (hands the file back to the AI on the next message); "Update scope only" changes the written scope and leaves every phase and price, "Build Estimate" replaces all the phases. Files saved before this change sit under the shared 'draft' key and are not linked to any quote.

## Take-off sheets: several plans in one take-off (REQUIRED if you touch `app/(app)/takeoff/page.tsx`)

Each plan loaded in Take-off is a SHEET (`TakeoffSheet` in `lib/takeoff-types.ts`, rules in `lib/takeoff-sheets.ts`, tested): its own picture, its own scale and its own drawings; one job-wide schedule and total, with a sheet filter and a sheet tag on each item (`drawingRef` is set to the sheet name once there are two or more). `project.calibration` is ALWAYS the showing sheet's scale, so every measurement in the page keeps working unchanged; `switchActiveSheet` swaps it. A drawing (`DrawnElement.sheetId`) and an electrical point (`ElectricPoint.sheetId`) belong to the sheet they were drawn on; one with no `sheetId` belongs to the first sheet, and adding the first plan stamps whatever is already drawn. RULES: draw and show only `elementsOnActiveSheet(project)` (and points that are `onActiveSheet`); a scale change must remeasure ONLY the showing sheet's drawings (`rescaleActiveSheet` / the `onlyElementIds` argument of `recalcItemsForMpp`: every other sheet has its own scale, so a global remeasure silently corrupts them); picking an item on another sheet must switch to its sheet (`switchSheet(id, true)`). The picture of each sheet is NOT in the project: it is kept in IndexedDB (`lib/takeoff-sheet-images.ts`, key project id + sheet id) because localStorage holds ~5MB (one big plan filling it used to stop the whole take-off saving) and is not part of the cloud row. Each picture ALSO has a copy in the account (`lib/takeoff-sheet-cloud.ts`): the existing private `quote-documents` bucket, path `{user_id}/takeoff-{project_id}/{sheet_id}.pic` (its policies already allow your own folder, so no new setup; 10MB a file, so a bigger picture is squeezed to JPEG first; no UPDATE policy, so a picture is replaced by remove-then-upload). The copy is made in the background when a plan is added (`savePictureToAccount` in Take-off, never blocking drawing), plans from before are put there once when the take-off is open, and a sheet tab shows ☁… / ☁✓ / ☁⚠ (press to retry). The image-load effect reads this device first and falls back to downloading from the account, caching it on the device, so a take-off opens with its plans on any computer; the "picture is missing" banner now only shows when neither place has it. Deleting a take-off from My Take-offs removes its folder of pictures (deleting a single sheet leaves its picture, so Recovery still works). The cloud row has no sheets column: they ride inside the existing `calibration` JSON (`lib/takeoff-sync.ts`), so no SQL is needed. A take-off from before sheets (one plan inside the project) is moved into 'Plan 1' on first load; a sheet whose picture is not on this device shows a banner and 'Add Plan' fills THAT sheet (keeping its drawings and scale). A multi-page PDF asks which pages to use and makes a sheet of each. Deleting a sheet removes its drawings, items and points (a recovery copy is kept). **Scale presets** (1:20 to 1:500, `lib/takeoff-paper.ts`, tested) work out metres per pixel from the PAPER: a pixel is some mm of paper, times the scale. A PDF page is drawn at 2x (144 px to the inch) so a PDF pixel is always `PDF_RENDER_MM_PER_PX` = 25.4/144 mm of paper whatever the sheet size; the sheet records it (`paperMmPerPx`, `paper`), and an older sheet or an image the size of an A-size PDF page is inferred (`inferPdfPaper`). A plain image (scan, photo, other size) asks what paper it is (the picture is taken as the whole sheet) and remembers it; the 📄 chip beside the scale dropdown shows/changes it. The old presets (a made-up pixel size per A3/A1) were up to 17x out, never go back to a fixed pixel size. Calibrate from a known length is still the way for a cropped or scanned plan. **Drawings stand out on a busy plan** (the small Halo / Names / Fade plan box top-right of the canvas, kept per browser in localStorage `sbc_takeoff_view`, never in the take-off): a white HALO under every drawing (`renderHalo`; with it on a line is never thinner than a few SCREEN pixels at any zoom), a NAME TAG on every drawing (`renderTags`, `lib/takeoff-tags.ts`, tested: name from the item or the label, then the length or m², constant size on screen so every size is divided by the zoom, set above its anchor with a leader line and pushed down past tags already placed) that can be DRAGGED in Select mode (the offset is saved on the drawing as `tagDx`/`tagDy`), and FADE PLAN (the picture toward white). With Names on, the old loose labels inside `renderElement` (class `to-lbl`) are hidden by CSS: a new text in that function must keep the class. The Measure tool (`tool === 'measure'`, 📏 in the tool list, any phase) is a throwaway ruler: click along a route, double-click to finish, it shows each segment, the total and (3+ points) the area and perimeter if closed, at the showing sheet's scale with a warning if that scale is not set; it creates NO drawing and NO item, is never saved, and clears on Esc, a tool change or a sheet change. **My Take-offs** (📁 button, `listTakeoffSummaries` in `lib/takeoff-sync.ts`): the screen always works on ONE take-off (this browser's `sbc_takeoff_project`, plus a debounced copy in the `takeoff_projects` table). The list shows every take-off saved to the account, opens one (the one on screen is saved to the cloud first, `saveCurrentToCloud`), starts a named new one, and deletes one (and its pictures). The toolbar has ✕ Close take-off (`handleClose`, replaced + New): it saves the take-off on screen under its name and leaves a fresh EMPTY one (name '', no customer), which is what Take-off shows next visit; leaving the page without Close just reopens the same take-off. An empty take-off (`isEmptyTakeoff`) is never saved to the account, so blanks do not clutter the list. **A take-off id MUST be a real UUID** (`takeoff_projects.id` is a UUID column; `newProjectId`/`isUuid` in `lib/takeoff-sync.ts`): the screen used to make short random ids, so every cloud save and My Take-offs entry silently failed until 2026-11-18. An old short-id take-off on a computer is given a new UUID on load (an effect in Take-off that moves its plan pictures across), and `saveTakeoffToSupabase` refuses a non-UUID id with a clear message. The test harness fake database must reject non-UUID ids like the real one. The customer and reference fields (`client`, `clientId`, `projectName`, `takeoffRef`, `siteAddress`) and the sheets have no columns: they ride inside the `calibration` JSON (`metaOf` in the sync file), so no SQL is needed. Plan pictures are copied to the account too (see above), so another computer fetches them itself; the banner only shows if neither place has the picture. Not built: linking a quote to Take-off, picking a quote's attached plans inside Take-off, and sending the priced take-off back into the SAME quote (Send to Quote still makes a new quote).

## Portal sign-in (subcontractor and client): an emailed 6-digit code, no password

The subcontractor portal has NO passwords and the client portal's email tab is the same: `components/PortalSignInForm.tsx` asks for the email, `POST /api/portal/send-code` (public, `middleware` skips `api/`) emails a 6-digit code AND a one-tap button (our own Resend email, `lib/portal-code-email.ts`, the code from the admin `generateLink` `email_otp` via `createPortalSignInLink`), and the person types the code on the same page (`verifyOtp` type `email`). The code is the reliable way in because some email apps open a link in another browser or a scanner uses it up first. The route only emails an address that is a `clients` contact (so it cannot create accounts or spam strangers), answers the same either way, waits 30s per address and limits each visitor. The old Supabase `signInWithOtp` email is no longer used here. `/login` (builders) and `/portal/login` carry a signpost to the portal logins so a subcontractor does not end up at a password page.

## Client portal: keep the builder's Preview in step (REQUIRED)

The builder's "preview what the client sees" page (`app/(app)/portal-preview/page.tsx`, reached from a client's Contacts card) is a
separate, hand-built copy of the client portal, so a new portal tab or section does NOT appear in it by itself — that is why
"the preview is missing X" keeps coming back. Whenever you add or change anything in the client portal (`app/(portal)/portal/**`):
1. Put the screen in a shared display component (see `components/PortalContractsView.tsx`) used by BOTH the real portal page and the preview, rather than writing it twice.
2. Add the tab/section to the preview (tab list, `TAB_LABELS`, any dashboard banner) with signing/approving switched off (`preview` prop).
3. Fetch the preview's data with the builder's own session (they own the rows), shaped like what the client's portal receives.
Existing tabs not yet shared this way: Quotes, Variations, Invoices, Build Plan (Quotes/Build Plan reuse their own components) — convert to shared components when next touched.

## Tech Stack
- Next.js 14 App Router, TypeScript strict
- Supabase PostgreSQL + RLS
- Netlify auto-deploy from GitHub `master` branch
- TypeScript errors silently block Netlify builds — always run `npx tsc --noEmit` before pushing

## New database tables need explicit grants (REQUIRED, from 30 Oct 2026)

Supabase stopped automatically granting Data API access to new tables in the `public` schema on 30 October 2026. A table created without
grants returns "permission denied" to supabase-js and the app, which looks like a feature that silently won't save or load. So every SQL file that
`create table`s in `public` must, in the SAME file, also:
1. `grant select, insert, update, delete on public.<table> to authenticated;` and `... to service_role;` (add `grant usage, select on` any sequence it uses).
2. Grant `select` to `anon` ONLY if the table is meant to be readable when signed out. Most are not (nothing sensitive to `anon`). Decide per table.
3. Keep `enable row level security` and its policies as before: the grant opens the door to the API, the policies still decide which rows.
Tables created before 30 Oct 2026 keep their access, so old SQL files are left alone. `supabase/job-selections.sql` is a good example to copy.
If a database is ever rebuilt from the SQL files (new project, preview branch, `supabase db reset`), the older files that lack grants need a one-off pass first.
