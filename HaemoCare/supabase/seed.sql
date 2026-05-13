-- HaemoCare Demo Data Seed
--
-- For when you provision real Supabase and want to populate the demo accounts
-- with the same data that mock-mode renders. Mirrors src/mock/data.ts +
-- src/mock/clinicianData.ts + src/mock/services.ts (mockEmergencyContacts).
--
-- PREREQUISITES (do these in Supabase Auth UI first, then run this SQL):
--   1. Create user: demo@haemocare.app / HaemoDemo2024
--      → copy UUID, replace ALL occurrences of DEMO_PATIENT_USER_ID below.
--   2. Create user: demo-doctor@haemocare.app / HaemoDoc2024
--      → copy UUID, replace ALL occurrences of DEMO_CLINICIAN_USER_ID below.
--   3. (Optional, for the 5 linked patients on the clinician dashboard.)
--      Create 5 placeholder auth users:
--        somchai@demo.haemocare.app, niran@demo.haemocare.app,
--        areeya@demo.haemocare.app, kraisorn@demo.haemocare.app,
--        pim@demo.haemocare.app (any password)
--      → copy their UUIDs, replace LINKED_PATIENT_1 … LINKED_PATIENT_5.
--      (If you skip step 3, the clinician dashboard works but the cohort is empty.)
--
-- Then run this SQL via the Supabase SQL Editor. Migrations from
-- supabase/migrations/ must already be applied — this seed assumes the schema
-- (incl. recommended_visit_interval_days, clinician_profiles,
-- clinician_patient_links, emergency_contacts) exists.

-- ============================================
-- PATIENT-SIDE: DEMO PATIENT (Somchai)
-- ============================================

insert into public.profiles (
  user_id, patient_id, full_name, blood_type, rh_factor, antibodies,
  known_reactions, medications, language_preference, pdpa_consented,
  pdpa_consented_at, share_full_name, recommended_visit_interval_days,
  created_at
) values (
  'DEMO_PATIENT_USER_ID',
  'HC-048291',
  'สมชาย ทะลังสาง',
  'B', '+',
  array['Anti-E', 'Anti-c'],
  'Mild febrile reaction on 2023-08-15. Slowed infusion rate resolved symptoms.',
  'Deferasirox 500mg daily, Folic acid 5mg daily',
  'th',
  true,
  '2025-01-15T00:00:00+07:00',
  false,
  14,  -- tier-1 overdue given last tx Apr 9 and today ~May 14
  '2025-01-15T00:00:00+07:00'
);

-- Transfusions (3) with Hb values for the decay analytics
insert into public.transfusions (
  id, user_id, date, hospital, units_received, reaction_noted,
  reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl
) values
  ('a1000001-0000-0000-0000-000000000001', 'DEMO_PATIENT_USER_ID',
   '2026-02-10 09:00:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   false, '', 'Routine transfusion. Hb pre: 7.2 g/dL, post: 10.1 g/dL', 7.2, 10.1),
  ('a1000001-0000-0000-0000-000000000002', 'DEMO_PATIENT_USER_ID',
   '2026-03-12 10:00:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   true, 'Mild chills at 30 min mark. Slowed rate to 2 mL/kg/hr. Resolved within 15 min.',
   'Hb pre: 6.8 g/dL, post: 9.9 g/dL', 6.8, 9.9),
  ('a1000001-0000-0000-0000-000000000003', 'DEMO_PATIENT_USER_ID',
   '2026-04-09 09:30:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   false, '', 'Hb pre: 7.0 g/dL. Uneventful transfusion.', 7.0, 10.2);

-- Symptom logs (9): mix of normal/monitor/urgent, including 3 recent
-- between-visit logs that demonstrate the overdue-aware severity bump.
insert into public.symptom_logs (
  user_id, transfusion_id, logged_at, symptoms, severity_scores, outcome, notes
) values
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000001',
   '2026-02-10 18:00:00+07',
   '["fatigue"]'::jsonb, '{"fatigue": 3}'::jsonb,
   'normal', 'Mild tiredness, resting at home.'),
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-12 16:00:00+07',
   '["fever", "chills", "back_pain"]'::jsonb,
   '{"fever": 5, "chills": 6, "back_pain": 3}'::jsonb,
   'monitor', 'Chills started during transfusion. Took paracetamol.'),
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-12 22:00:00+07',
   '["fever", "chills", "dark_urine", "back_pain"]'::jsonb,
   '{"fever": 7, "chills": 5, "dark_urine": 4, "back_pain": 6}'::jsonb,
   'urgent', 'Dark urine noticed. Called nurse hotline.'),
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-13 08:00:00+07',
   '["fatigue"]'::jsonb, '{"fatigue": 2}'::jsonb,
   'normal', 'Feeling much better. Fever gone.'),
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000003',
   '2026-04-09 17:00:00+07',
   '["fatigue", "skin_rash"]'::jsonb,
   '{"fatigue": 2, "skin_rash": 1}'::jsonb,
   'normal', 'Minor fatigue and slight rash at IV site. Resolved.'),
  ('DEMO_PATIENT_USER_ID', 'a1000001-0000-0000-0000-000000000003',
   '2026-04-10 08:00:00+07',
   '["fatigue"]'::jsonb, '{"fatigue": 1}'::jsonb,
   'normal', 'Day after: nearly resolved.'),
  -- Recent between-visit logs (no linked transfusion):
  ('DEMO_PATIENT_USER_ID', null,
   '2026-05-04 11:00:00+07',
   '["fatigue"]'::jsonb, '{"fatigue": 3}'::jsonb,
   'normal', 'Tired today. Hb feels low.'),
  ('DEMO_PATIENT_USER_ID', null,
   '2026-05-09 15:00:00+07',
   '["fatigue", "fever"]'::jsonb,
   '{"fatigue": 5, "fever": 4}'::jsonb,
   'monitor', 'Low-grade fever this afternoon. No clear cause.'),
  ('DEMO_PATIENT_USER_ID', null,
   '2026-05-12 19:30:00+07',
   '["fever", "chills", "dark_urine"]'::jsonb,
   '{"fever": 7, "chills": 5, "dark_urine": 4}'::jsonb,
   'urgent', 'Fever spiked, urine darker than usual. Need to contact clinician.');

-- Appointments: missed (May 7), upcoming (May 21), FHIR-imported (June 5)
insert into public.appointments (
  user_id, scheduled_date, hospital, notes, linked_transfusion_id,
  source, external_id, external_source_name
) values
  ('DEMO_PATIENT_USER_ID', '2026-05-07 09:00:00+07',
   'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ',
   'Monthly transfusion appointment. Bring updated blood work from last week.',
   null, 'manual', null, null),
  ('DEMO_PATIENT_USER_ID', '2026-05-21 13:00:00+07',
   'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ',
   'Iron chelation therapy review with Dr. Pranee. Discuss ferritin levels.',
   null, 'manual', null, null),
  ('DEMO_PATIENT_USER_ID', '2026-06-05 10:00:00+07',
   'โรงพยาบาลสงขลานครินทร์',
   'Hematology follow-up (auto-imported from hospital FHIR).',
   null, 'fhir_th_core',
   'Appointment/HC-FHIR-48291-203', 'TH Core FHIR sandbox');

-- Emergency contacts for the demo patient (3 entries, priority-ordered)
insert into public.emergency_contacts (
  user_id, name, phone, role_label, priority, created_at
) values
  ('DEMO_PATIENT_USER_ID', 'วนิดา ทะลังสาง', '0812345678', 'Caretaker', 1, '2025-01-20T00:00:00+07:00'),
  ('DEMO_PATIENT_USER_ID', 'นายแพทย์สุวรรณ ตันตระกูล', '0898765432', 'Doctor', 2, '2025-01-20T00:00:00+07:00'),
  ('DEMO_PATIENT_USER_ID', 'นิรันดร์ ทะลังสาง', '0856789012', 'Other', 3, '2025-01-20T00:00:00+07:00');

-- ============================================
-- CLINICIAN-SIDE: DEMO DOCTOR (Dr. Ploy)
-- ============================================

insert into public.clinician_profiles (
  user_id, full_name, license_number, hospital_affiliation, verified, verified_at, created_at
) values (
  'DEMO_CLINICIAN_USER_ID',
  'Dr. Ploy Wattanaporn',
  '12345-Demo',
  'Songklanagarind Hospital',
  true,
  '2026-01-15T09:00:00+07:00',
  '2026-01-15T09:00:00+07:00'
);

-- ============================================
-- COHORT: 5 LINKED PATIENTS (FOR THE DASHBOARD)
-- ============================================
-- Replace LINKED_PATIENT_1 … LINKED_PATIENT_5 with real auth.user UUIDs.
-- If you don't want a real cohort, you can skip this whole block —
-- the clinician dashboard will render with an empty queue.

-- Linked Patient 1: Somchai Panyawong — tier-2 overdue (28 days)
insert into public.profiles (user_id, patient_id, full_name, blood_type, rh_factor,
  antibodies, known_reactions, medications, language_preference, pdpa_consented,
  share_full_name, recommended_visit_interval_days)
values ('LINKED_PATIENT_1', 'HC-100001', 'Somchai Panyawong', 'B', '+',
  array[]::text[], '', 'Deferasirox 500mg daily', 'th', true, true, 28);

insert into public.transfusions (id, user_id, date, hospital, units_received,
  reaction_noted, reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl) values
  ('a1100001-0000-0000-0000-000000000001', 'LINKED_PATIENT_1', '2026-03-19 09:00:00+07',
   'Songklanagarind', 2, false, '', '', 6.8, 9.4),
  ('a1100001-0000-0000-0000-000000000002', 'LINKED_PATIENT_1', '2026-02-19 09:00:00+07',
   'Songklanagarind', 2, false, '', '', 7.1, 9.6);

insert into public.symptom_logs (user_id, transfusion_id, logged_at, symptoms,
  severity_scores, outcome, notes) values
  ('LINKED_PATIENT_1', 'a1100001-0000-0000-0000-000000000001',
   '2026-05-11 09:00:00+07',
   '["fatigue", "headache"]'::jsonb,
   '{"fatigue": 5, "headache": 4}'::jsonb,
   'monitor', '');

insert into public.emergency_contacts (user_id, name, phone, role_label, priority) values
  ('LINKED_PATIENT_1', 'Wanida Panyawong', '0812345678', 'Spouse', 1),
  ('LINKED_PATIENT_1', 'Dr. Suwan', '0898765432', 'Hematologist', 2);

-- Linked Patient 2: Niran Tonsuk — tier-1 overdue (14 days) + urgent symptom 2d ago
insert into public.profiles (user_id, patient_id, full_name, blood_type, rh_factor,
  antibodies, known_reactions, medications, language_preference, pdpa_consented,
  share_full_name, recommended_visit_interval_days)
values ('LINKED_PATIENT_2', 'HC-100002', 'Niran Tonsuk', 'B', '+',
  array[]::text[], '', 'Deferasirox 500mg daily', 'th', true, true, 28);

insert into public.transfusions (id, user_id, date, hospital, units_received,
  reaction_noted, reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl) values
  ('a1200002-0000-0000-0000-000000000001', 'LINKED_PATIENT_2', '2026-04-02 09:00:00+07',
   'Siriraj', 2, false, '', '', 6.5, 9.1);

insert into public.symptom_logs (user_id, transfusion_id, logged_at, symptoms,
  severity_scores, outcome, notes) values
  ('LINKED_PATIENT_2', 'a1200002-0000-0000-0000-000000000001',
   '2026-05-12 14:00:00+07',
   '["fever", "chills", "back_pain"]'::jsonb,
   '{"fever": 8, "chills": 6, "back_pain": 5}'::jsonb,
   'urgent', '');

insert into public.emergency_contacts (user_id, name, phone, role_label, priority) values
  ('LINKED_PATIENT_2', 'Pranee Tonsuk', '0823456789', 'Mother', 1);

-- Linked Patient 3: Areeya Kraisri — stable, upcoming appointment
insert into public.profiles (user_id, patient_id, full_name, blood_type, rh_factor,
  antibodies, known_reactions, medications, language_preference, pdpa_consented,
  share_full_name, recommended_visit_interval_days)
values ('LINKED_PATIENT_3', 'HC-100003', 'Areeya Kraisri', 'B', '+',
  array[]::text[], '', 'Deferasirox 500mg daily', 'th', true, true, 28);

insert into public.transfusions (id, user_id, date, hospital, units_received,
  reaction_noted, reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl) values
  ('a1300003-0000-0000-0000-000000000001', 'LINKED_PATIENT_3', '2026-05-04 09:00:00+07',
   'Songklanagarind', 2, false, '', '', 7.0, 9.5);

insert into public.appointments (user_id, scheduled_date, hospital, notes,
  linked_transfusion_id, source) values
  ('LINKED_PATIENT_3', '2026-05-21 09:00:00+07', 'Songklanagarind',
   '', null, 'manual');

-- Linked Patient 4: Kraisorn Vichaikun — stable but has reaction on file
insert into public.profiles (user_id, patient_id, full_name, blood_type, rh_factor,
  antibodies, known_reactions, medications, language_preference, pdpa_consented,
  share_full_name, recommended_visit_interval_days)
values ('LINKED_PATIENT_4', 'HC-100004', 'Kraisorn Vichaikun', 'B', '+',
  array[]::text[], '', 'Deferasirox 500mg daily', 'th', true, true, 28);

insert into public.transfusions (id, user_id, date, hospital, units_received,
  reaction_noted, reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl) values
  ('a1400004-0000-0000-0000-000000000001', 'LINKED_PATIENT_4', '2026-04-24 09:00:00+07',
   'Songklanagarind', 2, true,
   'Mild febrile reaction during infusion. Premedicated with acetaminophen on next visit.',
   '', 6.7, 9.3);

-- Linked Patient 5: Pim Jaroon — stable, on cadence
insert into public.profiles (user_id, patient_id, full_name, blood_type, rh_factor,
  antibodies, known_reactions, medications, language_preference, pdpa_consented,
  share_full_name, recommended_visit_interval_days)
values ('LINKED_PATIENT_5', 'HC-100005', 'Pim Jaroon', 'B', '+',
  array[]::text[], '', 'Deferasirox 500mg daily', 'th', true, true, 28);

insert into public.transfusions (id, user_id, date, hospital, units_received,
  reaction_noted, reaction_detail, notes, pre_hb_g_dl, post_hb_g_dl) values
  ('a1500005-0000-0000-0000-000000000001', 'LINKED_PATIENT_5', '2026-05-07 09:00:00+07',
   'Siriraj', 2, false, '', '', 7.2, 9.7);

insert into public.symptom_logs (user_id, transfusion_id, logged_at, symptoms,
  severity_scores, outcome, notes) values
  ('LINKED_PATIENT_5', 'a1500005-0000-0000-0000-000000000001',
   '2026-05-09 09:00:00+07',
   '["fatigue"]'::jsonb,
   '{"fatigue": 2}'::jsonb,
   'normal', '');

insert into public.appointments (user_id, scheduled_date, hospital, notes,
  linked_transfusion_id, source) values
  ('LINKED_PATIENT_5', '2026-05-28 09:00:00+07', 'Siriraj',
   '', null, 'manual');

-- ============================================
-- CLINICIAN ↔ PATIENT LINKS (all active)
-- ============================================
-- These rows make the 5 patients visible to the clinician via the
-- `is_active_clinician_for(uuid)` RLS helper.
insert into public.clinician_patient_links (
  clinician_id, patient_user_id, status, requested_at, consented_at,
  consent_text_version, share_full_name
) values
  ('DEMO_CLINICIAN_USER_ID', 'LINKED_PATIENT_1', 'active',
   '2026-01-20T00:00:00+07:00', '2026-01-20T00:00:00+07:00', 'pdpa-clin-2026-01', true),
  ('DEMO_CLINICIAN_USER_ID', 'LINKED_PATIENT_2', 'active',
   '2026-01-22T00:00:00+07:00', '2026-01-22T00:00:00+07:00', 'pdpa-clin-2026-01', true),
  ('DEMO_CLINICIAN_USER_ID', 'LINKED_PATIENT_3', 'active',
   '2026-01-25T00:00:00+07:00', '2026-01-25T00:00:00+07:00', 'pdpa-clin-2026-01', true),
  ('DEMO_CLINICIAN_USER_ID', 'LINKED_PATIENT_4', 'active',
   '2026-02-01T00:00:00+07:00', '2026-02-01T00:00:00+07:00', 'pdpa-clin-2026-01', true),
  ('DEMO_CLINICIAN_USER_ID', 'LINKED_PATIENT_5', 'active',
   '2026-02-15T00:00:00+07:00', '2026-02-15T00:00:00+07:00', 'pdpa-clin-2026-01', true);

-- ============================================
-- Done.
-- ============================================
-- Verify by signing in as either demo account in the app, OR by running:
--   select count(*) from public.symptom_logs where user_id = 'DEMO_PATIENT_USER_ID';
--   -- should return 9
--   select count(*) from public.clinician_patient_links where clinician_id = 'DEMO_CLINICIAN_USER_ID' and status = 'active';
--   -- should return 5
