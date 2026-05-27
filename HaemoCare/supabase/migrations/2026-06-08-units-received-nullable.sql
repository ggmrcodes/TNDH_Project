-- Make transfusions.units_received optional (the number of blood bags received
-- is now a not-required field on the scan/transfusion-document form). A blank
-- value means "unknown" — stored as NULL rather than a guessed default of 1.
-- Drop the NOT NULL constraint and the default 1 so an omitted/blank value is
-- recorded as unknown. Existing rows keep their values.

alter table public.transfusions
  alter column units_received drop not null,
  alter column units_received drop default;
