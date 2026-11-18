// "The AI quote always uses the new calculators unless a phase has none" (Deon, 2026-11-18). Back Office still holds the OLD task-based sub-phases (flat tasks with fixed rates) beside the newer
// calculator sub-phases for the same work, and the quote writer (app/api/scope-to-quote) could pick either: a quote came out with the old fixed pricing where a calculator exists.
// So: an old sub-phase whose work a calculator covers is NOT shown to the AI at all (when the company's Back Office has that calculator), and if the AI names one anyway it is swapped
// for the calculator line. A sub-phase with no calculator (Flashings, Above Ground Drainage, Specialist Finishes, Timber Frame & Studwork, Masonry & Blockwork ...) is left exactly as it is.
// Pure, no imports: tested in __tests__/ai-calc-first.test.ts.

/** old task-based sub-phase (by canonical id) -> the calculator sub-phase(s) that now price that work, in order of preference */
export const OLD_TO_CALC: Record<string, string[]> = {
  // Plastering & Boarding (Ceiling Plastering & Boarding stays: the vaulted ceiling tasks live there)
  'plaster-internal': ['plaster-rooms'],
  'plaster-drylining': ['plaster-rooms'],
  'plaster-external-render': ['plaster-render'],
  'plaster-insulation': ['plaster-insul-wall'],
  'plaster-floor-levelling': ['fs-floor-overlay', 'fs-screeded-floor'],
  // Structural frame
  'sf-steelwork': ['sf-steel-calc'],
  'sf-openings': ['sf-openings-calc'],
  // Windows and doors
  'wd-upvc-windows': ['wd-windows'],
  'wd-aluminium-windows': ['wd-windows'],
  'wd-ext-doors': ['wd-doors'],
  'wd-internal-doors': ['wd-doors'],
  // Drainage
  'drain-underground': ['drain-runs', 'drain-chambers-gullies'],
  'drain-rainwater': ['drain-soakaway'],
  // Electrics: the old room-by-room task sub-phases (the calculator prices the whole installation, rooms and consumer unit included)
  'elec-general': ['elec-install'],
  'elec-bed-1': ['elec-install'], 'elec-bed-2': ['elec-install'], 'elec-bed-3': ['elec-install'], 'elec-bed-4': ['elec-install'], 'elec-bed-5': ['elec-install'], 'elec-bed-6': ['elec-install'],
  'elec-ens-1': ['elec-install'], 'elec-ens-2': ['elec-install'], 'elec-ens-3': ['elec-install'], 'elec-ens-4': ['elec-install'], 'elec-ens-5': ['elec-install'], 'elec-ens-6': ['elec-install'],
  'elec-fam-bath': ['elec-install'], 'elec-bath-2': ['elec-install'], 'elec-cloakroom': ['elec-install'], 'elec-kitchen': ['elec-install'], 'elec-utility': ['elec-install'],
  'elec-living-rm': ['elec-install'], 'elec-dining-rm': ['elec-install'], 'elec-study': ['elec-install'], 'elec-playroom': ['elec-install'], 'elec-entrance': ['elec-install'],
  'elec-gf-hall': ['elec-install'], 'elec-ff-land': ['elec-install'], 'elec-sf-land': ['elec-install'], 'elec-garage': ['elec-install'], 'elec-boot-room': ['elec-install'],
  'elec-loft-room': ['elec-install'], 'elec-garden-rm': ['elec-install'],
  // Plumbing: the old room-by-room task sub-phases (Boiler & Heating System stays: system boilers, cylinders and heat pumps are not in a calculator yet)
  'plumb-kitchen': ['plumb-install'], 'plumb-utility': ['plumb-install'], 'plumb-fam-bath': ['plumb-install'], 'plumb-bath-2': ['plumb-install'],
  'plumb-ensuite-1': ['plumb-install'], 'plumb-ensuite-2': ['plumb-install'], 'plumb-cloakroom': ['plumb-install'],
  // Joinery
  'join-staircase': ['join-stairs-calc'],
  'join-fitted-furniture': ['join-furniture-calc'],
  'join-kitchen': ['join-kitchen-fit'],
  'join-skirting-arch': ['join-skirting-rooms'],
  // Tiling
  'tile-wall': ['tile-wall-rooms'],
  'tile-floor': ['tile-floor-rooms'],
  'tile-surface-prep': ['tile-prep-rooms'],
  // Floors
  'fs-ufh-screed': ['fs-screeded-floor'],
  // External walls (and the older External Wall Construction copies of them)
  'ew-solid-brick': ['ew-solid-brick-victorian'],
  'ew-timber-frame': ['ew-timber-frame-brick', 'ew-garden-room-timber'],
  'ewc-cav-partial': ['ew-cav-partial'], 'ewc-cav-full': ['ew-cav-full'], 'ewc-solid-brick': ['ew-solid-brick-victorian'],
  'ewc-timber-frame': ['ew-timber-frame-brick', 'ew-garden-room-timber'], 'ewc-blockwork-100': ['ew-blockwork-100'],
  // Demolition (Back Office ids are 'demo-' + the entry id)
  'demo-structural': ['demo-wall-removal-calc'],
  'demo-non-structural': ['demo-wall-removal-calc'],
  'demo-ceiling-strip': ['demo-strip-out-calc'],
  'demo-wall-finishes': ['demo-strip-out-calc'],
  'demo-floor-strip': ['demo-strip-out-calc'],
  'demo-kitchen-bathroom': ['demo-strip-out-calc'],
  'demo-external-demo': ['demo-outbuildings-calc', 'demo-external-works-calc'],
  'demo-waste': ['demo-waste-skips-calc'],
}

export interface SubPhaseLite { name: string; canonical_id?: string | null }

/** Which old sub-phases (by NAME, which is how the library and the AI's answer are keyed) to hide, and which calculator sub-phase (by name) replaces each.
 *  A name is hidden only when EVERY sub-phase of that name is an old one with a calculator the company has ('Kitchen' exists under both Electrics and Plumbing). */
export function oldPhasesToHide(subPhases: SubPhaseLite[]): Map<string, string> {
  const byCanon = new Map<string, SubPhaseLite>()
  for (const s of subPhases) if (s.canonical_id && !byCanon.has(s.canonical_id)) byCanon.set(s.canonical_id, s)
  const replacement = new Map<string, string>()   // old name -> calculator name
  const blocked = new Set<string>()
  for (const s of subPhases) {
    const targets = s.canonical_id ? OLD_TO_CALC[s.canonical_id] : undefined
    const calc = targets?.map(id => byCanon.get(id)).find(Boolean)
    if (calc) { if (!replacement.has(s.name)) replacement.set(s.name, calc.name) }
    else blocked.add(s.name)
  }
  for (const n of blocked) replacement.delete(n)
  return replacement
}

export interface AiPhaseLite { parentPhase?: string; phase: string; selectedTasks?: string[]; extraTasks?: unknown[]; [k: string]: unknown }

/** The AI's answer with any old sub-phase it named anyway swapped for its calculator line (no tasks, the calculator's own main phase); a calculator line it already gave is not repeated.
 *  Returns the phases and the swaps made (for a note). */
export function redirectOldPhases<T extends AiPhaseLite>(phases: T[], replacement: Map<string, string>, parentOf: Record<string, string>): { phases: T[]; swapped: { from: string; to: string }[] } {
  const swapped: { from: string; to: string }[] = []
  const have = new Set(phases.filter(p => !replacement.has(p.phase)).map(p => p.phase))
  const out: T[] = []
  for (const p of phases) {
    const to = replacement.get(p.phase)
    if (!to) { out.push(p); continue }
    swapped.push({ from: p.phase, to })
    if (have.has(to)) continue
    have.add(to)
    out.push({ ...p, phase: to, parentPhase: parentOf[to] ?? p.parentPhase, selectedTasks: [], extraTasks: [] })
  }
  return { phases: out, swapped }
}
