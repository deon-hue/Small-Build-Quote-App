-- contracts.sql — FMB contract drafting, sending and digital signing per job
-- Run in Supabase SQL Editor

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  quote_id             UUID REFERENCES quotes(id),
  status               TEXT NOT NULL DEFAULT 'draft',        -- 'draft' | 'sent' | 'signed'
  fields               JSONB NOT NULL DEFAULT '{}'::jsonb,   -- every filled-in field, keyed by lib/fmb-contract.ts field names
  payment_mode         TEXT NOT NULL DEFAULT 'simple',       -- 'simple' | 'staged'
  payment_schedule     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{date, amount}], staged mode only
  second_client_name   TEXT,
  draft_attachment_id  UUID REFERENCES job_attachments(id),
  signed_attachment_id UUID REFERENCES job_attachments(id),
  builder_signed_at    TIMESTAMPTZ,
  builder_signed_by    TEXT,
  client_signed_at     TIMESTAMPTZ,
  client_signed_by     TEXT,
  client2_signed_at    TIMESTAMPTZ,
  client2_signed_by    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own contracts" ON contracts;
CREATE POLICY "Own contracts" ON contracts
  FOR ALL USING (user_id = auth.uid());

-- ── 3. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS contracts_job_id_idx ON contracts(job_id);

-- ── 4. Portal RPC — SECURITY DEFINER so the customer can read their job's contracts ──
-- Mirrors get_job_attachments_for_portal (supabase/phase27.sql) exactly.
CREATE OR REPLACE FUNCTION get_job_contracts_for_portal(p_job_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
  v_result   JSON;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT j.user_id INTO v_admin_id
  FROM jobs j
  WHERE j.id = p_job_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = j.user_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    )
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN '[]'::JSON; END IF;

  -- draft_storage_path/signed_storage_path are resolved here (SECURITY DEFINER,
  -- so it can read job_attachments regardless of that table's own RLS, which
  -- only allows the job's owner) rather than making the portal client do a
  -- second, RLS-blocked lookup — mirrors get_job_attachments_for_portal, which
  -- hands back storage_path directly for the same reason.
  SELECT json_agg(
    json_build_object(
      'id',                   c.id,
      'status',                c.status,
      'second_client_name',    c.second_client_name,
      'client_signed_at',      c.client_signed_at,
      'client_signed_by',      c.client_signed_by,
      'client2_signed_at',     c.client2_signed_at,
      'client2_signed_by',     c.client2_signed_by,
      'created_at',            c.created_at,
      'draft_storage_path',    da.storage_path,
      'signed_storage_path',   sa.storage_path
    )
    ORDER BY c.created_at ASC
  ) INTO v_result
  FROM contracts c
  LEFT JOIN job_attachments da ON da.id = c.draft_attachment_id
  LEFT JOIN job_attachments sa ON sa.id = c.signed_attachment_id
  WHERE c.job_id = p_job_id AND c.user_id = v_admin_id;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_contracts_for_portal(UUID) TO authenticated;

-- ── 5. Portal RPC — client signs a contract (mirrors approve_quote, supabase/phase4.sql) ──
CREATE OR REPLACE FUNCTION sign_contract(p_contract_id UUID, p_role TEXT, p_signature TEXT)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_contract RECORD;
BEGIN
  IF p_role NOT IN ('client', 'client2') THEN
    RETURN json_build_object('error', 'invalid_role');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN json_build_object('error', 'not_authorized'); END IF;

  -- Verify this portal customer has access to the contract's job (same check as
  -- get_job_contracts_for_portal, inlined here so this RPC checks access itself).
  SELECT c.* INTO v_contract
  FROM contracts c
  JOIN jobs j ON j.id = c.job_id
  WHERE c.id = p_contract_id
    AND EXISTS (
      SELECT 1 FROM clients cl
      WHERE cl.user_id = j.user_id
        AND LOWER(cl.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(cl.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(cl.first_name,'') || ' ' || COALESCE(cl.last_name,'')))
          OR (cl.last_name IS NOT NULL AND cl.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(cl.last_name) || '%')
        )
    );

  IF NOT FOUND THEN RETURN json_build_object('error', 'contract_not_found'); END IF;
  IF v_contract.status <> 'sent' THEN
    RETURN json_build_object('error', 'already_actioned', 'status', v_contract.status);
  END IF;

  IF p_role = 'client' THEN
    v_contract.client_signed_at := NOW();
  ELSE
    v_contract.client2_signed_at := NOW();
  END IF;

  -- Fully signed once the client has signed, and the second client too if this
  -- contract has one — the app-side finalize step (flattening + storing the
  -- signed PDF) is triggered by the caller when this comes back 'signed'.
  IF v_contract.client_signed_at IS NOT NULL
     AND (v_contract.second_client_name IS NULL OR v_contract.client2_signed_at IS NOT NULL) THEN
    v_contract.status := 'signed';
  END IF;

  UPDATE contracts SET
    client_signed_at  = v_contract.client_signed_at,
    client_signed_by  = CASE WHEN p_role = 'client' THEN p_signature ELSE client_signed_by END,
    client2_signed_at = v_contract.client2_signed_at,
    client2_signed_by = CASE WHEN p_role = 'client2' THEN p_signature ELSE client2_signed_by END,
    status             = v_contract.status,
    updated_at         = NOW()
  WHERE id = p_contract_id;

  RETURN json_build_object('success', true, 'signed_at', NOW(), 'status', v_contract.status);
END;
$$;

GRANT EXECUTE ON FUNCTION sign_contract(UUID, TEXT, TEXT) TO authenticated;
