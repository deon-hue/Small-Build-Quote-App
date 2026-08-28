# Small Build Company — Codex Instructions

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

## Tech Stack
- Next.js 14 App Router, TypeScript strict
- Supabase PostgreSQL + RLS
- Netlify auto-deploy from GitHub `master` branch
- TypeScript errors silently block Netlify builds — always run `npx tsc --noEmit` before pushing
