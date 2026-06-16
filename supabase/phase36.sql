-- Migration: email ingest metadata columns on job_documents
-- Run this in Supabase SQL Editor

ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS source_email   TEXT,
  ADD COLUMN IF NOT EXISTS source_subject TEXT;
