-- Phase 15: Add recipe_items JSONB to bo_tasks
-- Stores the full 5-category cost recipe (LayerCostRecord) for each task.
-- This enables the Construction Layer Editor to pull BO defaults per layer/task.

ALTER TABLE public.bo_tasks
  ADD COLUMN IF NOT EXISTS recipe_items JSONB DEFAULT NULL;

COMMENT ON COLUMN public.bo_tasks.recipe_items IS
  'Full 5-category cost recipe stored as LayerCostRecord JSON: '
  '{ labourItems, materialItems, plantItems, subItems, otherItems }. '
  'Set when user saves a construction layer recipe to Back Office.';
