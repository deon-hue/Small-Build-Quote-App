// The canonical_ids that have a real, working assembly calculator today — the plain-data
// half of lib/built-assemblies.tsx, split out so non-UI code (the Back Office sync below)
// can check membership without importing that file's React components. Keep this in sync
// with BUILT_ASSEMBLY_CANON_IDS's keys in lib/built-assemblies.tsx — that file imports this
// same set rather than redeclaring it, so there's one list, not two.
export const BUILT_ASSEMBLY_CANONICAL_IDS = new Set<string>([
  'iw-stud-partition',
  'iw-metal-stud',
  'iw-block-masonry',
  'ew-blockwork-100',
])

// Bridges Take-off's External Walls "Build-up Type" system (keyed by WALL_MAKEUPS/
// bo_wall_types ids — see lib/takeoff-types.ts) to the real bo_sub_phases canonical_id used
// everywhere else. These are two separately-synced systems that happen to describe the same
// wall types under different ids (Internal Walls doesn't have this problem — Take-off's
// Sub-Phase picker there is already keyed by the real bo_sub_phases id). Exists only so
// Take-off can tell whether a given build-up type also has a real assembly calculator.
export const WALL_MAKEUP_TO_SUBPHASE_CANONICAL: Record<string, string> = {
  cav_wall_partial: 'ew-cav-partial',
  cav_wall_full: 'ew-cav-full',
  solid_brick_225: 'ew-solid-brick',
  timber_frame_wall: 'ew-timber-frame',
  blockwork_100: 'ew-blockwork-100',
}
