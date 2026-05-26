-- ============================================
-- In-app chat — core schema + RLS (Phase 1)
-- ============================================
-- Spec: docs/superpowers/specs/2026-05-26-in-app-chat-design.md

create table public.messages (
  id              uuid default uuid_generate_v4() primary key,
  link_id         uuid references public.clinician_patient_links(id) on delete cascade not null,
  sender_id       uuid references auth.users(id) on delete cascade not null,
  body            text,
  attachment_path text,
  attachment_type text check (attachment_type in ('image')),
  created_at      timestamptz default now(),
  constraint message_has_content check (
    (body is not null and length(btrim(body)) > 0) or attachment_path is not null
  )
);
create index idx_messages_link_created on public.messages (link_id, created_at desc);

create table public.message_reads (
  link_id      uuid references public.clinician_patient_links(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  last_read_at timestamptz default now() not null,
  primary key (link_id, user_id)
);

create or replace function public.is_link_party(p_link_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links l
    where l.id = p_link_id
      and (l.clinician_id = auth.uid() or l.patient_user_id = auth.uid())
  );
$$;
revoke execute on function public.is_link_party(uuid) from anon, public;
grant execute on function public.is_link_party(uuid) to authenticated;

create or replace function public.is_active_link_party(p_link_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links l
    where l.id = p_link_id
      and l.status = 'active'
      and (l.clinician_id = auth.uid() or l.patient_user_id = auth.uid())
  );
$$;
revoke execute on function public.is_active_link_party(uuid) from anon, public;
grant execute on function public.is_active_link_party(uuid) to authenticated;

alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

create policy "Parties read messages" on public.messages
  for select using (public.is_link_party(link_id));

create policy "Active parties send messages" on public.messages
  for insert with check (sender_id = auth.uid() and public.is_active_link_party(link_id));

create policy "Users manage own read marker" on public.message_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
