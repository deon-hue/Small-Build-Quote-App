-- enquiry-form.sql — the public enquiry form on a company-name link (app.buildospro.ai/enquiry/<company-slug>).
-- Run supabase/leads.sql FIRST (it adds where a lead came from and the chase date to quote_requests). Safe to run twice.
--
-- 1. Four settings on the company's own settings row: its current link name, whether the form is on, the sentence shown above the form, and whether to email the company about each new enquiry.
-- 2. A table of link names. EVERY name a company has had stays in it, so an old link keeps working after a rename and nobody else can take a name a company has used.
--    No policy and no access for signed-in users or the public: only the app's server (service role) reads and writes it, after checking who is asking.

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enquiry_slug    TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enquiry_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enquiry_intro   TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS enquiry_notify  BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.enquiry_slugs (
  slug       TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enquiry_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40)
);
CREATE INDEX IF NOT EXISTS enquiry_slugs_user_idx ON public.enquiry_slugs (user_id);

ALTER TABLE public.enquiry_slugs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enquiry_slugs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enquiry_slugs TO service_role;
