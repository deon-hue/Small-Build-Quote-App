// The canonical_ids that have a real, working assembly calculator today — the plain-data
// half of lib/built-assemblies.tsx, split out so non-UI code (the Back Office sync below)
// can check membership without importing that file's React components. Keep this in sync
// with BUILT_ASSEMBLY_CANON_IDS's keys in lib/built-assemblies.tsx — that file imports this
// same set rather than redeclaring it, so there's one list, not two.
export const BUILT_ASSEMBLY_CANONICAL_IDS = new Set<string>([
  'iw-stud-partition',
  'iw-metal-stud',
  'iw-block-masonry',
])
