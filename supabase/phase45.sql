-- Phase 45: Add is_paye flag to clients for PAYE staff time tracking
-- PAYE staff use the same subcontractor portal to log times, but their
-- job costs are recorded as 'labour' (not 'subcontractors') and Xero
-- push is suppressed — payroll goes through PAYE/RTI, not Xero bills.
-- Run in Supabase → SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_paye BOOLEAN NOT NULL DEFAULT false;
