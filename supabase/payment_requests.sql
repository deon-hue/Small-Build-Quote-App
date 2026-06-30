CREATE TABLE IF NOT EXISTS public.payment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  received_method TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own payment_requests" ON public.payment_requests;
CREATE POLICY "users manage own payment_requests" ON public.payment_requests
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
