-- ============================================================
-- Assembly calculators: link a cost line (e.g. "Ready-mixed concrete C25" in the strip foundation) to a Back Office Product or Plant item.
-- A linked line uses that item's price, so a price changed in Back Office (by hand now, from supplier feeds later) is the price the calculator uses.
-- One row per company + calculator + cost line. Only the company's own login(s) can see or change them. Safe to run more than once. Staging first, then live.
-- (Without this table the calculators still work, with their sample rates; links just can't be saved.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calculator_rate_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assembly_id TEXT NOT NULL,
  layer_id    TEXT NOT NULL,
  ref_kind    TEXT NOT NULL CHECK (ref_kind IN ('product', 'plant')),
  ref_id      UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, assembly_id, layer_id)
);

CREATE INDEX IF NOT EXISTS idx_calculator_rate_links_user ON public.calculator_rate_links (user_id);

ALTER TABLE public.calculator_rate_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own calculator rate links" ON public.calculator_rate_links;
CREATE POLICY "Own calculator rate links" ON public.calculator_rate_links
  FOR ALL TO authenticated
  USING (user_id = get_effective_owner_id())
  WITH CHECK (user_id = get_effective_owner_id());
