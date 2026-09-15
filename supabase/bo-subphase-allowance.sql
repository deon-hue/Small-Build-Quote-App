-- Lets a Back Office sub-phase be marked as a simple flat allowance (a single
-- description + £ figure, no Labour/Materials/Plant/Subcontractors breakdown) —
-- for General Preliminaries roles like Project Manager, QS, Foreman, etc.
ALTER TABLE bo_sub_phases ADD COLUMN IF NOT EXISTS is_allowance BOOLEAN NOT NULL DEFAULT false;
