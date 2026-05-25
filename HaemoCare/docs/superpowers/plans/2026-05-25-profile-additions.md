# Profile Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add primary diagnosis + thalassemia subtype to patient profiles, replace clinician free-text hospital with a curated picker, and add a patient-initiated clinician link flow.

**Architecture:** Three additive phases on `feat/profile-additions` branch. Each phase ships as one commit after typecheck + web build + Playwright screenshot QA. Shared infrastructure (hospitals table) lands in Phase 2 and is consumed by Phase 3. All DB migrations are additive (no DROPs, no destructive ALTERs).

**Tech Stack:** Expo SDK 54 / React Native 0.81 / react-native-web / TypeScript / Supabase JS v2 / Postgres with RLS.

**Spec:** `docs/superpowers/specs/2026-05-25-profile-additions-design.md`

**Working branch:** `feat/profile-additions` (already created off main, contains the spec commit `8013b19`).

**Project conventions** (read before starting):
- All theme tokens live in `src/config/theme.ts` (`COLORS`, `SPACING`, `RADIUS`, `SHADOWS`, `TYPOGRAPHY`). Never hardcode hex colors.
- i18n: flat dot-notation keys. `en.ts` is the source of truth (its keys form the `TranslationKey` type); `th.ts` must mirror every key (it's typed as `Record<TranslationKey, string>`).
- `t()` substitutes `{key}` (single braces) with params: `t('foo.bar', { name: 'X' })`.
- Mocks live in `src/mock/services.ts`. Hooks select between mock and real via `useAuth().isMockMode`.
- Web bundle: `npm run build:web` (outputs to `dist/`); serve with `npx serve dist -p 4173 -L`.
- Localhost auto-login signs you in as the mock clinician. Use `?as=patient` for patient flows, `?as=none` to disable and see LoginScreen.
- Typecheck: `npx tsc --noEmit` from `HaemoCare/` directory.
- All migrations are applied by the user via Supabase Dashboard → SQL Editor (we do not run migrations from code).
- No unit-test framework for components in this codebase. Verification = typecheck + web build + Playwright screenshot.

---

## Phase 1 — Profile diagnosis + subtype

**Phase goal:** Patient can record a `primary_diagnosis` (thalassemia / hemophilia / other) and, if thalassemia, a specific subtype. Both display as chips on PassportScreen and clinician PatientDetailPane.

**Phase commit:** Single commit at the end of Phase 1 after all tasks pass.

### Task 1.1: DB migration — diagnosis + subtype columns

**Files:**
- Create: `supabase/migrations/2026-05-25-profile-diagnosis.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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
```

- [ ] **Step 2: Tell the user to apply it**

Tell the user: "Migration file written. Please apply `supabase/migrations/2026-05-25-profile-diagnosis.sql` via Supabase Dashboard → SQL Editor. Reply when applied so I can continue."

Wait for user confirmation before proceeding to Task 1.2.

### Task 1.2: TypeScript types — Profile fields + enums

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Find the Profile interface (around line 1) and the line after it**

Run: `grep -n "interface Profile\|interface Transfusion" src/types/database.ts | head -5`
Expected: Profile is at line 1, Transfusion follows around line 20.

- [ ] **Step 2: Add the two enum types AND extend Profile**

In `src/types/database.ts`, replace the existing `Profile` interface (lines 1-18) with:

```ts
export type PrimaryDiagnosis = 'thalassemia' | 'hemophilia' | 'other';

export type ThalassemiaSubtype =
  | 'alpha_silent_carrier'
  | 'alpha_trait'
  | 'hb_h_disease'
  | 'alpha_major_hb_barts'
  | 'beta_minor'
  | 'beta_intermedia'
  | 'beta_major_cooleys'
  | 'hb_e_beta_thal'
  | 'delta_beta_thal'
  | 'hb_lepore_syndrome';

export interface Profile {
  id: string;
  user_id: string;
  patient_id: string;
  full_name: string;
  blood_type: 'A' | 'B' | 'AB' | 'O' | '';
  rh_factor: '+' | '-' | '';
  antibodies: string[];
  known_reactions: string;
  medications: string;
  language_preference: 'th' | 'en';
  pdpa_consented: boolean;
  pdpa_consented_at: string | null;
  share_full_name: boolean;
  recommended_visit_interval_days: number;
  primary_diagnosis: PrimaryDiagnosis | null;
  thalassemia_subtype: ThalassemiaSubtype | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit`
Expected: clean exit 0 (no errors).

### Task 1.3: i18n keys — diagnosis + subtype labels

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Find the right insertion point in en.ts**

Run: `grep -n "'profile\\.' \|// Profile\|profile\\." src/i18n/en.ts | head -5`
Pick a spot near other `profile.*` keys, or after the existing `profileSetup` block. If no clear cluster, insert immediately after `'auth.passwordMismatch'` (around line ~50 — verify location first).

- [ ] **Step 2: Add 13 keys to `src/i18n/en.ts`**

Insert this block at the chosen location:

```ts
  // Profile — primary diagnosis + thalassemia subtype
  'profile.diagnosis.label': 'Diagnosis',
  'profile.diagnosis.thalassemia': 'Thalassemia',
  'profile.diagnosis.hemophilia': 'Hemophilia',
  'profile.diagnosis.other': 'Other',
  'profile.subtype.label': 'Type of thalassemia',
  'profile.subtype.alpha_silent_carrier': 'α-thal silent carrier',
  'profile.subtype.alpha_trait': 'α-thal trait',
  'profile.subtype.hb_h_disease': 'Hb H disease',
  'profile.subtype.alpha_major_hb_barts': "α-thal major / Hb Bart's",
  'profile.subtype.beta_minor': 'β-thal minor / trait',
  'profile.subtype.beta_intermedia': 'β-thal intermedia',
  'profile.subtype.beta_major_cooleys': "β-thal major / Cooley's",
  'profile.subtype.hb_e_beta_thal': 'Hb E/β-thal',
  'profile.subtype.delta_beta_thal': 'δβ-thal',
  'profile.subtype.hb_lepore_syndrome': 'Hb Lepore syndrome',
```

- [ ] **Step 3: Add matching keys to `src/i18n/th.ts` at the same relative location**

```ts
  // Profile — primary diagnosis + thalassemia subtype
  'profile.diagnosis.label': 'การวินิจฉัย',
  'profile.diagnosis.thalassemia': 'ธาลัสซีเมีย',
  'profile.diagnosis.hemophilia': 'ฮีโมฟีเลีย',
  'profile.diagnosis.other': 'อื่น ๆ',
  'profile.subtype.label': 'ชนิดของธาลัสซีเมีย',
  'profile.subtype.alpha_silent_carrier': 'อัลฟาธาลัสซีเมียชนิดพาหะเงียบ',
  'profile.subtype.alpha_trait': 'อัลฟาธาลัสซีเมียเทรต',
  'profile.subtype.hb_h_disease': 'โรคฮีโมโกลบินเอช',
  'profile.subtype.alpha_major_hb_barts': 'อัลฟาธาลัสซีเมียเมเจอร์',
  'profile.subtype.beta_minor': 'เบต้าธาลัสซีเมียไมเนอร์',
  'profile.subtype.beta_intermedia': 'เบต้าธาลัสซีเมียอินเตอร์มีเดีย',
  'profile.subtype.beta_major_cooleys': 'เบต้าธาลัสซีเมียเมเจอร์ / โรคคูลีย์',
  'profile.subtype.hb_e_beta_thal': 'ฮีโมโกลบินอี/เบต้าธาลัสซีเมีย',
  'profile.subtype.delta_beta_thal': 'เดลตา-เบต้าธาลัสซีเมีย',
  'profile.subtype.hb_lepore_syndrome': 'ฮีโมโกลบินเลพอร์ซินโดรม',
```

- [ ] **Step 4: Verify typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit`
Expected: clean. (If `Record<TranslationKey, string>` complains, it means the en.ts and th.ts key sets diverged — fix by ensuring all 13 keys exist in both files with identical names.)

### Task 1.4: `DiagnosisChip` component (shared render)

**Files:**
- Create: `src/components/passport/DiagnosisChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { PrimaryDiagnosis, ThalassemiaSubtype } from '../../types/database';

interface Props {
  diagnosis: PrimaryDiagnosis | null;
  subtype: ThalassemiaSubtype | null;
}

export default function DiagnosisChip({ diagnosis, subtype }: Props) {
  const { t } = useLanguage();

  // Render rules (per spec section 1.4):
  //   both null → nothing
  //   'other' → nothing (no informative content)
  //   thalassemia or hemophilia, no subtype → top-level diagnosis chip
  //   thalassemia with subtype → subtype chip
  if (!diagnosis || diagnosis === 'other') return null;

  const label =
    diagnosis === 'thalassemia' && subtype
      ? t(`profile.subtype.${subtype}` as TranslationKey)
      : t(`profile.diagnosis.${diagnosis}` as TranslationKey);

  return (
    <View style={styles.chip}>
      <Feather name="activity" size={11} color={COLORS.primary} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.1,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.5: `DiagnosisPicker` component (form chips)

**Files:**
- Create: `src/components/passport/DiagnosisPicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { PrimaryDiagnosis } from '../../types/database';

interface Props {
  value: PrimaryDiagnosis | null;
  onChange: (next: PrimaryDiagnosis | null) => void;
}

const OPTIONS: PrimaryDiagnosis[] = ['thalassemia', 'hemophilia', 'other'];

export default function DiagnosisPicker({ value, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(selected ? null : opt)}
            activeOpacity={0.7}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {t(`profile.diagnosis.${opt}` as TranslationKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  labelSelected: {
    color: COLORS.white,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.6: `ThalassemiaSubtypePicker` component (modal sheet)

**Files:**
- Create: `src/components/passport/ThalassemiaSubtypePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { ThalassemiaSubtype } from '../../types/database';

interface Props {
  value: ThalassemiaSubtype | null;
  onChange: (next: ThalassemiaSubtype | null) => void;
}

const SUBTYPES: ThalassemiaSubtype[] = [
  'alpha_silent_carrier',
  'alpha_trait',
  'hb_h_disease',
  'alpha_major_hb_barts',
  'beta_minor',
  'beta_intermedia',
  'beta_major_cooleys',
  'hb_e_beta_thal',
  'delta_beta_thal',
  'hb_lepore_syndrome',
];

export default function ThalassemiaSubtypePicker({ value, onChange }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const currentLabel = value ? t(`profile.subtype.${value}` as TranslationKey) : null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.trigger}
      >
        <Text style={[styles.triggerText, !currentLabel && styles.placeholder]} numberOfLines={1}>
          {currentLabel ?? t('profile.subtype.label' as TranslationKey)}
        </Text>
        <Feather name="chevron-down" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('profile.subtype.label' as TranslationKey)}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scroll}>
              {SUBTYPES.map((s) => {
                const selected = value === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => { onChange(s); setOpen(false); }}
                    style={[styles.row, selected && styles.rowSelected]}
                  >
                    <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                      {t(`profile.subtype.${s}` as TranslationKey)}
                    </Text>
                    {selected && <Feather name="check" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    backgroundColor: COLORS.white,
    minHeight: 50,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  placeholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    ...(SHADOWS.elevated as object),
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  scroll: {
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  rowLabel: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  rowLabelSelected: {
    fontWeight: '700',
    color: COLORS.primary,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.7: `ProfileEditForm` integration

**Files:**
- Modify: `src/components/passport/ProfileEditForm.tsx`

- [ ] **Step 1: Read the current ProfileEditForm to find the blood-type group location**

Run: `grep -n "blood_type\|bloodType\|profileSetup\\.bloodType" src/components/passport/ProfileEditForm.tsx | head -5`

Locate the section that renders the blood type field. We'll insert the new diagnosis section ABOVE it.

- [ ] **Step 2: Add imports at the top of ProfileEditForm.tsx**

Add to the existing import block:

```tsx
import DiagnosisPicker from './DiagnosisPicker';
import ThalassemiaSubtypePicker from './ThalassemiaSubtypePicker';
import type { PrimaryDiagnosis, ThalassemiaSubtype } from '../../types/database';
import { TranslationKey } from '../../i18n';
```

- [ ] **Step 3: Add state for the two new fields near the top of the component**

Find where existing form state is declared (e.g., `const [bloodType, setBloodType] = useState(...)`) and add alongside:

```tsx
const [primaryDiagnosis, setPrimaryDiagnosis] = useState<PrimaryDiagnosis | null>(
  profile?.primary_diagnosis ?? null
);
const [thalassemiaSubtype, setThalassemiaSubtype] = useState<ThalassemiaSubtype | null>(
  profile?.thalassemia_subtype ?? null
);

const handleDiagnosisChange = (next: PrimaryDiagnosis | null) => {
  setPrimaryDiagnosis(next);
  // Clear subtype if diagnosis is not thalassemia
  if (next !== 'thalassemia') {
    setThalassemiaSubtype(null);
  }
};
```

- [ ] **Step 4: Update the onSubmit handler to include the new fields**

Find the `onSubmit({...})` call that posts the form values. Add the two new fields to the object being submitted:

```tsx
onSubmit({
  // ... existing fields like full_name, blood_type, etc.
  primary_diagnosis: primaryDiagnosis,
  thalassemia_subtype: thalassemiaSubtype,
});
```

- [ ] **Step 5: Add the Diagnosis section above the blood-type section in the JSX**

Insert this block immediately before the blood-type field:

```tsx
<View style={styles.section}>
  <Text style={styles.sectionLabel}>{t('profile.diagnosis.label' as TranslationKey)}</Text>
  <DiagnosisPicker value={primaryDiagnosis} onChange={handleDiagnosisChange} />
  {primaryDiagnosis === 'thalassemia' && (
    <View style={{ marginTop: SPACING.md }}>
      <Text style={styles.sectionLabel}>{t('profile.subtype.label' as TranslationKey)}</Text>
      <ThalassemiaSubtypePicker value={thalassemiaSubtype} onChange={setThalassemiaSubtype} />
    </View>
  )}
</View>
```

NOTE: if `styles.section` and `styles.sectionLabel` already exist in this file, reuse them. If not, add to the existing styles object:

```tsx
section: {
  marginBottom: SPACING.lg,
},
sectionLabel: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.textSecondary,
  marginBottom: SPACING.sm,
},
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.8: `PassportScreen` chip render

**Files:**
- Modify: `src/screens/tabs/PassportScreen.tsx`

- [ ] **Step 1: Add the DiagnosisChip import**

Add to the existing imports block:

```tsx
import DiagnosisChip from '../../components/passport/DiagnosisChip';
```

- [ ] **Step 2: Find the blood-type chip area**

Run: `grep -n "blood_type\|bloodTypeChip\|abRow\|antibodies" src/screens/tabs/PassportScreen.tsx | head -5`

Locate the row where the blood-type chip is rendered (near the existing `abRow` or `patientIdRow`).

- [ ] **Step 3: Render the DiagnosisChip next to the blood-type chip**

Wrap the blood-type chip and the new diagnosis chip in a flex row. Adjust based on the actual JSX shape — typically the blood-type chip is in a `<View>` with siblings; place `<DiagnosisChip>` immediately after it inside the same flex row, or in the row immediately below if vertical stacking reads better:

```tsx
<View style={styles.chipRow}>
  {/* existing blood-type chip */}
  <DiagnosisChip
    diagnosis={profile.primary_diagnosis}
    subtype={profile.thalassemia_subtype}
  />
</View>
```

If `styles.chipRow` doesn't exist, add:

```tsx
chipRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  flexWrap: 'wrap',
},
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.9: `PatientDetailPane` chip render (clinician side)

**Files:**
- Modify: `src/components/clinician/PatientDetailPane.tsx`

- [ ] **Step 1: Add import**

```tsx
import DiagnosisChip from '../passport/DiagnosisChip';
```

- [ ] **Step 2: Locate the passport-header card area**

Run: `grep -n "blood_type\|bloodType\|passportHeader" src/components/clinician/PatientDetailPane.tsx | head -5`

- [ ] **Step 3: Render DiagnosisChip next to the existing blood-type display**

Add the chip in the same row as the blood-type display:

```tsx
<DiagnosisChip
  diagnosis={profile.primary_diagnosis}
  subtype={profile.thalassemia_subtype}
/>
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.10: Mock data update

**Files:**
- Modify: `src/mock/data.ts`

- [ ] **Step 1: Find MOCK_PROFILE**

Run: `grep -n "MOCK_PROFILE\|primary_diagnosis" src/mock/data.ts | head`

- [ ] **Step 2: Add the new fields to MOCK_PROFILE**

In the `MOCK_PROFILE` object, add:

```ts
primary_diagnosis: 'thalassemia',
thalassemia_subtype: 'beta_major_cooleys',
```

- [ ] **Step 3: Also update MOCK_LINKED_PATIENTS in `src/mock/clinicianData.ts`** so demo patients render the chip on the clinician dashboard

Run: `grep -n "MOCK_LINKED_PATIENTS\|primary_diagnosis" src/mock/clinicianData.ts | head`

For each mock linked patient profile, add the same two fields (pick varied subtypes so the dashboard demo shows diversity):

```ts
primary_diagnosis: 'thalassemia',
thalassemia_subtype: 'beta_intermedia',  // or 'hb_e_beta_thal', 'beta_major_cooleys', etc.
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 1.11: Phase 1 verify + commit

- [ ] **Step 1: Run typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"`
Expected: `EXIT: 0`.

- [ ] **Step 2: Build the web bundle**

Run: `npm run build:web 2>&1 | tail -5`
Expected: `[fix-web-assets] done — 1 file(s) patched`. No errors.

- [ ] **Step 3: Serve + visual check (patient)**

Run: `npx serve dist -p 4173 -L` in the background, wait until `http://localhost:4173/` returns 200, then run a Playwright screenshot script targeting:
- `http://localhost:4173/?as=patient` → PassportScreen, screenshot, verify the diagnosis chip renders next to the blood-type chip.
- Navigate to "Edit Profile" → screenshot, verify the new Diagnosis section appears above blood type with three chips, and tapping Thalassemia reveals the subtype picker.

Script template (paste into a `.mjs` file, run with `node`):

```js
import { chromium, devices } from 'playwright';
const iPhone = devices['iPhone 14'];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...iPhone });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/?as=patient', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/phase1-passport.png' });
await browser.close();
```

Inspect `/tmp/phase1-passport.png` and confirm the chip is visible.

- [ ] **Step 4: Visual check (clinician)**

Same script, but URL is `http://localhost:4173/` (default = clinician auto-login). Select a patient in the queue → check PatientDetailPane shows the diagnosis chip in the passport header.

- [ ] **Step 5: Commit Phase 1**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-05-25-profile-diagnosis.sql \
  src/types/database.ts \
  src/i18n/en.ts \
  src/i18n/th.ts \
  src/components/passport/DiagnosisChip.tsx \
  src/components/passport/DiagnosisPicker.tsx \
  src/components/passport/ThalassemiaSubtypePicker.tsx \
  src/components/passport/ProfileEditForm.tsx \
  src/screens/tabs/PassportScreen.tsx \
  src/components/clinician/PatientDetailPane.tsx \
  src/mock/data.ts \
  src/mock/clinicianData.ts

git commit -m "$(cat <<'EOF'
feat(profile): primary diagnosis + thalassemia subtype

Phase 1 of the profile-additions spec. Patient profile gains two new
nullable fields (primary_diagnosis, thalassemia_subtype) and a
cascading picker pair in the edit form. DiagnosisChip renders the
result on PassportScreen and the clinician PatientDetailPane.

Requires applying supabase/migrations/2026-05-25-profile-diagnosis.sql
via Dashboard SQL Editor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Verify: `git log --oneline -2` shows the new commit.

---

## Phase 2 — Hospitals table + clinician affiliation picker

**Phase goal:** Replace the free-text hospital field on clinician signup/verification with a picker backed by a curated `hospitals` table. Adds the foundational data structure that Phase 3 also depends on.

### Task 2.1: DB migration — hospitals table + seed + clinician FK

**Files:**
- Create: `supabase/migrations/2026-05-26-hospitals-table.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================
-- Hospitals directory + clinician affiliation FK
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-25-profile-additions-design.md
-- Phase: 2

create table public.hospitals (
  id uuid default uuid_generate_v4() primary key,
  name_th text not null,
  name_en text not null,
  code text unique,
  region text check (region in ('north', 'northeast', 'central', 'south', 'east', 'west')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_hospitals_active_region on public.hospitals (region) where is_active = true;
create index idx_hospitals_name_th on public.hospitals (name_th);

alter table public.hospitals enable row level security;

create policy "Authenticated reads active hospitals" on public.hospitals
  for select using (is_active = true);

-- Seed: placeholder set. Expand later via INSERT.
insert into public.hospitals (name_th, name_en, code, region) values
  ('โรงพยาบาลสงขลานครินทร์', 'Songklanagarind Hospital', 'songklanagarind', 'south'),
  ('โรงพยาบาลศิริราช', 'Siriraj Hospital', 'siriraj', 'central'),
  ('โรงพยาบาลรามาธิบดี', 'Ramathibodi Hospital', 'ramathibodi', 'central');

-- Link clinician_profiles to the directory. Nullable so legacy free-text
-- rows are unaffected; new signups populate hospital_id from the picker.
alter table public.clinician_profiles
  add column hospital_id uuid references public.hospitals(id);

create index idx_clinician_profiles_hospital on public.clinician_profiles (hospital_id) where hospital_id is not null;
```

- [ ] **Step 2: Ask the user to apply it**

Tell the user: "Phase 2 migration written. Please apply `supabase/migrations/2026-05-26-hospitals-table.sql` via Supabase Dashboard SQL Editor. Reply when applied."

Wait for confirmation.

### Task 2.2: TypeScript types — Hospital + ClinicianProfile.hospital_id

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the Hospital interface**

Find the `ClinicianProfile` interface (around line ~160). Add this BEFORE it:

```ts
export interface Hospital {
  id: string;
  name_th: string;
  name_en: string;
  code: string | null;
  region: 'north' | 'northeast' | 'central' | 'south' | 'east' | 'west' | null;
  is_active: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Add `hospital_id` to ClinicianProfile**

Inside the `ClinicianProfile` interface body, add:

```ts
hospital_id: string | null;
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: errors will appear in `signUpClinician` and PendingVerificationScreen (they don't yet know about hospital_id). Note these — they'll be fixed in Tasks 2.7-2.9.

### Task 2.3: i18n keys — picker labels + region names

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Add to `src/i18n/en.ts`**

Append near other auth/profile keys:

```ts
  // Hospital picker (used by clinician signup + patient find-doctor flow)
  'hospital.picker.title': 'Select your hospital',
  'hospital.picker.searchPlaceholder': 'Search hospitals…',
  'hospital.picker.empty': 'No hospitals found.',
  'hospital.region.north': 'Northern',
  'hospital.region.northeast': 'Northeastern',
  'hospital.region.central': 'Central',
  'hospital.region.south': 'Southern',
  'hospital.region.east': 'Eastern',
  'hospital.region.west': 'Western',
```

- [ ] **Step 2: Add matching keys to `src/i18n/th.ts`**

```ts
  // Hospital picker (used by clinician signup + patient find-doctor flow)
  'hospital.picker.title': 'เลือกโรงพยาบาลของคุณ',
  'hospital.picker.searchPlaceholder': 'ค้นหาโรงพยาบาล...',
  'hospital.picker.empty': 'ไม่พบโรงพยาบาล',
  'hospital.region.north': 'ภาคเหนือ',
  'hospital.region.northeast': 'ภาคอีสาน',
  'hospital.region.central': 'ภาคกลาง',
  'hospital.region.south': 'ภาคใต้',
  'hospital.region.east': 'ภาคตะวันออก',
  'hospital.region.west': 'ภาคตะวันตก',
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: same errors as Task 2.2 step 3 (signUpClinician + PendingVerification still need hospital_id wiring). i18n key set should be balanced.

### Task 2.4: Hospital service + useHospitals hook

**Files:**
- Create: `src/services/hospitalService.ts`
- Create: `src/hooks/useHospitals.ts`

- [ ] **Step 1: Write hospitalService**

```ts
// src/services/hospitalService.ts
import { supabase } from '../config/supabase';
import type { Hospital } from '../types/database';

export async function getHospitals(): Promise<Hospital[]> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .eq('is_active', true)
    .order('region', { ascending: true })
    .order('name_th', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Hospital[];
}
```

- [ ] **Step 2: Write useHospitals hook**

```ts
// src/hooks/useHospitals.ts
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/hospitalService';
import * as mockService from '../mock/services';
import type { Hospital } from '../types/database';

let cachedHospitals: Hospital[] | null = null;

export interface UseHospitalsResult {
  hospitals: Hospital[];
  loading: boolean;
}

export function useHospitals(): UseHospitalsResult {
  const { isMockMode } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>(cachedHospitals ?? []);
  const [loading, setLoading] = useState(cachedHospitals === null);

  useEffect(() => {
    if (cachedHospitals !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const data = isMockMode
          ? await mockService.getHospitals()
          : await realService.getHospitals();
        if (!cancelled) {
          cachedHospitals = data;
          setHospitals(data);
        }
      } catch {
        if (!cancelled) setHospitals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isMockMode]);

  return { hospitals, loading };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: mock service `getHospitals` not yet defined → typecheck error. Will fix in Task 2.5.

### Task 2.5: Mock service for hospitals

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Add import for Hospital type**

At the top of `src/mock/services.ts`, add `Hospital` to the existing import from `'../types/database'`.

- [ ] **Step 2: Add seeded mock hospitals + getHospitals export**

Append to the file:

```ts
// ── Hospitals (mock) ──────────────────────────────────────────
const MOCK_HOSPITALS: Hospital[] = [
  {
    id: 'mock-hospital-songkla',
    name_th: 'โรงพยาบาลสงขลานครินทร์',
    name_en: 'Songklanagarind Hospital',
    code: 'songklanagarind',
    region: 'south',
    is_active: true,
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'mock-hospital-siriraj',
    name_th: 'โรงพยาบาลศิริราช',
    name_en: 'Siriraj Hospital',
    code: 'siriraj',
    region: 'central',
    is_active: true,
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'mock-hospital-rama',
    name_th: 'โรงพยาบาลรามาธิบดี',
    name_en: 'Ramathibodi Hospital',
    code: 'ramathibodi',
    region: 'central',
    is_active: true,
    created_at: new Date('2026-01-01').toISOString(),
  },
];

export async function getHospitals(): Promise<Hospital[]> {
  return [...MOCK_HOSPITALS];
}
```

- [ ] **Step 3: Update MOCK_CLINICIAN_PROFILE to include hospital_id**

In `src/mock/clinicianData.ts`, add `hospital_id: 'mock-hospital-songkla'` to `MOCK_CLINICIAN_PROFILE`.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: still has the signUpClinician + PendingVerification errors from earlier. Hospital-related errors should be gone.

### Task 2.6: HospitalPicker component

**Files:**
- Create: `src/components/common/HospitalPicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useHospitals } from '../../hooks/useHospitals';
import { TranslationKey } from '../../i18n';
import type { Hospital } from '../../types/database';

interface Props {
  value: string | null;
  onChange: (hospitalId: string | null) => void;
  placeholder?: string;
}

const REGION_KEYS: Record<NonNullable<Hospital['region']>, TranslationKey> = {
  north: 'hospital.region.north' as TranslationKey,
  northeast: 'hospital.region.northeast' as TranslationKey,
  central: 'hospital.region.central' as TranslationKey,
  south: 'hospital.region.south' as TranslationKey,
  east: 'hospital.region.east' as TranslationKey,
  west: 'hospital.region.west' as TranslationKey,
};

export default function HospitalPicker({ value, onChange, placeholder }: Props) {
  const { t } = useLanguage();
  const { hospitals, loading } = useHospitals();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => hospitals.find(h => h.id === value) ?? null, [hospitals, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter(h =>
      h.name_th.toLowerCase().includes(q) ||
      h.name_en.toLowerCase().includes(q) ||
      (h.code ?? '').toLowerCase().includes(q)
    );
  }, [hospitals, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hospital[]>();
    filtered.forEach(h => {
      const key = h.region ?? 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    });
    return map;
  }, [filtered]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.trigger}
      >
        <Feather name="map-pin" size={16} color={COLORS.textLight} />
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.name_th : (placeholder ?? t('hospital.picker.title' as TranslationKey))}
        </Text>
        <Feather name="chevron-down" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('hospital.picker.title' as TranslationKey)}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Feather name="search" size={16} color={COLORS.textLight} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('hospital.picker.searchPlaceholder' as TranslationKey)}
                placeholderTextColor={COLORS.textLight}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <ScrollView style={styles.scroll}>
              {loading && <ActivityIndicator color={COLORS.primary} style={{ padding: SPACING.lg }} />}
              {!loading && filtered.length === 0 && (
                <Text style={styles.empty}>{t('hospital.picker.empty' as TranslationKey)}</Text>
              )}
              {!loading && Array.from(grouped.entries()).map(([region, items]) => (
                <View key={region}>
                  {region !== 'other' && (
                    <Text style={styles.groupLabel}>
                      {t(REGION_KEYS[region as keyof typeof REGION_KEYS])}
                    </Text>
                  )}
                  {items.map(h => {
                    const isSelected = h.id === value;
                    return (
                      <TouchableOpacity
                        key={h.id}
                        onPress={() => { onChange(h.id); setOpen(false); }}
                        style={[styles.row, isSelected && styles.rowSelected]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.rowPrimary, isSelected && styles.rowSelectedText]}>
                            {h.name_th}
                          </Text>
                          <Text style={styles.rowSubtitle}>{h.name_en}</Text>
                        </View>
                        {isSelected && <Feather name="check" size={18} color={COLORS.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    backgroundColor: COLORS.white,
    minHeight: 50,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  placeholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    ...(SHADOWS.elevated as object),
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  scroll: {
    paddingBottom: SPACING.lg,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1.2,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  rowPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSelectedText: {
    color: COLORS.primary,
  },
  rowSubtitle: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  empty: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    padding: SPACING.lg,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: only the pre-existing signUpClinician + PendingVerification errors remain.

### Task 2.7: AuthContext.signUpClinician signature

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Find the signUpClinician interface declaration**

Run: `grep -n "signUpClinician" src/contexts/AuthContext.tsx`

You'll find it both in the `AuthContextType` interface AND in the `signUpClinician = async (input: ...)` implementation.

- [ ] **Step 2: Add `hospitalId` to the interface input type**

In the `AuthContextType` interface, update the signUpClinician input type:

```ts
signUpClinician: (input: {
  email: string;
  password: string;
  fullName: string;
  licenseNumber: string;
  hospitalAffiliation: string;
  hospitalId: string | null;
}) => Promise<{ error?: string }>;
```

- [ ] **Step 3: Update the implementation**

Find the `const signUpClinician = async (input: { ... })` block. Update the input type signature to match the interface and add `hospital_id` to the INSERT into `clinician_profiles`:

```ts
const signUpClinician = async (input: {
  email: string;
  password: string;
  fullName: string;
  licenseNumber: string;
  hospitalAffiliation: string;
  hospitalId: string | null;
}): Promise<{ error?: string }> => {
  // ... existing email/password signup logic unchanged ...

  const { error: insertError } = await supabase.from('clinician_profiles').insert({
    user_id: data.user.id,
    full_name: input.fullName,
    license_number: input.licenseNumber,
    hospital_affiliation: input.hospitalAffiliation,
    hospital_id: input.hospitalId,
    verified: false,
  });
  // ... rest unchanged
};
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: ClinicianSignupScreen will now complain (it doesn't pass hospitalId). Fix in Task 2.8.

### Task 2.8: ClinicianSignupScreen integration

**Files:**
- Modify: `src/screens/auth/ClinicianSignupScreen.tsx`

- [ ] **Step 1: Add the HospitalPicker import**

```tsx
import HospitalPicker from '../../components/common/HospitalPicker';
```

- [ ] **Step 2: Find the hospital affiliation input**

Run: `grep -n "hospitalAffiliation\|hospital_affiliation\|hospital " src/screens/auth/ClinicianSignupScreen.tsx | head`

- [ ] **Step 3: Add a `hospitalId` state next to the existing `hospitalAffiliation` state**

```tsx
const [hospitalId, setHospitalId] = useState<string | null>(null);
```

- [ ] **Step 4: Replace the free-text hospital `TextInput` with `<HospitalPicker />`**

Locate the TextInput for hospitalAffiliation and replace its block with:

```tsx
<View style={styles.fieldGroup}>
  <Text style={styles.fieldLabel}>{t('auth.clinicianSignup.hospital' as TranslationKey)}</Text>
  <HospitalPicker value={hospitalId} onChange={setHospitalId} />
</View>
```

(If `auth.clinicianSignup.hospital` doesn't exist as a translation key, check the existing key used — likely `auth.clinicianSignup.hospitalAffiliation` or similar. Use whatever key the existing input was using.)

- [ ] **Step 5: Update the submit handler to pass both fields**

Find the submit call to `signUpClinician({...})` and add `hospitalId` to the object. Keep `hospitalAffiliation` in for backwards compatibility — for newly-picked hospitals, populate it from the picker selection so search still works on legacy clinicians:

```tsx
const selectedHospital = hospitalId
  ? useHospitals().hospitals.find(h => h.id === hospitalId)
  : null;

await signUpClinician({
  email,
  password,
  fullName,
  licenseNumber,
  hospitalAffiliation: selectedHospital?.name_th ?? '',
  hospitalId,
});
```

NOTE: don't call useHospitals() inside the submit handler. Hoist it:

```tsx
// at top of component body
const { hospitals } = useHospitals();

// in submit handler:
const selectedHospital = hospitalId ? hospitals.find(h => h.id === hospitalId) : null;
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PendingVerification still has errors. Fix in Task 2.9.

### Task 2.9: PendingVerificationScreen integration

**Files:**
- Modify: `src/screens/auth/PendingVerificationScreen.tsx`

- [ ] **Step 1: Add HospitalPicker + useHospitals imports**

```tsx
import HospitalPicker from '../../components/common/HospitalPicker';
import { useHospitals } from '../../hooks/useHospitals';
```

- [ ] **Step 2: Replace the existing hospital TextInput with the picker**

Run: `grep -n "hospital\|TextInput" src/screens/auth/PendingVerificationScreen.tsx | head -10`

Locate the inline edit form's hospital field. Replace its TextInput block with:

```tsx
const { hospitals } = useHospitals();
const [hospitalId, setHospitalId] = useState<string | null>(clinicianProfile?.hospital_id ?? null);

// ... in JSX:
<HospitalPicker value={hospitalId} onChange={setHospitalId} />
```

- [ ] **Step 3: Update the save handler**

Find where the form updates `clinician_profiles`. Add `hospital_id` to the update payload. Also derive `hospital_affiliation` from the picked hospital so the legacy column stays consistent:

```ts
const selectedHospital = hospitalId ? hospitals.find(h => h.id === hospitalId) : null;
await supabase.from('clinician_profiles').update({
  // ... existing fields like license_number, hospital_affiliation, etc.
  hospital_affiliation: selectedHospital?.name_th ?? initialHospital ?? '',
  hospital_id: hospitalId,
}).eq('user_id', user.id);
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task 2.10: ClinicianDashboard header fallback chain

**Files:**
- Modify: `src/screens/clinician/ClinicianDashboardScreen.tsx`

- [ ] **Step 1: Find the header hospital label rendering**

Run: `grep -n "hospital_affiliation\|hospitalLabel" src/screens/clinician/ClinicianDashboardScreen.tsx | head`

- [ ] **Step 2: Add a useHospitals call near the top of the component**

```tsx
import { useHospitals } from '../../hooks/useHospitals';

// inside the component:
const { hospitals } = useHospitals();
```

- [ ] **Step 3: Update the hospitalLabel derivation**

Replace the existing `const hospitalLabel = ...` line with:

```tsx
const hospitalFromDirectory = clinicianProfile?.hospital_id
  ? hospitals.find(h => h.id === clinicianProfile.hospital_id)
  : null;
const hospitalLabel =
  hospitalFromDirectory?.name_th ??
  clinicianProfile?.hospital_affiliation?.trim() ??
  '—';
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task 2.11: Phase 2 verify + commit

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"
```
Expected: `EXIT: 0`.

- [ ] **Step 2: Build the web bundle**

```bash
npm run build:web 2>&1 | tail -3
```
Expected: success, no errors.

- [ ] **Step 3: Visual check (clinician signup flow)**

Serve + Playwright. Navigate `http://localhost:4173/?as=none` → LoginScreen → tap "Sign up" → RoleSelectScreen → tap "I'm a healthcare provider" → ClinicianSignupScreen. Screenshot. Verify:
- Hospital field is now a picker (not a text input)
- Tapping it opens a modal with the 3 seeded hospitals (Songklanagarind, Siriraj, Ramathibodi)
- Search filters the list
- Selecting one closes the modal and shows the Thai name

- [ ] **Step 4: Visual check (clinician dashboard header)**

Navigate `http://localhost:4173/` (auto-login as clinician). Screenshot the dashboard hero. The hospital name should appear from the mock hospital `MOCK_CLINICIAN_PROFILE.hospital_id` resolution (Songklanagarind Hospital).

- [ ] **Step 5: Commit Phase 2**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-05-26-hospitals-table.sql \
  src/types/database.ts \
  src/i18n/en.ts \
  src/i18n/th.ts \
  src/services/hospitalService.ts \
  src/hooks/useHospitals.ts \
  src/mock/services.ts \
  src/mock/clinicianData.ts \
  src/components/common/HospitalPicker.tsx \
  src/contexts/AuthContext.tsx \
  src/screens/auth/ClinicianSignupScreen.tsx \
  src/screens/auth/PendingVerificationScreen.tsx \
  src/screens/clinician/ClinicianDashboardScreen.tsx

git commit -m "$(cat <<'EOF'
feat(profile): hospital directory + clinician affiliation picker

Phase 2 of the profile-additions spec. Adds a curated hospitals table
(seeded with 3 placeholders), a HospitalPicker component with search
and region grouping, and rewires clinician signup + pending
verification to use the picker. ClinicianProfile gains hospital_id
(nullable) while keeping hospital_affiliation as legacy fallback for
existing rows. Dashboard header prefers directory name when available.

Requires applying supabase/migrations/2026-05-26-hospitals-table.sql
via Dashboard SQL Editor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Verify: `git log --oneline -3` shows the new commit on top of Phase 1.

---

## Phase 3 — Patient-initiated link flow

**Phase goal:** Patient browses hospitals, picks a verified clinician, requests a connection. Clinician sees the incoming request in their dashboard with Approve / Decline buttons.

### Task 3.1: DB migration — initiated_by + patient INSERT policy

**Files:**
- Create: `supabase/migrations/2026-05-27-patient-initiated-links.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================
-- Patient-initiated clinician links
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-25-profile-additions-design.md
-- Phase: 3

alter table public.clinician_patient_links
  add column initiated_by text not null default 'clinician'
    check (initiated_by in ('clinician', 'patient'));

create index idx_cpl_pending_by_clinician_for_patient_inbox
  on public.clinician_patient_links (clinician_id)
  where status = 'pending' and initiated_by = 'patient';

-- New INSERT policy: patients can self-request a link to a verified clinician.
create policy "Patients request links" on public.clinician_patient_links
  for insert
  with check (
    patient_user_id = auth.uid()
    and status = 'pending'
    and initiated_by = 'patient'
    and exists (
      select 1 from public.clinician_profiles
      where user_id = clinician_id and verified = true
    )
  );
```

- [ ] **Step 2: Ask the user to apply it**

Tell the user: "Phase 3 migration written. Please apply `supabase/migrations/2026-05-27-patient-initiated-links.sql` via Supabase Dashboard. Reply when applied."

Wait for confirmation.

### Task 3.2: TypeScript types — initiated_by + IncomingPatientRequest

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `initiated_by` to ClinicianPatientLink**

Find the existing `ClinicianPatientLink` interface (search for it) and add:

```ts
initiated_by: 'clinician' | 'patient';
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the existing PendingPatientLinkRow doesn't need this field strongly typed).

### Task 3.3: i18n keys — patient find-doctor + clinician incoming

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Add to `src/i18n/en.ts`**

```ts
  // Patient — find a clinician (patient-initiated link flow)
  'patient.findClinician.entryButton': 'Find my doctor',
  'patient.findClinician.title': 'Connect with a clinician',
  'patient.findClinician.step1Title': 'Which hospital?',
  'patient.findClinician.step2Title': 'Pick your doctor',
  'patient.findClinician.empty': 'No registered doctors at this hospital yet.',
  'patient.findClinician.alreadyConnected': 'Already connected',
  'patient.findClinician.alreadyPending': 'Request pending',
  'patient.findClinician.confirmTitle': 'Request connection?',
  'patient.findClinician.confirmSubmit': 'Send request',
  'patient.findClinician.success': 'Request sent. Waiting for {name} to approve.',
  'patient.findClinician.error': 'Could not send request. Try again.',
  // Clinician — incoming patient-initiated requests
  'clinician.incomingRequests.title': 'Awaiting your approval',
  'clinician.incomingRequests.approve': 'Approve',
  'clinician.incomingRequests.decline': 'Decline',
  'clinician.pendingSection.awaitingPatient': 'Awaiting patient',
```

- [ ] **Step 2: Add matching keys to `src/i18n/th.ts`**

```ts
  // Patient — find a clinician (Thai polish later if needed)
  'patient.findClinician.entryButton': 'ค้นหาแพทย์ของฉัน',
  'patient.findClinician.title': 'เชื่อมต่อกับแพทย์',
  'patient.findClinician.step1Title': 'โรงพยาบาลใด',
  'patient.findClinician.step2Title': 'เลือกแพทย์ของคุณ',
  'patient.findClinician.empty': 'ยังไม่มีแพทย์ที่ลงทะเบียนที่โรงพยาบาลนี้',
  'patient.findClinician.alreadyConnected': 'เชื่อมต่อแล้ว',
  'patient.findClinician.alreadyPending': 'รอการตอบรับ',
  'patient.findClinician.confirmTitle': 'ขอเชื่อมต่อ?',
  'patient.findClinician.confirmSubmit': 'ส่งคำขอ',
  'patient.findClinician.success': 'ส่งคำขอแล้ว รอ {name} อนุมัติ',
  'patient.findClinician.error': 'ไม่สามารถส่งคำขอได้ กรุณาลองอีกครั้ง',
  // Clinician — incoming patient-initiated requests
  'clinician.incomingRequests.title': 'รอการอนุมัติของคุณ',
  'clinician.incomingRequests.approve': 'อนุมัติ',
  'clinician.incomingRequests.decline': 'ปฏิเสธ',
  'clinician.pendingSection.awaitingPatient': 'รอผู้ป่วยตอบรับ',
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.4: patientService additions

**Files:**
- Modify: `src/services/patientService.ts`

- [ ] **Step 1: Add new types + functions at the end of the file**

```ts
import type { Hospital } from '../types/database';
// (skip if already imported)

export interface CliniciansAtHospital {
  user_id: string;
  full_name: string;
  hospital_id: string;
}

export async function getCliniciansAtHospital(hospitalId: string): Promise<CliniciansAtHospital[]> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, hospital_id')
    .eq('hospital_id', hospitalId)
    .eq('verified', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CliniciansAtHospital[];
}

export async function requestClinicianLink(
  clinicianId: string,
  patientUserId: string,
  shareFullName: boolean
): Promise<ClinicianPatientLink> {
  // Upsert pattern: existing declined/revoked rows get flipped back to pending.
  const { data: existing } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('patient_user_id', patientUserId)
    .maybeSingle();

  if (existing) {
    const link = existing as ClinicianPatientLink;
    if (link.status === 'active' || link.status === 'pending') return link;
    // declined / revoked / expired → flip back to pending
    const { data: updated, error: updErr } = await supabase
      .from('clinician_patient_links')
      .update({
        status: 'pending',
        initiated_by: 'patient',
        requested_at: new Date().toISOString(),
        consented_at: null,
        revoked_at: null,
        share_full_name: shareFullName,
      })
      .eq('id', link.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    return updated as ClinicianPatientLink;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('clinician_patient_links')
    .insert({
      clinician_id: clinicianId,
      patient_user_id: patientUserId,
      status: 'pending',
      initiated_by: 'patient',
      share_full_name: shareFullName,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  return inserted as ClinicianPatientLink;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.5: clinicianService additions — incoming requests

**Files:**
- Modify: `src/services/clinicianService.ts`

- [ ] **Step 1: Add types + functions at the end of the file**

```ts
export interface IncomingPatientRequest {
  link: ClinicianPatientLink;
  patientDisplayId: string | null;
  patientFullName: string | null; // null if share_full_name = false at request time
}

export async function getIncomingPatientRequests(
  clinicianId: string
): Promise<IncomingPatientRequest[]> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('status', 'pending')
    .eq('initiated_by', 'patient')
    .order('requested_at', { ascending: false });
  if (linkErr) throw new Error(linkErr.message);
  const links = (linkRows ?? []) as ClinicianPatientLink[];
  if (links.length === 0) return [];

  // Resolve display id + full name (only if patient agreed to share)
  const rows = await Promise.all(
    links.map(async (link) => {
      const { data: displayId } = await supabase.rpc('get_patient_display_id', {
        p_user_id: link.patient_user_id,
      });
      let patientFullName: string | null = null;
      if (link.share_full_name) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', link.patient_user_id)
          .maybeSingle();
        patientFullName = profile?.full_name ?? null;
      }
      return {
        link,
        patientDisplayId: (displayId as string | null) ?? null,
        patientFullName,
      };
    })
  );
  return rows;
}

export async function approveIncomingRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'active', consented_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}

export async function declineIncomingRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'declined' })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}
```

NOTE: the patient's `full_name` read assumes the patient has accepted RLS — which they have because they initiated the request (existing patient policies allow self-read). But the clinician reading another patient's profile is gated by `is_active_clinician_for()` which returns FALSE for pending links. To read the full_name BEFORE approval, we'd need an additional security-definer RPC. **DEFER**: for v1, set `patientFullName` to null and just show the patient display id (HC-XXXXXX) on the incoming request row. The UI will use display id as the label.

Update the function to skip the profile fetch and always return `patientFullName: null`:

```ts
return {
  link,
  patientDisplayId: (displayId as string | null) ?? null,
  patientFullName: null,
};
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.6: useAssignedPatients hook — expose incomingRequests

**Files:**
- Modify: `src/hooks/useAssignedPatients.ts`

- [ ] **Step 1: Extend the result interface**

```ts
import type { PendingPatientLinkRow, IncomingPatientRequest } from '../services/clinicianService';

export interface UseAssignedPatientsResult {
  patients: Profile[];
  pendingLinks: PendingPatientLinkRow[];
  incomingRequests: IncomingPatientRequest[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

- [ ] **Step 2: Add state + fetch**

Inside the hook, add state:

```ts
const [incomingRequests, setIncomingRequests] = useState<IncomingPatientRequest[]>([]);
```

Inside the existing `useEffect` that fetches, parallelize the third fetch:

```ts
const [activeData, pendingData, incomingData] = await Promise.all([
  isMockMode
    ? mockServices.getAssignedPatients()
    : realClinicianService.getAssignedPatients(userId!),
  isMockMode
    ? mockServices.getPendingPatientLinks(userId!)
    : realClinicianService.getPendingPatientLinks(userId!),
  isMockMode
    ? mockServices.getIncomingPatientRequests(userId!)
    : realClinicianService.getIncomingPatientRequests(userId!),
]);
if (!cancelled) {
  setPatients(activeData);
  setPendingLinks(pendingData);
  setIncomingRequests(incomingData);
}
```

And in the cancelled-error branch + the disabled branch, also set incomingRequests to `[]`.

- [ ] **Step 3: Return the new field**

```ts
return { patients, pendingLinks, incomingRequests, loading, error, refresh };
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: mock getIncomingPatientRequests not yet defined → typecheck error. Fix in Task 3.7.

### Task 3.7: Mock service for patient-initiated linking

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Add mock incoming requests + service functions**

Append:

```ts
// ── Patient-initiated linking (mock, clinician side) ─────────
// Seeded: one incoming request from a mock patient to the demo clinician,
// so the clinician dashboard demo shows the "Awaiting your approval" row.

let mockIncomingPatientRequests: import('../services/clinicianService').IncomingPatientRequest[] = [
  {
    link: {
      id: 'mock-incoming-patient-1',
      clinician_id: MOCK_CLINICIAN_PROFILE.user_id,
      patient_user_id: 'mock-patient-hc-987654',
      status: 'pending',
      initiated_by: 'patient',
      requested_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      consented_at: null,
      revoked_at: null,
      share_full_name: true,
    },
    patientDisplayId: 'HC-987654',
    patientFullName: null,
  },
];

export async function getIncomingPatientRequests(
  clinicianId: string
): Promise<import('../services/clinicianService').IncomingPatientRequest[]> {
  return mockIncomingPatientRequests.filter(r => r.link.clinician_id === clinicianId);
}

export async function approveIncomingRequest(linkId: string): Promise<void> {
  mockIncomingPatientRequests = mockIncomingPatientRequests.filter(r => r.link.id !== linkId);
}

export async function declineIncomingRequest(linkId: string): Promise<void> {
  mockIncomingPatientRequests = mockIncomingPatientRequests.filter(r => r.link.id !== linkId);
}

// ── Patient-initiated linking (mock, patient side) ───────────
// Returns the seeded mock clinicians at a given hospital. For the demo
// patient flow, only Songklanagarind has the demo clinician registered.

export async function getCliniciansAtHospital(
  hospitalId: string
): Promise<import('../services/patientService').CliniciansAtHospital[]> {
  if (hospitalId === MOCK_CLINICIAN_PROFILE.hospital_id) {
    return [{
      user_id: MOCK_CLINICIAN_PROFILE.user_id,
      full_name: MOCK_CLINICIAN_PROFILE.full_name,
      hospital_id: MOCK_CLINICIAN_PROFILE.hospital_id ?? '',
    }];
  }
  return [];
}

export async function requestClinicianLink(
  clinicianId: string,
  patientUserId: string,
  shareFullName: boolean
): Promise<import('../types/database').ClinicianPatientLink> {
  // No-op for mock — just return a fake active link
  return {
    id: `mock-self-request-${Date.now()}`,
    clinician_id: clinicianId,
    patient_user_id: patientUserId,
    status: 'pending',
    initiated_by: 'patient',
    requested_at: new Date().toISOString(),
    consented_at: null,
    revoked_at: null,
    share_full_name: shareFullName,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.8: IncomingPatientRequestRow component

**Files:**
- Create: `src/components/clinician/IncomingPatientRequestRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';

interface Props {
  linkId: string;
  patientDisplayId: string | null;
  patientFullName: string | null;
  onResolved: () => void;
}

export default function IncomingPatientRequestRow({ linkId, patientDisplayId, patientFullName, onResolved }: Props) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const [pending, setPending] = useState<'approve' | 'decline' | null>(null);

  const handle = useCallback(async (kind: 'approve' | 'decline') => {
    if (pending) return;
    setPending(kind);
    try {
      const svc = isMockMode ? mockService : realService;
      if (kind === 'approve') {
        await svc.approveIncomingRequest(linkId);
      } else {
        await svc.declineIncomingRequest(linkId);
      }
      onResolved();
    } finally {
      setPending(null);
    }
  }, [pending, isMockMode, linkId, onResolved]);

  const label = patientFullName ?? patientDisplayId ?? '—';

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Feather name="user-plus" size={14} color={COLORS.primary} />
      </View>
      <View style={styles.col}>
        <Text style={styles.name} numberOfLines={1}>{label}</Text>
        {patientFullName && patientDisplayId && (
          <Text style={styles.subtitle}>{patientDisplayId}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => handle('decline')}
        disabled={!!pending}
        style={[styles.declineBtn, !!pending && styles.btnDisabled]}
        accessibilityLabel={t('clinician.incomingRequests.decline' as TranslationKey)}
      >
        {pending === 'decline' ? (
          <ActivityIndicator size="small" color={COLORS.statusUrgent} />
        ) : (
          <Text style={styles.declineText}>
            {t('clinician.incomingRequests.decline' as TranslationKey)}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handle('approve')}
        disabled={!!pending}
        style={[styles.approveBtn, !!pending && styles.btnDisabled]}
        accessibilityLabel={t('clinician.incomingRequests.approve' as TranslationKey)}
      >
        {pending === 'approve' ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.approveText}>
            {t('clinician.incomingRequests.approve' as TranslationKey)}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    marginBottom: SPACING.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 11, color: COLORS.textSecondary },
  declineBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent,
    minWidth: 64,
    alignItems: 'center',
  },
  declineText: { fontSize: 12, fontWeight: '700', color: COLORS.statusUrgent },
  approveBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    minWidth: 64,
    alignItems: 'center',
  },
  approveText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.9: ClinicianDashboard incoming requests subsection

**Files:**
- Modify: `src/screens/clinician/ClinicianDashboardScreen.tsx`

- [ ] **Step 1: Add imports**

```tsx
import IncomingPatientRequestRow from '../../components/clinician/IncomingPatientRequestRow';
```

- [ ] **Step 2: Destructure `incomingRequests` from useAssignedPatients**

Find: `const { patients, pendingLinks, loading, refresh: refreshAssigned } = useAssignedPatients();`
Replace with: `const { patients, pendingLinks, incomingRequests, loading, refresh: refreshAssigned } = useAssignedPatients();`

- [ ] **Step 3: Extend the pending section in renderQueueContent to render two groups**

Find the existing `{pendingLinks.length > 0 && (` block. Replace its body so it renders both groups:

```tsx
{(pendingLinks.length > 0 || incomingRequests.length > 0) && (
  <View style={styles.pendingSection}>
    {incomingRequests.length > 0 && (
      <>
        <Text style={styles.pendingSectionLabel}>
          {t('clinician.incomingRequests.title' as TranslationKey).toUpperCase()}
        </Text>
        {incomingRequests.map((r) => (
          <IncomingPatientRequestRow
            key={r.link.id}
            linkId={r.link.id}
            patientDisplayId={r.patientDisplayId}
            patientFullName={r.patientFullName}
            onResolved={refreshAssigned}
          />
        ))}
      </>
    )}
    {pendingLinks.length > 0 && (
      <>
        <Text style={styles.pendingSectionLabel}>
          {t('clinician.pendingSection.awaitingPatient' as TranslationKey).toUpperCase()}
        </Text>
        {pendingLinks.map(({ link, patientDisplayId }) => (
          <PendingPatientRow
            key={link.id}
            linkId={link.id}
            patientDisplayId={patientDisplayId}
            onCancelled={refreshAssigned}
          />
        ))}
      </>
    )}
  </View>
)}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.10: PatientFindClinicianScreen

**Files:**
- Create: `src/screens/settings/PatientFindClinicianScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Modal, Pressable, Switch, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useHospitals } from '../../hooks/useHospitals';
import HospitalPicker from '../../components/common/HospitalPicker';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/patientService';
import * as mockService from '../../mock/services';
import type { CliniciansAtHospital } from '../../services/patientService';

export default function PatientFindClinicianScreen() {
  const navigation = useNavigation();
  const { t } = useLanguage();
  const { user, isMockMode } = useAuth();
  const { hospitals } = useHospitals();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [clinicians, setClinicians] = useState<CliniciansAtHospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<CliniciansAtHospital | null>(null);
  const [shareFullName, setShareFullName] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const selectedHospital = useMemo(
    () => hospitals.find(h => h.id === hospitalId) ?? null,
    [hospitals, hospitalId]
  );

  useEffect(() => {
    if (!hospitalId) {
      setClinicians([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const svc = isMockMode ? mockService : realService;
        const data = await svc.getCliniciansAtHospital(hospitalId);
        if (!cancelled) setClinicians(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hospitalId, isMockMode]);

  const handleSubmit = async () => {
    if (!confirmTarget || !user?.id) return;
    setError('');
    setSubmitting(true);
    try {
      const svc = isMockMode ? mockService : realService;
      await svc.requestClinicianLink(confirmTarget.user_id, user.id, shareFullName);
      setSuccess(true);
    } catch {
      setError(t('patient.findClinician.error' as TranslationKey));
    } finally {
      setSubmitting(false);
    }
  };

  const closeConfirm = () => {
    setConfirmTarget(null);
    setShareFullName(true);
    setSuccess(false);
    setError('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t('patient.findClinician.step1Title' as TranslationKey)}</Text>
        <HospitalPicker value={hospitalId} onChange={setHospitalId} />

        {hospitalId && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
              {t('patient.findClinician.step2Title' as TranslationKey)}
            </Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: SPACING.lg }} />
            ) : clinicians.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('patient.findClinician.empty' as TranslationKey)}</Text>
              </View>
            ) : (
              clinicians.map(c => (
                <TouchableOpacity
                  key={c.user_id}
                  onPress={() => setConfirmTarget(c)}
                  style={styles.clinicianRow}
                >
                  <View style={styles.avatar}>
                    <Feather name="user" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.clinicianName}>{c.full_name || 'Clinician'}</Text>
                    <Text style={styles.clinicianHospital}>{selectedHospital?.name_th ?? ''}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!confirmTarget} transparent animationType="fade" onRequestClose={closeConfirm}>
        <Pressable style={styles.backdrop} onPress={closeConfirm}>
          <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('patient.findClinician.confirmTitle' as TranslationKey)}</Text>
              <TouchableOpacity onPress={closeConfirm} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {success ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Feather name="check" size={22} color={COLORS.statusNormal} />
                </View>
                <Text style={styles.successText}>
                  {t('patient.findClinician.success' as TranslationKey, { name: confirmTarget?.full_name ?? '' })}
                </Text>
                <TouchableOpacity onPress={() => { closeConfirm(); navigation.goBack(); }} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{t('clinician.linkPatient.close' as TranslationKey)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.targetCard}>
                  <Text style={styles.targetName}>{confirmTarget?.full_name}</Text>
                  <Text style={styles.targetHospital}>{selectedHospital?.name_th}</Text>
                </View>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabelCol}>
                    <Text style={styles.toggleLabel}>{t('patient.linkRequest.shareFullNameLabel' as TranslationKey)}</Text>
                    <Text style={styles.toggleHelp}>{t('patient.linkRequest.shareFullNameHelp' as TranslationKey)}</Text>
                  </View>
                  <Switch
                    value={shareFullName}
                    onValueChange={setShareFullName}
                    trackColor={{ false: COLORS.borderLight, true: COLORS.primaryMuted }}
                    thumbColor={shareFullName ? COLORS.primary : COLORS.surface}
                  />
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                >
                  {submitting ? <ActivityIndicator color={COLORS.white} /> : (
                    <Text style={styles.primaryText}>{t('patient.findClinician.confirmSubmit' as TranslationKey)}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight, marginBottom: SPACING.sm },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  clinicianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  col: { flex: 1, gap: 2 },
  clinicianName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  clinicianHospital: { fontSize: 12, color: COLORS.textSecondary },
  backdrop: {
    flex: 1, backgroundColor: COLORS.overlay,
    justifyContent: 'center', alignItems: 'center', padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: '100%', maxWidth: 420, gap: SPACING.md,
    ...(SHADOWS.elevated as object),
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  targetCard: {
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
  },
  targetName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  targetHospital: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  toggleLabelCol: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  toggleHelp: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  errorText: { fontSize: 12, color: COLORS.statusUrgent, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    minHeight: 44, justifyContent: 'center',
  },
  primaryText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
  successWrap: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  successIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.statusNormalBg,
    justifyContent: 'center', alignItems: 'center',
  },
  successText: { fontSize: 14, color: COLORS.text, textAlign: 'center', lineHeight: 20 },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.11: Register the new screen in navigation

**Files:**
- Modify: `src/types/navigation.ts`
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add `PatientFindClinician` to RootStackParamList**

In `src/types/navigation.ts`, add to `RootStackParamList`:

```ts
PatientFindClinician: undefined;
```

- [ ] **Step 2: Register the screen in AppNavigator**

In `src/navigation/AppNavigator.tsx`, add import:

```tsx
import PatientFindClinicianScreen from '../screens/settings/PatientFindClinicianScreen';
```

Add inside the `<RootStack.Navigator>` block, after the existing `PrivacySettings` screen:

```tsx
<RootStack.Screen
  name="PatientFindClinician"
  component={PatientFindClinicianScreen}
  options={{ title: t('patient.findClinician.title') }}
/>
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.12: Add "+ Find my doctor" button in ConnectedCliniciansSection

**Files:**
- Modify: `src/components/patient/ConnectedCliniciansSection.tsx`

- [ ] **Step 1: Add navigation + i18n imports**

```tsx
import { useNavigation } from '@react-navigation/native';
```

- [ ] **Step 2: Add the button above the list**

Inside the component, just after `const { t } = useLanguage();` add `const navigation = useNavigation<any>();`. Then in the JSX, modify the section to include the button right under the title:

```tsx
<View style={styles.headerRow}>
  <Text style={styles.sectionLabel}>
    {t('privacy.connectedClinicians.title' as TranslationKey)}
  </Text>
  <TouchableOpacity
    onPress={() => navigation.navigate('PatientFindClinician')}
    style={styles.findBtn}
    activeOpacity={0.7}
  >
    <Feather name="plus" size={14} color={COLORS.primary} />
    <Text style={styles.findBtnText}>
      {t('patient.findClinician.entryButton' as TranslationKey)}
    </Text>
  </TouchableOpacity>
</View>
```

Replacing the existing standalone `<Text style={styles.sectionLabel}>...</Text>` line.

- [ ] **Step 3: Add the corresponding styles**

```tsx
headerRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: SPACING.sm,
  marginLeft: SPACING.xs,
},
findBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: SPACING.sm,
  paddingVertical: SPACING.xs,
  borderRadius: RADIUS.full,
  backgroundColor: COLORS.primaryLight,
  borderWidth: 1,
  borderColor: COLORS.primaryMuted,
},
findBtnText: {
  fontSize: 12,
  fontWeight: '700',
  color: COLORS.primary,
},
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

### Task 3.13: Phase 3 verify + commit

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"
```
Expected: `EXIT: 0`.

- [ ] **Step 2: Build the web bundle**

```bash
npm run build:web 2>&1 | tail -3
```
Expected: success.

- [ ] **Step 3: Visual check (clinician — incoming requests subsection)**

Serve + Playwright. Navigate `http://localhost:4173/` (auto-login as clinician). Open the patient queue (drawer on mobile, leftRail on desktop). Confirm:
- "AWAITING YOUR APPROVAL" subsection appears at top of pending
- A row with HC-987654 and Approve / Decline buttons renders
- Tap Decline → row disappears

- [ ] **Step 4: Visual check (patient — find clinician flow)**

Navigate `http://localhost:4173/?as=patient`. Tap PrivacySettings link from Passport → scroll to Connected clinicians → tap "+ Find my doctor". Confirm:
- PatientFindClinicianScreen opens
- HospitalPicker shows the 3 seeded hospitals
- Pick Songklanagarind → clinician list appears with the mock clinician (Dr. Ploy Wattanaporn)
- Tap clinician → confirm sheet opens with share_full_name toggle (default ON)
- Tap Send request → success state appears

- [ ] **Step 5: Commit Phase 3**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-05-27-patient-initiated-links.sql \
  src/types/database.ts \
  src/types/navigation.ts \
  src/i18n/en.ts \
  src/i18n/th.ts \
  src/services/patientService.ts \
  src/services/clinicianService.ts \
  src/hooks/useAssignedPatients.ts \
  src/mock/services.ts \
  src/components/clinician/IncomingPatientRequestRow.tsx \
  src/screens/clinician/ClinicianDashboardScreen.tsx \
  src/screens/settings/PatientFindClinicianScreen.tsx \
  src/components/patient/ConnectedCliniciansSection.tsx \
  src/navigation/AppNavigator.tsx

git commit -m "$(cat <<'EOF'
feat(profile): patient-initiated clinician link flow

Phase 3 of the profile-additions spec. Patient can browse hospitals,
pick a verified clinician, and send a connection request. Clinician
sees an "Awaiting your approval" subsection at the top of their
pending list with Approve / Decline buttons. clinician_patient_links
gains an initiated_by column so the UI knows which side needs to act.

Requires applying supabase/migrations/2026-05-27-patient-initiated-links.sql
via Dashboard SQL Editor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Verify: `git log --oneline -4` shows all three phase commits + the original spec commit on the branch.

---

## After Phase 3 — push + merge

Standard pattern (matches the previous features in this session):

1. Push the branch: `git push -u origin feat/profile-additions` (require explicit OK first)
2. Merge to main: fast-forward, push main, delete the feature branch locally + remotely (require explicit OK)

---

## Self-review notes (already addressed inline)

- All 3 migrations covered (Phase 1, 2, 3) ✓
- All 13 + 10 + 16 i18n keys covered (Phase 1, 2, 3 respectively) ✓
- Patient full-name on incoming-request row: deferred to display-id only (RLS prevents reading patient profile pre-approval; documented in Task 3.5) ✓
- Mock-mode storage paths exercise all flows (Tasks 1.10, 2.5, 3.7) ✓
- Each phase has its own commit at the end with the explicit file list ✓
- Visual verification step embedded per phase ✓
