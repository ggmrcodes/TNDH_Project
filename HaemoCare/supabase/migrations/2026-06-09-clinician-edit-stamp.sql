-- Patient-facing "reviewed by your clinician" indicator.
--
-- Adds two columns on public.transfusions that get auto-stamped by the
-- BEFORE UPDATE trigger whenever a clinician edit reaches the row:
--
--   clinician_edited_at   timestamptz  -- when the clinician last edited
--   clinician_edited_by   uuid         -- which clinician (auth.uid())
--
-- The trigger is the single source of truth — the client never sends
-- these columns, and any attempt to set them from a client is rejected
-- in the column-lock check. This means a leaked clinician token can't
-- forge a different clinician's edit, and the patient app trusts the
-- stamp without needing to re-verify it.
--
-- Patient self-edits do not touch these fields (the trigger bails on
-- `auth.uid() = OLD.user_id` before reaching the stamp logic) — so
-- the indicator persists across a patient's later edits, accurately
-- recording "the last time a clinician touched this record."

-- ───────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ───────────────────────────────────────────────────────────────────────

alter table public.transfusions
  add column if not exists clinician_edited_at timestamptz,
  add column if not exists clinician_edited_by uuid;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Replace the column-lock trigger function
-- ───────────────────────────────────────────────────────────────────────
-- Same shape as 2026-06-09-clinician-transfusion-write.sql but now
-- (a) refuses client writes to clinician_edited_at/by, and
-- (b) server-stamps both columns after the column-lock check passes.

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

  -- Patient self-edit: their own RLS policies constrain row scope.
  if auth.uid() = old.user_id then
    return new;
  end if;

  -- Clinician path. Lock columns the client may change to the small
  -- editable set; explicitly reject any client-attempted write to the
  -- new clinician_edited_at / clinician_edited_by stamps (the server
  -- stamps them itself, below).
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
     or new.clinician_edited_at is distinct from old.clinician_edited_at
     or new.clinician_edited_by is distinct from old.clinician_edited_by
  then
    raise exception 'clinician may only update pre_labs, reaction_noted, reaction_detail on public.transfusions (column-lock trigger)';
  end if;

  -- Server-side stamp: record who/when this clinician edit happened.
  -- Runs AFTER the column-lock check so the client can never spoof
  -- a different clinician's edit.
  new.clinician_edited_at := now();
  new.clinician_edited_by := auth.uid();

  return new;
end;
$$;

-- The trigger itself was created by the prior migration; the function
-- replacement above is enough to pick up the new behavior.
