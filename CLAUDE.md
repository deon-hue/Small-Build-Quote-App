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

## Tech Stack
- Next.js 14 App Router, TypeScript strict
- Supabase PostgreSQL + RLS
- Netlify auto-deploy from GitHub `master` branch
- TypeScript errors silently block Netlify builds — always run `npx tsc --noEmit` before pushing
