# Clinician Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the hospital directory (curated seed + "Other" free-text fallback), and add an in-app admin approval workflow so new clinicians can be verified without raw SQL.

**Architecture:** Two additive phases on `feat/clinician-onboarding`. Phase A (hospital expansion) is independent and ships first. Phase B (admin approval) adds an `admins` table, an `is_admin()` gate, and a dedicated AdminScreen. Each phase = one commit after typecheck + web build + Playwright verification. All migrations additive.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / react-native-web / TypeScript / Supabase JS v2 / Postgres + RLS.

**Spec:** `docs/superpowers/specs/2026-05-26-clinician-onboarding-design.md`

**Working branch:** `feat/clinician-onboarding` (already created off main; contains the spec commit `a60d824`).

**Project conventions** (read before starting):
- Theme tokens only, from `src/config/theme.ts` (`COLORS`, `SPACING`, `RADIUS`, `SHADOWS`, `TYPOGRAPHY`). Never hardcode hex/spacing.
- i18n: `src/i18n/en.ts` is the source of truth (its keys form `TranslationKey`); `src/i18n/th.ts` must mirror every key (`Record<TranslationKey, string>`). Add to BOTH.
- `t('foo', { name })` uses single-brace `{name}` substitution.
- Mocks: `src/mock/services.ts`, `src/mock/data.ts`, `src/mock/clinicianData.ts`. Hooks select mock vs real via `useAuth().isMockMode`.
- Typecheck: `npx tsc --noEmit` from `HaemoCare/`. Web build: `npm run build:web`. Both must pass before commit.
- Migrations are applied by the user via Supabase Dashboard SQL Editor — never run from code.
- Localhost auto-login: `?as=patient` (mock patient), `?as=none` (no auto-login / LoginScreen), default (mock clinician). Phase B adds `?as=admin`.
- No component unit tests in this codebase. Verification = typecheck + web build + Playwright screenshot.
- SECURITY DEFINER function pattern reference: `is_active_clinician_for` in `supabase/schema.sql:121`.
- `useHospitals` hook caches per-mode at module level: `cachedMockHospitals` / `cachedRealHospitals` in `src/hooks/useHospitals.ts`.

---

## Phase A — Hospital expansion

**Phase goal:** Patients/clinicians can affiliate to any hospital — a bigger curated seed plus an "Other — type it in" fallback. Single commit at phase end.

### Task A.1: Migration — seed expansion + create_or_get_hospital RPC

**Files:**
- Create: `supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================
-- Hospital directory expansion + create-or-get RPC
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-26-clinician-onboarding-design.md
-- Phase: A

-- Expanded curated seed. on conflict (code) keeps the 3 existing rows
-- and is safe to re-run. Codes are stable slugs.
insert into public.hospitals (name_th, name_en, code, region) values
  ('โรงพยาบาลจุฬาลงกรณ์', 'King Chulalongkorn Memorial Hospital', 'chulalongkorn', 'central'),
  ('โรงพยาบาลธรรมศาสตร์เฉลิมพระเกียรติ', 'Thammasat University Hospital', 'thammasat', 'central'),
  ('โรงพยาบาลพระมงกุฎเกล้า', 'Phramongkutklao Hospital', 'phramongkutklao', 'central'),
  ('โรงพยาบาลราชวิถี', 'Rajavithi Hospital', 'rajavithi', 'central'),
  ('โรงพยาบาลภูมิพลอดุลยเดช', 'Bhumibol Adulyadej Hospital', 'bhumibol', 'central'),
  ('สถาบันสุขภาพเด็กแห่งชาติมหาราชินี', 'Queen Sirikit National Institute of Child Health', 'qsnich', 'central'),
  ('โรงพยาบาลมหาราชนครเชียงใหม่', 'Maharaj Nakorn Chiang Mai Hospital', 'maharaj-cm', 'north'),
  ('โรงพยาบาลนครพิงค์', 'Nakornping Hospital', 'nakornping', 'north'),
  ('โรงพยาบาลพุทธชินราช พิษณุโลก', 'Buddhachinaraj Phitsanulok Hospital', 'buddhachinaraj', 'north'),
  ('โรงพยาบาลศรีนครินทร์ ขอนแก่น', 'Srinagarind Hospital (Khon Kaen)', 'srinagarind', 'northeast'),
  ('โรงพยาบาลมหาราชนครราชสีมา', 'Maharat Nakhon Ratchasima Hospital', 'maharat-korat', 'northeast'),
  ('โรงพยาบาลสรรพสิทธิประสงค์ อุบลราชธานี', 'Sunpasitthiprasong Hospital (Ubon)', 'sunpasit', 'northeast'),
  ('โรงพยาบาลอุดรธานี', 'Udon Thani Hospital', 'udonthani', 'northeast'),
  ('โรงพยาบาลหาดใหญ่', 'Hatyai Hospital', 'hatyai', 'south'),
  ('โรงพยาบาลสุราษฎร์ธานี', 'Surat Thani Hospital', 'suratthani', 'south'),
  ('โรงพยาบาลวชิระภูเก็ต', 'Vachira Phuket Hospital', 'vachira-phuket', 'south'),
  ('โรงพยาบาลมหาราชนครศรีธรรมราช', 'Maharaj Nakhon Si Thammarat Hospital', 'maharaj-nst', 'south'),
  ('โรงพยาบาลชลบุรี', 'Chonburi Hospital', 'chonburi', 'east'),
  ('โรงพยาบาลระยอง', 'Rayong Hospital', 'rayong', 'east'),
  ('โรงพยาบาลพระปกเกล้า จันทบุรี', 'Phrapokklao Hospital (Chanthaburi)', 'phrapokklao', 'east'),
  ('โรงพยาบาลราชบุรี', 'Ratchaburi Hospital', 'ratchaburi', 'west'),
  ('โรงพยาบาลนครปฐม', 'Nakhon Pathom Hospital', 'nakhonpathom', 'west'),
  ('โรงพยาบาลกาญจนบุรี', 'Kanchanaburi Hospital', 'kanchanaburi', 'west'),
  ('โรงพยาบาลบำรุงราษฎร์', 'Bumrungrad International Hospital', 'bumrungrad', 'central'),
  ('โรงพยาบาลกรุงเทพ', 'Bangkok Hospital', 'bangkok-hospital', 'central'),
  ('โรงพยาบาลสมิติเวช สุขุมวิท', 'Samitivej Sukhumvit Hospital', 'samitivej', 'central'),
  ('โรงพยาบาลบีเอ็นเอช', 'BNH Hospital', 'bnh', 'central'),
  ('โรงพยาบาลเมดพาร์ค', 'MedPark Hospital', 'medpark', 'central')
on conflict (code) do nothing;

-- Create-or-get: lets the "Other" flow add a hospital without a broad
-- INSERT policy. Dedups by case-insensitive name_th.
create or replace function public.create_or_get_hospital(p_name text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_id uuid;
  v_trimmed text := btrim(p_name);
begin
  if v_trimmed = '' then
    raise exception 'hospital name required';
  end if;
  select id into v_id from public.hospitals
    where lower(name_th) = lower(v_trimmed) limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.hospitals (name_th, name_en, is_active)
    values (v_trimmed, v_trimmed, true)
    returning id into v_id;
  return v_id;
end;
$$;
```

- [ ] **Step 2: Ask the user to apply it**

Tell the user: "Phase A migration written. Apply `supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql` via Supabase Dashboard SQL Editor. Reply when applied (mock-mode lets the rest of Phase A verify without it)."

Do not block on the reply — the controller decides whether to proceed (mock-mode works regardless).

### Task A.2: hospitalService.createOrGetHospital + useHospitals cache invalidation

**Files:**
- Modify: `src/services/hospitalService.ts`
- Modify: `src/hooks/useHospitals.ts`

- [ ] **Step 1: Add `createOrGetHospital` to hospitalService.ts**

Append:

```ts
export async function createOrGetHospital(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_or_get_hospital', { p_name: name.trim() });
  if (error) throw new Error(error.message);
  return data as string;
}
```

- [ ] **Step 2: Add cache invalidation to useHospitals.ts**

The module has `let cachedMockHospitals` and `let cachedRealHospitals`. Add an exported invalidation function (place it after the cache declarations, before the hook):

```ts
export function invalidateHospitalsCache(): void {
  cachedMockHospitals = null;
  cachedRealHospitals = null;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit`
Expected: clean exit 0 (the mock `createOrGetHospital` is added in A.3 — but nothing references it yet, so typecheck passes).

### Task A.3: Mock createOrGetHospital

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Add mock implementation**

Find the existing `MOCK_HOSPITALS` const and `getHospitals` export. After them, add:

```ts
let mockHospitalIdCounter = 1;

export async function createOrGetHospital(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('hospital name required');
  const existing = MOCK_HOSPITALS.find(
    h => h.name_th.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing.id;
  const id = `mock-hospital-other-${mockHospitalIdCounter++}`;
  MOCK_HOSPITALS.push({
    id,
    name_th: trimmed,
    name_en: trimmed,
    code: null,
    region: null,
    is_active: true,
    created_at: new Date().toISOString(),
  });
  return id;
}
```

NOTE: `MOCK_HOSPITALS` must be declared with `const` but its array contents are mutated via `.push` — that's fine (const binding, mutable array). If it's currently `const MOCK_HOSPITALS: Hospital[] = [...]`, no change needed.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task A.4: HospitalPicker "Other" fallback

**Files:**
- Modify: `src/components/common/HospitalPicker.tsx`

- [ ] **Step 1: Read the current HospitalPicker** to understand its modal structure (search input, grouped list, row rendering, styles).

- [ ] **Step 2: Add imports + state for the "Other" input mode**

Add to imports (if not present): `ActivityIndicator`, `TextInput` from `react-native`. Add:

```ts
import { createOrGetHospital as realCreateOrGet } from '../../services/hospitalService';
import * as mockService from '../../mock/services';
import { invalidateHospitalsCache } from '../../hooks/useHospitals';
import { useAuth } from '../../contexts/AuthContext';
```

Inside the component:

```ts
const { isMockMode } = useAuth();
const [otherMode, setOtherMode] = useState(false);
const [otherText, setOtherText] = useState('');
const [otherSubmitting, setOtherSubmitting] = useState(false);
const [otherError, setOtherError] = useState('');
```

- [ ] **Step 3: Add the "Other" row at the end of the modal list**

After the grouped region list (`Array.from(grouped.entries()).map(...)`) and before the ScrollView closes, add a row:

```tsx
{!otherMode && (
  <TouchableOpacity
    onPress={() => { setOtherMode(true); setOtherText(''); setOtherError(''); }}
    style={styles.otherRow}
  >
    <Feather name="plus" size={16} color={COLORS.primary} />
    <Text style={styles.otherRowText}>{t('hospital.picker.other' as TranslationKey)}</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Render the input mode**

When `otherMode` is true, replace the search bar + list with an input panel. Simplest: conditionally render an input block at the top of the modal body when `otherMode`:

```tsx
{otherMode ? (
  <View style={styles.otherPanel}>
    <Text style={styles.otherLabel}>{t('hospital.picker.otherLabel' as TranslationKey)}</Text>
    <TextInput
      value={otherText}
      onChangeText={(v) => { setOtherText(v); if (otherError) setOtherError(''); }}
      autoFocus
      style={styles.otherInput}
      placeholder={t('hospital.picker.otherLabel' as TranslationKey)}
      placeholderTextColor={COLORS.textLight}
      editable={!otherSubmitting}
    />
    {otherError ? <Text style={styles.otherErrorText}>{otherError}</Text> : null}
    <View style={styles.otherActions}>
      <TouchableOpacity onPress={() => setOtherMode(false)} style={styles.otherBackBtn}>
        <Text style={styles.otherBackText}>{t('hospital.picker.otherBack' as TranslationKey)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleAddOther}
        disabled={!otherText.trim() || otherSubmitting}
        style={[styles.otherAddBtn, (!otherText.trim() || otherSubmitting) && styles.otherBtnDisabled]}
      >
        {otherSubmitting
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={styles.otherAddText}>{t('hospital.picker.otherAdd' as TranslationKey)}</Text>}
      </TouchableOpacity>
    </View>
  </View>
) : (
  <>
    {/* existing search bar + grouped list go here */}
  </>
)}
```

Wrap the EXISTING search input + ScrollView list in the `: ( <> ... </> )` else-branch.

- [ ] **Step 5: Add the `handleAddOther` callback**

Inside the component:

```ts
const handleAddOther = useCallback(async () => {
  const name = otherText.trim();
  if (!name) return;
  setOtherSubmitting(true);
  setOtherError('');
  try {
    const svc = isMockMode ? mockService : { createOrGetHospital: realCreateOrGet };
    const id = await svc.createOrGetHospital(name);
    invalidateHospitalsCache();
    onChange(id);
    setOtherMode(false);
    setOpen(false);
  } catch {
    setOtherError(t('hospital.picker.otherError' as TranslationKey));
  } finally {
    setOtherSubmitting(false);
  }
}, [otherText, isMockMode, onChange, t]);
```

NOTE: ensure `useCallback` is imported from React. The `onChange` and `setOpen` already exist in the component (setOpen controls the modal). If the modal-close state has a different name, use that.

- [ ] **Step 6: Reset otherMode when the modal closes**

Wherever the modal `onRequestClose` / backdrop press resets state, also `setOtherMode(false)`. If there's an existing close handler, add it there; otherwise add `setOtherMode(false)` to the backdrop `onPress`.

- [ ] **Step 7: Add styles**

```ts
otherRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  paddingHorizontal: SPACING.lg,
  paddingVertical: SPACING.md,
  borderTopWidth: 1,
  borderTopColor: COLORS.borderLight,
},
otherRowText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
otherPanel: { padding: SPACING.lg, gap: SPACING.sm },
otherLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.5 },
otherInput: {
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: RADIUS.md,
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm + 2,
  fontSize: 15,
  color: COLORS.text,
  backgroundColor: COLORS.white,
},
otherErrorText: { fontSize: 12, color: COLORS.statusUrgent, fontWeight: '600' },
otherActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.xs },
otherBackBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
otherBackText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
otherAddBtn: {
  backgroundColor: COLORS.primary,
  paddingHorizontal: SPACING.lg,
  paddingVertical: SPACING.sm,
  borderRadius: RADIUS.md,
  minWidth: 88,
  alignItems: 'center',
  justifyContent: 'center',
},
otherAddText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
otherBtnDisabled: { opacity: 0.5 },
```

- [ ] **Step 8: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task A.5: i18n keys (Phase A)

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Add to en.ts near the existing `hospital.picker.*` keys**

```ts
'hospital.picker.other': 'Other — type your hospital',
'hospital.picker.otherLabel': 'Hospital name',
'hospital.picker.otherAdd': 'Add',
'hospital.picker.otherBack': 'Back to list',
'hospital.picker.otherError': 'Could not add hospital. Try again.',
```

- [ ] **Step 2: Add matching keys to th.ts**

```ts
'hospital.picker.other': 'อื่น ๆ — พิมพ์ชื่อโรงพยาบาล',
'hospital.picker.otherLabel': 'ชื่อโรงพยาบาล',
'hospital.picker.otherAdd': 'เพิ่ม',
'hospital.picker.otherBack': 'กลับไปที่รายการ',
'hospital.picker.otherError': 'ไม่สามารถเพิ่มโรงพยาบาลได้ ลองอีกครั้ง',
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0 (key sets balanced between en.ts and th.ts).

### Task A.6: Phase A verify + commit

- [ ] **Step 1: Typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"`
Expected: `EXIT: 0`.

- [ ] **Step 2: Web build**

Run: `npm run build:web 2>&1 | tail -5`
Expected: `[fix-web-assets] done`. No errors.

- [ ] **Step 3: Visual check (Other flow)**

Serve `dist` on 4173, then Playwright at `http://localhost:4173/?as=none` → Sign up → clinician → open hospital picker → tap "Other — type your hospital" → type a name → tap Add → confirm the picker closes with the typed hospital selected. Screenshot the input panel.

- [ ] **Step 4: Commit Phase A**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql \
  src/services/hospitalService.ts \
  src/hooks/useHospitals.ts \
  src/mock/services.ts \
  src/components/common/HospitalPicker.tsx \
  src/i18n/en.ts \
  src/i18n/th.ts

git commit -m "$(cat <<'EOF'
feat(hospitals): expand seed + "Other" free-text fallback

Phase A of clinician-onboarding. Adds ~28 curated Thai hospitals to the
seed, plus a create_or_get_hospital RPC (dedups by case-insensitive
name) backing a new "Other — type your hospital" option in
HospitalPicker. Free-text hospitals are created active immediately.

Requires applying supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql
via Dashboard SQL Editor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Admin approval workflow

**Phase goal:** An admin lands on a dedicated AdminScreen, sees pending clinicians with a count badge, and approves them with one tap. Single commit at phase end.

### Task B.1: Migration — admins table, is_admin(), RLS

**Files:**
- Create: `supabase/migrations/2026-05-29-admins-and-approval.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================
-- Admin approval workflow
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-26-clinician-onboarding-design.md
-- Phase: B

create table public.admins (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

-- A user can read their own admin row (to determine isAdmin client-side).
create policy "Users read own admin row" on public.admins
  for select using (user_id = auth.uid());

-- Security-definer admin check, mirrors is_active_clinician_for().
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Admins can read every clinician profile (to list pending ones)...
create policy "Admins read all clinician profiles" on public.clinician_profiles
  for select using (public.is_admin());

-- ...and flip verification.
create policy "Admins verify clinicians" on public.clinician_profiles
  for update using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Tell the user to apply it + bootstrap the first admin**

Tell the user: "Phase B migration written. Apply `supabase/migrations/2026-05-29-admins-and-approval.sql` via Dashboard. THEN bootstrap yourself as the first admin by running, with your own auth user id:
```sql
insert into public.admins (user_id) values ('<your-auth-user-id>');
```
(Find your user id in Supabase Dashboard → Authentication → Users.) Reply when done. Mock-mode (`?as=admin`) lets the UI verify without this."

### Task B.2: Types — PendingClinician

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the interface** (near ClinicianProfile):

```ts
export interface PendingClinician {
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  hospital_id: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.3: clinicianService — getPendingClinicians + approveClinician

**Files:**
- Modify: `src/services/clinicianService.ts`

- [ ] **Step 1: Add the functions** (append; add `PendingClinician` to the type import from `'../types/database'`):

```ts
export async function getPendingClinicians(): Promise<PendingClinician[]> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, license_number, hospital_affiliation, hospital_id, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingClinician[];
}

export async function approveClinician(userId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_profiles')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (mock equivalents added in B.6 — nothing references them yet).

### Task B.4: AuthContext — isAdmin state + ?as=admin hatch

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add `isAdmin` to the context type**

In `AuthContextType`, add:
```ts
isAdmin: boolean;
```

- [ ] **Step 2: Add state**

Near the other `useState` declarations:
```ts
const [isAdmin, setIsAdmin] = useState(false);
```

- [ ] **Step 3: Resolve admin status in the bootstrap getSession path AND the onAuthStateChange handler**

After the `fetchProfile` + `fetchClinicianProfile` calls in BOTH the bootstrap `getSession().then(...)` and the `onAuthStateChange` handler (for a signed-in user), add an admin check. Define a helper near `fetchClinicianProfile`:

```ts
const fetchIsAdmin = useCallback(async (): Promise<void> => {
  const { data, error } = await supabase.rpc('is_admin');
  setIsAdmin(!error && data === true);
}, []);
```

Then call `fetchIsAdmin()` wherever `fetchClinicianProfile(s.user.id)` is called for a real signed-in user. In the bootstrap `Promise.all`, add it:
```ts
Promise.all([fetchProfile(s.user.id), fetchClinicianProfile(s.user.id), fetchIsAdmin()])
  .finally(() => setIsLoading(false));
```
And in the onAuthStateChange signed-in branch, add `fetchIsAdmin();` alongside the existing fetches.

- [ ] **Step 4: Reset isAdmin on signOut**

In `signOut`, add `setIsAdmin(false);` in both the mock-mode branch and the real branch.

- [ ] **Step 5: Add `?as=admin` to the localhost auto-login hatch**

In the localhost auto-login useEffect, the current logic handles `asRole === 'none'` and `asRole === 'patient'`. Add an admin branch BEFORE the patient/clinician assignment:

```ts
if (asRole === 'admin') {
  setIsMockMode(true);
  setUser({ id: MOCK_CLINICIAN_USER_ID, email: MOCK_CLINICIAN_EMAIL } as User);
  setIsAdmin(true);
  setProfile(null);
  setClinicianProfile(null);
  return;
}
```

(Reuse the mock clinician identity for the admin demo; what matters is `isAdmin=true` so the AdminScreen renders.)

- [ ] **Step 6: Add `isAdmin` to the provider value**

In the `<AuthContext.Provider value={{ ... }}>`, add `isAdmin,`.

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.5: usePendingClinicians hook

**Files:**
- Create: `src/hooks/usePendingClinicians.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/clinicianService';
import * as mockService from '../mock/services';
import type { PendingClinician } from '../types/database';

export interface UsePendingCliniciansResult {
  pending: PendingClinician[];
  count: number;
  loading: boolean;
  refresh: () => void;
}

export function usePendingClinicians(): UsePendingCliniciansResult {
  const { isAdmin, isMockMode } = useAuth();
  const [pending, setPending] = useState<PendingClinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!isAdmin) {
      setPending([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = isMockMode
          ? await mockService.getPendingClinicians()
          : await realService.getPendingClinicians();
        if (!cancelled) setPending(data);
      } catch {
        if (!cancelled) setPending([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, isMockMode, tick]);

  return { pending, count: pending.length, loading, refresh };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: mock `getPendingClinicians` not yet defined → error. Fixed in B.6.

### Task B.6: Mock — pending clinicians + approve

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Add mock state + functions** (append; add `PendingClinician` to the type import):

```ts
let mockPendingClinicians: import('../types/database').PendingClinician[] = [
  {
    user_id: 'mock-clinician-pending-1',
    full_name: 'Dr. Somsak Wattana',
    license_number: 'MD-44821',
    hospital_affiliation: 'โรงพยาบาลศิริราช',
    hospital_id: 'mock-hospital-siriraj',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    user_id: 'mock-clinician-pending-2',
    full_name: 'Dr. Nan Thirakul',
    license_number: 'MD-50193',
    hospital_affiliation: 'โรงพยาบาลรามาธิบดี',
    hospital_id: 'mock-hospital-rama',
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
];

export async function getPendingClinicians(): Promise<import('../types/database').PendingClinician[]> {
  return [...mockPendingClinicians];
}

export async function approveClinician(userId: string): Promise<void> {
  mockPendingClinicians = mockPendingClinicians.filter(c => c.user_id !== userId);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.7: AdminScreen

**Files:**
- Create: `src/screens/admin/AdminScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { useHospitals } from '../../hooks/useHospitals';
import { usePendingClinicians } from '../../hooks/usePendingClinicians';
import LanguageToggle from '../../components/common/LanguageToggle';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/clinicianService';
import * as mockService from '../../mock/services';
import type { PendingClinician } from '../../types/database';

function PendingRow({ clinician, hospitalLabel, onApprove }: {
  clinician: PendingClinician;
  hospitalLabel: string;
  onApprove: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const date = (() => {
    try {
      return new Date(clinician.created_at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return clinician.created_at; }
  })();
  return (
    <View style={styles.card}>
      <View style={styles.cardCol}>
        <Text style={styles.name}>{clinician.full_name?.trim() || '—'}</Text>
        <Text style={styles.meta}>
          {t('admin.approvals.licenseLabel' as TranslationKey)}: {clinician.license_number || '—'}
        </Text>
        <Text style={styles.meta}>{hospitalLabel}</Text>
        <Text style={styles.metaLight}>
          {t('admin.approvals.signedUpAt' as TranslationKey, { date })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={async () => { setBusy(true); try { await onApprove(); } finally { setBusy(false); } }}
        disabled={busy}
        style={[styles.approveBtn, busy && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t('admin.approvals.approve' as TranslationKey)}
      >
        {busy
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={styles.approveText}>{t('admin.approvals.approve' as TranslationKey)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function AdminScreen() {
  const { t } = useLanguage();
  const { signOut, isMockMode } = useAuth();
  const { isMobile } = useResponsive();
  const { hospitals } = useHospitals();
  const { pending, count, loading, refresh } = usePendingClinicians();

  const hospitalLabelFor = useCallback((c: PendingClinician): string => {
    if (c.hospital_id) {
      const h = hospitals.find(x => x.id === c.hospital_id);
      if (h) return h.name_th;
    }
    return c.hospital_affiliation?.trim() || '—';
  }, [hospitals]);

  const handleApprove = useCallback(async (userId: string) => {
    const svc = isMockMode ? mockService : realService;
    await svc.approveClinician(userId);
    refresh();
  }, [isMockMode, refresh]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>HaemoCare</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn} accessibilityLabel={t('auth.logout')}>
            <Feather name="log-out" size={18} color={COLORS.statusUrgent} />
          </TouchableOpacity>
          <LanguageToggle />
        </View>
      </View>

      <View style={[styles.header, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('admin.title' as TranslationKey)}</Text>
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{t('admin.subtitle' as TranslationKey)}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(c) => c.user_id}
          renderItem={({ item }) => (
            <PendingRow
              clinician={item}
              hospitalLabel={hospitalLabelFor(item)}
              onApprove={() => handleApprove(item.user_id)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('admin.approvals.empty' as TranslationKey)}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 56, paddingBottom: SPACING.sm,
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  signOutBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.statusUrgentBg,
    borderWidth: 1, borderColor: COLORS.statusUrgent,
    justifyContent: 'center', alignItems: 'center',
  },
  header: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text },
  badge: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: SPACING.md, ...SHADOWS.card,
  },
  cardCol: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  metaLight: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  approveBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, minWidth: 96, minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  approveText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.8: AppNavigator — isAdmin gate

**Files:**
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Import AdminScreen**

```tsx
import AdminScreen from '../screens/admin/AdminScreen';
```

- [ ] **Step 2: Destructure isAdmin + add the gate**

Add `isAdmin` to the `useAuth()` destructure. Then add the gate AFTER the `isPasswordRecovery` gate and the `!user` gate, but BEFORE the clinician/patient routing:

```tsx
if (isAdmin) {
  return <AdminScreen />;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.9: i18n keys (Phase B)

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Add to en.ts**

```ts
'admin.title': 'Approvals',
'admin.subtitle': 'Doctors waiting for verification',
'admin.approvals.empty': 'No pending approvals.',
'admin.approvals.approve': 'Approve',
'admin.approvals.licenseLabel': 'License',
'admin.approvals.signedUpAt': 'Signed up {date}',
'admin.approvals.approved': 'Approved',
```

- [ ] **Step 2: Add matching keys to th.ts**

```ts
'admin.title': 'การอนุมัติ',
'admin.subtitle': 'แพทย์ที่รอการยืนยัน',
'admin.approvals.empty': 'ไม่มีรายการรออนุมัติ',
'admin.approvals.approve': 'อนุมัติ',
'admin.approvals.licenseLabel': 'เลขใบอนุญาต',
'admin.approvals.signedUpAt': 'สมัครเมื่อ {date}',
'admin.approvals.approved': 'อนุมัติแล้ว',
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

### Task B.10: Phase B verify + commit

- [ ] **Step 1: Typecheck**

Run: `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"`
Expected: `EXIT: 0`.

- [ ] **Step 2: Web build**

Run: `npm run build:web 2>&1 | tail -5`
Expected: success.

- [ ] **Step 3: Visual check (AdminScreen)**

Serve dist, Playwright at `http://localhost:4173/?as=admin`. Confirm:
- AdminScreen renders (not the clinician dashboard or patient app)
- "Approvals" title + a badge showing "2"
- Two pending clinician cards (Dr. Somsak Wattana, Dr. Nan Thirakul) with Approve buttons
- Tap one Approve → card disappears, badge drops to 1
Screenshot before + after.

- [ ] **Step 4: Commit Phase B**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-05-29-admins-and-approval.sql \
  src/types/database.ts \
  src/services/clinicianService.ts \
  src/contexts/AuthContext.tsx \
  src/hooks/usePendingClinicians.ts \
  src/mock/services.ts \
  src/screens/admin/AdminScreen.tsx \
  src/navigation/AppNavigator.tsx \
  src/i18n/en.ts \
  src/i18n/th.ts

git commit -m "$(cat <<'EOF'
feat(admin): in-app clinician approval workflow

Phase B of clinician-onboarding. Adds an admins table + is_admin()
security-definer function + RLS letting admins read all clinician
profiles and flip verified. AuthContext resolves isAdmin on bootstrap;
AppNavigator routes admins to a dedicated AdminScreen (before
patient/clinician routing) showing pending clinicians with a count
badge and one-tap Approve. First admin bootstrapped via SQL; ?as=admin
localhost hatch added for testing.

Requires applying supabase/migrations/2026-05-29-admins-and-approval.sql
via Dashboard + inserting the first admin row.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## After Phase B — push + merge

Standard pattern (require explicit OK before each):
1. `git push -u origin feat/clinician-onboarding`
2. FF merge to main, push main, delete branch local + remote.

---

## Self-review notes (addressed inline)

- **Spec coverage:** Phase A (seed + RPC + Other UI + i18n) → Tasks A.1-A.6. Phase B (admins table + is_admin + RLS + isAdmin state + AdminScreen + routing + services + i18n) → Tasks B.1-B.10. All spec sections covered.
- **Type consistency:** `PendingClinician` defined in B.2, used in B.3/B.5/B.6/B.7. `createOrGetHospital(name): Promise<string>` identical in real (A.2) + mock (A.3) + call site (A.4). `is_admin` RPC name matches between migration (B.1) and AuthContext (B.4).
- **`?as=admin`** added in B.4, used for testing in B.10.
- **No placeholders:** all steps have concrete code. Seed list is concrete (28 hospitals). User reviews seed before applying per A.1 Step 2.
- **Cache invalidation:** `invalidateHospitalsCache` defined A.2, called in A.4's handleAddOther.
