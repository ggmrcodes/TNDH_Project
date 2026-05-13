-- Backfill pre_hb_g_dl / post_hb_g_dl on transfusions.
-- These columns are referenced by the TypeScript Transfusion type but
-- were never added to schema.sql. Add them as nullable numerics.

alter table public.transfusions
  add column if not exists pre_hb_g_dl numeric(4,2),
  add column if not exists post_hb_g_dl numeric(4,2);
