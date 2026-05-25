-- phase6.sql: Per-user job type default templates
-- Run this in Supabase SQL editor

create table if not exists job_type_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  job_type   text not null,
  template   jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, job_type)
);

alter table job_type_templates enable row level security;

create policy "Users manage own job type templates"
  on job_type_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
