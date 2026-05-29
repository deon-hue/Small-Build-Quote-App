-- ============================================================
-- Small Build Company — Back Office Master Database
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Labour Trades Master
CREATE TABLE IF NOT EXISTS bo_labour_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  day_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  half_day_rate_override NUMERIC(10,2),
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phases Master
CREATE TABLE IF NOT EXISTS bo_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  job_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-Phases Master
CREATE TABLE IF NOT EXISTS bo_sub_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks Master
CREATE TABLE IF NOT EXISTS bo_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  sub_phase_id UUID REFERENCES bo_sub_phases(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client_description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'item',
  default_qty NUMERIC(10,3) NOT NULL DEFAULT 1,
  labour_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  materials_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  plant_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  subcontract_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  waste_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  trade_name TEXT,
  productivity_rate NUMERIC(10,3),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  from_takeoff BOOLEAN NOT NULL DEFAULT TRUE,
  from_ai BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products / Materials Master
CREATE TABLE IF NOT EXISTS bo_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  unit TEXT NOT NULL DEFAULT 'item',
  default_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  waste_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plant / Equipment Master
CREATE TABLE IF NOT EXISTS bo_plant_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'day',
  default_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Takeoff Tools
CREATE TABLE IF NOT EXISTS bo_takeoff_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Takeoff Tool Sub-types
CREATE TABLE IF NOT EXISTS bo_takeoff_subtypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  tool_id UUID REFERENCES bo_takeoff_tools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool-Task Mappings (what tasks get generated when a sub-type is measured)
CREATE TABLE IF NOT EXISTS bo_tool_task_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  subtype_id UUID REFERENCES bo_takeoff_subtypes(id) ON DELETE CASCADE,
  task_id UUID REFERENCES bo_tasks(id) ON DELETE CASCADE,
  quantity_formula TEXT NOT NULL DEFAULT 'measured_qty',
  waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Formula Rules
CREATE TABLE IF NOT EXISTS bo_formula_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  expression TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Scope Mappings
CREATE TABLE IF NOT EXISTS bo_ai_scope_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  keyword TEXT NOT NULL,
  phase_id UUID REFERENCES bo_phases(id) ON DELETE CASCADE,
  sub_phase_id UUID REFERENCES bo_sub_phases(id) ON DELETE SET NULL,
  task_id UUID REFERENCES bo_tasks(id) ON DELETE SET NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bo_labour_trades_user ON bo_labour_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_phases_user ON bo_phases(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_sub_phases_user ON bo_sub_phases(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_sub_phases_phase ON bo_sub_phases(phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_user ON bo_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_phase ON bo_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_tasks_sub_phase ON bo_tasks(sub_phase_id);
CREATE INDEX IF NOT EXISTS idx_bo_products_user ON bo_products(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_plant_items_user ON bo_plant_items(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_takeoff_tools_user ON bo_takeoff_tools(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_takeoff_subtypes_tool ON bo_takeoff_subtypes(tool_id);
CREATE INDEX IF NOT EXISTS idx_bo_tool_task_mappings_subtype ON bo_tool_task_mappings(subtype_id);
CREATE INDEX IF NOT EXISTS idx_bo_formula_rules_user ON bo_formula_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_bo_ai_scope_mappings_user ON bo_ai_scope_mappings(user_id);

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE bo_labour_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_sub_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_plant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_takeoff_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_takeoff_subtypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_tool_task_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_formula_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bo_ai_scope_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (own data only)
CREATE POLICY "Users manage own labour trades" ON bo_labour_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own phases" ON bo_phases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sub_phases" ON bo_sub_phases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tasks" ON bo_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own products" ON bo_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own plant items" ON bo_plant_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own takeoff tools" ON bo_takeoff_tools FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own takeoff subtypes" ON bo_takeoff_subtypes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own tool task mappings" ON bo_tool_task_mappings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own formula rules" ON bo_formula_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own ai scope mappings" ON bo_ai_scope_mappings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
