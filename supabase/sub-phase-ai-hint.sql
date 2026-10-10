-- ============================================================
-- Back Office sub-phases: "What this covers (for the AI)".
-- A short plain-words description on each sub-phase that the AI quote reads when it decides which sub-phase a piece of work belongs to (and which it
-- does not). Optional: the app has a suggested wording for the built-in sub-phases, and anything you write here wins over it.
-- Safe to run more than once. Staging first, then live. (Without it the AI still works using the suggested wording; the box just can't save.)
-- ============================================================

ALTER TABLE public.bo_sub_phases ADD COLUMN IF NOT EXISTS ai_hint TEXT;
