-- Per-patient emergency contacts (up to 3, priority-ordered).
-- See docs/superpowers/specs/2026-05-14-emergency-contact-design.md.

create table public.emergency_contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text not null check (length(phone) >= 9),
  role_label text not null default '',
  priority integer not null default 1 check (priority between 1 and 3),
  created_at timestamptz default now(),
  constraint emergency_contacts_user_priority_unique
    unique (user_id, priority) deferrable initially deferred
);
create index idx_emergency_contacts_user
  on public.emergency_contacts(user_id, priority);

alter table public.emergency_contacts enable row level security;

create policy "Users manage own emergency contacts"
  on public.emergency_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Clinicians read assigned emergency contacts"
  on public.emergency_contacts
  for select
  using (public.is_active_clinician_for(user_id));

create or replace function public.swap_emergency_contact_priorities(
  a_id uuid, b_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  a_user uuid; b_user uuid;
  a_prio integer; b_prio integer;
begin
  select user_id, priority into a_user, a_prio
    from emergency_contacts where id = a_id for update;
  select user_id, priority into b_user, b_prio
    from emergency_contacts where id = b_id for update;
  if a_user is null or b_user is null then
    raise exception 'contact not found';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if a_user is distinct from auth.uid() or b_user is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;
  update emergency_contacts
    set priority = case
      when id = a_id then b_prio
      when id = b_id then a_prio
      else priority
    end
    where id in (a_id, b_id);
end;
$$;

revoke execute on function public.swap_emergency_contact_priorities(uuid, uuid) from anon;
grant execute on function public.swap_emergency_contact_priorities(uuid, uuid) to authenticated;
