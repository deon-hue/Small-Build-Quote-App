-- Quote Versioning and Approval System
-- Extends quotes table with approval/status fields
-- Creates audit log table to track all version events
-- ALSO: Re-enables RLS on quotes and clients tables (was disabled during debugging)

-- ============================================================================
-- 0. RE-ENABLE RLS on quotes and clients (critical security fix)
-- ============================================================================

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. Add new columns to quotes table
-- ============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'
  CHECK (status IN ('draft', 'sent', 'current', 'superseded', 'accepted', 'confirmed'));

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS changes_summary TEXT;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;

-- ============================================================================
-- 2. Create audit log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL CHECK (event_type IN ('sent', 'viewed', 'superseded', 'accepted', 'confirmed')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  details JSONB DEFAULT NULL
);

-- ============================================================================
-- 3. Create indexes for efficient querying
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quote_audit_log_quote_id ON quote_audit_log(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_audit_log_event_type ON quote_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_quote_audit_log_created_at ON quote_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_approved_at ON quotes(approved_at);

-- ============================================================================
-- 4. Enable Row-Level Security on audit_log
-- ============================================================================

ALTER TABLE quote_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin (quote owner) can view all audit logs for their quotes
CREATE POLICY "audit_log_select_own_quotes" ON quote_audit_log
  FOR SELECT USING (
    quote_id IN (
      SELECT id FROM quotes WHERE user_id = auth.uid()
    )
  );

-- Admin can insert audit events for their quotes
CREATE POLICY "audit_log_insert_own_quotes" ON quote_audit_log
  FOR INSERT WITH CHECK (
    quote_id IN (
      SELECT id FROM quotes WHERE user_id = auth.uid()
    )
  );

-- Clients (from portal) can view sent versions of quotes (view-only audit trail)
-- This will be implemented in the client portal logic

-- ============================================================================
-- 5. Add comment for clarity
-- ============================================================================

COMMENT ON TABLE quote_audit_log IS 'Tracks all events for quote versions: sent, viewed, superseded, accepted, confirmed. Each row is one event.';
COMMENT ON COLUMN quotes.status IS 'Current lifecycle status of the quote version: draft (internal only), sent (shared with client), current (active version), superseded (replaced by newer version), accepted (client approved), confirmed (locked and accepted)';
COMMENT ON COLUMN quotes.is_locked IS 'If true, quote cannot be edited after client approval';
COMMENT ON COLUMN quotes.changes_summary IS 'Brief summary of changes from previous version (e.g., "Kitchen removed, Total £500 less")';
