# Clinician ↔ Patient Linking — Manual QA Checklist

**Spec:** [2026-05-25-clinician-patient-linking-design.md](./2026-05-25-clinician-patient-linking-design.md)

The automated regression script (`scripts/qa-clinician-links.mjs`) covers
the parts that work in mock-mode. The steps below need two real accounts
in the same Supabase project and exercise the cross-user transitions.

## Setup

1. Apply both migrations via Supabase Dashboard → SQL Editor:
   - `supabase/migrations/2026-05-25-clinician-link-rls.sql`
   - `supabase/migrations/2026-05-25-patient-link-rpc-fns.sql`
2. One **verified** clinician account (toggle `clinician_profiles.verified = true`
   in the dashboard if not already set). Note its email + password.
3. One patient account with a non-empty `profiles.patient_id`. Note the
   HC-XXXXXX code displayed on the PassportScreen.
4. Two browser profiles or two devices so both can be signed in
   simultaneously.

## Cross-user happy path

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Clinician | Sign in → dashboard → `+ Add patient` → type unknown ID like `HC-000000` → submit | Inline "Patient not found" error |
| 2 | Clinician | Clear input → type the real patient's HC-XXXXXX → submit | Success state; close modal; pending row appears in queue (greyed, with cancel button) |
| 3 | Patient | Force-reload the app (sign out + back in, or hard refresh) | Gold banner appears above tabs: "Dr. X wants to connect" |
| 4 | Patient | Tap banner → modal shows clinician name + hospital + requested date; toggle is ON | Visual confirmation only |
| 5 | Patient | Tap Approve | Modal advances to "All caught up"; banner disappears after close |
| 6 | Clinician | Refresh the dashboard | Patient promoted from pending row to active queue with full triage data; pre-transfusion labs panel, adherence card, detail pane all populate |
| 7 | Patient | Passport → Privacy & Data → scroll to "Connected clinicians" | Clinician listed with "Sharing full name" badge |
| 8 | Patient | Tap Revoke → confirm | List empties; banner does not return |
| 9 | Clinician | Refresh dashboard | Patient gone from queue; selecting their old id (if cached) shows empty data because RLS now denies reads |

## Re-request after revoke

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 10 | Clinician | `+ Add patient` again with same HC-XXXXXX | Success state; new pending row (UPDATE flipped the existing declined/revoked row back to pending — `requested_at` reset) |
| 11 | Patient | Reload | Banner returns |

## Negative paths

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 12 | Clinician | Submit a HC-XXXXXX already linked active | Inline "Already connected to this patient." |
| 13 | Clinician | Submit a HC-XXXXXX already pending | Inline "Already requested — waiting for patient to respond." |
| 14 | Clinician | Cancel a pending row (kebab → cancel) | Row disappears from queue; patient's banner disappears on next refresh |
| 15 | Patient | Decline (instead of Approve) | Modal advances; banner disappears; clinician's pending row stays until they cancel — re-request bumps the same row back to pending |
| 16 | Unverified clinician | Try to `+ Add patient` | Should fail at RLS layer with the "UNKNOWN" error (the INSERT policy checks `verified = true`) |

## Web-only sanity

| # | Action | Expected |
|---|--------|----------|
| W1 | Open the patient app at `pages.dev` (or production web build) → check banner appears | Real banner (not auto-login mock) |
| W2 | Revoke uses `window.confirm` on web (not native Alert) | Confirm dialog visible; OK triggers revoke |

## Known limitations

- **iOS push notifications**: out of scope for v1. Patient must open the app to see the banner. Per spec phase boundary.
- **Auto-expire of stale pending requests**: out of scope; will accumulate forever unless either side cancels/revokes.
- **Bulk invite / share link**: out of scope.

## Localhost mock-mode coverage

These run automatically via `node scripts/qa-clinician-links.mjs` (no
two-account setup needed):

- ✓ Clinician error path (NOT_FOUND)
- ✓ Clinician success path (creates pending row, mock universe)
- ✓ Patient banner on cold load (seeded pending request from demo clinician)
- ✓ Patient modal → Approve → all-done state
- ✓ Patient navigates to PrivacySettings → sees connected clinician with full-name badge
- ✓ Patient revokes → list empties (`window.confirm` flow on web)
- ✓ Zero console errors across both flows
