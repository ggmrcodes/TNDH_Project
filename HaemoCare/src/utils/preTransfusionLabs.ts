// Validation + parsing helpers for pre-transfusion lab values (Hb / Hct / Ferritin).
//
// Field ranges per docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md:
//   Hb       0.1 – 25     g/dL
//   Hct      1   – 75     %
//   Ferritin 0   – 10000  ng/mL
//
// Clinical safety: bad numbers must never persist. The form layer reuses
// `validateLabField` per input + `validateLabs` on submit; the service
// layer (mock + real) reuses `validateLabs` defensively.

import type { PreTransfusionLabs } from '../types/database';

export const HB_MIN = 0.1;
export const HB_MAX = 25;
export const HCT_MIN = 1;
export const HCT_MAX = 75;
export const FERRITIN_MIN = 0;
export const FERRITIN_MAX = 10000;

/** Field codes used for translation lookup. */
export type LabField = 'hb' | 'hct' | 'ferritin';

/** Error code (not user-facing) — caller maps to a localized message. */
export type LabValidationCode = 'too_low' | 'too_high' | 'not_a_number';

export interface LabValidationError {
  field: LabField;
  code: LabValidationCode;
  min: number;
  max: number;
}

const RANGE: Record<LabField, { min: number; max: number }> = {
  hb:       { min: HB_MIN, max: HB_MAX },
  hct:      { min: HCT_MIN, max: HCT_MAX },
  ferritin: { min: FERRITIN_MIN, max: FERRITIN_MAX },
};

/** Parse a text input into a number-or-null, then validate against the
 * field's clinical range. Empty / whitespace input is treated as `null`
 * (the user cleared the field) and is always valid because labs are
 * optional per-field.
 *
 * Returns `{ value }` on success (value is `number | null`) or
 * `{ error }` on failure. */
export function validateLabField(
  field: LabField,
  raw: string
): { value: number | null; error?: undefined } | { value?: undefined; error: LabValidationError } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };

  // Normalize: allow comma-decimal (Thai keyboards often default to comma).
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    const { min, max } = RANGE[field];
    return { error: { field, code: 'not_a_number', min, max } };
  }

  const { min, max } = RANGE[field];
  if (n < min) return { error: { field, code: 'too_low', min, max } };
  if (n > max) return { error: { field, code: 'too_high', min, max } };
  return { value: n };
}

/** Run all three numeric ranges across a (possibly partial) labs payload.
 * `null` values are accepted (optional per-field); only out-of-range
 * numbers produce errors. */
export function validateLabs(
  labs: Pick<PreTransfusionLabs, 'hb' | 'hct' | 'ferritin'>
): LabValidationError[] {
  const errors: LabValidationError[] = [];
  (['hb', 'hct', 'ferritin'] as const).forEach((field) => {
    const v = labs[field];
    if (v === null || v === undefined) return;
    const { min, max } = RANGE[field];
    if (!Number.isFinite(v)) {
      errors.push({ field, code: 'not_a_number', min, max });
      return;
    }
    if (v < min) errors.push({ field, code: 'too_low', min, max });
    if (v > max) errors.push({ field, code: 'too_high', min, max });
  });
  return errors;
}

/** True when every value is null — used by the UI to decide whether the
 * "pre-labs" badge / row should render. */
export function isEmptyLabs(
  labs: Pick<PreTransfusionLabs, 'hb' | 'hct' | 'ferritin'> | null | undefined
): boolean {
  if (!labs) return true;
  return labs.hb == null && labs.hct == null && labs.ferritin == null;
}
