# Overdue Visit → Symptom Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a HaemoCare patient is overdue for their planned visit, raise the suggested severity of newly logged symptoms and surface overdue state in the Symptom Monitor and Appointments tabs.

**Architecture:** A single pure module (`overdueVisit.ts`) computes overdue state from existing tables. A hook (`useOverdueState`) composes data fetches and exposes the state to three screens. A shared banner component renders the warning. The bump is applied to suggested outcome at save time inside `NewSymptomLogScreen` — no schema change to `symptom_logs`. One additive column on `profiles` holds the per-patient cadence.

**Tech Stack:** TypeScript, React Native (Expo 54), Supabase (Postgres + RLS), Jest with `jest-expo`, `date-fns` (already a dependency), NativeWind / StyleSheet, `@react-navigation`.

**Spec reference:** `docs/superpowers/specs/2026-05-12-overdue-visit-symptom-escalation-design.md`

**Branching note:** Work must happen on a feature branch — never on `main`. Create one before Task 1 if HEAD is currently on `main`:

```bash
git checkout -b feat/overdue-visit-symptom-escalation
```

---

## File Map

**Create:**
- `HaemoCare/src/utils/overdueVisit.ts` — pure overdue math + bump helper
- `HaemoCare/src/utils/__tests__/overdueVisit.test.ts` — unit tests for the above
- `HaemoCare/src/hooks/useOverdueState.ts` — composes profile + transfusion + appointment into overdue state
- `HaemoCare/src/hooks/__tests__/useOverdueState.test.ts` — smoke test
- `HaemoCare/src/components/common/OverdueBanner.tsx` — shared banner UI
- `HaemoCare/supabase/migrations/2026-05-12_add_recommended_visit_interval_days.sql` — additive migration

**Modify:**
- `HaemoCare/supabase/schema.sql` — append new column to `profiles` table block
- `HaemoCare/src/types/database.ts` — add `recommended_visit_interval_days` to `Profile`
- `HaemoCare/src/services/appointmentService.ts` — add `getMostRecentPastAppointment`
- `HaemoCare/src/mock/services.ts` — add a mock `getMostRecentPastAppointment` so mock mode keeps working
- `HaemoCare/src/i18n/en.ts` — three new keys
- `HaemoCare/src/i18n/th.ts` — Thai equivalents of the same three keys
- `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx` — render banner when overdue
- `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx` — render banner when overdue
- `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx` — apply bump + render explanation
- `HaemoCare/src/screens/detail/EditProfileScreen.tsx` — add numeric input

**Reuse (do NOT duplicate):**
- `HaemoCare/src/services/transfusionService.ts` — already exports `getLatestTransfusion(userId)`. Use it directly. Do not add `getMostRecentTransfusion`.
- `HaemoCare/src/utils/dateHelpers.ts` — exists but uses `differenceInDays`. Overdue math uses `differenceInCalendarDays` directly from `date-fns` so calendar-day boundaries are exact.

---

## Task 1: Database migration

**Files:**
- Create: `HaemoCare/supabase/migrations/2026-05-12_add_recommended_visit_interval_days.sql`
- Modify: `HaemoCare/supabase/schema.sql`

- [ ] **Step 1: Create migration file**

Path: `HaemoCare/supabase/migrations/2026-05-12_add_recommended_visit_interval_days.sql`

```sql
-- Adds per-patient transfusion cadence used by the overdue-visit feature.
-- Run once against any existing Supabase project.

alter table public.profiles
  add column recommended_visit_interval_days integer not null default 28
  check (recommended_visit_interval_days between 7 and 180);
```

- [ ] **Step 2: Update schema.sql so fresh setups include the column**

In `HaemoCare/supabase/schema.sql`, find the `create table public.profiles` block (lines 9-25 at time of writing). Add the new column inside the `create table` so a from-scratch run produces the same shape.

Locate this line:

```sql
  share_full_name boolean default false,
```

Insert immediately before `created_at`:

```sql
  recommended_visit_interval_days integer not null default 28
    check (recommended_visit_interval_days between 7 and 180),
```

The resulting `profiles` block should end:

```sql
  share_full_name boolean default false,
  recommended_visit_interval_days integer not null default 28
    check (recommended_visit_interval_days between 7 and 180),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

- [ ] **Step 3: Update the TypeScript Profile type**

In `HaemoCare/src/types/database.ts`, add the field to `Profile`:

```typescript
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
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Typecheck**

Run from `HaemoCare/`:

```bash
npx tsc --noEmit
```

Expected: passes. (No callers of `Profile` construct it positionally — they all use object spreads or service helpers that pass `Partial<Profile>`.)

- [ ] **Step 5: Commit**

```bash
git add HaemoCare/supabase/migrations/2026-05-12_add_recommended_visit_interval_days.sql \
        HaemoCare/supabase/schema.sql \
        HaemoCare/src/types/database.ts
git commit -m "feat(db): add recommended_visit_interval_days to profiles"
```

---

## Task 2: Pure overdue logic — write failing tests

**Files:**
- Create: `HaemoCare/src/utils/__tests__/overdueVisit.test.ts`

This task is TDD red phase. Write the full test file before any implementation.

- [ ] **Step 1: Create the test file**

Path: `HaemoCare/src/utils/__tests__/overdueVisit.test.ts`

```typescript
import {
  computeOverdueState,
  applyBump,
  GRACE_DAYS,
  TIER_1_MAX,
  OUTCOME_LADDER,
} from '../overdueVisit';
import type { Profile, Transfusion, Appointment } from '../../types/database';

// Helpers to keep test fixtures tiny and explicit.
const profile = (intervalDays = 28): Pick<Profile, 'recommended_visit_interval_days'> => ({
  recommended_visit_interval_days: intervalDays,
});

const tx = (date: string): Pick<Transfusion, 'date'> => ({ date });

const appt = (scheduled_date: string): Pick<Appointment, 'scheduled_date'> => ({
  scheduled_date,
});

const TODAY = new Date('2026-05-12T12:00:00Z');

describe('OUTCOME_LADDER', () => {
  it('orders normal < monitor < urgent', () => {
    expect(OUTCOME_LADDER).toEqual(['normal', 'monitor', 'urgent']);
  });
});

describe('applyBump', () => {
  it('returns input unchanged when bumpTiers = 0', () => {
    expect(applyBump('normal', 0)).toBe('normal');
    expect(applyBump('monitor', 0)).toBe('monitor');
    expect(applyBump('urgent', 0)).toBe('urgent');
  });

  it('bumps one tier with bumpTiers = 1', () => {
    expect(applyBump('normal', 1)).toBe('monitor');
    expect(applyBump('monitor', 1)).toBe('urgent');
    expect(applyBump('urgent', 1)).toBe('urgent'); // cap
  });

  it('bumps two tiers with bumpTiers = 2', () => {
    expect(applyBump('normal', 2)).toBe('urgent');
    expect(applyBump('monitor', 2)).toBe('urgent'); // capped
    expect(applyBump('urgent', 2)).toBe('urgent'); // cap
  });
});

describe('computeOverdueState — empty data', () => {
  it('returns not-overdue when patient has no transfusions and no appointments', () => {
    const state = computeOverdueState({
      profile: profile(),
      mostRecentTransfusion: null,
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state.isOverdue).toBe(false);
  });
});

describe('computeOverdueState — cadence path only', () => {
  it('returns not-overdue inside the grace period (N <= 7)', () => {
    // Last transfusion 32 days ago, interval 28 → planned was 4 days ago → N = 4 ≤ 7
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-10T10:00:00Z'), // 32 days before TODAY
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state.isOverdue).toBe(false);
  });

  it('returns tier-1 bump on day 8 (boundary)', () => {
    // Last transfusion 36 days ago, interval 28 → planned was 8 days ago → N = 8
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-06T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 8,
        bumpTiers: 1,
        sourcePath: 'cadence',
      })
    );
  });

  it('still tier-1 at day 21 (boundary upper edge)', () => {
    // 49 days ago, interval 28 → N = 21
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-24T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 21, bumpTiers: 1 })
    );
  });

  it('returns tier-2 bump on day 22 (boundary)', () => {
    // 50 days ago, interval 28 → N = 22
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-23T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 22, bumpTiers: 2 })
    );
  });

  it('uses the patient-set interval, not the 28 default', () => {
    // Interval 14, last transfusion 25 days ago → planned was 11 days ago → N = 11 → tier 1
    const state = computeOverdueState({
      profile: profile(14),
      mostRecentTransfusion: tx('2026-04-17T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 11, bumpTiers: 1 })
    );
  });
});

describe('computeOverdueState — appointment path only', () => {
  it('marks overdue when latest past appointment has no transfusion at/after it', () => {
    // Appointment 10 days ago, no transfusions ever
    const state = computeOverdueState({
      profile: profile(),
      mostRecentTransfusion: null,
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 10,
        bumpTiers: 1,
        sourcePath: 'appointment',
      })
    );
  });

  it('clears overdue when a transfusion was logged at/after the latest past appointment', () => {
    // Appointment 10 days ago, transfusion 8 days ago → patient came in
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-05-04T11:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    // Cadence: 8 days since transfusion, planned was -20 days from now → not overdue.
    // Appointment: collapsed because transfusion at/after.
    expect(state.isOverdue).toBe(false);
  });
});

describe('computeOverdueState — both paths', () => {
  it('uses the earlier planned date (more conservative) when both paths fire', () => {
    // Cadence: last transfusion 50 days ago, interval 28 → planned was 22 days ago.
    // Appointment: 5 days ago → planned was 5 days ago.
    // Earlier planned date = cadence (22 days ago). Pick cadence.
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-23T12:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-07T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 22,
        bumpTiers: 2,
        sourcePath: 'cadence',
      })
    );
  });

  it('prefers the appointment sourcePath on an exact tie', () => {
    // Both paths produce 10 days overdue.
    // Appointment 10 days ago. Last transfusion 38 days ago, interval 28 → planned 10 days ago.
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-04T09:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 10,
        sourcePath: 'appointment',
      })
    );
  });
});

describe('computeOverdueState — sanity', () => {
  it('exposes constants for tuning', () => {
    expect(GRACE_DAYS).toBe(7);
    expect(TIER_1_MAX).toBe(21);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `HaemoCare/`:

```bash
npm test -- --testPathPattern=overdueVisit
```

Expected: FAIL. Test runner cannot find module `../overdueVisit`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add HaemoCare/src/utils/__tests__/overdueVisit.test.ts
git commit -m "test(overdue): add failing tests for overdueVisit utils"
```

---

## Task 3: Pure overdue logic — implement

**Files:**
- Create: `HaemoCare/src/utils/overdueVisit.ts`

- [ ] **Step 1: Implement the module**

Path: `HaemoCare/src/utils/overdueVisit.ts`

```typescript
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Outcome, Profile, Transfusion, Appointment } from '../types/database';

export const OUTCOME_LADDER: readonly Outcome[] = ['normal', 'monitor', 'urgent'] as const;

export const GRACE_DAYS = 7;
export const TIER_1_MAX = 21;

export type OverdueState =
  | { isOverdue: false }
  | {
      isOverdue: true;
      daysOverdue: number;
      bumpTiers: 1 | 2;
      sourcePath: 'appointment' | 'cadence';
      plannedVisitDate: string; // ISO
    };

export interface ComputeOverdueStateArgs {
  profile: Pick<Profile, 'recommended_visit_interval_days'>;
  mostRecentTransfusion: Pick<Transfusion, 'date'> | null;
  mostRecentPastAppointment: Pick<Appointment, 'scheduled_date'> | null;
  today: Date;
}

export function applyBump(originalOutcome: Outcome, bumpTiers: 0 | 1 | 2): Outcome {
  if (bumpTiers === 0) return originalOutcome;
  const idx = OUTCOME_LADDER.indexOf(originalOutcome);
  const bumped = Math.min(idx + bumpTiers, OUTCOME_LADDER.length - 1);
  return OUTCOME_LADDER[bumped];
}

export function computeOverdueState(args: ComputeOverdueStateArgs): OverdueState {
  const { profile, mostRecentTransfusion, mostRecentPastAppointment, today } = args;

  // Path A: missed appointment. Latest past appointment with no transfusion at/after.
  let appointmentPlanned: Date | null = null;
  if (mostRecentPastAppointment) {
    const apptDate = parseISO(mostRecentPastAppointment.scheduled_date);
    const hasTransfusionAtOrAfter =
      mostRecentTransfusion != null &&
      parseISO(mostRecentTransfusion.date) >= apptDate;
    if (!hasTransfusionAtOrAfter) {
      appointmentPlanned = apptDate;
    }
  }

  // Path B: cadence. last_transfusion + interval.
  let cadencePlanned: Date | null = null;
  if (mostRecentTransfusion) {
    const txDate = parseISO(mostRecentTransfusion.date);
    cadencePlanned = new Date(txDate);
    cadencePlanned.setDate(cadencePlanned.getDate() + profile.recommended_visit_interval_days);
  }

  if (!appointmentPlanned && !cadencePlanned) {
    return { isOverdue: false };
  }

  // Pick the earlier (more conservative) planned date. Tie → prefer appointment.
  let planned: Date;
  let sourcePath: 'appointment' | 'cadence';
  if (appointmentPlanned && cadencePlanned) {
    if (appointmentPlanned.getTime() <= cadencePlanned.getTime()) {
      planned = appointmentPlanned;
      sourcePath = 'appointment';
    } else {
      planned = cadencePlanned;
      sourcePath = 'cadence';
    }
  } else if (appointmentPlanned) {
    planned = appointmentPlanned;
    sourcePath = 'appointment';
  } else {
    planned = cadencePlanned!;
    sourcePath = 'cadence';
  }

  const daysOverdue = differenceInCalendarDays(today, planned);
  if (daysOverdue <= GRACE_DAYS) {
    return { isOverdue: false };
  }

  const bumpTiers: 1 | 2 = daysOverdue <= TIER_1_MAX ? 1 : 2;
  return {
    isOverdue: true,
    daysOverdue,
    bumpTiers,
    sourcePath,
    plannedVisitDate: planned.toISOString(),
  };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run from `HaemoCare/`:

```bash
npm test -- --testPathPattern=overdueVisit
```

Expected: PASS. All test cases green.

- [ ] **Step 3: Typecheck**

Run from `HaemoCare/`:

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add HaemoCare/src/utils/overdueVisit.ts
git commit -m "feat(overdue): add computeOverdueState + applyBump"
```

---

## Task 4: Add `getMostRecentPastAppointment` to appointmentService

**Files:**
- Modify: `HaemoCare/src/services/appointmentService.ts`

- [ ] **Step 1: Add the helper**

In `HaemoCare/src/services/appointmentService.ts`, after the existing `getPastAppointments` function (around line 36), insert:

```typescript
export async function getMostRecentPastAppointment(
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

`maybeSingle()` returns `null` rather than throwing when no row matches — which is the correct semantics here (a patient may have zero past appointments).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add HaemoCare/src/services/appointmentService.ts
git commit -m "feat(appointments): add getMostRecentPastAppointment helper"
```

---

## Task 5: Add mock implementations

**Files:**
- Modify: `HaemoCare/src/mock/services.ts`

- [ ] **Step 1: Inspect the file to find the right insertion point**

Read `HaemoCare/src/mock/services.ts`. Find where `getLatestTransfusion` is exported (it must exist — `SymptomMonitorScreen.tsx` imports it as `mockServices.getLatestTransfusion`). Note the file's pattern (likely a fixture object plus exported functions returning Promises of slices of it).

- [ ] **Step 2: Add a mock for `getMostRecentPastAppointment`**

At a location consistent with the file's existing pattern, add:

```typescript
export async function getMostRecentPastAppointment(
  _userId?: string
): Promise<Appointment | null> {
  // Return the most recent appointment with scheduled_date < now, or null.
  const now = new Date().toISOString();
  const past = mockAppointments
    .filter((a) => a.scheduled_date < now)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
  return past[0] ?? null;
}
```

If `mockAppointments` isn't the variable name, use whatever the file already uses for the appointments fixture. Match the existing function signature style (`async`, `_userId` if other mock fns ignore the arg).

If the mock profile fixture doesn't yet have `recommended_visit_interval_days`, add it with value `28` so types stay aligned.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add HaemoCare/src/mock/services.ts
git commit -m "feat(mock): add getMostRecentPastAppointment + interval default"
```

---

## Task 6: `useOverdueState` hook — write the smoke test

**Files:**
- Create: `HaemoCare/src/hooks/__tests__/useOverdueState.test.ts`

- [ ] **Step 1: Create the test**

Path: `HaemoCare/src/hooks/__tests__/useOverdueState.test.ts`

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { useOverdueState } from '../useOverdueState';
import * as profileService from '../../services/profileService';
import * as transfusionService from '../../services/transfusionService';
import * as appointmentService from '../../services/appointmentService';

jest.mock('../../services/profileService');
jest.mock('../../services/transfusionService');
jest.mock('../../services/appointmentService');
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isMockMode: false }),
}));

describe('useOverdueState', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns isOverdue: false when no data exists', async () => {
    (profileService.getProfile as jest.Mock).mockResolvedValue({
      recommended_visit_interval_days: 28,
    });
    (transfusionService.getLatestTransfusion as jest.Mock).mockResolvedValue(null);
    (appointmentService.getMostRecentPastAppointment as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useOverdueState());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overdueState).toEqual({ isOverdue: false });
    expect(result.current.error).toBeNull();
  });

  it('returns null overdueState and surfaces error on service failure', async () => {
    (profileService.getProfile as jest.Mock).mockRejectedValue(new Error('network down'));
    (transfusionService.getLatestTransfusion as jest.Mock).mockResolvedValue(null);
    (appointmentService.getMostRecentPastAppointment as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useOverdueState());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overdueState).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
```

> **Note:** If `@testing-library/react-native` is not yet a dev dependency, add it before running:
> ```bash
> cd HaemoCare && npm install --save-dev @testing-library/react-native
> ```
> Then `git add HaemoCare/package.json HaemoCare/package-lock.json` before any commit that depends on it.

- [ ] **Step 2: Run — verify it fails**

```bash
npm test -- --testPathPattern=useOverdueState
```

Expected: FAIL. Module `../useOverdueState` does not exist.

- [ ] **Step 3: Commit the failing test (and library install if applicable)**

```bash
git add HaemoCare/src/hooks/__tests__/useOverdueState.test.ts \
        HaemoCare/package.json HaemoCare/package-lock.json
git commit -m "test(hook): add failing smoke test for useOverdueState"
```

---

## Task 7: `useOverdueState` hook — implement

**Files:**
- Create: `HaemoCare/src/hooks/useOverdueState.ts`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/hooks/useOverdueState.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realProfileService from '../services/profileService';
import * as realTransfusionService from '../services/transfusionService';
import * as realAppointmentService from '../services/appointmentService';
import * as mockServices from '../mock/services';
import { computeOverdueState, OverdueState } from '../utils/overdueVisit';

export interface UseOverdueStateResult {
  overdueState: OverdueState | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useOverdueState(): UseOverdueStateResult {
  const { user, isMockMode } = useAuth();
  const [overdueState, setOverdueState] = useState<OverdueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) {
      setOverdueState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profile, mostRecentTransfusion, mostRecentPastAppointment] = isMockMode
          ? await Promise.all([
              mockServices.getProfile(user.id),
              mockServices.getLatestTransfusion(),
              mockServices.getMostRecentPastAppointment(user.id),
            ])
          : await Promise.all([
              realProfileService.getProfile(user.id),
              realTransfusionService.getLatestTransfusion(user.id),
              realAppointmentService.getMostRecentPastAppointment(user.id),
            ]);

        if (cancelled) return;

        if (!profile) {
          // No profile yet → feature is silent.
          setOverdueState({ isOverdue: false });
          return;
        }

        const state = computeOverdueState({
          profile,
          mostRecentTransfusion,
          mostRecentPastAppointment,
          today: new Date(),
        });
        setOverdueState(state);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setOverdueState(null); // Silent degradation: no banner, no bump.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isMockMode, tick]);

  return { overdueState, loading, error, refresh };
}
```

If `mockServices` does not export `getProfile`, use whatever the existing convention is in `src/mock/services.ts` — replace the call to match. Do not invent a function that isn't there.

- [ ] **Step 2: Run the tests to verify they pass**

```bash
npm test -- --testPathPattern=useOverdueState
```

Expected: PASS.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add HaemoCare/src/hooks/useOverdueState.ts
git commit -m "feat(hook): add useOverdueState composing profile + tx + appt"
```

---

## Task 8: i18n strings (EN + TH)

**Files:**
- Modify: `HaemoCare/src/i18n/en.ts`
- Modify: `HaemoCare/src/i18n/th.ts`

- [ ] **Step 1: Add to `en.ts`**

Open `HaemoCare/src/i18n/en.ts`. After the `// Symptom Monitor` block (look for `'symptoms.title': 'Symptom Monitor',`), add a new section:

```typescript
  // Overdue Visit
  'overdue.banner.monitor': "You're {days} days past your planned visit. Logged symptoms are being treated as more severe.",
  'overdue.banner.monitor.cta': 'Book appointment',
  'overdue.banner.appointments': "{days} days overdue — book an appointment now.",
  'overdue.banner.appointments.cta': 'Book now',
  'overdue.bumpExplanation': "Because you're {days} days past your planned visit, we've raised this from {from} to {to}. You can change it back, but please contact your hospital.",
```

- [ ] **Step 2: Add to `th.ts`**

Mirror the same keys in `HaemoCare/src/i18n/th.ts`. Use these Thai translations (review with a native speaker before shipping; correct medical-grade Thai may need revision):

```typescript
  // Overdue Visit
  'overdue.banner.monitor': 'คุณเลยกำหนดนัดมา {days} วันแล้ว อาการที่บันทึกจะถูกประเมินว่ามีความรุนแรงสูงขึ้น',
  'overdue.banner.monitor.cta': 'จองนัด',
  'overdue.banner.appointments': 'เลยกำหนด {days} วัน — กรุณาจองนัดทันที',
  'overdue.banner.appointments.cta': 'จองตอนนี้',
  'overdue.bumpExplanation': 'เนื่องจากคุณเลยกำหนดนัดมา {days} วัน เราจึงยกระดับจาก {from} เป็น {to} คุณสามารถเปลี่ยนกลับได้ แต่กรุณาติดต่อโรงพยาบาล',
```

- [ ] **Step 3: Confirm the translation function supports `{placeholder}` interpolation**

Open `HaemoCare/src/contexts/LanguageContext.tsx` (or wherever `useLanguage().t` is defined) and verify the translator supports a second argument for `{key}` substitution. If it does not, add interpolation now — minimal change:

```typescript
function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let str = translations[language][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
```

(Adjust to match the existing function signature shape. If the project uses `i18next` or another library, the placeholder syntax may differ — match the existing convention rather than introducing new syntax.)

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add HaemoCare/src/i18n/en.ts HaemoCare/src/i18n/th.ts \
        HaemoCare/src/contexts/LanguageContext.tsx
git commit -m "feat(i18n): add overdue banner + bump explanation strings"
```

---

## Task 9: `OverdueBanner` shared component

**Files:**
- Create: `HaemoCare/src/components/common/OverdueBanner.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/common/OverdueBanner.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING, SHADOWS } from '../../config/theme';

export interface OverdueBannerProps {
  daysOverdue: number;
  variant: 'monitor' | 'appointments';
  onPressCta: () => void;
}

export default function OverdueBanner({ daysOverdue, variant, onPressCta }: OverdueBannerProps) {
  const { t } = useLanguage();

  const messageKey =
    variant === 'monitor'
      ? ('overdue.banner.monitor' as TranslationKey)
      : ('overdue.banner.appointments' as TranslationKey);
  const ctaKey =
    variant === 'monitor'
      ? ('overdue.banner.monitor.cta' as TranslationKey)
      : ('overdue.banner.appointments.cta' as TranslationKey);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Feather name="alert-triangle" size={20} color={COLORS.white} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.message}>{t(messageKey, { days: daysOverdue })}</Text>
        <TouchableOpacity onPress={onPressCta} style={styles.ctaBtn} activeOpacity={0.8}>
          <Text style={styles.ctaText}>{t(ctaKey)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    borderWidth: 1,
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: { flex: 1, gap: SPACING.sm },
  message: { fontSize: 13, fontWeight: '600', color: COLORS.text, lineHeight: 18 },
  ctaBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
  },
  ctaText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
});
```

If `COLORS.statusUrgent` / `statusUrgentBg` are not in the theme, use the literal fallbacks shown (`#DC3B3B`, `#FEF2F2`) — `SymptomMonitorScreen.tsx` already references both keys so they very likely exist.

The `t(key, { days: N })` call assumes Task 8 Step 3 confirmed `{placeholder}` support.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add HaemoCare/src/components/common/OverdueBanner.tsx
git commit -m "feat(ui): add OverdueBanner shared component"
```

---

## Task 10: Wire banner into SymptomMonitorScreen

**Files:**
- Modify: `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx`

- [ ] **Step 1: Add imports**

Near the existing imports at the top of `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx`, add:

```typescript
import OverdueBanner from '../../components/common/OverdueBanner';
import { useOverdueState } from '../../hooks/useOverdueState';
```

- [ ] **Step 2: Call the hook in the component**

Inside `SymptomMonitorScreen()`, immediately after the existing `const { isMobile, isDesktop } = useResponsive();` line, add:

```typescript
  const { overdueState, refresh: refreshOverdue } = useOverdueState();
```

- [ ] **Step 3: Refresh overdue state on focus alongside the existing data fetch**

Inside the existing `useFocusEffect(useCallback(() => { ... }, [user, isMockMode]))`, add `refreshOverdue();` as the first line of the effect body so the hook re-runs when the user returns to the tab. Make sure to include `refreshOverdue` in the dependency array.

- [ ] **Step 4: Render the banner**

Inside the `ListHeaderComponent={...}` JSX, before the existing `<View style={isDesktop ? styles.topRowDesktop : undefined}>` block, insert:

```tsx
{overdueState?.isOverdue && (
  <OverdueBanner
    daysOverdue={overdueState.daysOverdue}
    variant="monitor"
    onPressCta={() => navigation.navigate('Main', { screen: 'Appointments' })}
  />
)}
```

> The exact navigation argument depends on the navigator structure. If the file currently uses `navigation.navigate('NewSymptomLog', { ... })` directly, the Appointments tab is reachable via the bottom tab navigator. Use whatever pattern the file already uses to switch tabs. If unclear, `navigation.navigate('Appointments' as never)` is a safe fallback.

- [ ] **Step 5: Manually verify the screen still renders**

Run the app:

```bash
cd HaemoCare && npm run web
```

Open the Symptom Monitor tab. With no overdue state, the banner should not render. With a seeded overdue patient (e.g. via mock mode if mock fixtures land overdue), the banner appears at the top.

- [ ] **Step 6: Commit**

```bash
git add HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx
git commit -m "feat(ui): show OverdueBanner on Symptom Monitor"
```

---

## Task 11: Wire banner into AppointmentsScreen

**Files:**
- Modify: `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx`

- [ ] **Step 1: Open the file and locate the screen component**

Read `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx`. Find the top-level component and the place where the list header is rendered (FlatList `ListHeaderComponent`, or a header View above a list).

- [ ] **Step 2: Add imports**

```typescript
import OverdueBanner from '../../components/common/OverdueBanner';
import { useOverdueState } from '../../hooks/useOverdueState';
```

- [ ] **Step 3: Call the hook inside the component**

```typescript
  const { overdueState, refresh: refreshOverdue } = useOverdueState();
```

If the screen has an existing `useFocusEffect`, add `refreshOverdue()` as the first call inside it and add `refreshOverdue` to the deps array.

- [ ] **Step 4: Render the banner above the list / content**

```tsx
{overdueState?.isOverdue && (
  <OverdueBanner
    daysOverdue={overdueState.daysOverdue}
    variant="appointments"
    onPressCta={() => navigation.navigate('AddAppointment')}
  />
)}
```

Use the existing navigation pattern from the screen for the AddAppointment route (the route name must match what's registered in `RootStackParamList` from `src/types/navigation.ts`).

- [ ] **Step 5: Manually verify**

```bash
cd HaemoCare && npm run web
```

Open Appointments tab. Banner conditional on overdue state. Tap CTA — navigates to AddAppointmentScreen.

- [ ] **Step 6: Commit**

```bash
git add HaemoCare/src/screens/tabs/AppointmentsScreen.tsx
git commit -m "feat(ui): show OverdueBanner on Appointments"
```

---

## Task 12: Apply bump in NewSymptomLogScreen

**Files:**
- Modify: `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx`

- [ ] **Step 1: Read the file to find the outcome-selection logic**

Read `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx`. Find:
- where the suggested outcome from AI extraction (or manual selection) is stored in state — likely a `useState<Outcome>` or similar
- where it's persisted to the backend (the `createSymptomLog` call)

- [ ] **Step 2: Add imports**

```typescript
import { useOverdueState } from '../../hooks/useOverdueState';
import { applyBump } from '../../utils/overdueVisit';
import { TranslationKey } from '../../i18n';
```

- [ ] **Step 3: Call the hook in the component**

Near the top of the component, alongside existing hooks:

```typescript
  const { overdueState } = useOverdueState();
```

- [ ] **Step 4: Track AI/manual suggested outcome separately from the user-confirmed outcome**

If the screen currently keeps a single `outcome` piece of state, split it conceptually:
- `aiSuggestedOutcome` (the value AI extraction or initial mapping produced — this is what the bump explanation refers to as "from")
- `outcome` (the live, possibly-overridden value)

The bump uses `aiSuggestedOutcome` as input; the screen renders `outcome`. Concretely, when the AI extraction completes (or whatever sets the initial outcome), set both:

```typescript
const initial: Outcome = /* result of AI extraction or default */;
setAiSuggestedOutcome(initial);

const bumpTiers = overdueState?.isOverdue ? overdueState.bumpTiers : 0;
const bumped = applyBump(initial, bumpTiers);
setOutcome(bumped);
```

If splitting state is too invasive, an acceptable shortcut is: keep `outcome` as-is and store the unbumped value in a ref (`useRef<Outcome>(initial)`) purely so the explanation copy can reference it. The user-confirmed value is whatever is in `outcome` at submit time.

- [ ] **Step 5: Render the bump explanation inline above the outcome selector**

Where the outcome selector is rendered, conditionally insert (when `overdueState?.isOverdue && aiSuggestedOutcome !== outcomeIfNoBump !== applyBump(aiSuggestedOutcome, overdueState.bumpTiers)` — i.e. only when the bump actually changed the value):

```tsx
{overdueState?.isOverdue &&
  applyBump(aiSuggestedOutcome, overdueState.bumpTiers) !== aiSuggestedOutcome && (
    <View style={styles.bumpNote}>
      <Feather name="alert-triangle" size={16} color={COLORS.statusUrgent} />
      <Text style={styles.bumpNoteText}>
        {t('overdue.bumpExplanation' as TranslationKey, {
          days: overdueState.daysOverdue,
          from: t(`status.${aiSuggestedOutcome}` as TranslationKey),
          to: t(`status.${applyBump(aiSuggestedOutcome, overdueState.bumpTiers)}` as TranslationKey),
        })}
      </Text>
    </View>
  )}
```

Add corresponding styles:

```typescript
  bumpNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    borderWidth: 1,
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginBottom: SPACING.md,
  },
  bumpNoteText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 17 },
```

- [ ] **Step 6: Confirm no change to the save path**

`createSymptomLog` should be called with whatever the patient confirmed (`outcome`), not the AI suggestion. Verify in the existing submit handler. The bump is already baked into `outcome` from Step 4, so this should be a no-op.

- [ ] **Step 7: Manually verify**

```bash
cd HaemoCare && npm run web
```

With an overdue mock patient, open NewSymptomLogScreen. The default outcome should appear bumped, and the explanation banner should render above the selector. Tap the selector to override — explanation copy stays anchored to the AI suggestion; saved value is the user's override.

- [ ] **Step 8: Commit**

```bash
git add HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx
git commit -m "feat(symptom-log): apply overdue bump + render explanation"
```

---

## Task 13: Add interval input to EditProfileScreen

**Files:**
- Modify: `HaemoCare/src/screens/detail/EditProfileScreen.tsx`
- Modify: `HaemoCare/src/i18n/en.ts`
- Modify: `HaemoCare/src/i18n/th.ts`

- [ ] **Step 1: Add a translation key for the field label**

In `HaemoCare/src/i18n/en.ts`, in the profile section:

```typescript
  'profileSetup.visitInterval': 'Days between transfusions',
  'profileSetup.visitIntervalHint': 'Default 28 days. Used to warn when you are overdue.',
```

In `HaemoCare/src/i18n/th.ts`, the same keys with Thai translations:

```typescript
  'profileSetup.visitInterval': 'ระยะห่างระหว่างการให้เลือด (วัน)',
  'profileSetup.visitIntervalHint': 'ค่าเริ่มต้น 28 วัน ใช้สำหรับเตือนเมื่อคุณเลยกำหนด',
```

- [ ] **Step 2: Read EditProfileScreen and find an existing numeric / text input pattern**

Open `HaemoCare/src/screens/detail/EditProfileScreen.tsx`. Find where one of the existing text fields (e.g., `known_reactions` or `medications`) is rendered. Copy that pattern for the new input.

- [ ] **Step 3: Add the input**

Add a numeric `TextInput`:

```tsx
<View style={styles.field}>
  <Text style={styles.label}>{t('profileSetup.visitInterval')}</Text>
  <TextInput
    style={styles.input}
    keyboardType="number-pad"
    value={String(intervalDays)}
    onChangeText={(s) => {
      const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
      setIntervalDays(Number.isFinite(n) ? Math.min(180, Math.max(7, n)) : 28);
    }}
    placeholder="28"
  />
  <Text style={styles.hint}>{t('profileSetup.visitIntervalHint')}</Text>
</View>
```

With state:

```typescript
const [intervalDays, setIntervalDays] = useState<number>(profile?.recommended_visit_interval_days ?? 28);
```

And include the value in the `updateProfile` call:

```typescript
await updateProfile(user.id, {
  /* …existing fields… */,
  recommended_visit_interval_days: intervalDays,
});
```

If the screen uses a single `formState` object, add `recommended_visit_interval_days` to it the same way other fields are stored.

- [ ] **Step 4: Add styles if missing**

If the existing `styles` doesn't already have `field`, `label`, `input`, `hint`, reuse whatever pattern the file already follows (e.g., it may use a shared field renderer). Don't introduce a new style system — match the file.

- [ ] **Step 5: Manually verify**

```bash
cd HaemoCare && npm run web
```

Edit profile → set interval to e.g. 21 → save → re-open → value persisted. With interval=14 and a transfusion 25 days ago, the overdue banner should now appear on the relevant tabs.

- [ ] **Step 6: Commit**

```bash
git add HaemoCare/src/screens/detail/EditProfileScreen.tsx \
        HaemoCare/src/i18n/en.ts HaemoCare/src/i18n/th.ts
git commit -m "feat(profile): expose recommended_visit_interval_days editor"
```

---

## Task 14: Full verification pass

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

```bash
cd HaemoCare && npm test
```

Expected: all tests pass, including the new `overdueVisit` and `useOverdueState` tests.

- [ ] **Step 2: Typecheck the whole project**

```bash
cd HaemoCare && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual exercise of all three surfaces**

Run `npm run web`. Verify in order:
1. Brand-new patient (no transfusions, no appointments) → no banners anywhere, no bump on NewSymptomLog.
2. Patient with last transfusion 36 days ago, interval=28, no missed appt → banners on Symptom Monitor + Appointments; NewSymptomLog default outcome is bumped one tier; explanation copy reads "8 days past your planned visit."
3. Patient with last transfusion 50 days ago, interval=28 → bump is two tiers; default `normal` → `urgent` with explanation.
4. After logging a transfusion dated today → on next screen entry, banners disappear and bump no longer applies.
5. Profile edit → set interval=14 → patient now overdue who wasn't before; banners reappear.
6. Toggle language to Thai → all overdue copy renders in Thai.

- [ ] **Step 4: No commit required for this task** — verification only. If something fails, file a follow-up task and revisit.

---

## Self-review pass on this plan

**Spec coverage:**
- Overdue model (cadence + appointment, grace, tier-1/tier-2 boundaries, tiebreaker) → Task 3 + tests in Task 2 ✓
- Schema migration → Task 1 ✓
- `computeOverdueState` + `applyBump` → Tasks 2–3 ✓
- `useOverdueState` hook (with error → silent degradation) → Tasks 6–7 ✓
- Service helper (`getMostRecentPastAppointment`) → Task 4 ✓
- Reuse `getLatestTransfusion` (no duplicate) → File Map + Task 7 ✓
- Mock services → Task 5 ✓
- Three i18n keys + interpolation → Task 8 ✓
- OverdueBanner shared component → Task 9 ✓
- Symptom Monitor banner → Task 10 ✓
- Appointments banner → Task 11 ✓
- NewSymptomLog bump + explanation → Task 12 ✓
- EditProfile interval input → Task 13 ✓
- Verification pass → Task 14 ✓
- "Not stored on symptom_logs" (deferred) → respected (no symptom_logs schema change anywhere) ✓
- "AI extraction untouched" → respected (Task 12 does not import or modify `aiExtraction.ts`) ✓

**Placeholder scan:** No TBDs, TODOs, or "implement appropriate X" instructions. Every code block is real.

**Type consistency:**
- `OverdueState` discriminated-union shape used identically in Tasks 3, 7, 10, 11, 12 ✓
- `applyBump(outcome, bumpTiers: 0 | 1 | 2)` signature consistent across all consumers ✓
- `useOverdueState(): { overdueState, loading, error, refresh }` consistent in Tasks 7, 10, 11, 12 ✓
- `OverdueBanner` props (`daysOverdue`, `variant`, `onPressCta`) consistent in Tasks 9, 10, 11 ✓

**Known soft spots** (called out, not hidden):
- Task 8 Step 3 modifies `LanguageContext.tsx` to support `{placeholder}` interpolation only if not already supported. Whoever executes the plan must check first.
- Task 10 / Task 11 navigation parameter shapes depend on `RootStackParamList` — fallback patterns provided.
- Task 12 splits one piece of state (suggested vs. confirmed outcome) — depending on the current screen structure, this may be a one-line or a five-line change.
