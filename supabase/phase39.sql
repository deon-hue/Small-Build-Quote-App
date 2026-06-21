-- Migration: add payment_terms to clients
-- Run this in Supabase SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'Payment on receipt';
