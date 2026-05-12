-- HaemoCare Demo Data Seed
--
-- INSTRUCTIONS:
-- 1. First create the demo user in Supabase Auth:
--    Email: demo@haemocare.app / Password: HaemoDemo2024
-- 2. Copy the user's UUID from auth.users
-- 3. Replace all occurrences of DEMO_USER_ID below with that UUID
-- 4. Run this SQL in Supabase SQL Editor

-- ============================================
-- PROFILE
-- ============================================
insert into public.profiles (user_id, full_name, blood_type, rh_factor, antibodies, known_reactions, medications, language_preference)
values (
  'DEMO_USER_ID',
  'สมชาย ทะลังสาง',
  'B', '+',
  array['Anti-E', 'Anti-c'],
  'Mild febrile reaction on 2023-08-15. Slowed infusion rate resolved symptoms.',
  'Deferasirox 500mg daily, Folic acid 5mg daily',
  'th'
);

-- ============================================
-- TRANSFUSIONS (3 records)
-- ============================================
insert into public.transfusions (id, user_id, date, hospital, units_received, reaction_noted, reaction_detail, notes) values
  ('a1000001-0000-0000-0000-000000000001', 'DEMO_USER_ID',
   '2026-02-10 09:00:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   false, '',
   'Routine transfusion. Hb pre: 7.2 g/dL, post: 10.1 g/dL'),

  ('a1000001-0000-0000-0000-000000000002', 'DEMO_USER_ID',
   '2026-03-12 10:00:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   true, 'Mild chills at 30 min mark. Slowed rate to 2 mL/kg/hr. Resolved within 15 min.',
   'Hb pre: 6.8 g/dL, post: 9.9 g/dL'),

  ('a1000001-0000-0000-0000-000000000003', 'DEMO_USER_ID',
   '2026-04-09 09:30:00+07', 'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 2,
   false, '',
   'Hb pre: 7.0 g/dL. Uneventful transfusion.');

-- ============================================
-- SYMPTOM LOGS (5 records across outcomes)
-- ============================================
insert into public.symptom_logs (user_id, transfusion_id, logged_at, symptoms, severity_scores, outcome, notes) values
  -- Log 1: Normal - mild fatigue after Feb transfusion
  ('DEMO_USER_ID', 'a1000001-0000-0000-0000-000000000001',
   '2026-02-10 18:00:00+07',
   '["fatigue"]'::jsonb,
   '{"fatigue": 3}'::jsonb,
   'normal', 'Mild tiredness, resting at home'),

  -- Log 2: Monitor - chills + fever after Mar transfusion
  ('DEMO_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-12 16:00:00+07',
   '["fever", "chills", "back_pain"]'::jsonb,
   '{"fever": 5, "chills": 6, "back_pain": 3}'::jsonb,
   'monitor', 'Chills started during transfusion. Took paracetamol.'),

  -- Log 3: Normal - follow-up next day, resolved
  ('DEMO_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-13 08:00:00+07',
   '["fatigue"]'::jsonb,
   '{"fatigue": 2}'::jsonb,
   'normal', 'Feeling much better. Fever gone.'),

  -- Log 4: Urgent - example of alarming symptoms
  ('DEMO_USER_ID', 'a1000001-0000-0000-0000-000000000002',
   '2026-03-12 22:00:00+07',
   '["fever", "chills", "dark_urine", "back_pain"]'::jsonb,
   '{"fever": 7, "chills": 5, "dark_urine": 4, "back_pain": 6}'::jsonb,
   'urgent', 'Dark urine noticed. Called nurse hotline.'),

  -- Log 5: Normal - after Apr transfusion
  ('DEMO_USER_ID', 'a1000001-0000-0000-0000-000000000003',
   '2026-04-09 17:00:00+07',
   '["fatigue", "skin_rash"]'::jsonb,
   '{"fatigue": 2, "skin_rash": 1}'::jsonb,
   'normal', 'Minor fatigue and slight rash at IV site. Resolved.');

-- ============================================
-- APPOINTMENTS (2 upcoming)
-- ============================================
insert into public.appointments (user_id, scheduled_date, hospital, notes, linked_transfusion_id) values
  ('DEMO_USER_ID', '2026-05-07 09:00:00+07',
   'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ',
   'Monthly transfusion appointment. Bring updated blood work from last week.', null),

  ('DEMO_USER_ID', '2026-05-21 13:00:00+07',
   'โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ',
   'Iron chelation therapy review with Dr. Pranee. Discuss ferritin levels.', null);
