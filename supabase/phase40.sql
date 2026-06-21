-- Phase 40: Add client_type to distinguish clients from suppliers in the clients table
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'client'
    CHECK (client_type IN ('client', 'supplier'));

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients (user_id, client_type);
