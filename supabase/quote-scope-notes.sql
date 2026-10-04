-- ============================================================
-- Quotes: "Changes to the scope" notes
--
-- Free text, written by the builder, dated entries describing changes to the scope of works agreed AFTER the quote
-- was accepted. The accepted quote's own scope stays exactly as the client approved it; these notes sit underneath it
-- on the quote, the client portal, printed quotes and the contract (Schedule 1).
--
-- Safe to run more than once. Run in the Supabase SQL Editor (staging first, then live). The app copes with the
-- column not existing yet (it just hides the feature), so this can be run before or after the new code is deployed.
-- The client portal reads the whole quote row, so no portal function needs changing.
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scope_notes TEXT;
