-- ============================================================
-- Phase 9: Quote Documents (plan / drawing attachments)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Storage bucket for uploaded plans and drawings
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-documents',
  'quote-documents',
  false,
  10485760,   -- 10 MB per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'image/webp', 'image/tiff', 'image/bmp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. Storage RLS — each user can only touch their own folder
--    Path structure: {user_id}/{quote_id}/{filename}
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Quote docs: users upload own" ON storage.objects;
CREATE POLICY "Quote docs: users upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Quote docs: users read own" ON storage.objects;
CREATE POLICY "Quote docs: users read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Quote docs: users delete own" ON storage.objects;
CREATE POLICY "Quote docs: users delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'quote-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ────────────────────────────────────────────────────────────
-- 3. quote_documents table — tracks uploaded files per quote
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users NOT NULL,
  quote_id     TEXT NOT NULL,           -- quote UUID, or 'draft' for unsaved quotes
  filename     TEXT NOT NULL,
  storage_path TEXT NOT NULL,           -- path inside quote-documents bucket
  mime_type    TEXT NOT NULL DEFAULT '',
  file_size    INTEGER NOT NULL DEFAULT 0,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quote_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own quote_documents" ON quote_documents;
CREATE POLICY "Own quote_documents" ON quote_documents
  FOR ALL USING (auth.uid() = user_id);
