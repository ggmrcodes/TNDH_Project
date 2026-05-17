-- Adds the structured `urine_color` field to symptom_logs.
-- See docs/superpowers/specs/2026-05-17-urine-color-logging-brief.md.
--
-- The seven-color hemophilia-relevant scale is enforced at the database
-- level so a typo in the client can never sneak past Supabase. The
-- column is nullable: historical logs (which carry the legacy
-- `dark_urine` key inside `severity_scores`) are not backfilled and
-- continue to display via the legacy code path.

alter table public.symptom_logs
  add column if not exists urine_color text
    check (
      urine_color is null
      or urine_color in ('clear', 'yellow', 'dark_yellow', 'pink', 'red', 'brown_tea', 'cola')
    );

-- Optional helper index for the clinician dashboard if it ever filters
-- on hematuria colors directly. Cheap to maintain because >90% of rows
-- will be null.
create index if not exists symptom_logs_urine_color_idx
  on public.symptom_logs (urine_color)
  where urine_color is not null;
