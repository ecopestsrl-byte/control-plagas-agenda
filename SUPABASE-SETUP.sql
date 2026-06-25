create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_kv enable row level security;

drop policy if exists "service role full access" on public.app_kv;
create policy "service role full access"
on public.app_kv
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
