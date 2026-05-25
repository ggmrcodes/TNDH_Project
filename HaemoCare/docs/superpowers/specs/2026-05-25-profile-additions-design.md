# Profile Additions — Design Spec

**Date:** 2026-05-25
**Branch:** `feat/profile-additions` (single branch, three phases land sequentially)
**Scope:** Medium — three additive features sharing one foundational data structure (the hospitals directory).

## Goal

Three patient/clinician profile improvements rolled into a single design so the shared infrastructure (a hospital directory) gets thought through once:

1. Record the patient's **primary diagnosis** (thalassemia / hemophilia / other) on their profile, plus a **thalassemia subtype** when applicable.
2. Replace the **free-text hospital input** on clinician signup with a picker backed by a curated hospitals table.
3. Add a **patient-initiated clinician link flow** — patient picks a hospital, sees verified clinicians there, taps to request a connection. Coexists with the clinician-initiated flow we shipped earlier this week.

## Locked decisions

| Decision | Value |
|---|---|
| Disease scope | Record-only enum on profile (thalassemia / hemophilia / other). Existing features unchanged for everyone — both diseases use the same transfusion/symptom UI for now. |
| Thalassemia subtypes | 10 single-select options (full list in Phase 1 section). Only visible when `primary_diagnosis = 'thalassemia'`. |
| Subtype display | Visible on PassportScreen + clinician PatientDetailPane (chip + sub-line). |
| Hospital data source | New curated `hospitals` table, RLS public-read. Seed with 2-3 placeholder rows (Songklanagarind, Siriraj, Ramathibodi). Expand later via SQL. |
| Clinician affiliation migration | Additive — keep free-text `hospital_affiliation` as fallback for legacy rows; new signups use `hospital_id`. |
| Patient link entry point | New "+ Find my doctor" button inside the existing Connected Clinicians section in PrivacySettings. |
| Link direction tracking | New `initiated_by` column on `clinician_patient_links` (enum: `'clinician'` / `'patient'`, default `'clinician'`). |

## Visual styling — non-negotiable

Same as the clinician-patient-linking spec: every new component pulls from existing theme tokens (`COLORS.primary` teal, `COLORS.accent` coral, `COLORS.background` cream / `COLORS.white`, `RADIUS.lg`, `SHADOWS.card`, Fraunces display font). Auth screens use `COLORS.white`; in-app screens use `COLORS.background`. Pickers/modals match existing `AddPatientModal` and `LinkRequestModal` patterns.

## Architecture overview

```
Phase 1 — Profile fields
└── profiles: + primary_diagnosis (enum), + thalassemia_subtype (enum, nullable)
└── ProfileEditForm: cascading pickers
└── PassportScreen + PatientDetailPane: diagnosis chip + subtype sub-line

Phase 2 — Hospital directory  (foundational for Phase 3)
└── NEW hospitals table (id, name_th, name_en, code, region, is_active)
└── clinician_profiles: + hospital_id FK (nullable, free-text kept as fallback)
└── HospitalPicker component (modal sheet, search-as-you-type)
└── ClinicianSignupScreen + PendingVerificationScreen: text input → picker
└── seed migration: Songklanagarind, Siriraj, Ramathibodi placeholders

Phase 3 — Patient-initiated link
└── clinician_patient_links: + initiated_by (enum)
└── new RLS INSERT policy: patients self-request to verified clinicians
└── NEW PatientFindClinicianScreen (entry from PrivacySettings)
└── ClinicianDashboard: new "Incoming requests" subsection w/ Approve/Decline
```

The `clinician_patient_links` state machine (`pending → active / declined / revoked`) is unchanged — we just add a direction marker so the right side sees the right action.

---

## Phase 1 — Profile diagnosis + subtype

### 1.1 Database

```sql
-- migration: supabase/migrations/2026-05-25-profile-diagnosis.sql

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

alter table public.profiles
  add constraint subtype_requires_thalassemia
    check (thalassemia_subtype is null or primary_diagnosis = 'thalassemia');
```

Both columns nullable. Existing rows get `NULL` for both — no backfill. RLS unchanged (patient reads/writes own row; clinician reads via `is_active_clinician_for`).

### 1.2 TypeScript types (`src/types/database.ts`)

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
  // ... existing fields
  primary_diagnosis: PrimaryDiagnosis | null;
  thalassemia_subtype: ThalassemiaSubtype | null;
}
```

### 1.3 i18n keys

All 13 keys bilingual (drafted EN/TH from user-supplied list):

```
profile.diagnosis.label             "Diagnosis"
profile.diagnosis.thalassemia       "Thalassemia" / "ธาลัสซีเมีย"
profile.diagnosis.hemophilia        "Hemophilia" / "ฮีโมฟีเลีย"
profile.diagnosis.other             "Other" / "อื่น ๆ"
profile.subtype.label               "Type of thalassemia"
profile.subtype.alpha_silent_carrier  "α-thal silent carrier" / "อัลฟาธาลัสซีเมียชนิดพาหะเงียบ"
profile.subtype.alpha_trait           "α-thal trait" / "อัลฟาธาลัสซีเมียเทรต"
profile.subtype.hb_h_disease          "Hb H disease" / "โรคฮีโมโกลบินเอช"
profile.subtype.alpha_major_hb_barts  "α-thal major / Hb Bart's" / "อัลฟาธาลัสซีเมียเมเจอร์"
profile.subtype.beta_minor            "β-thal minor / trait" / "เบต้าธาลัสซีเมียไมเนอร์"
profile.subtype.beta_intermedia       "β-thal intermedia" / "เบต้าธาลัสซีเมียอินเตอร์มีเดีย"
profile.subtype.beta_major_cooleys    "β-thal major / Cooley's" / "เบต้าธาลัสซีเมียเมเจอร์ / โรคคูลีย์"
profile.subtype.hb_e_beta_thal        "Hb E/β-thal" / "ฮีโมโกลบินอี/เบต้าธาลัสซีเมีย"
profile.subtype.delta_beta_thal       "δβ-thal" / "เดลตา-เบต้าธาลัสซีเมีย"
profile.subtype.hb_lepore_syndrome    "Hb Lepore syndrome" / "ฮีโมโกลบินเลพอร์ซินโดรม"
```

### 1.4 UI

**`ProfileEditForm` (modify)** — new "Diagnosis" section placed above the blood type group:

- `DiagnosisPicker`: three chips (Thalassemia / Hemophilia / Other), single-select. Existing chip styling.
- `ThalassemiaSubtypePicker`: only renders when diagnosis === 'thalassemia'. Tap → modal sheet with 10 options, Thai label primary + English subtitle. Single-select.
- Switching diagnosis away from 'thalassemia' nulls the subtype automatically (controlled in the form's onChange).

**`PassportScreen` (modify)** — small chip group below the existing blood type:

```
[B+]  [β-thal major]
```

Render rules:
- Both fields null → no chip rendered (existing behavior preserved).
- `primary_diagnosis = 'other'` → no chip (no informative content to show).
- `primary_diagnosis = 'thalassemia' | 'hemophilia'` and subtype null → show top-level chip ("Thalassemia" / "Hemophilia").
- `primary_diagnosis = 'thalassemia'` and subtype set → show subtype label (e.g., "β-thal major").

**`PatientDetailPane` (modify, clinician side)** — same chip pattern, in the existing passport-header card.

### 1.5 Mock data

`MOCK_PROFILE` gets `primary_diagnosis: 'thalassemia'` + `thalassemia_subtype: 'beta_major_cooleys'` so the demo patient renders with the new chip.

### 1.6 Files (Phase 1)

**Create:**
- `supabase/migrations/2026-05-25-profile-diagnosis.sql`
- `src/components/passport/DiagnosisPicker.tsx`
- `src/components/passport/ThalassemiaSubtypePicker.tsx`
- `src/components/passport/DiagnosisChip.tsx` (rendered in PassportScreen + PatientDetailPane)

**Modify:**
- `src/types/database.ts` — Profile + enums
- `src/components/passport/ProfileEditForm.tsx` — diagnosis section
- `src/screens/tabs/PassportScreen.tsx` — chip render
- `src/components/clinician/PatientDetailPane.tsx` — chip render
- `src/i18n/en.ts` + `src/i18n/th.ts` — 13 keys
- `src/mock/data.ts` — seed mock profile values

---

## Phase 2 — Hospital directory + clinician affiliation picker

### 2.1 Database

```sql
-- migration: supabase/migrations/2026-05-26-hospitals-table.sql

create table public.hospitals (
  id uuid default uuid_generate_v4() primary key,
  name_th text not null,
  name_en text not null,
  code text unique,                   -- stable identifier, e.g. 'songklanagarind'
  region text check (region in ('north', 'northeast', 'central', 'south', 'east', 'west')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_hospitals_active_region on public.hospitals (region) where is_active = true;
create index idx_hospitals_name_th on public.hospitals (name_th);

alter table public.hospitals enable row level security;

-- Hospitals are public reference data; anyone signed in can read active rows.
create policy "Authenticated reads active hospitals" on public.hospitals
  for select using (is_active = true);

-- Seed: minimal placeholder set, expand later.
insert into public.hospitals (name_th, name_en, code, region) values
  ('โรงพยาบาลสงขลานครินทร์', 'Songklanagarind Hospital', 'songklanagarind', 'south'),
  ('โรงพยาบาลศิริราช', 'Siriraj Hospital', 'siriraj', 'central'),
  ('โรงพยาบาลรามาธิบดี', 'Ramathibodi Hospital', 'ramathibodi', 'central');

-- Link clinician_profiles to the directory (nullable for legacy compatibility).
alter table public.clinician_profiles
  add column hospital_id uuid references public.hospitals(id);

create index idx_clinician_profiles_hospital on public.clinician_profiles (hospital_id) where hospital_id is not null;
```

`hospital_affiliation` (free-text) stays on `clinician_profiles`. The app prefers `hospital_id` when set; falls back to the free-text. Once a clinician edits their profile post-Phase-2 they pick from the picker; legacy rows decay naturally over time.

### 2.2 TypeScript types

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

export interface ClinicianProfile {
  // ... existing fields
  hospital_id: string | null;
}
```

### 2.3 i18n keys

```
hospital.picker.title         "Select your hospital" / "เลือกโรงพยาบาลของคุณ"
hospital.picker.searchPlaceholder  "Search hospitals…" / "ค้นหาโรงพยาบาล..."
hospital.picker.empty         "No hospitals found." / "ไม่พบโรงพยาบาล"
hospital.region.north         "Northern" / "ภาคเหนือ"
hospital.region.northeast     "Northeastern" / "ภาคอีสาน"
hospital.region.central       "Central" / "ภาคกลาง"
hospital.region.south         "Southern" / "ภาคใต้"
hospital.region.east          "Eastern" / "ภาคตะวันออก"
hospital.region.west          "Western" / "ภาคตะวันตก"
```

### 2.4 Service + hook

```ts
// src/services/hospitalService.ts (new)
export async function getHospitals(): Promise<Hospital[]>;

// src/hooks/useHospitals.ts (new)
export function useHospitals(): { hospitals: Hospital[]; loading: boolean };
```

Session-cached. Hospitals change rarely; one fetch on first use is enough.

### 2.5 New `HospitalPicker` component

`src/components/common/HospitalPicker.tsx`:

```ts
interface Props {
  value: string | null;             // selected hospital_id
  onChange: (hospitalId: string | null) => void;
  placeholder?: string;
}
```

UX:
- Closed state: row with chevron, shows selected hospital's `name_th` or placeholder
- Tap → full-screen modal sheet with search input + grouped list (by region) + cancel
- Each row: `name_th` primary + `name_en` subtitle. Tap → selects + closes.
- Empty state if filtered: `hospital.picker.empty`

Styled to match existing `AddPatientModal` (cream background, RADIUS.lg, primary teal CTA).

### 2.6 Modified screens

- `ClinicianSignupScreen`: replace the free-text hospital input with `<HospitalPicker />`. Submit `hospital_id` to `signUpClinician`. (The free-text field can still be hidden behind an "Other / not listed" flow if needed, but defer for now — placeholder hospitals + the ability to add more later cover the v1 case.)
- `PendingVerificationScreen`: same picker for editing the affiliation.
- `ClinicianDashboardScreen` (header identity chip): show hospital from the directory when `hospital_id` is set; fall back to `hospital_affiliation`.

### 2.7 Files (Phase 2)

**Create:**
- `supabase/migrations/2026-05-26-hospitals-table.sql`
- `src/services/hospitalService.ts`
- `src/hooks/useHospitals.ts`
- `src/components/common/HospitalPicker.tsx`

**Modify:**
- `src/types/database.ts` — Hospital, ClinicianProfile.hospital_id
- `src/contexts/AuthContext.tsx` — signUpClinician signature (accept hospital_id, persist alongside legacy field)
- `src/screens/auth/ClinicianSignupScreen.tsx` — picker swap
- `src/screens/auth/PendingVerificationScreen.tsx` — picker swap
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — header label fallback chain
- `src/i18n/en.ts` + `src/i18n/th.ts`
- `src/mock/services.ts` — mock `getHospitals` returning the seed list

---

## Phase 3 — Patient-initiated link flow

### 3.1 Database

```sql
-- migration: supabase/migrations/2026-05-27-patient-initiated-links.sql

alter table public.clinician_patient_links
  add column initiated_by text not null default 'clinician'
    check (initiated_by in ('clinician', 'patient'));

create index idx_cpl_pending_by_clinician_for_patient_inbox
  on public.clinician_patient_links (clinician_id)
  where status = 'pending' and initiated_by = 'patient';

-- Existing "Clinicians insert links" policy already gates on clinician_id = auth.uid().
-- Add a parallel policy for patient self-request.
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

State machine (unchanged from before, just with direction tracking):

```
                  ┌──────────────────────────────┐
                  │   no link row exists         │
                  └───────────────┬──────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
        clinician inserts                patient inserts
        initiated_by='clinician'         initiated_by='patient'
                  │                               │
                  ▼                               ▼
        ┌────────────────────┐         ┌────────────────────┐
        │  pending           │         │  pending           │
        │  (patient acts)    │         │  (clinician acts)  │
        │  → banner          │         │  → dashboard       │
        │    Approve/Decline │         │    Approve/Decline │
        └────────┬───────────┘         └────────┬───────────┘
                 │                              │
                 ▼                              ▼
         active / declined            active / declined
                 │                              │
                 └──────────┬───────────────────┘
                            ▼
                    either side revokes
                            │
                            ▼
                         revoked
```

### 3.2 TypeScript types

```ts
export interface ClinicianPatientLink {
  // ... existing fields
  initiated_by: 'clinician' | 'patient';
}
```

### 3.3 Service additions

```ts
// src/services/patientService.ts
export async function requestClinicianLink(
  clinicianId: string,
  shareFullName: boolean
): Promise<ClinicianPatientLink>;

export async function getCliniciansAtHospital(
  hospitalId: string
): Promise<{ user_id: string; full_name: string; hospital_affiliation: string }[]>;

// src/services/clinicianService.ts
export interface IncomingPatientRequest {
  link: ClinicianPatientLink;
  patientDisplayId: string | null;
  patientFullName: string;       // null/empty if share_full_name=false at request time
}
export async function getIncomingPatientRequests(
  clinicianId: string
): Promise<IncomingPatientRequest[]>;
export async function approveIncomingRequest(linkId: string): Promise<void>;
export async function declineIncomingRequest(linkId: string): Promise<void>;
```

`getCliniciansAtHospital` returns verified clinicians with `hospital_id = ?`. Uses the existing `clinician_profiles` row + the verified check.

### 3.4 New screen: `PatientFindClinicianScreen`

`src/screens/settings/PatientFindClinicianScreen.tsx`. Reachable via the new "+ Find my doctor" button in `ConnectedCliniciansSection`. Two-step flow with a confirm sheet:

1. **Hospital step** — reuse `HospitalPicker` (Phase 2). Tap a hospital → next step.
2. **Clinician step** — list of verified clinicians at that hospital. Each row: avatar + full name + hospital subtitle. Tap → confirm sheet.
3. **Confirm sheet** — modal mirroring the existing `LinkRequestModal` (Phase 4 of clinician-linking) styling: clinician name + hospital + `share_full_name` toggle (default ON, same semantics as patient-side accept of clinician-initiated requests) + Send Request CTA. Cancel returns to the clinician list.
4. **Success** — inline message: "Request sent. Waiting for {{name}} to approve." Confirm sheet stays open with the success message; user dismisses to return to the clinician list (now showing "Pending" badge on that clinician).

Empty states:
- Hospital with zero verified clinicians: "No registered doctors at this hospital yet. They need to sign up in HaemoCare first."
- Existing active link to the selected clinician: disable tap, show "Already connected" badge.
- Existing pending link (either direction): disable tap, show "Pending" badge.

### 3.5 Clinician dashboard — Incoming requests subsection

Extend the existing pending-rows area in `ClinicianDashboardScreen` (and the mobile drawer) to render two subsections:

```
PENDING (top of section)
├─ Awaiting patient                       (initiated_by='clinician')
│  ├─ <PendingPatientRow /> with Cancel
│  └─ ...
└─ Awaiting your approval                 (initiated_by='patient')
   ├─ <IncomingPatientRequestRow /> with Approve + Decline
   └─ ...
```

`IncomingPatientRequestRow` is a new component (mirrors `PendingPatientRow` styling — greyed-ish with a hint, but with two action buttons instead of one cancel). Renders in both the desktop leftRail and the mobile drawer (same renderQueueContent helper).

`useAssignedPatients` extended again to return `incomingRequests: IncomingPatientRequest[]` alongside `pendingLinks`.

### 3.6 i18n keys

```
patient.findClinician.entryButton    "Find my doctor" / "ค้นหาแพทย์ของฉัน"
patient.findClinician.title          "Connect with a clinician" / "เชื่อมต่อกับแพทย์"
patient.findClinician.step1Title     "Which hospital?" / "โรงพยาบาลใด"
patient.findClinician.step2Title     "Pick your doctor" / "เลือกแพทย์ของคุณ"
patient.findClinician.empty          "No registered doctors at this hospital yet." / "ยังไม่มีแพทย์ที่ลงทะเบียน"
patient.findClinician.alreadyConnected  "Already connected" / "เชื่อมต่อแล้ว"
patient.findClinician.alreadyPending    "Request pending" / "รอการตอบรับ"
patient.findClinician.confirmTitle      "Request connection?" / "ขอเชื่อมต่อ?"
patient.findClinician.confirmSubmit     "Send request" / "ส่งคำขอ"
patient.findClinician.success           "Request sent. Waiting for {{name}} to approve." / "ส่งคำขอแล้ว รอ {{name}} อนุมัติ"

clinician.incomingRequests.title         "Awaiting your approval" / "รอการอนุมัติของคุณ"
clinician.incomingRequests.approve       "Approve" / "อนุมัติ"
clinician.incomingRequests.decline       "Decline" / "ปฏิเสธ"
clinician.incomingRequests.empty         "" (no header rendered if empty)
clinician.pendingSection.awaitingPatient "Awaiting patient" / "รอผู้ป่วยตอบรับ"
```

### 3.7 Edge cases

| Scenario | Behavior |
|---|---|
| Patient picks hospital with zero verified clinicians | Empty state message, no list |
| Patient re-requests after decline/revoke | UPSERT: existing row UPDATE back to status='pending', preserve `initiated_by='patient'`, reset `requested_at` |
| Clinician requests patient who has already requested THEM (race) | UNIQUE (clinician_id, patient_user_id) blocks the second insert. Handle gracefully on both sides — surface as "already requested by other party". |
| Clinician approves a patient-initiated request | UPDATE status='active', consented_at=now(). Same column reused — semantics: "the side that needs to act gave consent." |
| Patient revokes an active patient-initiated link | Same revoke flow as today — `Connected Clinicians` row Revoke button. |

### 3.8 Files (Phase 3)

**Create:**
- `supabase/migrations/2026-05-27-patient-initiated-links.sql`
- `src/screens/settings/PatientFindClinicianScreen.tsx`
- `src/components/clinician/IncomingPatientRequestRow.tsx`

**Modify:**
- `src/types/database.ts` — `initiated_by` on ClinicianPatientLink, IncomingPatientRequest type
- `src/services/patientService.ts` — `requestClinicianLink`, `getCliniciansAtHospital`
- `src/services/clinicianService.ts` — `getIncomingPatientRequests`, `approveIncomingRequest`, `declineIncomingRequest`
- `src/hooks/useAssignedPatients.ts` — return `incomingRequests` alongside `pendingLinks`
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — render two pending subsections
- `src/components/patient/ConnectedCliniciansSection.tsx` — add "+ Find my doctor" button at top, route to new screen
- `src/navigation/AppNavigator.tsx` — register `PatientFindClinician` route
- `src/types/navigation.ts` — `PatientFindClinician` in RootStackParamList
- `src/i18n/en.ts` + `src/i18n/th.ts`
- `src/mock/services.ts` — mock implementations

---

## Testing

Each phase ships with the same testing pattern that worked for the clinician-linking feature:

- **Typecheck + web build** after each phase — must pass before commit
- **Playwright iPhone + desktop screenshots** of every new screen + edited screen
- **Mock-mode regression script** `scripts/qa-profile-additions.mjs` exercising:
  - Phase 1: pick diagnosis → pick subtype → save → reload → chips render
  - Phase 2: hospital picker opens, search works, selection persists through profile save
  - Phase 3: patient picks hospital → clinician → request → clinician approves → both sides reflect active
- **Manual QA checklist** at `docs/superpowers/specs/2026-05-25-profile-additions-qa.md` for the cross-user steps that need real Supabase

## Phasing & rollout

Three phases, each = one commit on this branch. After each phase:

1. Apply the new migration via Supabase Dashboard SQL Editor.
2. Build + Playwright check + mock-mode QA pass.
3. Commit. Push at end of all phases (or after each, depending on whether mid-feature deploys are wanted).

**Order is fixed** because Phase 3 depends on the hospitals table:

1. **Phase 1** — profile diagnosis + subtype. Independent. Smallest. ~1 day equivalent.
2. **Phase 2** — hospitals table + clinician affiliation picker. Foundational. ~1-2 days.
3. **Phase 3** — patient-initiated link flow. Biggest. ~2 days.

All migrations are additive (no DROP, no destructive ALTER). Existing patient/clinician rows are unaffected until their owners next edit.

## Out of scope (v1.5+)

- Hemophilia-specific features (factor levels, bleeding episodes). Patients with `primary_diagnosis = 'hemophilia'` see the same UI for now.
- Hemophilia subtype picker.
- Hospital admin tooling (creating/editing hospitals from the app). For now hospitals are seeded/managed via SQL.
- Doctor specialties / sub-specialty filtering in the patient picker.
- "Other / not listed" hospital path on clinician signup.
- Notification (email/push) when a patient-initiated request lands — clinician sees it on next dashboard refresh, no async notification.
