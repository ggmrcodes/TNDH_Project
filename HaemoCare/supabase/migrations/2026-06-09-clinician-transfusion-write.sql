-- Clinician write surface for pre-transfusion labs + reaction notes.
--
-- Until this migration, clinicians had only SELECT on public.transfusions —
-- the lab edit UI in PreTransfusionLabsPanel would silently fail because no
-- UPDATE policy existed. This migration opens a tightly-scoped write surface:
--
--   * RLS UPDATE policy gates the row: clinician must be actively linked
--     (`public.is_active_clinician_for(user_id)`) to the patient.
--   * BEFORE UPDATE trigger gates the columns: clinician edits are limited
--     to `pre_labs`, `reaction_noted`, `reaction_detail`. Any other column
--     change raises an exception.
--
-- Patient self-edits (`auth.uid() = OLD.user_id`) bypass the trigger — their
-- own RLS policies already constrain the row to their data. service_role and
-- other system actors (`auth.uid() IS NULL`) also bypass.
--
-- Realtime: the existing 2026-06-09-patient-data-realtime trigger on
-- public.transfusions broadcasts every UPDATE to topic `patient:{user_id}`,
-- so clinician edits propagate to the patient's screen live.
--
-- Auditing: pre_labs edits continue to go through
-- public.transfusion_lab_audit_log (an audit-row INSERT precedes the
-- transfusion UPDATE in the service layer, per the 2026-05-17 brief).
-- Reaction-note edits are NOT audited in this v1 — they're observational
-- text, not safety-critical numeric values.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Column-lock trigger function
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.lock_clinician_to_labs_and_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role / system actor: no auth context, allow.
  if auth.uid() is null then
    return new;
  end if;

  -- Patient self-edit: their own RLS policies constrain the row scope;
  -- nothing more for this trigger to enforce.
  if auth.uid() = old.user_id then
    return new;
  end if;

  -- Anything else reaching this point is a clinician edit (gated by the
  -- "Clinicians update assigned patient transfusions" UPDATE policy
  -- below). Lock to the labs + reactions columns.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.date is distinct from old.date
     or new.hospital is distinct from old.hospital
     or new.units_received is distinct from old.units_received
     or new.notes is distinct from old.notes
     or new.document_photo_url is distinct from old.document_photo_url
     or new.pre_hb_g_dl is distinct from old.pre_hb_g_dl
     or new.post_hb_g_dl is distinct from old.post_hb_g_dl
     or new.created_at is distinct from old.created_at
  then
    raise exception 'clinician may only update pre_labs, reaction_noted, reaction_detail on public.transfusions (column-lock trigger)';
  end if;

  return new;
end;
$$;

-- Re-apply trigger cleanly so re-running the migration is idempotent.
drop trigger if exists restrict_clinician_transfusion_writes on public.transfusions;
create trigger restrict_clinician_transfusion_writes
before update on public.transfusions
for each row
execute function public.lock_clinician_to_labs_and_reactions();

-- ───────────────────────────────────────────────────────────────────────
-- 2. RLS UPDATE policy for clinicians
-- ───────────────────────────────────────────────────────────────────────

drop policy if exists "Clinicians update assigned patient transfusions" on public.transfusions;
create policy "Clinicians update assigned patient transfusions"
on public.transfusions
for update
to authenticated
using (public.is_active_clinician_for(user_id))
with check (public.is_active_clinician_for(user_id));
