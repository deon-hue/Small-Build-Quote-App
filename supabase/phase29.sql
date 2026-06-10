-- Migration: add client_files column to quote_requests
-- Run this in Supabase SQL Editor

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS client_files JSONB DEFAULT '[]'::JSONB;

-- Storage bucket is created automatically by the upload API route the first time a file is uploaded.
-- If you want to create it manually, run this (or create it via Storage > New bucket in the dashboard):
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('client-uploads', 'client-uploads', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- Then add a public read policy so the builder can view images:
-- CREATE POLICY "Public read client uploads"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'client-uploads');
