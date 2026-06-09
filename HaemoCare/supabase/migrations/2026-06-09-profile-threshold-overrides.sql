-- Per-patient overrides for the LabTrendsChart reference threshold lines.
-- See docs/superpowers/specs/2026-06-09-lab-trends-reference-thresholds-design.md.
--
-- Program defaults live in src/utils/clinicalThresholds.ts (Hb floor 7.0
-- g/dL, Ferritin ceiling 1000 ng/mL). When these columns are NULL the
-- chart falls back to the default; when set, the value here overrides.
--
-- Range constraints mirror validateLabs() in utils/preTransfusionLabs.ts
-- so a typo like 90 (meant 9.0) is rejected at the DB layer too.

alter table public.profiles
  add column if not exists hb_threshold_override numeric(3,1)
    check (hb_threshold_override is null
           or (hb_threshold_override >= 0.1 and hb_threshold_override <= 25)),
  add column if not exists ferritin_threshold_override integer
    check (ferritin_threshold_override is null
           or (ferritin_threshold_override >= 0 and ferritin_threshold_override <= 10000));
