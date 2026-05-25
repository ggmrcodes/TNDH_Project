-- ============================================
-- Profile additions — primary diagnosis + thalassemia subtype
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-25-profile-additions-design.md
-- Phase: 1

alter table public.profiles
  add column primary_diagnosis text
    check (primary_diagnosis in ('thalassemia', 'hemophilia', 'other')),
  add column thalassemia_subtype text
    check (thalassemia_subtype in (
      'alpha_silent_carrier', 'alpha_trait', 'hb_h_disease',
      'alpha_major_hb_barts', 'beta_minor', 'beta_intermedia',
      'beta_major_cooleys', 'hb_e_beta_thal', 'delta_beta_thal',
      'hb_lepore_syndrome'
    ));

-- Subtype only valid when primary diagnosis is thalassemia.
alter table public.profiles
  add constraint subtype_requires_thalassemia
    check (thalassemia_subtype is null or primary_diagnosis = 'thalassemia');
