-- Archiving a completed job hides it from the Jobs list without deleting anything —
-- all related data (notes, documents, payments, variations, invoices, Gantt state)
-- stays exactly as it was, keyed off the same job id, for future reference.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
