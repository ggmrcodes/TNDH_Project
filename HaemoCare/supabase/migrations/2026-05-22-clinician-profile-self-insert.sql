-- Allow newly-signed-up clinicians to insert their own clinician_profiles row.
--
-- The existing policies on clinician_profiles cover SELECT and UPDATE for
-- self (auth.uid() = user_id) but there is no INSERT policy. Without this
-- migration the clinician signup flow's row insert fails under RLS.
--
-- Safety: this only allows inserting a row whose user_id matches the
-- authenticated user. `verified` defaults to false at the column level, so
-- self-insert cannot grant verified-clinician privileges — the admin still
-- has to flip `verified = true` to elevate the row.
--
-- If a row already exists for that user_id, the UNIQUE constraint on
-- (user_id) blocks duplicate inserts, so this policy cannot be used to
-- create multiple rows per user.

create policy "Clinicians insert own profile"
  on public.clinician_profiles
  for insert
  with check (auth.uid() = user_id);
