-- Phase 41: Add 'subcontractor' as a valid client_type value
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_client_type_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_client_type_check
    CHECK (client_type IN ('client', 'supplier', 'subcontractor'));
