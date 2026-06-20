-- Migration: link bills to source documents
-- Run this in Supabase SQL Editor

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES job_documents(id) ON DELETE SET NULL;
