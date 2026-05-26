-- ============================================
-- Admin approval workflow
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-26-clinician-onboarding-design.md
-- Phase: B

create table public.admins (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

-- A user can read their own admin row (to determine isAdmin client-side).
create policy "Users read own admin row" on public.admins
  for select using (user_id = auth.uid());

-- Security-definer admin check, mirrors is_active_clinician_for().
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

-- Admins can read every clinician profile (to list pending ones)...
create policy "Admins read all clinician profiles" on public.clinician_profiles
  for select using (public.is_admin());

-- ...and flip verification.
create policy "Admins verify clinicians" on public.clinician_profiles
  for update using (public.is_admin()) with check (public.is_admin());
