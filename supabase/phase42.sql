-- Phase 42: Unify all contacts into the clients table
-- Run in Supabase → SQL Editor

-- 1. Add account_number to clients table (used by supplier/subcontractor records)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 2. Copy suppliers table records into clients where not already present
--    Matching is done by email (if set) or by name (case-insensitive)
INSERT INTO clients (
  user_id, name, first_name, last_name, email, phone, address, notes,
  client_type, account_number, xero_contact_id, xero_synced_at,
  added_from, updated_at
)
SELECT
  s.user_id,
  s.name,
  split_part(coalesce(s.contact_name, ''), ' ', 1)                                    AS first_name,
  CASE
    WHEN position(' ' IN coalesce(s.contact_name, '')) > 0
    THEN substring(s.contact_name FROM position(' ' IN s.contact_name) + 1)
    ELSE ''
  END                                                                                   AS last_name,
  coalesce(s.email, ''),
  coalesce(s.phone, ''),
  coalesce(s.address, ''),
  coalesce(s.notes, ''),
  'supplier'                                                                            AS client_type,
  coalesce(s.account_number, ''),
  s.xero_contact_id,
  s.xero_synced_at,
  coalesce(s.added_from, 'manual'),
  now()
FROM suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.user_id = s.user_id
    AND (
      (s.email IS NOT NULL AND s.email <> '' AND lower(c.email) = lower(s.email))
      OR lower(trim(c.name)) = lower(trim(s.name))
    )
);

-- 3. Add contact_id to bills (FK to clients — used for new bills going forward)
--    Old bills keep supplier_id pointing to the suppliers table; new bills use contact_id.
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 4. Back-populate contact_id for existing bills by matching supplier name to clients
UPDATE bills b
SET contact_id = c.id
FROM clients c
WHERE b.contact_id IS NULL
  AND b.supplier_name IS NOT NULL AND b.supplier_name <> ''
  AND c.user_id = b.user_id
  AND lower(trim(c.name)) = lower(trim(b.supplier_name))
  AND c.client_type IN ('supplier', 'subcontractor');
