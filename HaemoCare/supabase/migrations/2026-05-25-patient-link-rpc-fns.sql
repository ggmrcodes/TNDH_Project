-- ============================================
-- Patient-link RPC helpers (security definer)
-- ============================================
--
-- The clinician-linking flow needs to resolve the publicly-shareable
-- patient_id (HC-XXXXXX, printed on PassportScreen) to an auth.users.id
-- so a clinician_patient_links row can be inserted. Existing RLS on
-- profiles blocks clinicians from reading anything until a link is
-- active, so we expose two minimal SECURITY DEFINER functions that
-- only return the patient_id ↔ user_id mapping.
--
-- Spec: docs/superpowers/specs/2026-05-25-clinician-patient-linking-design.md
-- Phase: 2 (clinician request flow)

-- Forward lookup: clinician types HC-XXXXXX → resolve to user_id.
-- Open to any authenticated caller; the actual write is gated by the
-- INSERT policy on clinician_patient_links (verified clinicians only).
create or replace function public.find_user_by_patient_id(p_patient_id text)
returns uuid
language sql stable security definer
set search_path = public as $$
  select user_id
  from public.profiles
  where patient_id = p_patient_id
  limit 1;
$$;

-- Reverse lookup: given a user_id, return their patient_id — but only
-- if the calling user is a party to any link with that patient (pending
-- or otherwise). This is what surfaces the patient_id in greyed pending
-- rows on the clinician's queue without exposing the table broadly.
create or replace function public.get_patient_display_id(p_user_id uuid)
returns text
language sql stable security definer
set search_path = public as $$
  select p.patient_id
  from public.profiles p
  where p.user_id = p_user_id
    and exists (
      select 1 from public.clinician_patient_links l
      where l.patient_user_id = p_user_id
        and (l.clinician_id = auth.uid() or l.patient_user_id = auth.uid())
    )
  limit 1;
$$;
