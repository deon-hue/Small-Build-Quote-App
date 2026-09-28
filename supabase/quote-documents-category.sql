-- quote-documents-category.sql — lets a quote attachment carry the same
-- document/plan/photo category a job attachment has, so copy-quote-plans
-- (app/api/copy-quote-plans/route.ts) can preserve it on conversion instead
-- of always labelling every carried-over file 'plan'.
ALTER TABLE quote_documents
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS label TEXT;
