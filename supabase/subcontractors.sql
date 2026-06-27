-- Subcontractor contracts (both rate-based and fixed-price)
CREATE TABLE IF NOT EXISTS public.sub_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        TEXT,
  contact_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('rate', 'fixed')),
  description   TEXT NOT NULL DEFAULT '',
  rate_type     TEXT CHECK (rate_type IN ('hourly', 'daily')),
  rate_amount   NUMERIC(10,2),
  quoted_amount NUMERIC(10,2),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_contracts" ON public.sub_contracts;
CREATE POLICY "users manage own sub_contracts" ON public.sub_contracts
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Time entries for day/hourly rate subs
CREATE TABLE IF NOT EXISTS public.sub_time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_contract_id UUID NOT NULL REFERENCES public.sub_contracts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  units           NUMERIC(10,2) NOT NULL,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_time_entries" ON public.sub_time_entries;
CREATE POLICY "users manage own sub_time_entries" ON public.sub_time_entries
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Payment stages for fixed-price subs (each can be pushed to Xero)
CREATE TABLE IF NOT EXISTS public.sub_payment_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_contract_id UUID NOT NULL REFERENCES public.sub_contracts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description     TEXT NOT NULL DEFAULT '',
  amount          NUMERIC(10,2) NOT NULL,
  due_date        DATE,
  paid_date       DATE,
  xero_bill_id    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sub_payment_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own sub_payment_stages" ON public.sub_payment_stages;
CREATE POLICY "users manage own sub_payment_stages" ON public.sub_payment_stages
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
