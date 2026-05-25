# Clinician ↔ Patient Linking — Design Spec

**Date:** 2026-05-25
**Branch:** new branch off `main` (suggested: `feat/clinician-patient-linking`)
**Scope:** Medium — one migration, one new service, one new hook on each side, two new modals, one new banner, one section added to PrivacySettings.

## Goal

A verified clinician can add a patient to their dashboard by entering the patient's `patient_id`. The patient sees an in-app banner on next launch, approves or declines (with a "share my full name" toggle), and from that moment the existing RLS function `is_active_clinician_for(uuid)` returns true — making logs, transfusions, and trend data visible to the clinician via the policies that already gate on it.

Out of scope (v1):
- Push or email notifications (in-app banner only)
- Patient-initiated requests
- Bulk invite / share link
- Auto-expire of stale pending requests
- Lookup by email or phone

## Locked decisions

| Decision | Value |
|---|---|
| Initiator | Clinician |
| Identifier | `profiles.patient_id` (HC-XXXXXX), exact match |
| Patient notification | In-app banner on next launch |
| Pending UI for clinician | Greyed row in queue with cancel button |
| `share_full_name` default | ON, toggled by patient at accept time |
| Self-request guard | No client-side block (acceptable, edge case) |
| `+ Add patient` location (mobile) | Top-right of drawer header (next to close X) |
| `+ Add patient` location (desktop) | Top of left rail, above search |
| Patient revoke surface | New "Connected clinicians" section in PrivacySettings |

## Visual styling — non-negotiable

Every new component in this feature pulls from the existing HaemoCare theme tokens. No ad-hoc colors, fonts, radii, or shadows.

- **Color tokens (from `src/theme`):** `COLORS.primary` (teal `#0B6E6E`), `COLORS.accent` (coral `#E8755A`), `COLORS.background` (cream `#F8F6F2`), `COLORS.text*`, `COLORS.border*`. Use the existing `primaryGradientStart → primaryGradientEnd` for any hero surfaces.
- **Radii:** `RADIUS.lg` (16) for cards and modals; `RADIUS.md` for inputs/buttons; `RADIUS.full` for pills/badges.
- **Shadows:** `SHADOWS.card` for raised surfaces.
- **Type:** Fraunces display font for headings and hero text; existing body font for everything else.
- **Spacing:** `SPACING.*` tokens only — no raw px in margins/padding.

Reference touchstones to mirror:
- Banner (gold tint, similar to pending-verification hero from `feat/clinician-signup`)
- Modal layout (cream background, teal primary CTA, RADIUS.lg corners — see existing modals in `PassportScreen` and clinician dashboard)
- Pending row styling (greyed via `opacity: 0.6`, NOT a new grey color)
- AddPatientButton (compact, teal-tinted, ghost variant — match the existing button hierarchy in `ClinicianDashboardScreen`)

When in doubt, grep an existing similar component and mirror its style block.

## State machine

```
                  ┌─────────────────────────┐
                  │   no link row exists    │
                  └────────────┬────────────┘
                               │ clinician submits patient_id
                               ▼
                       ┌───────────────┐
              ┌────────│   pending     │────────┐
              │        └───────┬───────┘        │
              │                │                │
   patient    │   patient      │   clinician    │
   declines   │   approves     │   cancels      │
              │                │                │
              ▼                ▼                ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │ declined │    │  active  │────│ revoked  │
       └──────────┘    └──────────┘    └──────────┘
            │              │   ▲              ▲
            │  clinician   │   │  patient     │
            │  re-requests │   │  revokes     │
            │  → pending   │   │  → revoked   │
            └──────────────┘   └──────────────┘
```

`expired` exists in the schema but is unused in v1 (no cron).

Re-requesting a `declined` or `revoked` link UPDATEs the existing row back to `pending` and resets `requested_at`. The `UNIQUE (clinician_id, patient_user_id)` constraint forces this upsert pattern.

## Architecture

```
Patient app
└── MainTabNavigator wrapper
    ├── <LinkRequestBanner />  ← NEW, renders when pending count > 0
    └── tabs (unchanged)

Patient settings
└── PrivacySettingsScreen
    └── <ConnectedCliniciansSection />  ← NEW

Clinician app
└── ClinicianDashboardScreen
    ├── Header (sign-out)
    ├── leftRail
    │   ├── <AddPatientButton />  ← NEW (desktop: above search)
    │   └── queue (rows mix active + pending states)
    └── drawer (mobile only)
        ├── drawerHeader (title + <AddPatientButton /> + close X)
        └── queue (same component)
```

## 1 — Database

Single migration file: `supabase/migrations/2026-05-25-clinician-link-rls.sql`

The existing schema (from `2026-05-13_clinician_dashboard.sql`) already provides:
- `"Both sides view own links"` — SELECT for both clinician and patient
- `"Patient updates own link status"` — UPDATE where `auth.uid() = patient_user_id`

What's **missing** is everything on the clinician write side: INSERT (table is currently read-only for clinicians) and UPDATE (clinicians have no way to cancel a pending request or revoke an active link). The migration adds exactly two policies:

```sql
-- Verified clinicians create link rows for themselves
create policy "Clinicians insert links"
  on public.clinician_patient_links
  for insert
  with check (
    clinician_id = auth.uid()
    and exists (
      select 1 from public.clinician_profiles
      where user_id = auth.uid() and verified = true
    )
  );

-- Clinicians update their own link rows (cancel pending, re-request after
-- decline, revoke active from their side). Status transitions enforced by
-- the table's check constraint + service layer.
create policy "Clinicians update own links"
  on public.clinician_patient_links
  for update
  using (clinician_id = auth.uid());
```

Patient-side reads (banner, privacy settings) and patient writes (accept/decline/revoke) are already covered by the 2026-05-13 policies — no additions needed.

Migration must be applied via Supabase Dashboard SQL Editor (same pattern as prior migrations).

## 2 — Service layer

### `src/services/clinicianService.ts` (additions)

```ts
type RequestLinkError =
  | { kind: 'NOT_FOUND' }
  | { kind: 'ALREADY_ACTIVE' }
  | { kind: 'ALREADY_PENDING' }
  | { kind: 'UNKNOWN'; message: string };

requestPatientLink(patientId: string): Promise<
  { ok: true; link: ClinicianPatientLink } | { ok: false; error: RequestLinkError }
>
```

Lookup `profiles.patient_id` → fetch `user_id`. If found:
- Check for existing link via select; if status is `active` → `ALREADY_ACTIVE`; `pending` → `ALREADY_PENDING`; `declined`/`revoked` → UPDATE back to `pending`; otherwise INSERT.

```ts
cancelLinkRequest(linkId: string): Promise<void>
```
UPDATE status='revoked', revoked_at=now() for a row the clinician owns.

```ts
useClinicianLinks(clinicianId: string): {
  active: ClinicianPatientLink[];
  pending: ClinicianPatientLink[];
  refresh: () => Promise<void>;
}
```

Replaces direct querying inside `useAssignedPatients`. Returns the raw link rows; `useAssignedPatients` already does the patient hydration, so we feed it the `active` ids and a new `pending` array for the greyed rows.

### `src/services/patientService.ts` (NEW file or extend existing)

```ts
type PendingLinkRequest = {
  id: string;
  clinician_id: string;
  clinician_full_name: string;
  clinician_hospital: string | null;
  requested_at: string;
};

getPendingLinkRequests(userId: string): Promise<PendingLinkRequest[]>
acceptLinkRequest(linkId: string, shareFullName: boolean): Promise<void>
declineLinkRequest(linkId: string): Promise<void>

type ConnectedClinician = {
  link_id: string;
  clinician_full_name: string;
  clinician_hospital: string | null;
  share_full_name: boolean;
  consented_at: string;
};
getConnectedClinicians(userId: string): Promise<ConnectedClinician[]>
revokeClinicianLink(linkId: string): Promise<void>
```

`getPendingLinkRequests` and `getConnectedClinicians` JOIN `clinician_profiles` to surface names + hospitals.

## 3 — Hooks

### `src/hooks/usePatientLinkRequests.ts` (NEW)

```ts
usePatientLinkRequests(): {
  pending: PendingLinkRequest[];
  count: number;
  refresh: () => Promise<void>;
}
```

Fetches on mount, refetches on `refresh()`. Returns `count = 0` for mock mode (no pending requests on demo accounts).

### `src/hooks/useConnectedClinicians.ts` (NEW)

Same shape, drives PrivacySettings section.

### `src/hooks/useAssignedPatients.ts` (MODIFY)

Currently returns active assigned patients. Extend to also expose `pendingLinks: ClinicianPatientLink[]` — a flat list of pending rows the clinician has open. The dashboard composes these into greyed queue rows alongside active patients.

## 4 — Components

### NEW: `src/components/clinician/AddPatientButton.tsx`
Compact button (`+ Add patient`). On press → opens `AddPatientModal`.

### NEW: `src/components/clinician/AddPatientModal.tsx`
Modal with:
- Text input — `patient_id` (autocap none, no autocorrect, monospace)
- Submit button (disabled until non-empty after trim)
- Inline error rendering for each `RequestLinkError` kind
- Success state → "Request sent — waiting for patient to respond" with Close

Styled with existing modal patterns (cream background, teal primary button, RADIUS.lg). Uses `COLORS.primary` + `COLORS.accent` tokens.

### NEW: `src/components/clinician/PendingPatientRow.tsx`
Renders a pending queue row:
- Greyed text (`opacity: 0.6`)
- Patient ID + "Waiting for patient to accept" subtitle
- Kebab menu → "Cancel request" (calls `cancelLinkRequest`, refreshes hook)

Lives alongside the existing `PatientQueueRow` rather than mixing states inside one component.

### NEW: `src/components/patient/LinkRequestBanner.tsx`
Renders if `usePatientLinkRequests().count > 0`. Positioned just above the tab content (gold tint, similar to the pending-verification gradient).
- Single request: `"Dr. {name} wants to connect"` + View button
- Multiple: `"{N} clinicians want to connect"` + View button
- Tap → opens `LinkRequestModal`

### NEW: `src/components/patient/LinkRequestModal.tsx`
Modal with stack of pending requests:
- For each: clinician name, hospital, requested date
- Toggle: `Share my full name with this clinician` (default ON)
- Buttons: `Approve` (teal) + `Decline` (text-only outline)
- After approve/decline, modal advances to next request or closes if empty

### NEW: `src/components/patient/ConnectedCliniciansSection.tsx`
Lives inside `PrivacySettingsScreen`. List of `ConnectedClinician` rows:
- Name + hospital + "Sharing full name" badge if `share_full_name`
- Trailing `Revoke` button (text destructive style, confirms in alert before calling `revokeClinicianLink`)
- Empty state: "No clinicians connected"

### MODIFY: `src/screens/clinician/ClinicianDashboardScreen.tsx`
- Desktop: render `<AddPatientButton />` at top of `leftRail`, above the search bar.
- Mobile: render `<AddPatientButton />` inside `drawerHeader`, between `drawerTitle` and `drawerCloseBtn` (small layout shuffle).
- Compose `pendingLinks` from the extended hook into the queue render: pending rows render via `PendingPatientRow`, sorted to the bottom of the list (or as a "Pending" subgroup with a small label).
- Refresh hook after `requestPatientLink` succeeds.

### MODIFY: `src/screens/settings/PrivacySettingsScreen.tsx`
- Add `<ConnectedCliniciansSection />` after existing PDPA consent section, before any sign-out / delete-account actions.

### MODIFY: `src/navigation/MainTabNavigator.tsx` (or wherever patient tabs are wrapped)
- Wrap the tab navigator output in a `<View>` with `<LinkRequestBanner />` at top. Banner is `null` when count is 0 so layout is unaffected.

## 5 — Edge cases

| Scenario | Behavior |
|---|---|
| Clinician submits non-existent `patient_id` | Inline error: `"Patient not found. Check the ID and try again."` |
| Existing `active` link | Inline error: `"Already connected to this patient."` |
| Existing `pending` link | Inline error: `"Already requested — waiting for patient to respond."` |
| Existing `declined`/`revoked` link | UPDATE row back to `pending`, reset `requested_at`. Patient sees fresh banner. |
| Patient receives banner, kills app, reopens | Hook refetches on mount, banner returns. |
| Patient approves then immediately backgrounds | UPDATE has committed before transition; clinician's next refresh shows row promoted. |
| Network drops during approve | Row stays `pending`; banner persists; patient can retry from the modal (button doesn't unmount until success). |
| Clinician cancels pending request | UPDATE to `revoked`. Banner for the patient (if not yet seen) disappears on next fetch. |
| Patient revokes active link | UPDATE to `revoked`. Clinician's queue stops showing that patient on next refresh. RLS function `is_active_clinician_for(uuid)` returns false → patient data no longer visible. |
| Mock mode (demo clinician / demo patient) | Service functions return empty arrays / no-op writes. Banner never appears on demo patient; demo clinician sees only mocked active patients. |

## 6 — i18n keys

Namespace: `clinician.linkPatient.*` and `patient.linkRequest.*` and `privacy.connectedClinicians.*`.

```
clinician.linkPatient.addButton            "+ Add patient"
clinician.linkPatient.modalTitle           "Add a patient to your queue"
clinician.linkPatient.modalSubtitle        "Enter the patient ID shown on their HaemoCare passport (format: HC-XXXXXX)."
clinician.linkPatient.inputLabel           "Patient ID"
clinician.linkPatient.inputPlaceholder     "HC-000000"
clinician.linkPatient.submit               "Send request"
clinician.linkPatient.cancel               "Cancel"
clinician.linkPatient.close                "Close"
clinician.linkPatient.error.notFound       "Patient not found. Check the ID and try again."
clinician.linkPatient.error.alreadyActive  "Already connected to this patient."
clinician.linkPatient.error.alreadyPending "Already requested — waiting for patient to respond."
clinician.linkPatient.error.unknown        "Something went wrong. Try again."
clinician.linkPatient.success              "Request sent — waiting for patient to respond."
clinician.linkPatient.pendingRowSubtitle   "Waiting for patient to accept"
clinician.linkPatient.cancelRequest        "Cancel request"

patient.linkRequest.bannerOne              "Dr. {{name}} wants to connect"
patient.linkRequest.bannerMany             "{{count}} clinicians want to connect"
patient.linkRequest.bannerView             "View"
patient.linkRequest.modalTitle             "Clinician requests"
patient.linkRequest.modalHospital          "{{hospital}}"
patient.linkRequest.modalRequestedAt       "Requested {{date}}"
patient.linkRequest.shareFullNameLabel     "Share my full name with this clinician"
patient.linkRequest.shareFullNameHelp      "They'll see your full name in their patient list. You can revoke this anytime in Privacy settings."
patient.linkRequest.approve                "Approve"
patient.linkRequest.decline                "Decline"
patient.linkRequest.allDone                "All caught up."

privacy.connectedClinicians.title          "Connected clinicians"
privacy.connectedClinicians.empty          "No clinicians connected."
privacy.connectedClinicians.sharingFullName "Sharing full name"
privacy.connectedClinicians.revoke         "Revoke"
privacy.connectedClinicians.revokeConfirmTitle "Revoke access?"
privacy.connectedClinicians.revokeConfirmBody  "Dr. {{name}} will no longer see your logs, transfusions, or trends."
privacy.connectedClinicians.revokeConfirmYes   "Revoke"
privacy.connectedClinicians.revokeConfirmNo    "Keep"
```

Both `en.ts` and `th.ts` updated. Thai translations TBD during implementation (drafted in spec review).

## 7 — Files to create / modify

**Create (8):**
- `supabase/migrations/2026-05-25-clinician-link-rls.sql`
- `src/services/patientService.ts` (or extend existing)
- `src/hooks/usePatientLinkRequests.ts`
- `src/hooks/useConnectedClinicians.ts`
- `src/components/clinician/AddPatientButton.tsx`
- `src/components/clinician/AddPatientModal.tsx`
- `src/components/clinician/PendingPatientRow.tsx`
- `src/components/patient/LinkRequestBanner.tsx`
- `src/components/patient/LinkRequestModal.tsx`
- `src/components/patient/ConnectedCliniciansSection.tsx`

**Modify (~6):**
- `src/services/clinicianService.ts` — link CRUD methods
- `src/hooks/useAssignedPatients.ts` — expose `pendingLinks`
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — Add Patient button + pending rows in queue
- `src/screens/settings/PrivacySettingsScreen.tsx` — Connected clinicians section
- `src/navigation/MainTabNavigator.tsx` (or equivalent) — banner wrapper
- `src/i18n/en.ts` + `src/i18n/th.ts`

## 8 — Testing scope

Manual QA via the Playwright iPhone harness already set up, plus desktop browser:

1. Clinician: open `+ Add patient`, submit unknown ID → see NOT_FOUND error.
2. Clinician: submit a real demo patient's ID → success message; pending row appears in queue.
3. Patient (different account): reload → banner appears; tap → modal shows clinician details; approve with default toggle ON.
4. Clinician: refresh → patient promoted from pending greyed row to active.
5. Patient: PrivacySettings → see clinician in Connected list with "Sharing full name" badge → tap Revoke → confirm → list empties.
6. Clinician: refresh → patient gone from queue.
7. Clinician: re-add same patient → request fires again (UPDATE back to pending); banner returns on patient side.

No unit tests — `useAssignedPatients` doesn't have any to model from, and the new service functions are thin enough that integration verification is more valuable.

## 9 — Phasing

Implementation order (each phase independently testable):

1. **DB migration** — apply via Dashboard SQL Editor, verify policies via Supabase row inspector.
2. **Clinician request flow** — service + button + modal + pending row + queue integration. No patient-side changes yet. Verify pending rows persist across refresh.
3. **Patient banner + accept/decline** — banner, modal, accept/decline service calls. Verify state transitions end-to-end.
4. **PrivacySettings Connected clinicians** — section + revoke flow.
5. **i18n Thai pass** — fill in `th.ts` translations.
6. **Manual QA pass** following section 8.

Each phase = one commit. Branch lands as a single PR.
