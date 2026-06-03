-- Phase 19: Xero connection (OAuth2 token storage)
-- One connection per user. Tokens are protected by RLS (owner-only). Access
-- tokens are short-lived; the rotating refresh token is used to renew them.

CREATE TABLE IF NOT EXISTS public.xero_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL UNIQUE,
  tenant_id     TEXT NOT NULL DEFAULT '',
  tenant_name   TEXT NOT NULL DEFAULT '',
  access_token  TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at    TIMESTAMPTZ,
  scopes        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.xero_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'xero_connections') THEN
    CREATE POLICY "Own xero_connection" ON public.xero_connections
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
