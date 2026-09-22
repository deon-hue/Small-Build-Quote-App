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
1. Engine: its own pure module in `lib/assembly-calc.ts` (geometry + `calculate…Cost`, reusing `costLayer`);
   add its quantity-source type to the `AssemblyQuantitySource` union. Hand-work the numbers and test the
   engine (`node file.mts` with `file:///` import URLs) before building the screen.
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
  one calculator each, never one big screen**: `roof-structure` (Roof Structure — a roof type drop-down, flat
  built; mono/lean-to, gable and hip are next, each its own calculator behind it), `roof-covering` (Roof
  Coverings — flat GRP/EPDM/TPO with trims built; pitched tiles/slate next), `roof-rainwater` (Gutters &
  Downpipes), and the parapet wall is `ew-parapet-wall` under External Walls (a line, like any wall). The three
  roof parts are `AssemblyFlatRoofDemo` with a `part` prop ('structure' | 'covering' | 'gutters'; 'complete',
  the old all-in-one `roof-flat`, is kept only until it's retired) — each shows only its own inputs, layers,
  labour (`suggestFlatRoofLabour(…, scope)`) and description (`describeFlatRoof(…, part)`), and the parts'
  totals add up to the complete roof's. `roof-structure` pairs with the `cold_flat_roof`/`warm_flat_roof`
  Build-Up Types; the others appear under "Calculators". A roof is sized from the bounding box of the drawn
  shape via `drawnBoxMm`, passed as `externalLengthMm` + `externalWidthMm`, and the panel card shows "Size"
  not "Length". A calculator for any other phase (floors, plastering, ...) needs
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
