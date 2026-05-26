# Clinician Onboarding — Design Spec

**Date:** 2026-05-26
**Branch:** `feat/clinician-onboarding` (two phases land sequentially)
**Scope:** Medium — make it easier for new doctors to get into the system and become discoverable to patients, without leaving the verification gate as raw SQL.

## Goal

Two friction points in clinician onboarding, addressed together:

1. **Hospital coverage** — the picker only offers 3 seeded placeholder hospitals. A doctor whose hospital isn't listed can't affiliate. Expand the curated list and add an "Other — type it in" fallback so any hospital works.
2. **Verification is raw SQL** — a clinician signs up `verified: false` and is stuck on PendingVerificationScreen until someone flips the boolean in the database by hand, with no UI and no signal that anyone is waiting. Add an in-app admin approval screen with a pending-count badge.

Self-serve verification (auto-trust via email domain / invite code) is explicitly **out of scope** — a human still approves each clinician, but the human gets tooling instead of a SQL console.

## Locked decisions

| Decision | Value |
|---|---|
| Admin identity | New `admins` table (`user_id` FK, unique). First admin bootstrapped via SQL. |
| Admin access | Dedicated `AdminScreen`; `isAdmin` routes there before patient/clinician routing. |
| Notification | In-app pending-count badge on AdminScreen. No email in v1. |
| Reject action | None in v1 — Approve only. Unwanted signups stay pending (invisible to patients). |
| Hospital expansion | Curated seed (~30-40 Thai hospitals) **and** an "Other — type it in" fallback. |
| "Other" hospital creation | `create_or_get_hospital(name)` SECURITY DEFINER RPC; dedups by case-insensitive `name_th`, inserts active row if new. |

## Visual styling — non-negotiable

Same as prior specs: theme tokens only (`COLORS`, `SPACING`, `RADIUS`, `SHADOWS`, `TYPOGRAPHY`). AdminScreen uses the white-background auth-screen shell (it's a pre-app gate, like PendingVerificationScreen). Pending-clinician rows mirror existing card patterns (`SHADOWS.card`, `RADIUS.lg`). Approve button uses `COLORS.primary`.

## Architecture overview

```
Phase A — Hospital expansion (independent, ships first)
└── seed migration: ~30-40 curated Thai hospitals (added to hospitals table)
└── create_or_get_hospital(p_name) RPC — dedup + insert, returns id
└── HospitalPicker: "Other — type your hospital" row → inline text input → RPC → select

Phase B — Admin approval workflow
└── admins table + is_admin() security-definer function
└── RLS on clinician_profiles: admins SELECT all + UPDATE verified
└── AuthContext: isAdmin state, fetched on bootstrap alongside profiles
└── AppNavigator: isAdmin gate → AdminScreen (before patient/clinician routing)
└── AdminScreen: pending-clinician list + Approve + pending-count badge + sign out
└── clinicianService: getPendingClinicians(), approveClinician(userId)
```

The verification gate (`clinician_profiles.verified`) and PendingVerificationScreen are unchanged — Phase B just gives a human a UI to flip the flag instead of SQL.

---

## Phase A — Hospital expansion

### A.1 Database

Migration: `supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql`

**Seed expansion.** INSERT ~30-40 major Thai hospitals (medical schools, regional centers, major private). Drafted by the implementer from a curated list; the user reviews before applying. Each row: `name_th`, `name_en`, `code` (slug), `region`. Use `on conflict (code) do nothing` so re-running is safe and the 3 existing seeds aren't duplicated.

**Create-or-get RPC** (so the "Other" flow can add hospitals without a broad INSERT policy):

```sql
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
  -- Dedup against existing rows by case-insensitive name_th match.
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

Callable by any authenticated user (the function runs as definer; the only thing it can do is add/return a hospital, which is non-sensitive reference data). `name_en` defaults to the same string as `name_th` for free-text entries (the user typed one name; we don't force bilingual).

### A.2 Service + mock

`src/services/hospitalService.ts` — add:
```ts
export async function createOrGetHospital(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_or_get_hospital', { p_name: name.trim() });
  if (error) throw new Error(error.message);
  return data as string;
}
```

Mock (`src/mock/services.ts`): `createOrGetHospital(name)` — checks MOCK_HOSPITALS for a case-insensitive match, else pushes a new mock hospital with a generated id, returns the id.

### A.3 UI — HospitalPicker "Other" fallback

`src/components/common/HospitalPicker.tsx`:

- After the grouped region list in the modal, render a sticky/last row: **"+ Other — type your hospital"** (`hospital.picker.other` key).
- Tapping it switches the modal body to a small text-input mode: a `TextInput` (autofocus) + a "Add" button + a "Cancel / back to list" affordance.
- On Add: call `createOrGetHospital(text)` (mock or real via `isMockMode`), then `onChange(returnedId)` and close. Refresh the `useHospitals` cache so the new hospital appears in the list next open (call a cache-invalidation or just append locally).
- Disable Add while the text is empty or the RPC is in flight (spinner).
- Error path: if the RPC throws, show an inline error and keep the input open.

**Cache note:** `useHospitals` caches per-mode at module level. After creating a hospital, invalidate the relevant cache so subsequent opens include it. Add an exported `invalidateHospitalsCache()` to the hook module and call it after `createOrGetHospital` succeeds.

### A.4 i18n (Phase A)

```
hospital.picker.other          "Other — type your hospital" / "อื่น ๆ — พิมพ์ชื่อโรงพยาบาล"
hospital.picker.otherLabel     "Hospital name" / "ชื่อโรงพยาบาล"
hospital.picker.otherAdd       "Add" / "เพิ่ม"
hospital.picker.otherBack      "Back to list" / "กลับไปที่รายการ"
hospital.picker.otherError     "Could not add hospital. Try again." / "ไม่สามารถเพิ่มโรงพยาบาลได้ ลองอีกครั้ง"
```

### A.5 Files (Phase A)

**Create:**
- `supabase/migrations/2026-05-28-hospitals-expand-and-rpc.sql`

**Modify:**
- `src/services/hospitalService.ts` — `createOrGetHospital`
- `src/hooks/useHospitals.ts` — `invalidateHospitalsCache()` export
- `src/mock/services.ts` — mock `createOrGetHospital`
- `src/components/common/HospitalPicker.tsx` — "Other" row + input mode
- `src/i18n/en.ts` + `src/i18n/th.ts` — 5 keys

---

## Phase B — Admin approval workflow

### B.1 Database

Migration: `supabase/migrations/2026-05-29-admins-and-approval.sql`

```sql
create table public.admins (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

-- A user may read their own admin row (to determine isAdmin client-side).
create policy "Users read own admin row" on public.admins
  for select using (user_id = auth.uid());

-- Security-definer check, mirrors is_active_clinician_for().
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Admins can read every clinician profile (to see pending ones)...
create policy "Admins read all clinician profiles" on public.clinician_profiles
  for select using (public.is_admin());

-- ...and flip verification.
create policy "Admins verify clinicians" on public.clinician_profiles
  for update using (public.is_admin()) with check (public.is_admin());
```

**Bootstrap:** after applying, the founder runs once (separately, with their own auth user id):
```sql
insert into public.admins (user_id) values ('<your-auth-user-id>');
```
Documented in the spec + flagged at apply time. No UI for the first admin (chicken-and-egg).

### B.2 Types

```ts
// src/types/database.ts
export interface PendingClinician {
  user_id: string;
  full_name: string;
  license_number: string;
  hospital_affiliation: string;
  hospital_id: string | null;
  created_at: string;
}
```

### B.3 AuthContext — isAdmin

- Add `isAdmin: boolean` to the context type.
- On bootstrap (and in the auth-state-change handler), after fetching profile/clinicianProfile, also resolve admin status. Cheapest: `supabase.rpc('is_admin')` once per session, OR `supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle()`. Use the RPC.
- Mock mode: `isAdmin` is false for the demo clinician/patient. (A separate `?as=admin` localhost hatch can be added for testing — see B.6.)
- Reset `isAdmin` on signOut.

### B.4 Routing — AppNavigator

Add the gate **before** the role-based routing, after the recovery + no-user gates:

```tsx
if (isAdmin) {
  return <AdminScreen />;
}
```

So an admin lands on AdminScreen regardless of whether they also have a patient/clinician profile. (v1: admin is admin-only; switching roles is out of scope.)

### B.5 AdminScreen

`src/screens/admin/AdminScreen.tsx`:

- White-background shell (like PendingVerificationScreen). Header: HaemoCare brand + "Approvals" title + a **pending-count badge** + LanguageToggle + sign-out.
- Body: `FlatList` of pending clinicians (`verified = false`), each a card:
  - Full name (or "—"), license number, hospital (resolve `hospital_id` → directory name, else `hospital_affiliation`), signup date.
  - **Approve** button (teal) → `approveClinician(user_id)` → optimistic remove from list + badge decrement.
- Empty state: "No pending approvals." (`admin.approvals.empty`)
- Pull-to-refresh or a refresh affordance.

### B.6 Services + hook + mock

`src/services/clinicianService.ts`:
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

`src/hooks/usePendingClinicians.ts` (new): admin-only fetch, returns `{ pending, count, loading, refresh }`. Enabled only when `isAdmin`.

Mock: seed 1-2 pending clinicians; `approveClinician` removes from the in-memory list. Add an `?as=admin` localhost hatch in AuthContext that sets `isAdmin=true` + a mock admin user so AdminScreen is testable without real Supabase.

### B.7 i18n (Phase B)

```
admin.title                "Approvals" / "การอนุมัติ"
admin.subtitle             "Doctors waiting for verification" / "แพทย์ที่รอการยืนยัน"
admin.approvals.empty      "No pending approvals." / "ไม่มีรายการรออนุมัติ"
admin.approvals.approve    "Approve" / "อนุมัติ"
admin.approvals.licenseLabel  "License" / "เลขใบอนุญาต"
admin.approvals.signedUpAt    "Signed up {date}" / "สมัครเมื่อ {date}"
admin.approvals.approved      "Approved" / "อนุมัติแล้ว"
```

### B.8 Files (Phase B)

**Create:**
- `supabase/migrations/2026-05-29-admins-and-approval.sql`
- `src/screens/admin/AdminScreen.tsx`
- `src/hooks/usePendingClinicians.ts`

**Modify:**
- `src/types/database.ts` — `PendingClinician`
- `src/contexts/AuthContext.tsx` — `isAdmin` state + fetch + `?as=admin` hatch + reset on signout
- `src/navigation/AppNavigator.tsx` — isAdmin gate
- `src/services/clinicianService.ts` — `getPendingClinicians`, `approveClinician`
- `src/mock/services.ts` — mock pending clinicians + approve + mock admin
- `src/i18n/en.ts` + `src/i18n/th.ts` — 7 keys

---

## Edge cases

| Scenario | Behavior |
|---|---|
| "Other" hospital name matches an existing one (any case) | RPC returns the existing id — no duplicate row |
| "Other" hospital name is blank/whitespace | RPC raises; UI shows inline error, keeps input open |
| Admin approves a clinician who already got verified (race) | UPDATE is idempotent (sets verified=true again); list refresh drops them |
| Admin has no clinician/patient profile | Still routes to AdminScreen (isAdmin gate is first) |
| Non-admin somehow calls getPendingClinicians | RLS returns only their own row (or nothing) — no leak |
| First admin not yet bootstrapped | No one sees AdminScreen; verification stays SQL-only until the INSERT is run |

## Testing

Per-phase: typecheck + web build + Playwright screenshots, plus a mock-mode regression check.

- Phase A: open HospitalPicker → "Other" → type a name → confirm it selects; type an existing name → confirm no dup (mock).
- Phase B: `?as=admin` → AdminScreen lists pending clinicians → tap Approve → row disappears, badge decrements.

Cross-user real-Supabase steps (clinician signs up → admin sees them → approves → clinician reaches dashboard → appears in patient picker) documented in a manual QA checklist.

## Phasing & rollout

1. **Phase A** — hospital expansion. Independent. Apply migration, ship.
2. **Phase B** — admin approval. Apply migration + bootstrap first admin via SQL.

Both migrations additive. Each phase = one commit. Same push/merge workflow as prior features.

## Out of scope (v1.5+)

- Email/push notification on new clinician signup (in-app badge only for now)
- Reject / soft-delete of clinician applications
- Self-serve verification (email-domain trust, invite codes)
- Admin management UI (adding/removing admins stays SQL)
- Hospital merge/dedup tooling for "Other" entries
- Admin acting as a clinician/patient in the same session
