# Doctor Dashboard MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working clinician-side dashboard (mock-mode end-to-end) that surfaces the assigned-patient triage queue + a per-patient detail pane, against the existing HaemoCare data layer.

**Architecture:** New `clinician` role detected by AuthContext. Root navigator picks ClinicianStack vs the existing patient navigator. Dashboard is a Split View screen: left rail = triage queue, right pane = a `userId`-parameterised version of the existing PreVisitSummary. Two new tables (`clinician_profiles`, `clinician_patient_links`) + a helper SQL function + RLS policies extending read-access to clinicians for active-linked patients. Mock-mode handles demo flow end-to-end without touching real Supabase.

**Tech stack:** Same as the rest of HaemoCare — Expo / React Native + react-native-web, Supabase Postgres + RLS, NativeWind / StyleSheet, jest-expo, date-fns, @react-navigation.

**Spec:** `docs/superpowers/specs/doctor-dashboard/design.md`.

**Branching note:** Work on a fresh branch off `main` (NOT off `feat/overdue-visit-symptom-escalation`):
```bash
git checkout main
git checkout -b feat/doctor-dashboard
```

---

## File Map

**Create:**
- `HaemoCare/supabase/migrations/2026-05-13_add_hb_columns.sql` — backfill missing pre_hb/post_hb columns
- `HaemoCare/supabase/migrations/2026-05-13_clinician_dashboard.sql` — clinician tables, helper fn, RLS
- `HaemoCare/src/services/clinicianService.ts` — real Supabase queries for the clinician role
- `HaemoCare/src/mock/clinicianData.ts` — MOCK_CLINICIAN_PROFILE + MOCK_LINKED_PATIENTS roster
- `HaemoCare/src/utils/triageQueue.ts` — pure scoring/sorting for the queue
- `HaemoCare/src/utils/__tests__/triageQueue.test.ts`
- `HaemoCare/src/hooks/useAssignedPatients.ts`
- `HaemoCare/src/screens/clinician/ClinicianDashboardScreen.tsx`
- `HaemoCare/src/navigation/ClinicianStackNavigator.tsx`
- `HaemoCare/src/components/clinician/PatientQueueRow.tsx`
- `HaemoCare/src/components/clinician/CohortStats.tsx`
- `HaemoCare/src/components/clinician/FilterChips.tsx`
- `HaemoCare/src/components/clinician/OverdueBadge.tsx`
- `HaemoCare/src/components/clinician/PatientDetailPane.tsx` — extracted from PreVisitSummaryScreen, parameterised by userId

**Modify:**
- `HaemoCare/supabase/schema.sql` — apply both migrations in-line
- `HaemoCare/src/types/database.ts` — add `pre_hb_g_dl`/`post_hb_g_dl` to Transfusion (likely already present), add `ClinicianProfile`, `ClinicianPatientLink`, `LinkStatus`
- `HaemoCare/src/types/navigation.ts` — add `ClinicianStackParamList`
- `HaemoCare/src/contexts/AuthContext.tsx` — add `role: 'patient' | 'clinician' | null`, clinician mock-mode trigger, `MOCK_CLINICIAN_EMAIL`/`MOCK_CLINICIAN_PASSWORD`
- `HaemoCare/src/mock/services.ts` — add `getAssignedPatients`, `getClinicianProfile`, per-patient mock data helpers
- `HaemoCare/src/screens/detail/PreVisitSummaryScreen.tsx` — keep as patient-side wrapper; delegate body to new `PatientDetailPane`
- `HaemoCare/src/navigation/AppNavigator.tsx` — when `role === 'clinician'`, render `ClinicianStackNavigator` (skip profile/PDPA gates)
- `HaemoCare/src/i18n/en.ts`, `HaemoCare/src/i18n/th.ts` — clinician UI keys

---

## Task 1: Database schema + types

**Files:**
- Create: `HaemoCare/supabase/migrations/2026-05-13_add_hb_columns.sql`
- Create: `HaemoCare/supabase/migrations/2026-05-13_clinician_dashboard.sql`
- Modify: `HaemoCare/supabase/schema.sql`
- Modify: `HaemoCare/src/types/database.ts`

- [ ] **Step 1: Create the Hb columns migration**

Path: `HaemoCare/supabase/migrations/2026-05-13_add_hb_columns.sql`

```sql
-- Backfill pre_hb_g_dl / post_hb_g_dl on transfusions.
-- These columns are referenced by the TypeScript Transfusion type but
-- were never added to schema.sql. Add them as nullable numerics.

alter table public.transfusions
  add column if not exists pre_hb_g_dl numeric(4,2),
  add column if not exists post_hb_g_dl numeric(4,2);
```

- [ ] **Step 2: Create the clinician-dashboard migration**

Path: `HaemoCare/supabase/migrations/2026-05-13_clinician_dashboard.sql`

```sql
-- Clinician role storage.
create table public.clinician_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null default '',
  license_number text not null default '',
  hospital_affiliation text not null default '',
  verified boolean default false,
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- Clinician ↔ patient consented link.
create table public.clinician_patient_links (
  id uuid default uuid_generate_v4() primary key,
  clinician_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'revoked', 'expired')),
  requested_at timestamptz default now(),
  consented_at timestamptz,
  revoked_at timestamptz,
  share_full_name boolean default false,
  unique (clinician_id, patient_user_id)
);
create index idx_cpl_clinician_active
  on public.clinician_patient_links(clinician_id) where status = 'active';
create index idx_cpl_patient
  on public.clinician_patient_links(patient_user_id);

-- Helper used by RLS policies.
create or replace function public.is_active_clinician_for(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links
    where clinician_id = auth.uid()
      and patient_user_id = p_user_id
      and status = 'active'
  );
$$;

alter table public.clinician_profiles enable row level security;
alter table public.clinician_patient_links enable row level security;

-- Clinician profile policies.
create policy "Clinicians view own profile" on public.clinician_profiles
  for select using (auth.uid() = user_id);
create policy "Clinicians update own profile" on public.clinician_profiles
  for update using (auth.uid() = user_id);
create policy "Patients view linked clinicians" on public.clinician_profiles
  for select using (
    exists (select 1 from public.clinician_patient_links l
            where l.clinician_id = clinician_profiles.user_id
              and l.patient_user_id = auth.uid()
              and l.status in ('pending', 'active'))
  );

-- Link policies.
create policy "Both sides view own links" on public.clinician_patient_links
  for select using (auth.uid() = clinician_id or auth.uid() = patient_user_id);
create policy "Patient updates own link status" on public.clinician_patient_links
  for update using (auth.uid() = patient_user_id);

-- Clinician read-through on patient tables.
create policy "Clinicians read assigned profiles" on public.profiles
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned transfusions" on public.transfusions
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned symptom_logs" on public.symptom_logs
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned appointments" on public.appointments
  for select using (public.is_active_clinician_for(user_id));
```

- [ ] **Step 3: Merge both migrations into `schema.sql` for from-scratch setups**

In `HaemoCare/supabase/schema.sql`:

1. Inside the `create table public.transfusions` block, add `pre_hb_g_dl numeric(4,2)` and `post_hb_g_dl numeric(4,2)` lines right before `notes text default ''`.
2. After the existing `APPOINTMENTS` section (before INDEXES), paste the entire contents of `2026-05-13_clinician_dashboard.sql` (tables, function, RLS).

- [ ] **Step 4: Update `database.ts` types**

In `HaemoCare/src/types/database.ts`:

The `Transfusion` interface already declares `pre_hb_g_dl?: number;` and `post_hb_g_dl?: number;` — verify and leave intact.

Add new exports below the existing `MedicationReminder` interface:

```typescript
export type LinkStatus = 'pending' | 'active' | 'declined' | 'revoked' | 'expired';

export interface ClinicianProfile {
  id: string;
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

export interface ClinicianPatientLink {
  id: string;
  clinician_id: string;
  patient_user_id: string;
  status: LinkStatus;
  requested_at: string;
  consented_at: string | null;
  revoked_at: string | null;
  share_full_name: boolean;
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/supabase/migrations/2026-05-13_add_hb_columns.sql \
        HaemoCare/supabase/migrations/2026-05-13_clinician_dashboard.sql \
        HaemoCare/supabase/schema.sql \
        HaemoCare/src/types/database.ts
git commit -m "feat(db): add clinician tables + Hb columns to schema"
```

---

## Task 2: Mock data + mock services

**Files:**
- Create: `HaemoCare/src/mock/clinicianData.ts`
- Modify: `HaemoCare/src/mock/services.ts`

- [ ] **Step 1: Read existing patient mock data to mirror the shape**

Read `HaemoCare/src/mock/data.ts` (~200 lines). Note how MOCK_PROFILE, MOCK_TRANSFUSIONS, MOCK_APPOINTMENTS, MOCK_SYMPTOM_LOGS are structured. We'll build a small set of "linked patient" rosters in the same shape.

- [ ] **Step 2: Create `clinicianData.ts`**

Path: `HaemoCare/src/mock/clinicianData.ts`

```typescript
import type {
  ClinicianProfile,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
} from '../types/database';

export const MOCK_CLINICIAN_USER_ID = 'mock-clinician-001';

export const MOCK_CLINICIAN_PROFILE: ClinicianProfile = {
  id: 'mock-clinician-profile-001',
  user_id: MOCK_CLINICIAN_USER_ID,
  full_name: 'Dr. Ploy Wattanaporn',
  license_number: '12345-Demo',
  hospital_affiliation: 'Songklanagarind Hospital',
  verified: true,
  verified_at: '2026-01-15T09:00:00+07:00',
  created_at: '2026-01-15T09:00:00+07:00',
};

// Each linked patient has profile + transfusions + symptom_logs + appointments.
// Five patients with varied risk profiles.
export interface MockLinkedPatient {
  profile: Profile;
  transfusions: Transfusion[];
  symptomLogs: SymptomLog[];
  appointments: Appointment[];
}

const today = new Date('2026-05-13T08:00:00+07:00');
const daysAgo = (n: number) =>
  new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const baseProfile = (id: string, name: string, patientId: string, intervalDays = 28): Profile => ({
  id: `p-${id}`,
  user_id: id,
  patient_id: patientId,
  full_name: name,
  blood_type: 'B',
  rh_factor: '+',
  antibodies: [],
  known_reactions: '',
  medications: 'Deferasirox 500mg daily',
  language_preference: 'th',
  pdpa_consented: true,
  pdpa_consented_at: '2026-01-15T09:00:00+07:00',
  share_full_name: true,
  recommended_visit_interval_days: intervalDays,
  created_at: '2026-01-15T09:00:00+07:00',
  updated_at: '2026-01-15T09:00:00+07:00',
});

export const MOCK_LINKED_PATIENTS: MockLinkedPatient[] = [
  // Patient 1: tier-2 overdue (28+ days), recent monitor log
  {
    profile: baseProfile('mock-pt-001', 'Somchai Panyawong', 'HC-100001', 28),
    transfusions: [
      { id: 't1a', user_id: 'mock-pt-001', date: daysAgo(35), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 6.8, post_hb_g_dl: 9.4, created_at: daysAgo(35) },
      { id: 't1b', user_id: 'mock-pt-001', date: daysAgo(63), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.1, post_hb_g_dl: 9.6, created_at: daysAgo(63) },
    ],
    symptomLogs: [
      { id: 's1a', user_id: 'mock-pt-001', transfusion_id: 't1a', logged_at: daysAgo(3), symptoms: ['fatigue','headache'], severity_scores: { fatigue: 5, headache: 4 }, outcome: 'monitor', notes: '', created_at: daysAgo(3) },
    ],
    appointments: [],
  },
  // Patient 2: tier-1 overdue (14 days), urgent log in last 7d
  {
    profile: baseProfile('mock-pt-002', 'Niran Tonsuk', 'HC-100002', 28),
    transfusions: [
      { id: 't2a', user_id: 'mock-pt-002', date: daysAgo(42), hospital: 'Siriraj', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 6.5, post_hb_g_dl: 9.1, created_at: daysAgo(42) },
    ],
    symptomLogs: [
      { id: 's2a', user_id: 'mock-pt-002', transfusion_id: 't2a', logged_at: daysAgo(2), symptoms: ['fever','chills','back_pain'], severity_scores: { fever: 8, chills: 6, back_pain: 5 }, outcome: 'urgent', notes: '', created_at: daysAgo(2) },
    ],
    appointments: [],
  },
  // Patient 3: stable, recent appointment scheduled
  {
    profile: baseProfile('mock-pt-003', 'Areeya Kraisri', 'HC-100003', 28),
    transfusions: [
      { id: 't3a', user_id: 'mock-pt-003', date: daysAgo(10), hospital: 'Songklanagarind', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.0, post_hb_g_dl: 9.5, created_at: daysAgo(10) },
    ],
    symptomLogs: [],
    appointments: [
      { id: 'a3a', user_id: 'mock-pt-003', scheduled_date: daysAgo(-7), hospital: 'Songklanagarind', notes: '', linked_transfusion_id: null, source: 'manual', external_id: null, external_source_name: null, created_at: daysAgo(15) },
    ],
  },
  // Patient 4: had a recent transfusion reaction
  {
    profile: baseProfile('mock-pt-004', 'Kraisorn Vichaikun', 'HC-100004', 28),
    transfusions: [
      { id: 't4a', user_id: 'mock-pt-004', date: daysAgo(20), hospital: 'Songklanagarind', units_received: 2, reaction_noted: true, reaction_detail: 'Mild febrile reaction during infusion. Premedicated with acetaminophen on next visit.', notes: '', pre_hb_g_dl: 6.7, post_hb_g_dl: 9.3, created_at: daysAgo(20) },
    ],
    symptomLogs: [],
    appointments: [],
  },
  // Patient 5: stable, fully on cadence
  {
    profile: baseProfile('mock-pt-005', 'Pim Jaroon', 'HC-100005', 28),
    transfusions: [
      { id: 't5a', user_id: 'mock-pt-005', date: daysAgo(7), hospital: 'Siriraj', units_received: 2, reaction_noted: false, reaction_detail: '', notes: '', pre_hb_g_dl: 7.2, post_hb_g_dl: 9.7, created_at: daysAgo(7) },
    ],
    symptomLogs: [
      { id: 's5a', user_id: 'mock-pt-005', transfusion_id: 't5a', logged_at: daysAgo(5), symptoms: ['fatigue'], severity_scores: { fatigue: 2 }, outcome: 'normal', notes: '', created_at: daysAgo(5) },
    ],
    appointments: [
      { id: 'a5a', user_id: 'mock-pt-005', scheduled_date: daysAgo(-14), hospital: 'Siriraj', notes: '', linked_transfusion_id: null, source: 'manual', external_id: null, external_source_name: null, created_at: daysAgo(20) },
    ],
  },
];
```

- [ ] **Step 3: Extend `mock/services.ts`**

Read `HaemoCare/src/mock/services.ts`. Locate the bottom of the file and append:

```typescript
import {
  MOCK_CLINICIAN_PROFILE,
  MOCK_LINKED_PATIENTS,
  type MockLinkedPatient,
} from './clinicianData';

// ── Clinician-side mock services ──────────────────────────────

export async function getClinicianProfile(): Promise<ClinicianProfile | null> {
  return MOCK_CLINICIAN_PROFILE;
}

export async function getAssignedPatients(): Promise<Profile[]> {
  return MOCK_LINKED_PATIENTS.map(p => p.profile);
}

export async function getAssignedPatientById(userId: string): Promise<MockLinkedPatient | null> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId) ?? null;
}

export async function getTransfusionsForPatient(userId: string): Promise<Transfusion[]> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.transfusions ?? [];
}

export async function getLatestTransfusionForPatient(userId: string): Promise<Transfusion | null> {
  const list = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.transfusions ?? [];
  return list[0] ?? null;
}

export async function getSymptomLogsForPatient(userId: string): Promise<SymptomLog[]> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.symptomLogs ?? [];
}

export async function getMostRecentPastAppointmentForPatient(
  userId: string
): Promise<Appointment | null> {
  const list = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.appointments ?? [];
  const nowIso = new Date().toISOString();
  const past = list.filter(a => a.scheduled_date < nowIso)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
  return past[0] ?? null;
}
```

Adjust the import at the top of `services.ts` if `ClinicianProfile` / `Profile` / `Transfusion` / `SymptomLog` / `Appointment` aren't already in scope. Reuse existing imports if present.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/mock/clinicianData.ts HaemoCare/src/mock/services.ts
git commit -m "feat(mock): add clinician profile + linked-patient roster"
```

---

## Task 3: Real clinician service

**Files:**
- Create: `HaemoCare/src/services/clinicianService.ts`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/services/clinicianService.ts`

```typescript
import { supabase } from '../config/supabase';
import type {
  ClinicianProfile,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
} from '../types/database';

export async function getClinicianProfile(userId: string): Promise<ClinicianProfile | null> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClinicianProfile | null) ?? null;
}

/**
 * Returns all patients with an active link to the authenticated clinician.
 * RLS gates the read; this query only needs the link table + profiles.
 */
export async function getAssignedPatients(clinicianId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('clinician_patient_links')
    .select('patient_user_id, profiles!inner(*)')
    .eq('clinician_id', clinicianId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  // The Supabase join nests the profile row under `profiles`. Flatten it.
  return (data ?? []).flatMap((row: any) => (row.profiles ? [row.profiles as Profile] : []));
}

export async function getTransfusionsForPatient(userId: string): Promise<Transfusion[]> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Transfusion[];
}

export async function getLatestTransfusionForPatient(
  userId: string
): Promise<Transfusion | null> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Transfusion | null) ?? null;
}

export async function getSymptomLogsForPatient(userId: string): Promise<SymptomLog[]> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SymptomLog[];
}

export async function getMostRecentPastAppointmentForPatient(
  userId: string
): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .lt('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Appointment | null) ?? null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/services/clinicianService.ts
git commit -m "feat(clinician): add clinicianService for assigned patients"
```

---

## Task 4: Triage queue scoring utility + tests

**Files:**
- Create: `HaemoCare/src/utils/triageQueue.ts`
- Create: `HaemoCare/src/utils/__tests__/triageQueue.test.ts`

- [ ] **Step 1: Write the test file (red phase)**

Path: `HaemoCare/src/utils/__tests__/triageQueue.test.ts`

```typescript
import { triageScore, sortTriageDescending, type TriageInput } from '../triageQueue';

const baseInput = (overrides: Partial<TriageInput> = {}): TriageInput => ({
  isOverdue: false,
  daysOverdue: 0,
  bumpTiers: 0,
  worstRecentOutcome: 'normal',
  daysSinceLastTransfusion: 30,
  hasReactionOnFile: false,
  ...overrides,
});

describe('triageScore', () => {
  it('returns the lowest score for a stable patient', () => {
    expect(triageScore(baseInput())).toBeLessThan(100);
  });

  it('ranks urgent recent symptom above tier-2 overdue', () => {
    const urgent = triageScore(baseInput({ worstRecentOutcome: 'urgent' }));
    const overdueT2 = triageScore(baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }));
    expect(urgent).toBeGreaterThan(overdueT2);
  });

  it('ranks tier-2 overdue above tier-1 overdue', () => {
    const t2 = triageScore(baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }));
    const t1 = triageScore(baseInput({ isOverdue: true, daysOverdue: 12, bumpTiers: 1 }));
    expect(t2).toBeGreaterThan(t1);
  });

  it('ranks tier-1 overdue above monitor-only', () => {
    const t1 = triageScore(baseInput({ isOverdue: true, daysOverdue: 12, bumpTiers: 1 }));
    const monitor = triageScore(baseInput({ worstRecentOutcome: 'monitor' }));
    expect(t1).toBeGreaterThan(monitor);
  });

  it('uses daysOverdue as a tiebreaker within tier-2', () => {
    const t2More = triageScore(baseInput({ isOverdue: true, daysOverdue: 40, bumpTiers: 2 }));
    const t2Less = triageScore(baseInput({ isOverdue: true, daysOverdue: 25, bumpTiers: 2 }));
    expect(t2More).toBeGreaterThan(t2Less);
  });
});

describe('sortTriageDescending', () => {
  it('returns highest-priority first', () => {
    type Row = { id: string; input: TriageInput };
    const rows: Row[] = [
      { id: 'stable', input: baseInput() },
      { id: 'urgent', input: baseInput({ worstRecentOutcome: 'urgent' }) },
      { id: 'tier1', input: baseInput({ isOverdue: true, daysOverdue: 10, bumpTiers: 1 }) },
      { id: 'tier2', input: baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }) },
      { id: 'monitor', input: baseInput({ worstRecentOutcome: 'monitor' }) },
    ];
    const sorted = sortTriageDescending(rows, r => r.input);
    expect(sorted.map(r => r.id)).toEqual(['urgent', 'tier2', 'tier1', 'monitor', 'stable']);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test -- --testPathPattern=triageQueue
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Path: `HaemoCare/src/utils/triageQueue.ts`

```typescript
import type { Outcome } from '../types/database';

export interface TriageInput {
  isOverdue: boolean;
  daysOverdue: number;     // 0 when not overdue
  bumpTiers: 0 | 1 | 2;    // from overdueState
  worstRecentOutcome: Outcome;  // worst symptom outcome in last 14d, or 'normal'
  daysSinceLastTransfusion: number; // 0 if no transfusion ever (treat as worst)
  hasReactionOnFile: boolean;
}

/**
 * Higher score = higher priority on the queue.
 * Layered: urgent symptom (10000) > overdue tier-2 (5000) > tier-1 (2500) >
 * monitor-only (1000) > anything else. Within a layer, daysOverdue tiebreaks.
 */
export function triageScore(input: TriageInput): number {
  let score = 0;
  if (input.worstRecentOutcome === 'urgent') score += 10000;
  if (input.bumpTiers === 2) score += 5000;
  else if (input.bumpTiers === 1) score += 2500;
  if (input.worstRecentOutcome === 'monitor' && score < 1000) score += 1000;
  if (input.hasReactionOnFile) score += 200;
  score += Math.min(input.daysOverdue, 365); // tiebreaker within layer
  return score;
}

export function sortTriageDescending<T>(rows: T[], project: (row: T) => TriageInput): T[] {
  return [...rows].sort((a, b) => triageScore(project(b)) - triageScore(project(a)));
}
```

- [ ] **Step 4: Run the tests — verify they pass**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test -- --testPathPattern=triageQueue
```
Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/utils/triageQueue.ts HaemoCare/src/utils/__tests__/triageQueue.test.ts
git commit -m "feat(triage): add triageQueue scoring + sort util"
```

---

## Task 5: AuthContext role detection + clinician mock-mode

**Files:**
- Modify: `HaemoCare/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Read the existing AuthContext**

Read `HaemoCare/src/contexts/AuthContext.tsx` end-to-end. Note: existing patient mock-mode triggers on `demo@haemocare.app` / `HaemoDemo2024`. The pattern to mirror.

- [ ] **Step 2: Add role + clinician constants**

Near the existing `MOCK_EMAIL` / `MOCK_PASSWORD` constants, add:

```typescript
const MOCK_CLINICIAN_EMAIL = 'demo-doctor@haemocare.app';
const MOCK_CLINICIAN_PASSWORD = 'HaemoDoc2024';
```

Import the mock clinician profile at the top:

```typescript
import { MOCK_CLINICIAN_PROFILE, MOCK_CLINICIAN_USER_ID } from '../mock/clinicianData';
import type { ClinicianProfile } from '../types/database';
```

- [ ] **Step 3: Extend the context type**

Inside `AuthContextType`, add:

```typescript
role: 'patient' | 'clinician' | null;
clinicianProfile: ClinicianProfile | null;
```

- [ ] **Step 4: Add state + role derivation**

Inside `AuthProvider`, add `useState` for clinician profile and a `role` derived from current state:

```typescript
const [clinicianProfile, setClinicianProfile] = useState<ClinicianProfile | null>(null);

const role: 'patient' | 'clinician' | null =
  clinicianProfile ? 'clinician' : profile ? 'patient' : null;
```

- [ ] **Step 5: Extend `signIn` to handle clinician mock-mode**

In the existing `signIn` callback, add a branch BEFORE the patient mock check:

```typescript
if (email.trim().toLowerCase() === MOCK_CLINICIAN_EMAIL && password === MOCK_CLINICIAN_PASSWORD) {
  setIsMockMode(true);
  setUser({ id: MOCK_CLINICIAN_USER_ID, email: MOCK_CLINICIAN_EMAIL } as User);
  setClinicianProfile(MOCK_CLINICIAN_PROFILE);
  setProfile(null); // mutually exclusive with patient profile
  return {};
}
```

- [ ] **Step 6: Clear clinician profile on signOut**

In the existing `signOut`, after clearing mock state, add `setClinicianProfile(null);`.

- [ ] **Step 7: Add clinician profile to context value**

Where the existing value object is provided to `AuthContext.Provider`, add `role` and `clinicianProfile`.

- [ ] **Step 8: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/contexts/AuthContext.tsx
git commit -m "feat(auth): add role detection + clinician mock-mode"
```

---

## Task 6: `useAssignedPatients` hook

**Files:**
- Create: `HaemoCare/src/hooks/useAssignedPatients.ts`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/hooks/useAssignedPatients.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realClinicianService from '../services/clinicianService';
import * as mockServices from '../mock/services';
import type { Profile } from '../types/database';

export interface UseAssignedPatientsResult {
  patients: Profile[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAssignedPatients(): UseAssignedPatientsResult {
  const { user, isMockMode, role } = useAuth();
  const [patients, setPatients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;
  const enabled = role === 'clinician' && userId != null;

  useEffect(() => {
    if (!enabled) {
      setPatients([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = isMockMode
          ? await mockServices.getAssignedPatients()
          : await realClinicianService.getAssignedPatients(userId!);
        if (!cancelled) setPatients(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setPatients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, isMockMode, tick]);

  return { patients, loading, error, refresh };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/hooks/useAssignedPatients.ts
git commit -m "feat(hook): add useAssignedPatients for clinician dashboard"
```

---

## Task 7: OverdueBadge component

**Files:**
- Create: `HaemoCare/src/components/clinician/OverdueBadge.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/clinician/OverdueBadge.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';

export interface OverdueBadgeProps {
  daysOverdue: number;
  tier: 1 | 2;
}

export default function OverdueBadge({ daysOverdue, tier }: OverdueBadgeProps) {
  const bg = tier === 2 ? (COLORS.statusUrgentBg ?? '#FEF2F2') : (COLORS.statusMonitorBg ?? '#FEF3E7');
  const fg = tier === 2 ? (COLORS.statusUrgent ?? '#DC3B3B') : (COLORS.statusMonitor ?? '#E8933A');
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.text, { color: fg }]}>{`${daysOverdue}d overdue`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/clinician/OverdueBadge.tsx
git commit -m "feat(ui): add OverdueBadge for clinician queue"
```

---

## Task 8: PatientQueueRow component

**Files:**
- Create: `HaemoCare/src/components/clinician/PatientQueueRow.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/clinician/PatientQueueRow.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import OverdueBadge from './OverdueBadge';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import type { Outcome } from '../../types/database';

export interface PatientQueueRowProps {
  patientId: string;          // HC-XXXXXX
  displayName: string;
  isSelected: boolean;
  isOverdue: boolean;
  daysOverdue: number;
  bumpTiers: 0 | 1 | 2;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
  onPress: () => void;
}

const OUTCOME_DOT: Record<Outcome, string> = {
  normal: COLORS.statusNormal ?? '#0EA572',
  monitor: COLORS.statusMonitor ?? '#E8933A',
  urgent: COLORS.statusUrgent ?? '#DC3B3B',
};

export default function PatientQueueRow(props: PatientQueueRowProps) {
  const {
    patientId, displayName, isSelected,
    isOverdue, daysOverdue, bumpTiers,
    worstRecentOutcome, hasReactionOnFile, onPress,
  } = props;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <View style={[styles.dot, { backgroundColor: OUTCOME_DOT[worstRecentOutcome] }]} />
      <View style={styles.col}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {hasReactionOnFile && (
            <Feather name="alert-circle" size={12} color={COLORS.statusUrgent ?? '#DC3B3B'} />
          )}
        </View>
        <View style={styles.bottomLine}>
          <Text style={styles.id}>{patientId}</Text>
          {isOverdue && bumpTiers > 0 && (
            <OverdueBadge daysOverdue={daysOverdue} tier={bumpTiers as 1 | 2} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS?.md ?? 12,
    backgroundColor: 'transparent',
  },
  rowSelected: { backgroundColor: COLORS.primaryLight ?? '#E7F4F2' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  col: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  id: { fontSize: 11, color: COLORS.textLight },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/clinician/PatientQueueRow.tsx
git commit -m "feat(ui): add PatientQueueRow"
```

---

## Task 9: CohortStats component

**Files:**
- Create: `HaemoCare/src/components/clinician/CohortStats.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/clinician/CohortStats.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export interface CohortStatsProps {
  overdueCount: number;
  monitorCount: number;
  stableCount: number;
}

export default function CohortStats({ overdueCount, monitorCount, stableCount }: CohortStatsProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.container}>
      <Stat label={t('clinician.cohort.overdue' as TranslationKey)} value={overdueCount} color={COLORS.statusUrgent ?? '#DC3B3B'} />
      <Stat label={t('clinician.cohort.monitor' as TranslationKey)} value={monitorCount} color={COLORS.statusMonitor ?? '#E8933A'} />
      <Stat label={t('clinician.cohort.stable' as TranslationKey)} value={stableCount} color={COLORS.statusNormal ?? '#0EA572'} />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderRadius: RADIUS?.lg ?? 14,
  },
  stat: { flex: 1, alignItems: 'flex-start', gap: 2 },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/clinician/CohortStats.tsx
git commit -m "feat(ui): add CohortStats panel"
```

---

## Task 10: FilterChips component

**Files:**
- Create: `HaemoCare/src/components/clinician/FilterChips.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/clinician/FilterChips.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export type FilterId = 'overdue' | 'recentUrgent' | 'hasReactions' | null;

export interface FilterChipsProps {
  active: FilterId;
  onChange: (next: FilterId) => void;
}

const CHIPS: Array<{ id: Exclude<FilterId, null>; key: TranslationKey }> = [
  { id: 'overdue', key: 'clinician.filter.overdue' as TranslationKey },
  { id: 'recentUrgent', key: 'clinician.filter.recentUrgent' as TranslationKey },
  { id: 'hasReactions', key: 'clinician.filter.hasReactions' as TranslationKey },
];

export default function FilterChips({ active, onChange }: FilterChipsProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      {CHIPS.map(chip => {
        const isActive = active === chip.id;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(isActive ? null : chip.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{t(chip.key)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap', paddingHorizontal: SPACING.md, marginVertical: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS?.full ?? 999,
    borderWidth: 1,
    borderColor: COLORS.borderLight ?? '#E4E4E4',
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: COLORS.primaryLight ?? '#E7F4F2', borderColor: COLORS.primary ?? '#0B6E6E' },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.primary ?? '#0B6E6E' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/clinician/FilterChips.tsx
git commit -m "feat(ui): add FilterChips"
```

---

## Task 11: Refactor PreVisitSummaryScreen → PatientDetailPane

**Files:**
- Modify: `HaemoCare/src/screens/detail/PreVisitSummaryScreen.tsx`
- Create: `HaemoCare/src/components/clinician/PatientDetailPane.tsx`

- [ ] **Step 1: Read `PreVisitSummaryScreen.tsx`**

The current screen pulls `useAuth()` for the logged-in patient's user_id and renders analytics + history for that one user. Identify the JSX block that renders the actual content (after data is loaded) vs. the wrapper (header, SafeAreaView, etc.).

- [ ] **Step 2: Extract a `PatientDetailPane` component**

Create `HaemoCare/src/components/clinician/PatientDetailPane.tsx` containing the rendering logic of `PreVisitSummaryScreen`, but parameterised on `userId: string` (no `useAuth` for the target user). It still uses `useLanguage`, `useResponsive`, etc. It chooses `mockServices` vs real services based on `isMockMode` from `useAuth()`, but uses the CLINICIAN-side mock service variants when `isMockMode` AND a `userId` is passed that doesn't equal `auth.user.id` (i.e., the clinician is viewing a linked patient). Otherwise the existing patient-side services.

A simpler decision rule: take `userId` as a prop. When the component runs in clinician mock-mode (caller is the dashboard), it calls `mockServices.getTransfusionsForPatient(userId)`, etc. Caller can pass a service-selector prop if needed, but the simplest version inspects `useAuth().role`:

```typescript
const { role, isMockMode } = useAuth();
const isClinicianView = role === 'clinician';
// then choose service:
const transfusions = isClinicianView
  ? (isMockMode ? await mockServices.getTransfusionsForPatient(userId) : await clinicianService.getTransfusionsForPatient(userId))
  : (isMockMode ? await mockServices.getTransfusions() : await realTransfusionService.getTransfusions(userId));
```

If the screen as-it-stands has substantial state and effects, the cleanest split is: copy the body into `PatientDetailPane.tsx`, accept `userId: string` and `isClinicianView: boolean` as props, replace the auth-id reads with the prop. Then PreVisitSummaryScreen becomes a thin wrapper:

```tsx
const { user } = useAuth();
return <PatientDetailPane userId={user!.id} isClinicianView={false} />;
```

If the existing screen is small enough to inline-refactor instead, that's also acceptable — but the goal is one reusable rendering component the clinician dashboard can drop into its right pane.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/clinician/PatientDetailPane.tsx \
        HaemoCare/src/screens/detail/PreVisitSummaryScreen.tsx
git commit -m "refactor(prevsit): extract PatientDetailPane parameterised by userId"
```

If this task is substantially harder than the spec anticipates (the existing screen has heavy state + side effects that don't decompose cleanly), STOP and report DONE_WITH_CONCERNS. The dashboard can fall back to a simpler bespoke detail layout for v1.

---

## Task 12: i18n strings

**Files:**
- Modify: `HaemoCare/src/i18n/en.ts`, `HaemoCare/src/i18n/th.ts`

- [ ] **Step 1: Add keys to `en.ts`**

In `HaemoCare/src/i18n/en.ts`, append a new section:

```typescript
  // Clinician dashboard
  'clinician.dashboard.title': 'Clinician Dashboard',
  'clinician.cohort.overdue': 'OVERDUE',
  'clinician.cohort.monitor': 'MONITOR',
  'clinician.cohort.stable': 'STABLE',
  'clinician.filter.overdue': 'Overdue',
  'clinician.filter.recentUrgent': 'Urgent in last 14d',
  'clinician.filter.hasReactions': 'Has reactions on file',
  'clinician.queue.empty': 'No assigned patients',
  'clinician.detail.empty': 'Select a patient',
  'clinician.detail.reactionOnFile': 'Reaction on last transfusion',
  'clinician.signOut': 'Sign out',
```

- [ ] **Step 2: Add mirror keys to `th.ts`** (Thai)

```typescript
  // Clinician dashboard
  'clinician.dashboard.title': 'แดชบอร์ดแพทย์',
  'clinician.cohort.overdue': 'เลยกำหนด',
  'clinician.cohort.monitor': 'เฝ้าระวัง',
  'clinician.cohort.stable': 'ปกติ',
  'clinician.filter.overdue': 'เลยกำหนด',
  'clinician.filter.recentUrgent': 'อาการรุนแรงใน 14 วัน',
  'clinician.filter.hasReactions': 'มีประวัติแพ้',
  'clinician.queue.empty': 'ยังไม่มีผู้ป่วยที่ได้รับมอบหมาย',
  'clinician.detail.empty': 'เลือกผู้ป่วย',
  'clinician.detail.reactionOnFile': 'มีอาการแพ้ในการให้เลือดครั้งล่าสุด',
  'clinician.signOut': 'ออกจากระบบ',
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/i18n/en.ts HaemoCare/src/i18n/th.ts
git commit -m "feat(i18n): add clinician dashboard strings"
```

---

## Task 13: ClinicianDashboardScreen

**Files:**
- Create: `HaemoCare/src/screens/clinician/ClinicianDashboardScreen.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/screens/clinician/ClinicianDashboardScreen.tsx`

```typescript
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive } from '../../utils/responsive';
import { useAssignedPatients } from '../../hooks/useAssignedPatients';
import { computeOverdueState, OverdueState } from '../../utils/overdueVisit';
import { sortTriageDescending, type TriageInput } from '../../utils/triageQueue';
import * as mockServices from '../../mock/services';
import CohortStats from '../../components/clinician/CohortStats';
import FilterChips, { FilterId } from '../../components/clinician/FilterChips';
import PatientQueueRow from '../../components/clinician/PatientQueueRow';
import PatientDetailPane from '../../components/clinician/PatientDetailPane';
import { COLORS, SPACING } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import type { Profile, Outcome, Transfusion, SymptomLog, Appointment } from '../../types/database';

interface PatientSlice {
  profile: Profile;
  latestTx: Transfusion | null;
  pastAppt: Appointment | null;
  recentLogs: SymptomLog[];
  overdueState: OverdueState;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default function ClinicianDashboardScreen() {
  const { signOut, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { isDesktop } = useResponsive();
  const { patients, loading } = useAssignedPatients();
  const [slices, setSlices] = useState<PatientSlice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>(null);

  // Hydrate per-patient slices for queue triage scoring.
  useEffect(() => {
    if (!isMockMode || patients.length === 0) {
      setSlices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const today = new Date();
      const fourteenDaysAgo = new Date(today.getTime() - FOURTEEN_DAYS_MS);
      const built = await Promise.all(patients.map(async (profile) => {
        const [latestTx, pastAppt, allLogs] = await Promise.all([
          mockServices.getLatestTransfusionForPatient(profile.user_id),
          mockServices.getMostRecentPastAppointmentForPatient(profile.user_id),
          mockServices.getSymptomLogsForPatient(profile.user_id),
        ]);
        const recentLogs = allLogs.filter(l => new Date(l.logged_at) >= fourteenDaysAgo);
        const overdueState = computeOverdueState({
          profile,
          mostRecentTransfusion: latestTx,
          mostRecentPastAppointment: pastAppt,
          today,
        });
        const outcomes = recentLogs.map(l => l.outcome);
        const worstRecentOutcome: Outcome = outcomes.includes('urgent')
          ? 'urgent' : outcomes.includes('monitor') ? 'monitor' : 'normal';
        return {
          profile, latestTx, pastAppt, recentLogs, overdueState,
          worstRecentOutcome,
          hasReactionOnFile: latestTx?.reaction_noted ?? false,
        } satisfies PatientSlice;
      }));
      if (!cancelled) setSlices(built);
    })();
    return () => { cancelled = true; };
  }, [patients, isMockMode]);

  // Apply triage sort + filter.
  const visibleSlices = useMemo(() => {
    const filtered = slices.filter(s => {
      if (filter === 'overdue') return s.overdueState.isOverdue;
      if (filter === 'recentUrgent') return s.worstRecentOutcome === 'urgent';
      if (filter === 'hasReactions') return s.hasReactionOnFile;
      return true;
    });
    return sortTriageDescending<PatientSlice>(filtered, (s) => ({
      isOverdue: s.overdueState.isOverdue,
      daysOverdue: s.overdueState.isOverdue ? s.overdueState.daysOverdue : 0,
      bumpTiers: s.overdueState.isOverdue ? s.overdueState.bumpTiers : 0,
      worstRecentOutcome: s.worstRecentOutcome,
      daysSinceLastTransfusion: 0,
      hasReactionOnFile: s.hasReactionOnFile,
    } satisfies TriageInput));
  }, [slices, filter]);

  // Default to top-overdue (the first item after sort) on load.
  useEffect(() => {
    if (selectedId == null && visibleSlices.length > 0) {
      setSelectedId(visibleSlices[0].profile.user_id);
    }
  }, [visibleSlices, selectedId]);

  const cohortStats = useMemo(() => ({
    overdueCount: slices.filter(s => s.overdueState.isOverdue).length,
    monitorCount: slices.filter(s => s.worstRecentOutcome === 'monitor').length,
    stableCount: slices.filter(s => !s.overdueState.isOverdue && s.worstRecentOutcome === 'normal').length,
  }), [slices]);

  const renderRow = useCallback(({ item }: { item: PatientSlice }) => {
    const isOverdue = item.overdueState.isOverdue;
    const daysOverdue = isOverdue ? item.overdueState.daysOverdue : 0;
    const bumpTiers = isOverdue ? item.overdueState.bumpTiers : 0;
    return (
      <PatientQueueRow
        patientId={item.profile.patient_id}
        displayName={item.profile.share_full_name ? item.profile.full_name : item.profile.patient_id}
        isSelected={selectedId === item.profile.user_id}
        isOverdue={isOverdue}
        daysOverdue={daysOverdue}
        bumpTiers={bumpTiers as 0 | 1 | 2}
        worstRecentOutcome={item.worstRecentOutcome}
        hasReactionOnFile={item.hasReactionOnFile}
        onPress={() => setSelectedId(item.profile.user_id)}
      />
    );
  }, [selectedId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinician.dashboard.title' as TranslationKey)}</Text>
        <TouchableOpacity onPress={signOut}><Text style={styles.signOut}>{t('clinician.signOut' as TranslationKey)}</Text></TouchableOpacity>
      </View>
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <View style={[styles.leftRail, isDesktop && styles.leftRailDesktop]}>
          <CohortStats {...cohortStats} />
          <FilterChips active={filter} onChange={setFilter} />
          <FlatList
            data={visibleSlices}
            keyExtractor={(item) => item.profile.user_id}
            renderItem={renderRow}
            ListEmptyComponent={loading ? null : (
              <Text style={styles.empty}>{t('clinician.queue.empty' as TranslationKey)}</Text>
            )}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
          />
        </View>
        <View style={[styles.rightPane, isDesktop && styles.rightPaneDesktop]}>
          {selectedId ? (
            <PatientDetailPane userId={selectedId} isClinicianView />
          ) : (
            <ScrollView contentContainerStyle={styles.emptyDetail}>
              <Text style={styles.empty}>{t('clinician.detail.empty' as TranslationKey)}</Text>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight ?? '#E4E4E4',
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  signOut: { fontSize: 13, color: COLORS.primary ?? '#0B6E6E', fontWeight: '600' },
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },
  leftRail: { flex: 1 },
  leftRailDesktop: { width: 360, flex: 0, borderRightWidth: 1, borderRightColor: COLORS.borderLight ?? '#E4E4E4' },
  rightPane: { flex: 1 },
  rightPaneDesktop: { flex: 1 },
  emptyDetail: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  empty: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', padding: SPACING.lg },
});
```

The `PatientDetailPane` `isClinicianView` prop tells the pane to use the clinician-mock services (or the clinician real services later). If `PatientDetailPane` from Task 11 ended up using a different prop name, adjust this consumer call to match.

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/screens/clinician/ClinicianDashboardScreen.tsx
git commit -m "feat(clinician): add ClinicianDashboardScreen split-view"
```

---

## Task 14: ClinicianStackNavigator + role-based routing

**Files:**
- Modify: `HaemoCare/src/types/navigation.ts`
- Create: `HaemoCare/src/navigation/ClinicianStackNavigator.tsx`
- Modify: `HaemoCare/src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add `ClinicianStackParamList`**

In `HaemoCare/src/types/navigation.ts`, add:

```typescript
export type ClinicianStackParamList = {
  ClinicianDashboard: undefined;
};
```

- [ ] **Step 2: Create the stack**

Path: `HaemoCare/src/navigation/ClinicianStackNavigator.tsx`

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClinicianStackParamList } from '../types/navigation';
import ClinicianDashboardScreen from '../screens/clinician/ClinicianDashboardScreen';

const Stack = createNativeStackNavigator<ClinicianStackParamList>();

export default function ClinicianStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClinicianDashboard" component={ClinicianDashboardScreen} />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 3: Wire role-based root in `AppNavigator.tsx`**

In `HaemoCare/src/navigation/AppNavigator.tsx`:

1. Import: `import ClinicianStackNavigator from './ClinicianStackNavigator';`
2. Destructure `role` from `useAuth()`.
3. After `if (!user) return <AuthNavigator />;`, add (before the profile-complete check):

```typescript
if (role === 'clinician') {
  return <ClinicianStackNavigator />;
}
```

The existing profile-complete / pdpa-consent / patient stack checks then only apply when `role === 'patient' || role === null`. Existing behavior unchanged for patients.

- [ ] **Step 4: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/types/navigation.ts \
        HaemoCare/src/navigation/ClinicianStackNavigator.tsx \
        HaemoCare/src/navigation/AppNavigator.tsx
git commit -m "feat(nav): role-based root + ClinicianStackNavigator"
```

---

## Task 15: Final verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test
```
Expected: all existing tests + new `triageQueue` tests pass.

- [ ] **Step 2: Typecheck the whole project**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Diff stat**

```bash
cd /Users/macbook/Desktop/TNDH && git diff main..HEAD --stat | tail -30
```
Capture the file count + insertion count for the writeup.

- [ ] **Step 4: No commit** — verification only. If any test fails or typecheck errors, fix on a follow-up commit and re-run.

---

## Self-review

**Spec coverage:**
- Triage queue (P1) → Tasks 4, 8, 13 ✓
- Patient detail (P2) → Task 11 + consumer in Task 13 ✓
- Filter chips (P3) → Tasks 10, 13 ✓
- Reaction flag (P4) → Tasks 8, 13 (via `hasReactionOnFile`) ✓
- Clinician role + RLS → Tasks 1, 5 ✓
- Mock clinician roster → Task 2 ✓
- Role-based navigation → Task 14 ✓
- Hb columns gap fix → Task 1 ✓

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:** `TriageInput`, `PatientSlice`, `ClinicianProfile`, `ClinicianPatientLink` defined once and reused. `FilterId`, `LinkStatus` likewise.

**Soft spots (deliberate):**
- Task 11 (refactor) is the highest-uncertainty task. If `PreVisitSummaryScreen` is structurally hostile to extraction, the subagent reports DONE_WITH_CONCERNS — the dashboard then falls back to a simpler bespoke layout. Acceptable degradation.
- Real clinician sign-up + consent UX intentionally deferred to phase-2 (mock-mode only). Spec calls this out.
