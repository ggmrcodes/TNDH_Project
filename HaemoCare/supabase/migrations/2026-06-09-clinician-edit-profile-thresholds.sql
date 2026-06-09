-- Clinician write surface for the per-patient threshold overrides added
-- in 2026-06-09-profile-threshold-overrides.sql.
--
-- Same shape as PR #38's transfusion column-lock pattern:
--   * RLS UPDATE policy gates row scope (is_active_clinician_for).
--   * BEFORE UPDATE trigger gates column scope: clinician edits may
--     only change hb_threshold_override / ferritin_threshold_override.
--   * Patient self-edits (auth.uid() = OLD.user_id) bypass.
--   * service_role (auth.uid() IS NULL) bypasses.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Column-lock trigger function
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.lock_clinician_to_threshold_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.user_id then
    return new;
  end if;

  -- Clinician path. Allow ONLY hb_threshold_override and
  -- ferritin_threshold_override to differ from OLD.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.patient_id is distinct from old.patient_id
     or new.full_name is distinct from old.full_name
     or new.blood_type is distinct from old.blood_type
     or new.rh_factor is distinct from old.rh_factor
     or new.antibodies is distinct from old.antibodies
     or new.known_reactions is distinct from old.known_reactions
     or new.medications is distinct from old.medications
     or new.language_preference is distinct from old.language_preference
     or new.pdpa_consented is distinct from old.pdpa_consented
     or new.pdpa_consented_at is distinct from old.pdpa_consented_at
     or new.share_full_name is distinct from old.share_full_name
     or new.recommended_visit_interval_days is distinct from old.recommended_visit_interval_days
     or new.primary_diagnosis is distinct from old.primary_diagnosis
     or new.thalassemia_subtype is distinct from old.thalassemia_subtype
     or new.hospital_id is distinct from old.hospital_id
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
  then
    raise exception 'clinician may only update hb_threshold_override / ferritin_threshold_override on public.profiles (column-lock trigger)';
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_clinician_profile_writes on public.profiles;
create trigger restrict_clinician_profile_writes
before update on public.profiles
for each row
execute function public.lock_clinician_to_threshold_overrides();

-- ───────────────────────────────────────────────────────────────────────
-- 2. RLS UPDATE policy
-- ───────────────────────────────────────────────────────────────────────

drop policy if exists "Clinicians update assigned patient threshold overrides" on public.profiles;
create policy "Clinicians update assigned patient threshold overrides"
on public.profiles
for update
to authenticated
using (public.is_active_clinician_for(user_id))
with check (public.is_active_clinician_for(user_id));
