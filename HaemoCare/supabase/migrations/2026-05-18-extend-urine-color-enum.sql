-- Extends the urine_color CHECK constraint to allow the four
-- clinically-abnormal-only picker categories introduced when the
-- picker was pruned. Legacy values stay allowed so historical rows
-- written by the previous 7-color picker continue to validate.

alter table public.symptom_logs
  drop constraint if exists symptom_logs_urine_color_check;

alter table public.symptom_logs
  add constraint symptom_logs_urine_color_check
  check (
    urine_color is null
    or urine_color in (
      -- New picker values (only ones the client writes going forward)
      'red_pink', 'cola_dark', 'cloudy_white', 'green_blue',
      -- Legacy values (kept valid for rows written before this migration)
      'clear', 'yellow', 'dark_yellow', 'pink', 'red', 'brown_tea', 'cola'
    )
  );
