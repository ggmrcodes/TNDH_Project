-- ============================================
-- Transfusion document photo — persist the scanned image
-- ============================================
-- The scan flow (ScanTransfusionScreen) captures a photo of the
-- transfusion document, sends it to AI extraction, and currently
-- discards it. This migration adds long-term storage so the photo
-- is kept with the transfusion record and viewable later.
--
-- Columns:
--   transfusions.document_photo_url text  — storage path inside the
--     'transfusion-documents' bucket (NULL for legacy rows and for
--     manual-entry records with no attached photo). NOT a public URL —
--     callers must mint a signed URL via storage.createSignedUrl().
--
-- Bucket:
--   'transfusion-documents' — private. Path convention is
--     '{user_id}/{transfusion_id}.jpg'.
--
-- Read access:
--   - The owning patient (storage.foldername(name)[1] = auth.uid())
--   - Any clinician with an *active* link to that patient (matches the
--     existing visibility of the structured transfusion fields).
--
-- Write access (insert/update/delete): owning patient only.

alter table public.transfusions
  add column if not exists document_photo_url text;

-- Bucket
insert into storage.buckets (id, name, public)
values ('transfusion-documents', 'transfusion-documents', false)
on conflict (id) do nothing;

-- ── RLS on storage.objects ────────────────────────────────────────

-- Owning patient can read their own document
create policy "Patient reads own transfusion documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'transfusion-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Active linked clinician can read the patient's documents.
-- Mirrors the visibility of the transfusion's structured columns
-- (pre_hb, post_hb, units, etc.) which clinicians already see via
-- their own SELECT policy on public.transfusions.
create policy "Linked clinicians read patient transfusion documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'transfusion-documents'
    and exists (
      select 1 from public.clinician_patient_links
      where clinician_id = auth.uid()
        and patient_user_id::text = (storage.foldername(name))[1]
        and status = 'active'
    )
  );

-- Owning patient can upload
create policy "Patient uploads own transfusion documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'transfusion-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owning patient can replace (UPDATE) their own document
create policy "Patient updates own transfusion documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'transfusion-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owning patient can delete their own document
create policy "Patient deletes own transfusion documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'transfusion-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
