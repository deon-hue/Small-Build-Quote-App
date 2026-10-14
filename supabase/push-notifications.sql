-- push-notifications.sql — alerts on your phone and tablet (web push) for things that need your attention.
-- push_subscriptions: one row per device you turn notifications on for (the address the phone's own push service gave us, and the keys to send to it).
-- notification_prefs: what you want to be told about, and a master switch, one row per person.
-- push_sent: remembers which alert has already been sent today, so one thing is never sent twice.
-- The app only ever reads and writes your own rows; the server sends the alerts with its own key. Safe to run more than once. Staging first, then live.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  device_label  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user  ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON public.push_subscriptions (owner_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Own push subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  supplier_replies  BOOLEAN NOT NULL DEFAULT true,
  sub_notes         BOOLEAN NOT NULL DEFAULT true,
  timesheets        BOOLEAN NOT NULL DEFAULT true,
  daily_summary     BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own notification prefs" ON public.notification_prefs;
CREATE POLICY "Own notification prefs" ON public.notification_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_sent (
  user_id   UUID NOT NULL,
  key       TEXT NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
-- only the server (its own key, which bypasses row security) reads or writes this one
ALTER TABLE public.push_sent ENABLE ROW LEVEL SECURITY;
