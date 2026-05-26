-- ============================================
-- In-app chat — push tokens (Phase 4)
-- ============================================
create table public.push_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null unique,
  platform text check (platform in ('ios','android','web')),
  updated_at timestamptz default now()
);
create index idx_push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "Users manage own push tokens" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
