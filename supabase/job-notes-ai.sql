-- AI-powered Job Notes: voice dictation, photos, auto-tagging, action items.
-- Extends the existing job_notes table (raw text preserved separately from the
-- AI-cleaned text) and adds a small note-scoped photo table reusing the existing
-- job-documents storage bucket.

ALTER TABLE job_notes
  ADD COLUMN IF NOT EXISTS raw_note TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT,
  ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'typed';

CREATE TABLE IF NOT EXISTS job_note_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  note_id UUID NOT NULL REFERENCES job_notes(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE job_note_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own job note photos" ON job_note_photos
  FOR ALL USING (user_id = get_effective_owner_id()) WITH CHECK (user_id = get_effective_owner_id());
