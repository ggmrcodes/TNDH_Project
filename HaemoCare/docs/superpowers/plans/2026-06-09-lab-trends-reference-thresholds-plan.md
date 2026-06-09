# Lab-trends reference thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-patient clinical reference threshold lines (Hb floor + Ferritin ceiling) to the existing `LabTrendsChart` on the clinician dashboard, with program-default fallback and a clinician-only edit sheet.

**Architecture:** Two nullable columns on `public.profiles` + program defaults in `utils/clinicalThresholds.ts` + a pure `getEffectiveLabThresholds()` resolver. RLS UPDATE policy + `BEFORE UPDATE` column-lock trigger gate clinician writes to those two columns only (same shape as PR #38's transfusion trigger). `LabTrendsChart` gains two threshold props that drive dashed lines + right-edge severity chips; y-axis auto-extends so the line stays visible even when no data point reaches it. A new `ThresholdEditSheet` bottom sheet opens from a gear icon in the chart header.

**Tech Stack:** React Native + Expo SDK 54 + TypeScript, Supabase (Postgres + RLS), react-native-svg, jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-09-lab-trends-reference-thresholds-design.md`

---

## File map

**New files:**
- `supabase/migrations/2026-06-09-profile-threshold-overrides.sql`
- `supabase/migrations/2026-06-09-clinician-edit-profile-thresholds.sql`
- `src/components/clinician/ThresholdEditSheet.tsx`
- `src/utils/__tests__/clinicalThresholds.test.ts`

**Modified files:**
- `src/types/database.ts`
- `src/utils/clinicalThresholds.ts`
- `src/services/clinicianService.ts`
- `src/mock/services.ts`
- `src/components/charts/LabTrendsChart.tsx`
- `src/components/clinician/PatientDetailPane.tsx`
- `src/i18n/en.ts`
- `src/i18n/th.ts`

---

## Task 1: SQL — add threshold-override columns to `profiles`

**Files:**
- Create: `supabase/migrations/2026-06-09-profile-threshold-overrides.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la supabase/migrations/2026-06-09-profile-threshold-overrides.sql
```

Expected: file listed with non-zero size.

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/lab-trends-thresholds
git add supabase/migrations/2026-06-09-profile-threshold-overrides.sql
git commit -m "feat(db): add hb/ferritin threshold override columns on profiles"
```

---

## Task 2: SQL — clinician UPDATE policy + column-lock trigger

**Files:**
- Create: `supabase/migrations/2026-06-09-clinician-edit-profile-thresholds.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Clinician write surface for the per-patient threshold overrides added
-- in 2026-06-09-profile-threshold-overrides.sql.
--
-- Same shape as PR #38's transfusion column-lock pattern:
--   * RLS UPDATE policy gates row scope (is_active_clinician_for).
--   * BEFORE UPDATE trigger gates column scope: clinician edits may
--     only change hb_threshold_override / ferritin_threshold_override.
--   * Patient self-edits (auth.uid() = OLD.user_id) bypass.
--   * service_role (auth.uid() IS NULL) bypasses.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Column-lock trigger function
-- ───────────────────────────────────────────────────────────────────────

create or replace function public.lock_clinician_to_threshold_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.user_id then
    return new;
  end if;

  -- Clinician path. Allow ONLY hb_threshold_override and
  -- ferritin_threshold_override to differ from OLD.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.patient_id is distinct from old.patient_id
     or new.full_name is distinct from old.full_name
     or new.blood_type is distinct from old.blood_type
     or new.rh_factor is distinct from old.rh_factor
     or new.antibodies is distinct from old.antibodies
     or new.known_reactions is distinct from old.known_reactions
     or new.medications is distinct from old.medications
     or new.language_preference is distinct from old.language_preference
     or new.pdpa_consented is distinct from old.pdpa_consented
     or new.pdpa_consented_at is distinct from old.pdpa_consented_at
     or new.share_full_name is distinct from old.share_full_name
     or new.recommended_visit_interval_days is distinct from old.recommended_visit_interval_days
     or new.primary_diagnosis is distinct from old.primary_diagnosis
     or new.thalassemia_subtype is distinct from old.thalassemia_subtype
     or new.hospital_id is distinct from old.hospital_id
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
  then
    raise exception 'clinician may only update hb_threshold_override / ferritin_threshold_override on public.profiles (column-lock trigger)';
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_clinician_profile_writes on public.profiles;
create trigger restrict_clinician_profile_writes
before update on public.profiles
for each row
execute function public.lock_clinician_to_threshold_overrides();

-- ───────────────────────────────────────────────────────────────────────
-- 2. RLS UPDATE policy
-- ───────────────────────────────────────────────────────────────────────

drop policy if exists "Clinicians update assigned patient threshold overrides" on public.profiles;
create policy "Clinicians update assigned patient threshold overrides"
on public.profiles
for update
to authenticated
using (public.is_active_clinician_for(user_id))
with check (public.is_active_clinician_for(user_id));
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la supabase/migrations/2026-06-09-clinician-edit-profile-thresholds.sql
```

Expected: file listed with non-zero size.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-06-09-clinician-edit-profile-thresholds.sql
git commit -m "feat(rls): clinician UPDATE on profile threshold overrides only"
```

---

## Task 3: TypeScript — add fields to `Profile` type

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Read the current Profile interface**

```bash
grep -n "^export interface Profile " src/types/database.ts
```

Expected: line number around 22-30 range.

- [ ] **Step 2: Add the two optional fields**

Find this section in `src/types/database.ts`:

```ts
export interface Profile {
  id: string;
  user_id: string;
  patient_id: string;
  full_name: string;
  // ... other fields
  hospital_id: string | null;
  created_at: string;
  updated_at: string;
}
```

Add these two fields immediately after `hospital_id`:

```ts
  // ── Per-patient lab reference threshold overrides (added 2026-06-09).
  // Used by LabTrendsChart on the clinician dashboard. NULL means use
  // the program defaults from src/utils/clinicalThresholds.ts
  // (Hb floor 7.0 g/dL, Ferritin ceiling 1000 ng/mL). Clinician-only
  // edit path; the BEFORE UPDATE trigger in
  // 2026-06-09-clinician-edit-profile-thresholds.sql enforces that
  // clinician writes touch only these two columns.
  hb_threshold_override?: number | null;
  ferritin_threshold_override?: number | null;
```

- [ ] **Step 3: Verify tsc still passes**

```bash
npx tsc --noEmit
```

Expected: no output (clean exit).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add hb/ferritin threshold overrides to Profile"
```

---

## Task 4: Pure helper — `getEffectiveLabThresholds` (TDD)

**Files:**
- Create: `src/utils/__tests__/clinicalThresholds.test.ts`
- Modify: `src/utils/clinicalThresholds.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/clinicalThresholds.test.ts`:

```ts
import {
  HB_DEFAULT_FLOOR_G_DL,
  FERRITIN_DEFAULT_CEILING_NG_ML,
  getEffectiveLabThresholds,
} from '../clinicalThresholds';

describe('lab threshold defaults', () => {
  it('Hb default floor is 7.0 g/dL', () => {
    expect(HB_DEFAULT_FLOOR_G_DL).toBe(7.0);
  });

  it('Ferritin default ceiling is 1000 ng/mL', () => {
    expect(FERRITIN_DEFAULT_CEILING_NG_ML).toBe(1000);
  });
});

describe('getEffectiveLabThresholds', () => {
  it('returns defaults when profile is null', () => {
    expect(getEffectiveLabThresholds(null)).toEqual({
      hbFloor: 7.0,
      ferritinCeiling: 1000,
    });
  });

  it('returns defaults when both overrides are null', () => {
    expect(
      getEffectiveLabThresholds({
        hb_threshold_override: null,
        ferritin_threshold_override: null,
      }),
    ).toEqual({ hbFloor: 7.0, ferritinCeiling: 1000 });
  });

  it('returns defaults when both overrides are undefined (legacy rows)', () => {
    expect(
      getEffectiveLabThresholds({
        hb_threshold_override: undefined,
        ferritin_threshold_override: undefined,
      } as { hb_threshold_override?: number | null; ferritin_threshold_override?: number | null }),
    ).toEqual({ hbFloor: 7.0, ferritinCeiling: 1000 });
  });

  it('returns the override when both are set', () => {
    expect(
      getEffectiveLabThresholds({
        hb_threshold_override: 9.0,
        ferritin_threshold_override: 800,
      }),
    ).toEqual({ hbFloor: 9.0, ferritinCeiling: 800 });
  });

  it('returns mixed (Hb override + Ferritin default) when only Hb is set', () => {
    expect(
      getEffectiveLabThresholds({
        hb_threshold_override: 9.0,
        ferritin_threshold_override: null,
      }),
    ).toEqual({ hbFloor: 9.0, ferritinCeiling: 1000 });
  });

  it('returns mixed (Hb default + Ferritin override) when only Ferritin is set', () => {
    expect(
      getEffectiveLabThresholds({
        hb_threshold_override: null,
        ferritin_threshold_override: 800,
      }),
    ).toEqual({ hbFloor: 7.0, ferritinCeiling: 800 });
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

```bash
npx jest src/utils/__tests__/clinicalThresholds.test.ts 2>&1 | tail -10
```

Expected: FAIL — `HB_DEFAULT_FLOOR_G_DL is not exported from '../clinicalThresholds'` (or similar undefined-export errors).

- [ ] **Step 3: Implement the constants + helper**

Open `src/utils/clinicalThresholds.ts`. Find the top of the file (after the imports). Add this block above the existing exports:

```ts
import type { Profile } from '../types/database';

// ── Lab reference thresholds for LabTrendsChart ─────────────────────────
//
// Program-default thresholds for the clinician dashboard's
// LabTrendsChart. Per-patient overrides live on profiles
// (hb_threshold_override / ferritin_threshold_override). See:
//   - spec: docs/superpowers/specs/2026-06-09-lab-trends-reference-thresholds-design.md
//   - schema: supabase/migrations/2026-06-09-profile-threshold-overrides.sql
//
// HB_DEFAULT_FLOOR_G_DL is intentionally identical to the threshold
// HbTrendChart uses for decay projection, so the two charts on the
// dashboard agree on "transfuse below this."

/** Default Hb floor — "transfuse-when-below" threshold for the chart. */
export const HB_DEFAULT_FLOOR_G_DL = 7.0;

/** Default Ferritin ceiling — iron-overload red flag. */
export const FERRITIN_DEFAULT_CEILING_NG_ML = 1000;

export interface EffectiveLabThresholds {
  hbFloor: number;
  ferritinCeiling: number;
}

/**
 * Resolve the effective Hb floor + Ferritin ceiling for a patient.
 * Falls back to program defaults when the per-patient override is
 * null or undefined (e.g. legacy rows or never-set).
 */
export function getEffectiveLabThresholds(
  profile: Pick<Profile, 'hb_threshold_override' | 'ferritin_threshold_override'> | null
): EffectiveLabThresholds {
  return {
    hbFloor: profile?.hb_threshold_override ?? HB_DEFAULT_FLOOR_G_DL,
    ferritinCeiling: profile?.ferritin_threshold_override ?? FERRITIN_DEFAULT_CEILING_NG_ML,
  };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
npx jest src/utils/__tests__/clinicalThresholds.test.ts 2>&1 | tail -6
```

Expected: `Tests: 7 passed, 7 total`.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -5
```

Expected: tsc clean; jest passes at the previous total + 7 new.

- [ ] **Step 6: Commit**

```bash
git add src/utils/clinicalThresholds.ts src/utils/__tests__/clinicalThresholds.test.ts
git commit -m "feat(utils): add lab threshold defaults + getEffectiveLabThresholds"
```

---

## Task 5: Real service — `updateProfileThresholds`

**Files:**
- Modify: `src/services/clinicianService.ts`

- [ ] **Step 1: Add the service function**

Open `src/services/clinicianService.ts`. Find `getProfileForPatient` (around line 99). Add this function immediately after it:

```ts
/**
 * Clinician-side update of the patient's lab reference thresholds.
 * The BEFORE UPDATE trigger from
 * 2026-06-09-clinician-edit-profile-thresholds.sql rejects any column
 * change other than the two threshold overrides, so this service can
 * stay narrow and trust the DB to enforce scope.
 *
 * Passing `null` for either field clears the override; the chart will
 * fall back to the default from clinicalThresholds.ts.
 */
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

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/services/clinicianService.ts
git commit -m "feat(service): add updateProfileThresholds clinician write"
```

---

## Task 6: Mock service — `updateProfileThresholdsForPatient`

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Find the existing `getProfileForPatient` in the mock**

```bash
grep -n "export async function getProfileForPatient" src/mock/services.ts
```

Expected: a line number.

- [ ] **Step 2: Add the mock service**

In `src/mock/services.ts`, immediately after the `getProfileForPatient` function, add:

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

- [ ] **Step 3: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/mock/services.ts
git commit -m "feat(mock): add updateProfileThresholdsForPatient"
```

---

## Task 7: i18n — 4 new keys per locale

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Find the end of the `preLabs.*` block in en.ts**

```bash
grep -n "'preLabs\.reactions\.detailPlaceholder'" src/i18n/en.ts
```

Expected: a line number.

- [ ] **Step 2: Add keys to en.ts**

Find this existing line in `src/i18n/en.ts`:

```ts
  'preLabs.reactions.detailPlaceholder': 'e.g., chills 15 min after start, resolved with paracetamol',
```

Add immediately after it (still inside the same object):

```ts
  'preLabs.threshold.title': 'Lab reference thresholds',
  'preLabs.threshold.hbField': 'Hb floor (g/dL)',
  'preLabs.threshold.ferritinField': 'Ferritin ceiling (ng/mL)',
  'preLabs.threshold.useDefault': 'Use default ({value})',
```

- [ ] **Step 3: Add keys to th.ts**

Find this existing line in `src/i18n/th.ts`:

```ts
  'preLabs.reactions.detailPlaceholder': 'เช่น มีอาการหนาวสั่นหลังเริ่ม 15 นาที หายหลังกินพาราเซตามอล',
```

Add immediately after it:

```ts
  'preLabs.threshold.title': 'ค่ามาตรฐานเลือด',
  'preLabs.threshold.hbField': 'ค่าต่ำสุด Hb (g/dL)',
  'preLabs.threshold.ferritinField': 'ค่าสูงสุด Ferritin (ng/mL)',
  'preLabs.threshold.useDefault': 'ใช้ค่ามาตรฐาน ({value})',
```

- [ ] **Step 4: Verify tsc (catches missing keys across locales)**

```bash
npx tsc --noEmit
```

Expected: clean. If tsc reports a missing key on th.ts or en.ts, the locales are out of sync — re-check both edits.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.ts src/i18n/th.ts
git commit -m "i18n: add 4 keys for lab threshold edit sheet"
```

---

## Task 8: `ThresholdEditSheet` component

**Files:**
- Create: `src/components/clinician/ThresholdEditSheet.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/clinician/ThresholdEditSheet.tsx`:

```tsx
// Bottom-sheet modal for editing a patient's per-patient lab reference
// thresholds (Hb floor + Ferritin ceiling). Opened from the gear icon
// in LabTrendsChart's header. Clinician-only — no patient-side caller.
//
// Empty input = clear the override = use the program default from
// clinicalThresholds.ts.
//
// Validation reuses validateLabField from utils/preTransfusionLabs so
// the same per-field ranges (Hb 0.1-25, Ferritin 0-10000) and error
// messages as the lab-entry form apply here too.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import Button from '../common/Button';
import { validateLabField, type LabValidationError } from '../../utils/preTransfusionLabs';
import {
  HB_DEFAULT_FLOOR_G_DL,
  FERRITIN_DEFAULT_CEILING_NG_ML,
} from '../../utils/clinicalThresholds';

export interface ThresholdEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Current override values (null = using default). */
  initialHbOverride: number | null;
  initialFerritinOverride: number | null;
  /** Caller persists the values + closes the sheet on success. */
  onSave: (next: {
    hb_threshold_override: number | null;
    ferritin_threshold_override: number | null;
  }) => Promise<void>;
}

interface FieldState {
  raw: string;
  error: LabValidationError | null;
}

function toFieldRaw(value: number | null): string {
  return value == null ? '' : String(value);
}

export default function ThresholdEditSheet({
  visible,
  onClose,
  initialHbOverride,
  initialFerritinOverride,
  onSave,
}: ThresholdEditSheetProps) {
  const { t } = useLanguage();
  const [hb, setHb] = useState<FieldState>({ raw: toFieldRaw(initialHbOverride), error: null });
  const [ferritin, setFerritin] = useState<FieldState>({
    raw: toFieldRaw(initialFerritinOverride),
    error: null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const hbResult = validateLabField('hb', hb.raw);
    const ferResult = validateLabField('ferritin', ferritin.raw);
    if (hbResult.error || ferResult.error) {
      if (hbResult.error) setHb((p) => ({ ...p, error: hbResult.error! }));
      if (ferResult.error) setFerritin((p) => ({ ...p, error: ferResult.error! }));
      return;
    }
    try {
      setSaving(true);
      await onSave({
        hb_threshold_override: hbResult.value ?? null,
        ferritin_threshold_override: ferResult.value ?? null,
      });
    } catch (err: any) {
      Alert.alert(t('common.error' as TranslationKey), err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('preLabs.threshold.title' as TranslationKey)}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Hb floor field */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              {t('preLabs.threshold.hbField' as TranslationKey)}
            </Text>
            <TextInput
              style={[styles.input, hb.error && styles.inputError]}
              value={hb.raw}
              onChangeText={(raw) => setHb({ raw, error: null })}
              placeholder={String(HB_DEFAULT_FLOOR_G_DL)}
              placeholderTextColor={COLORS.textLight}
              keyboardType="decimal-pad"
            />
            {hb.raw !== '' && (
              <TouchableOpacity
                onPress={() => setHb({ raw: '', error: null })}
                style={styles.useDefaultBtn}
              >
                <Text style={styles.useDefaultText}>
                  {t('preLabs.threshold.useDefault' as TranslationKey, {
                    value: String(HB_DEFAULT_FLOOR_G_DL),
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Ferritin ceiling field */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              {t('preLabs.threshold.ferritinField' as TranslationKey)}
            </Text>
            <TextInput
              style={[styles.input, ferritin.error && styles.inputError]}
              value={ferritin.raw}
              onChangeText={(raw) => setFerritin({ raw, error: null })}
              placeholder={String(FERRITIN_DEFAULT_CEILING_NG_ML)}
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
            />
            {ferritin.raw !== '' && (
              <TouchableOpacity
                onPress={() => setFerritin({ raw: '', error: null })}
                style={styles.useDefaultBtn}
              >
                <Text style={styles.useDefaultText}>
                  {t('preLabs.threshold.useDefault' as TranslationKey, {
                    value: String(FERRITIN_DEFAULT_CEILING_NG_ML),
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label={t('preLabs.cancel' as TranslationKey)}
              onPress={onClose}
              variant="outline"
              fullWidth={false}
              style={styles.actionBtn}
            />
            <Button
              label={t('preLabs.save' as TranslationKey)}
              onPress={handleSave}
              fullWidth={false}
              style={styles.actionBtn}
              loading={saving}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...TYPOGRAPHY.h3, color: COLORS.text },
  fieldBlock: { gap: SPACING.xs },
  fieldLabel: { ...TYPOGRAPHY.label, color: COLORS.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputError: { borderColor: COLORS.statusUrgent },
  useDefaultBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  useDefaultText: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: { flexGrow: 0 },
});
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/clinician/ThresholdEditSheet.tsx
git commit -m "feat(clinician): add ThresholdEditSheet bottom sheet"
```

---

## Task 9: `LabTrendsChart` — threshold lines + chip + y-axis extend + gear icon

**Files:**
- Modify: `src/components/charts/LabTrendsChart.tsx`

- [ ] **Step 1: Extend `LabTrendsChartProps` and `MetricPlot` props**

Open `src/components/charts/LabTrendsChart.tsx`. Find the `LabTrendsChartProps` interface (around line 27). Add two new optional props:

```ts
export interface LabTrendsChartProps {
  // ... existing props
  /** When set, the Hb subplot renders a dashed red horizontal line at
   * this value + a right-edge severity chip. The y-axis auto-extends
   * to include this value when no data point reaches it. */
  hbFloor?: number;
  /** Same shape, ferritin ceiling (amber). */
  ferritinCeiling?: number;
  /** Tapping the gear icon in the chart header fires this. Caller is
   * expected to open ThresholdEditSheet. When undefined, the gear icon
   * is suppressed (used for patient-side embeddings). */
  onEditThresholds?: () => void;
}
```

Find the `MetricPlotProps` interface (around line 152). Add:

```ts
interface MetricPlotProps {
  // ... existing props
  threshold?: {
    value: number;
    /** Pre-formatted chip label (e.g., '7.0'). */
    label: string;
    lineColor: string;
    chipBgColor: string;
    chipTextColor: string;
  };
}
```

- [ ] **Step 2: Extend `MetricPlot` to render the threshold line + chip + extend y-domain**

Inside `MetricPlot`, find this block:

```ts
const { yMin, yMax } = useMemo(() => {
  if (points.length === 0) return { yMin: 0, yMax: 1 };
  const values = points.map(p => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    return { yMin: lo - pad, yMax: hi + pad };
  }
  const margin = (hi - lo) * 0.05;
  return { yMin: lo - margin, yMax: hi + margin };
}, [points]);
```

Replace with this threshold-aware version:

```ts
const { yMin, yMax } = useMemo(() => {
  const values = points.map(p => p.value);
  const candidates: number[] = [...values];
  if (threshold !== undefined) candidates.push(threshold.value);
  if (candidates.length === 0) return { yMin: 0, yMax: 1 };
  const lo = Math.min(...candidates);
  const hi = Math.max(...candidates);
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    return { yMin: lo - pad, yMax: hi + pad };
  }
  const margin = (hi - lo) * 0.05;
  return { yMin: lo - margin, yMax: hi + margin };
}, [points, threshold?.value]);
```

- [ ] **Step 3: Render the threshold line + chip inside the `<Svg>` block of `MetricPlot`**

In `MetricPlot`, find the `return (` and locate the `<Svg width={width} height={height}>` opening tag. Inside the Svg, after the y-axis grid and before the data Polyline, add:

```tsx
{threshold !== undefined && (() => {
  const ty = yScale(threshold.value);
  const chipW = 36;
  const chipH = 14;
  const chipX = padL + plotW - chipW;
  const chipY = ty - chipH / 2;
  return (
    <>
      <Line
        x1={padL}
        x2={padL + plotW - chipW - 2}
        y1={ty}
        y2={ty}
        stroke={threshold.lineColor}
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
      <Rect
        x={chipX}
        y={chipY}
        width={chipW}
        height={chipH}
        rx={4}
        ry={4}
        fill={threshold.chipBgColor}
      />
      <SvgText
        x={chipX + chipW / 2}
        y={ty + 4}
        fontSize={9}
        fontWeight="700"
        fill={threshold.chipTextColor}
        textAnchor="middle"
      >
        {threshold.label}
      </SvgText>
    </>
  );
})()}
```

(The exact `chipW=36` width is sized for 4 digits e.g. `1000`; 4-char ASCII fits comfortably at 9pt.)

- [ ] **Step 4: Pass the threshold prop from the outer `LabTrendsChart` to `MetricPlot`**

Find the `SERIES_ORDER.map(k => ( ... <MetricPlot ... /> ))` block (around line 130). Replace it with:

```tsx
{SERIES_ORDER.map(k => {
  let threshold: MetricPlotProps['threshold'] = undefined;
  if (k === 'hb' && hbFloor !== undefined) {
    threshold = {
      value: hbFloor,
      label: hbFloor.toFixed(1),
      lineColor: COLORS.statusUrgent,
      chipBgColor: COLORS.statusUrgentBg,
      chipTextColor: COLORS.statusUrgentText,
    };
  } else if (k === 'ferritin' && ferritinCeiling !== undefined) {
    threshold = {
      value: ferritinCeiling,
      label: String(Math.round(ferritinCeiling)),
      lineColor: COLORS.statusMonitor,
      chipBgColor: COLORS.statusMonitorBg,
      chipTextColor: COLORS.statusMonitorText,
    };
  }
  return (
    <MetricPlot
      key={k}
      label={labels[k]}
      color={SERIES_COLORS[k]}
      points={series[k]}
      markers={series.transfusionMarkers}
      xMin={xMin}
      xMax={xMax}
      width={chartWidth}
      emptyText={labels.empty}
      threshold={threshold}
    />
  );
})}
```

(If the existing call passes `width={chartWidth}` under a different variable name, use that name. The other props copy what's already there.)

- [ ] **Step 5: Add the gear icon next to the window selector**

In the chart header, find the existing ScrollView block:

```tsx
<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.windowRow}>
  {ALL_WINDOWS.map(w => ( ... ))}
</ScrollView>
```

Wrap it in a flex row + add a gear button to the right of it:

```tsx
<View style={styles.headerRow}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.windowRow}>
    {ALL_WINDOWS.map(w => (
      <TouchableOpacity
        key={w}
        style={[styles.windowChip, window === w && styles.windowChipActive]}
        onPress={() => persistWindow(w)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: window === w }}
      >
        <Text style={[styles.windowChipText, window === w && styles.windowChipTextActive]}>
          {labels.windows[w]}
        </Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
  {onEditThresholds && (
    <TouchableOpacity
      onPress={onEditThresholds}
      style={styles.thresholdBtn}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Feather name="sliders" size={14} color={COLORS.textSecondary} />
    </TouchableOpacity>
  )}
</View>
```

Add the necessary import at the top of the file if not present:

```ts
import { Feather } from '@expo/vector-icons';
```

And add the new styles to the `StyleSheet.create({ ... })` block:

```ts
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  thresholdBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
```

- [ ] **Step 6: Verify tsc + jest**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -5
```

Expected: tsc clean, jest passes at the previous total + 7 (no new tests at this step, but Task 4 added 7).

- [ ] **Step 7: Commit**

```bash
git add src/components/charts/LabTrendsChart.tsx
git commit -m "feat(chart): threshold line + chip + y-extend + gear in LabTrendsChart"
```

---

## Task 10: `PatientDetailPane` — wire thresholds + the edit sheet into the chart

**Files:**
- Modify: `src/components/clinician/PatientDetailPane.tsx`

- [ ] **Step 1: Add imports**

Open `src/components/clinician/PatientDetailPane.tsx`. Find the imports block (top of file). Add:

```ts
import ThresholdEditSheet from './ThresholdEditSheet';
import { getEffectiveLabThresholds } from '../../utils/clinicalThresholds';
import * as realClinicianService from '../../services/clinicianService';
```

(`realClinicianService` may already be imported — search before adding. If `mockServices` is also already imported but under a different name, use the existing one.)

- [ ] **Step 2: Add state for the edit sheet**

Find the state-block near the top of the `PatientDetailPane` function (around line 150). Add immediately after the existing `useState` lines:

```ts
const [thresholdSheetOpen, setThresholdSheetOpen] = useState(false);
```

- [ ] **Step 3: Compute the effective thresholds**

Find the `careEventsResult` `useMemo` block (around line 270). Add this `useMemo` immediately after it:

```ts
const effectiveThresholds = useMemo(
  () => getEffectiveLabThresholds(patientProfile),
  [patientProfile]
);
```

- [ ] **Step 4: Add the save handler**

After the `useMemo` blocks, before the `if (!patientProfile) return null;` guard, add:

```ts
const handleSaveThresholds = useCallback(
  async (next: {
    hb_threshold_override: number | null;
    ferritin_threshold_override: number | null;
  }) => {
    if (!patientProfile) return;
    const updated = isMockMode
      ? await mockServices.updateProfileThresholdsForPatient(patientProfile.user_id, next)
      : await realClinicianService.updateProfileThresholds(patientProfile.user_id, next);
    setPatientProfile(updated);
    setThresholdSheetOpen(false);
  },
  [isMockMode, patientProfile]
);
```

- [ ] **Step 5: Pass thresholds + the open handler to the chart**

Find the existing `<LabTrendsChart ... />` invocation (around line 455). Add the three new props:

```tsx
<LabTrendsChart
  // ... existing props (transfusions, labels, etc.)
  hbFloor={effectiveThresholds.hbFloor}
  ferritinCeiling={effectiveThresholds.ferritinCeiling}
  onEditThresholds={isClinicianView ? () => setThresholdSheetOpen(true) : undefined}
/>
```

- [ ] **Step 6: Render the sheet**

Near the end of the JSX, just before the closing tag of the outer root `<View>` / `<ScrollView>`, add:

```tsx
{isClinicianView && patientProfile && (
  <ThresholdEditSheet
    visible={thresholdSheetOpen}
    onClose={() => setThresholdSheetOpen(false)}
    initialHbOverride={patientProfile.hb_threshold_override ?? null}
    initialFerritinOverride={patientProfile.ferritin_threshold_override ?? null}
    onSave={handleSaveThresholds}
  />
)}
```

- [ ] **Step 7: Verify tsc + jest**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -5
```

Expected: tsc clean, jest still at the post-Task-4 count.

- [ ] **Step 8: Commit**

```bash
git add src/components/clinician/PatientDetailPane.tsx
git commit -m "feat(clinician): wire threshold edit + effective values into PatientDetailPane"
```

---

## Task 11: Manual verification + open PR + merge

- [ ] **Step 1: Run the full suite one more time**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -5
```

Expected: tsc clean, jest at previous total + 7.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/lab-trends-thresholds
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base main --head feat/lab-trends-thresholds \
  --title "feat(clinician): per-patient lab reference thresholds on the trends chart" \
  --body "$(cat <<'EOF'
## Summary
Closes the deferred decision flagged in \`LabTrendsChart.tsx\` (\"Reference-range bands intentionally NOT drawn — deferred threshold decision\"). Adds dashed reference threshold lines (Hb floor, Ferritin ceiling) to the \`LabTrendsChart\` on the clinician dashboard, with program defaults of 7.0 g/dL and 1000 ng/mL, and a clinician-only edit sheet for per-patient overrides.

## Architecture
- 2 new nullable columns on \`public.profiles\`: \`hb_threshold_override\`, \`ferritin_threshold_override\` (range-checked at the DB layer).
- New RLS UPDATE policy + BEFORE UPDATE trigger \`lock_clinician_to_threshold_overrides\` on \`public.profiles\` — same shape as PR #38's transfusion column-lock. Clinician edits gated to those two columns; patient self-edits + service_role bypass.
- New \`getEffectiveLabThresholds(profile)\` helper in \`utils/clinicalThresholds.ts\` — falls back to program defaults when overrides are null/undefined.
- \`LabTrendsChart\` gets \`hbFloor\` + \`ferritinCeiling\` + \`onEditThresholds\` props. Per-metric subplot renders a dashed line + right-edge severity chip; y-axis auto-extends so the line stays visible.
- \`ThresholdEditSheet\` is a new bottom-sheet modal opened by a gear icon in the chart header. Empty input = clear the override = revert to default.

## Deployment
**Both SQL migrations must be applied to Supabase before the clinician edit works.**
\`\`\`bash
supabase db push     # or paste both 2026-06-09-profile-threshold-overrides.sql
                     # and 2026-06-09-clinician-edit-profile-thresholds.sql
                     # into the Studio SQL editor
\`\`\`

## Test plan
- [x] \`npx tsc --noEmit\` clean
- [x] \`npx jest --silent\` passes (+7 new tests on \`getEffectiveLabThresholds\`)
- [ ] Apply both migrations; clinician selects a patient with lab history → trend chart shows dashed lines on Hb + Ferritin subplots at the defaults
- [ ] Clinician taps the gear icon → ThresholdEditSheet opens with empty fields (showing defaults as placeholders)
- [ ] Enters \`9.0\` for Hb and \`800\` for Ferritin, saves → chart re-renders with lines at the new values
- [ ] Re-opens the sheet → fields prefilled with 9.0 and 800; \"Use default\" links visible
- [ ] Taps \"Use default (7.0)\" on Hb → field clears, saves → chart Hb line returns to 7.0
- [ ] Clinician attempts a SQL UPDATE on any other profile column directly → DB rejects with the trigger's exception
- [ ] Patient-side \`ProfileEditForm\` still saves successfully (trigger bypasses patient self-edits)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge the PR**

```bash
gh pr merge --merge --delete-branch
```

- [ ] **Step 5: Sync local main**

```bash
git checkout main && git pull --ff-only && git log --oneline -3
```

Expected: the merged PR commit at the top of the log.

---

## Self-review checklist (run before declaring this plan complete)

- [ ] Every section in the spec has at least one task implementing it.
- [ ] No "TBD" / "TODO" / "implement appropriate X" placeholders.
- [ ] Types match across tasks: `hb_threshold_override` is `number | null` (not `number | undefined`) in service, mock, and component; same for ferritin.
- [ ] Function names match across tasks: `getEffectiveLabThresholds` (utils), `updateProfileThresholds` (real service), `updateProfileThresholdsForPatient` (mock).
- [ ] Constant names match: `HB_DEFAULT_FLOOR_G_DL = 7.0`, `FERRITIN_DEFAULT_CEILING_NG_ML = 1000` — used identically in tests, helper, sheet, and chart.
