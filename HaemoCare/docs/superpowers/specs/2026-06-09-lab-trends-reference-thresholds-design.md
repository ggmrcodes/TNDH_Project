# Lab-trends reference thresholds — design spec

**Status:** approved
**Date:** 2026-06-09
**Closes:** the deferred decision flagged in `src/components/charts/LabTrendsChart.tsx` ("Reference-range bands intentionally NOT drawn (deferred threshold decision).")

## Goal

Add per-patient clinical reference threshold lines to the existing
`LabTrendsChart` on the clinician dashboard. The doctor sees, at a glance,
whether the patient's measured pre-transfusion labs are crossing the
hospital's actionable threshold — and the patient (or their clinical
state) can override the default when it differs from the program norm.

## Decisions locked from brainstorm

| # | Question | Answer |
|---|---|---|
| Q1 | Is the line a population reference range or a treatment threshold? | **B — treatment threshold** (matches existing `HbTrendChart` 7.0 g/dL precedent) |
| Q2 | Which metrics / what values? | **B** — Hb floor `7.0 g/dL`, Ferritin ceiling `1000 ng/mL`, Hct skipped (mathematically derived from Hb) |
| Q3 | Fixed program-wide constants, or per-patient configurable? | **B — per-patient configurable** with program defaults as fallback |
| Section 2 | Chart visual | **A** — dashed line + right-edge value chip + y-axis auto-extend; severity-colored (urgent red for Hb floor, monitor amber for Ferritin ceiling). No threshold-crossing markers in v1. |
| Section 3 | Edit UI placement | **A** — gear icon in `LabTrendsChart` header; opens `ThresholdEditSheet` bottom sheet. Clinician-only. |
| Section 4 | Service / i18n / tests | **A** — `updateProfileThresholds` service + mock + 4 new i18n keys/locale + unit tests on the pure helper |

## Architecture

### Data model

Two new nullable columns on `public.profiles`:

```sql
alter table public.profiles
  add column if not exists hb_threshold_override numeric(3,1)
    check (hb_threshold_override is null
           or hb_threshold_override between 0.1 and 25),
  add column if not exists ferritin_threshold_override integer
    check (ferritin_threshold_override is null
           or ferritin_threshold_override between 0 and 10000);
```

Range constraints mirror the existing `validateLabs` numeric ranges from
`utils/preTransfusionLabs.ts`. They protect against typos like saving
`90` instead of `9.0`.

### Program defaults

In `utils/clinicalThresholds.ts`:

```ts
export const HB_DEFAULT_FLOOR_G_DL = 7.0;
export const FERRITIN_DEFAULT_CEILING_NG_ML = 1000;

export function getEffectiveLabThresholds(
  profile: Pick<Profile, 'hb_threshold_override' | 'ferritin_threshold_override'> | null
): { hbFloor: number; ferritinCeiling: number } {
  return {
    hbFloor: profile?.hb_threshold_override ?? HB_DEFAULT_FLOOR_G_DL,
    ferritinCeiling: profile?.ferritin_threshold_override ?? FERRITIN_DEFAULT_CEILING_NG_ML,
  };
}
```

`HB_DEFAULT_FLOOR_G_DL` is intentionally identical to the existing
`HbTrendChart` decay-projection threshold (7.0) so the two charts on the
dashboard agree on what "transfuse below this" means.

### Chart rendering

`LabTrendsChart` gets two new optional props:

```ts
interface LabTrendsChartProps {
  // ... existing props
  hbFloor?: number;
  ferritinCeiling?: number;
}
```

When defined, each per-metric subplot renders one dashed horizontal line
at the threshold value:

| Metric | Color | Stroke | Right-edge chip |
|---|---|---|---|
| Hb floor | `COLORS.statusUrgent` on `COLORS.statusUrgentBg` chip | 1.5px, `strokeDasharray="4,3"` | bg `statusUrgentBg`, text `statusUrgentText` |
| Ferritin ceiling | `COLORS.statusMonitor` on `COLORS.statusMonitorBg` chip | same | bg `statusMonitorBg`, text `statusMonitorText` |

The y-axis auto-extends so the threshold line is always visible — the
existing `niceStep` axis math extends from `min(dataMin, threshold)` to
`max(dataMax, threshold)` with the existing top/bottom margins.

Hct subplot renders no line (per Q2=B; Hct ≈ 3 × Hb).

### Edit UI

A `Feather "sliders"` icon in `LabTrendsChart`'s header, immediately
right of the window selector. Tapping it opens `ThresholdEditSheet` — a
new component (~150 lines) that renders a bottom sheet modal with:

- Hb floor input (g/dL), prefilled with the current override or the
  default. Placeholder text shows `default (7.0)`.
- "Use default (7.0)" link below the field; only shown when an override
  is currently set. Tapping the link clears the field, which the save
  handler treats as `null`.
- Same pair for Ferritin ceiling.
- Validation via the existing `validateLabField` from
  `utils/preTransfusionLabs.ts` — bad input shows the same error
  messages as the lab-entry form.
- `[Cancel] [Save]` action row.

On save: `updateProfileThresholds(patientUserId, ...)` (real) or
`updateProfileThresholdsForPatient(...)` (mock). Then closes the sheet
and bumps a `thresholdsTick` in the LabTrendsChart parent so the chart
re-renders with the new threshold lines.

### RLS

New migration `2026-06-09-clinician-edit-profile-thresholds.sql`:

1. **UPDATE policy:** clinician can update a profile row when
   `public.is_active_clinician_for(user_id)` returns true. Same helper
   PR #38 used for transfusion writes.

2. **BEFORE UPDATE trigger** `lock_clinician_to_threshold_overrides`:
   security-definer, `set search_path = ''`. Identical pattern to
   PR #38's `lock_clinician_to_labs_and_reactions`:
   - `auth.uid() is null` → service_role, allow
   - `auth.uid() = old.user_id` → patient self-edit, allow (their own
     RLS policies constrain row scope)
   - otherwise: raise an exception unless ONLY
     `hb_threshold_override` or `ferritin_threshold_override` differs
     from OLD. All other profile columns are enumerated in the
     `is distinct from` chain.

Patient self-edits (e.g., from `ProfileEditForm`) continue to work
unchanged; the trigger bails out before reaching the column-lock.
Service role bypasses, same as PR #38.

### Service layer

```ts
// src/services/clinicianService.ts
export async function updateProfileThresholds(
  patientUserId: string,
  thresholds: {
    hb_threshold_override: number | null;
    ferritin_threshold_override: number | null;
  }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(thresholds)
    .eq('user_id', patientUserId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}
```

The column-lock trigger from the RLS migration rejects anything other
than these two columns, so the service can stay narrow and trust the
DB to enforce scope.

Mock equivalent in `src/mock/services.ts`:

```ts
export async function updateProfileThresholdsForPatient(
  patientUserId: string,
  thresholds: {
    hb_threshold_override: number | null;
    ferritin_threshold_override: number | null;
  }
): Promise<Profile> {
  const linked = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === patientUserId);
  if (!linked) throw new Error('Linked patient missing');
  linked.profile = { ...linked.profile, ...thresholds };
  return linked.profile;
}
```

### Threading thresholds into the chart

`PatientDetailPane` already loads `patientProfile`. It resolves the
effective thresholds once via `getEffectiveLabThresholds(patientProfile)`
and passes them to `LabTrendsChart` as the new `hbFloor` /
`ferritinCeiling` props. No new fetch.

### i18n

4 new keys per locale in `src/i18n/en.ts` / `src/i18n/th.ts`:

| Key | EN | TH |
|---|---|---|
| `preLabs.threshold.title` | Lab reference thresholds | ค่ามาตรฐานเลือด |
| `preLabs.threshold.hbField` | Hb floor (g/dL) | ค่าต่ำสุด Hb (g/dL) |
| `preLabs.threshold.ferritinField` | Ferritin ceiling (ng/mL) | ค่าสูงสุด Ferritin (ng/mL) |
| `preLabs.threshold.useDefault` | Use default ({value}) | ใช้ค่ามาตรฐาน ({value}) |

The right-edge chip on the chart reuses the existing `formatLabValue`
helper from `utils/labTrendsData.ts` so the displayed number matches the
y-axis formatting.

### Tests

New `src/utils/__tests__/clinicalThresholds.test.ts` (this file does
not yet exist — `clinicalThresholds.ts` was previously tested only via
downstream evaluators). Tests:

- `getEffectiveLabThresholds(null)` returns defaults
- `getEffectiveLabThresholds({ hb: null, ferritin: null })` returns defaults
- `getEffectiveLabThresholds({ hb: 9.0, ferritin: 800 })` returns the overrides
- `getEffectiveLabThresholds({ hb: 9.0, ferritin: null })` returns mixed (override + default)
- `getEffectiveLabThresholds({ hb: null, ferritin: 800 })` returns mixed (default + override)
- `HB_DEFAULT_FLOOR_G_DL` and `FERRITIN_DEFAULT_CEILING_NG_ML` exported constants match the documented values

Mock service test in `src/mock/__tests__/services.test.ts` (or wherever
the mock tests live — check during plan stage):

- `updateProfileThresholdsForPatient` patches the linked profile in place
- throws when the patient is not found

No new SQL tests (this repo doesn't have a DB test harness). The trigger
logic is reviewed via code review and manually verified post-deploy.

## Files touched

**New:**
- `supabase/migrations/2026-06-09-profile-threshold-overrides.sql`
- `supabase/migrations/2026-06-09-clinician-edit-profile-thresholds.sql`
- `src/components/clinician/ThresholdEditSheet.tsx`
- `src/utils/__tests__/clinicalThresholds.test.ts`

**Modified:**
- `src/types/database.ts` (two new optional fields on `Profile`)
- `src/utils/clinicalThresholds.ts` (defaults + `getEffectiveLabThresholds`)
- `src/components/charts/LabTrendsChart.tsx` (lines + chip + y-axis extend + gear)
- `src/services/clinicianService.ts` (`updateProfileThresholds`)
- `src/mock/services.ts` (`updateProfileThresholdsForPatient`)
- `src/components/clinician/PatientDetailPane.tsx` (thread effective thresholds into chart props)
- `src/i18n/en.ts`, `src/i18n/th.ts` (4 keys per locale)

## Deployment

Same shape as PR #38 / PR #39:

1. Apply both SQL migrations to Supabase (CLI `supabase db push` or paste
   into the SQL editor). Both must be applied before the clinician edit
   path works — without the column migration, the trigger references
   columns that don't exist.
2. Deploy the app (`git pull && pm2 restart expo-metro` on the Metro
   server; force-quit Expo Go to load the new bundle).

## Out of scope

These were considered and explicitly rejected during brainstorm. Listed
here so future-us doesn't add them silently.

- **Threshold-crossing markers** (small triangle every time a data point
  dips below the floor or above the ceiling). Section 2 option C. More
  signal, more visual noise; revisit if doctors miss crossings.
- **Patient-side edit** of thresholds. Section 3 option D. Thresholds
  are a clinical decision; the patient lacks the context to set them.
- **Sex-specific default ranges.** `Profile` has no sex/gender field
  today; adding one expands scope significantly and isn't required by
  the chosen "treatment threshold" framing (Q1=B).
- **Audit log of threshold changes.** Threshold edits are clinical
  configuration, not safety-critical numeric labs. If we ever want this,
  mirror PR #38's `transfusion_lab_audit_log` pattern.
- **Hct line.** Q2=B. Hct ≈ 3 × Hb; a Hct line would just restate the
  Hb line.
- **Reference-range bands** (population norms for healthy non-thalassemia
  adults). Q1=A. Most data falls outside the band by definition for
  these patients; the band would scream falsely.

## Future work (not in this PR)

- If multiple hospitals using this app converge on different defaults,
  promote `HB_DEFAULT_FLOOR_G_DL` and `FERRITIN_DEFAULT_CEILING_NG_ML`
  to a `hospitals` table column so each clinic's clinicians see their
  hospital's default.
- If sex-specific defaults become clinically required, add `sex` to
  `Profile` and branch the default resolution in
  `getEffectiveLabThresholds`.
- If clinicians ask for threshold history (audit), add a
  `profile_threshold_audit_log` table and mirror PR #38's
  before-update audit-row pattern.
